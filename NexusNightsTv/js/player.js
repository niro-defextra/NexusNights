/**
 * NEXUSNIGHT TV - Cinema Player Adapter
 * AVPlay hardware engine for Samsung TV; HTML5 + Hls.js for browser / webview fallback.
 * Full custom subtitle parser & overlay (Arabic / English / Provider tracks).
 * Strict ES5 for Samsung Tizen 5.0 compatibility.
 */
(function (window) {
    'use strict';

    // Authored icons — never unicode glyphs standing in for an icon system.
    function playerIconCheck(size) {
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6L9 17l-5-5"/></svg>';
    }
    var PLAYER_ICON_DOWNLOAD = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align: -2px;"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>';
    var SKIP_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><polygon points="5 4 15 12 5 20"/><rect x="17" y="4" width="2.5" height="16"/></svg>';

    // AniSkip wins for intro/outro; IntroDB fills recap and preview.
    function mergeSkipTimings(primary, secondary) {
        var merged = { found: false };
        var keys = ['recap', 'intro', 'outro', 'preview'];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var segment = (primary && primary[key]) || (secondary && secondary[key]);
            if (!segment) continue;
            var start = Number(segment.startTime);
            var end = Number(segment.endTime);
            if (!isFinite(start) || !isFinite(end) || end <= start) continue;
            merged[key] = { startTime: start, endTime: end };
            merged.found = true;
        }
        return merged;
    }

    window.NexusPlayer = {
        currentSource: null,
        alternatives: [],
        sourceIndex: 0,
        primarySource: null,
        subtitles: [],
        activeSubtitleIndex: -1,
        subtitleCues: [],
        meta: null,
        playAttemptId: 0,
        isPlaying: false,
        useAVPlay: false,
        activeEngine: null,
        videoElement: null,
        iframeElement: null,
        hlsInstance: null,
        controlsTimeout: null,
        currentTime: 0,
        duration: 0,
        isLive: false,
        stopping: false,
        skippedEmbedSources: 0,
        lastProgressSaveTime: 0,
        skipTimings: null,
        activeSkipSegment: null,
        seekHudTimeout: null,
        skipRequestId: 0,
        nextEpisodeHandler: null,
        nextCountdownTimer: null,
        nextCountdownSec: 5,
        nextEpisodeActive: false,
        nextEpisodeDismissed: false,
        qualityLevels: [],
        selectedQualityIndex: -1,
        consecutiveStalls: 0,
        lastStallTime: 0,

        init: function () {
            this.useAVPlay = typeof webapis !== 'undefined' && !!webapis.avplay;
            console.log('[NexusPlayer] Initialized. AVPlay Available:', this.useAVPlay);
        },

        play: function (source, alternatives, subtitles, meta) {
            if (typeof webapis !== 'undefined' && !!webapis.avplay) {
                this.useAVPlay = true;
            }
            if (!source || (!source.url && !source.embedUrl)) {
                if (window.NexusApp && NexusApp.showToast) NexusApp.showToast(NexusConfig.t('player_no_source'));
                return;
            }
            this.primarySource = source;
            this.alternatives = Array.isArray(alternatives) ? alternatives.slice(0) : [];
            this.subtitles = Array.isArray(subtitles) ? subtitles.slice(0) : [];
            this.meta = meta || {};
            this.currentSource = source;
            // Sports streams have no TMDB metadata and no subtitle/audio tracks.
            this.isSports = !(meta && meta.tmdbId);
            this.isLive = !!(meta && meta.isLive) || !!(source && source.isLive) || this.isSports;
            this.sourceIndex = 0;
            this.currentTime = 0;
            this.duration = 0;
            this.stopping = false;
            this.skippedEmbedSources = 0;
            this.activeSubtitleIndex = -1;
            this.subtitleCues = [];
            this.qualityLevels = [];
            this.selectedQualityIndex = -1;
            this.consecutiveStalls = 0;
            this.lastStallTime = 0;
            this.skipTimings = (meta && meta.skipTimings) || null;
            this.activeSkipSegment = null;
            this.skipRequestId += 1;
            this.nextEpisodeActive = false;
            this.nextEpisodeDismissed = false;
            this.clearNextEpisodeCountdown();

            this.showPlayerPage();

            var playerPage = document.getElementById('player-page');
            if (playerPage) {
                var isLiveStream = !!(source.isLive || (meta && meta.isLive) || this.isSports);
                playerPage.classList.toggle('is-live', isLiveStream);
                playerPage.classList.toggle('is-sports', !!this.isSports);
            }

            // Fetch extra unified subtitles (Arabic & English) if TMDB metadata is available (VOD only)
            if (!this.isSports && !this.isLive) {
                this.fetchExternalSubtitles();
                this.fetchSkipSegments(this.skipRequestId);
            }

            this.trySource(source);
        },

        fetchSkipSegments: function (requestId) {
            var self = this;
            if (this.isSports || this.isLive || !this.meta || !this.meta.tmdbId || !window.NexusAPI || !NexusAPI.getSkipSegments) {
                this.updateSkipSegment();
                return;
            }
            var kind = this.meta.type === 'series' ? 'series' : 'movie';
            NexusAPI.getSkipSegments(kind, this.meta.tmdbId, this.meta.season, this.meta.episode)
                .then(function (segments) {
                    if (requestId !== self.skipRequestId) return;
                    if (segments && segments.found) {
                        self.skipTimings = mergeSkipTimings(self.skipTimings, segments);
                    }
                    self.updateSkipSegment();
                })
                .catch(function () {
                    if (requestId === self.skipRequestId) self.updateSkipSegment();
                });
        },

        fetchExternalSubtitles: function () {
            var self = this;
            if (this.isSports || this.isLive || !this.meta || !this.meta.tmdbId || !window.NexusAPI || !NexusAPI.getSubtitles) return;

            console.log('[NexusPlayer] Fetching subtitles for TMDB ID:', this.meta.tmdbId);

            NexusAPI.getSubtitles(this.meta.tmdbId, this.meta.type || 'movie')
                .then(function (extSubs) {
                    if (!extSubs || !extSubs.length) {
                        console.log('[NexusPlayer] No subtitles returned');
                        return;
                    }

                    var newSubtitles = [];
                    for (var i = 0; i < extSubs.length; i++) {
                        var item = extSubs[i];
                        var lang = self.normalizeLang(item.language);
                        var provider = item.provider || 'OpenSubtitles';

                        // De-duplicate against the live list AND the batch being built,
                        // otherwise a provider that returns N identical tracks adds all N.
                        var duplicate = self.subtitles.some(function (existing) {
                            return self.normalizeLang(existing.language) === lang &&
                                   (existing.provider || '') === provider;
                        }) || newSubtitles.some(function (added) {
                            return added.language === lang && added.provider === provider;
                        });
                        if (duplicate) continue;

                        newSubtitles.push({
                            id: item.id,
                            url: item.url || null,
                            language: lang,
                            label: self.subtitleLabel(lang, item.languageName || item.fileName),
                            isExternal: true,
                            provider: provider,
                            quality: item.quality || 'Good',
                            downloads: item.downloads || 0,
                            rating: item.rating || 0
                        });
                    }

                    if (newSubtitles.length > 0) {
                        console.log('[NexusPlayer] Adding', newSubtitles.length, 'subtitle track(s)');
                        self.subtitles = self.subtitles.concat(newSubtitles);
                        self.showExternalSubtitleNotification(newSubtitles);
                        self.autoSelectPreferredSubtitle();
                    }
                })
                .catch(function (err) {
                    console.warn('[NexusPlayer] Subtitle fetch error:', err && err.message);
                });
        },

        // Map provider language values ("en-US", "ara", "English"...) to 'ar' / 'en'.
        normalizeLang: function (value) {
            var v = String(value || '').trim().toLowerCase();
            if (!v) return 'en';
            if (v === 'ar' || v === 'ara' || v === 'arabic' || v.indexOf('ar-') === 0 || v.indexOf('ar_') === 0) return 'ar';
            if (v === 'en' || v === 'eng' || v === 'english' || v.indexOf('en-') === 0 || v.indexOf('en_') === 0) return 'en';
            return v;
        },

        subtitleLabel: function (lang, fallback) {
            if (fallback && String(fallback).trim()) return String(fallback).trim();
            if (lang === 'ar') return 'العربية';
            if (lang === 'en') return 'English';
            return String(lang || '').toUpperCase();
        },
        
        showExternalSubtitleNotification: function(newSubtitles) {
            if (!newSubtitles || newSubtitles.length === 0) return;

            // Only ever show one at a time.
            var stale = document.querySelector('.player-external-sub-notification');
            if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

            var playerPage = document.getElementById('player-page');
            if (!playerPage) return;

            var arCount = 0, enCount = 0;
            for (var i = 0; i < newSubtitles.length; i++) {
                if (newSubtitles[i].language === 'ar') arCount++;
                else if (newSubtitles[i].language === 'en') enCount++;
            }

            var parts = [];
            if (arCount > 0) parts.push(arCount + ' ' + NexusConfig.t('player_subs_ar_track'));
            if (enCount > 0) parts.push(enCount + ' ' + NexusConfig.t('player_subs_en_track'));
            if (parts.length === 0) parts.push(String(newSubtitles.length));

            var notification = document.createElement('div');
            notification.className = 'player-external-sub-notification';
            notification.setAttribute('role', 'status');
            notification.innerHTML =
                '<div class="player-external-sub-notification-title">' + NexusConfig.escapeHtml(NexusConfig.t('player_subs_toast_new')) + '</div>' +
                '<div class="player-external-sub-notification-body">' + NexusConfig.escapeHtml(parts.join(' • ')) + '</div>' +
                '<div class="player-external-sub-notification-hint">' + NexusConfig.escapeHtml(NexusConfig.t('player_subs_toast_hint')) + '</div>';

            playerPage.appendChild(notification);

            // Auto-dismiss (guaranteed: the node is removed even if animation is unsupported).
            setTimeout(function () {
                if (!notification.parentNode) return;
                notification.classList.add('is-leaving');
                setTimeout(function () {
                    if (notification.parentNode) notification.parentNode.removeChild(notification);
                }, 400);
            }, 4200);
        },

        autoSelectPreferredSubtitle: function () {
            if (this.activeSubtitleIndex !== -1 || !this.subtitles.length) return;
            var preferredLang = NexusConfig.getLanguage(); // 'ar' or 'en'
            for (var i = 0; i < this.subtitles.length; i++) {
                var lang = this.normalizeLang(this.subtitles[i].language || this.subtitles[i].lang);
                if (lang === preferredLang) {
                    this.selectSubtitle(i);
                    return;
                }
            }
        },

        selectSubtitle: function (index) {
            var self = this;
            this.activeSubtitleIndex = index;
            this.subtitleCues = [];
            var badge = document.getElementById('btn-subtitles-label');

            if (index < 0 || index >= this.subtitles.length) {
                this.activeSubtitleIndex = -1;
                if (badge) badge.textContent = NexusConfig.t('player_subtitles_off');
                var overlay = document.getElementById('player-subtitle-overlay');
                if (overlay) overlay.classList.remove('active');
                return;
            }

            var sub = this.subtitles[index];
            if (badge) badge.textContent = 'CC: ' + (sub.label || sub.language || 'Subtitles');

            // If subtitle needs download URL from API
            if (sub.isExternal && sub.id && !sub.url) {
                NexusAPI.getSubtitleDownload(sub.id)
                    .then(function (res) {
                        if (res && res.link) {
                            sub.url = res.link;
                            self.loadSubtitleContent(sub.url);
                        }
                    })
                    .catch(function (e) {
                        console.warn('[NexusPlayer] Subtitle download link failed:', e);
                    });
            } else if (sub.url) {
                this.loadSubtitleContent(sub.url);
            }
        },

        loadSubtitleContent: function (url) {
            var self = this;
            fetch(url)
                .then(function (r) { return r.text(); })
                .then(function (text) {
                    self.subtitleCues = self.parseSubtitles(text);
                    console.log('[NexusPlayer] Parsed subtitle cues:', self.subtitleCues.length);
                })
                .catch(function (err) {
                    console.warn('[NexusPlayer] Failed to load subtitle text:', err.message);
                });
        },

        parseSubtitles: function (text) {
            if (!text) return [];
            var cues = [];
            var blocks = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');
            var timeRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

            for (var i = 0; i < blocks.length; i++) {
                var lines = blocks[i].trim().split('\n');
                var timeLine = null;
                var textLines = [];

                for (var j = 0; j < lines.length; j++) {
                    var l = lines[j].trim();
                    if (timeRegex.test(l)) {
                        timeLine = l;
                    } else if (timeLine && l) {
                        textLines.push(l.replace(/<[^>]+>/g, ''));
                    }
                }

                if (timeLine && textLines.length) {
                    var match = timeLine.match(timeRegex);
                    if (match) {
                        var start = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10) + parseInt(match[4], 10) / 1000;
                        var end = parseInt(match[5], 10) * 3600 + parseInt(match[6], 10) * 60 + parseInt(match[7], 10) + parseInt(match[8], 10) / 1000;
                        cues.push({
                            start: start,
                            end: end,
                            text: textLines.join('\n')
                        });
                    }
                }
            }
            return cues;
        },

        trySource: function (source) {
            if (!source || (!source.url && !source.embedUrl)) {
                this.showError(NexusConfig.t('player_error'));
                return;
            }
            if (typeof webapis !== 'undefined' && !!webapis.avplay) {
                this.useAVPlay = true;
            }
            this.currentSource = source;
            this.isLive = !!(source.isLive || (this.meta && this.meta.isLive));
            var attemptId = ++this.playAttemptId;

            this.cleanupEngine();
            this.showLoading();

            var titleEl = document.getElementById('player-title');
            if (titleEl) {
                var computedTitle = (this.meta && this.meta.title) || source.title || (this.isLive ? 'بث مباشر' : 'NexusNights');
                if (this.meta && this.meta.season && this.meta.episode) {
                    computedTitle += ' • S' + this.meta.season + 'E' + this.meta.episode;
                } else if (this.meta && this.meta.year) {
                    computedTitle += ' (' + this.meta.year + ')';
                }
                titleEl.textContent = computedTitle;
            }

            var badgeEl = document.getElementById('player-badge');
            if (badgeEl) {
                if (this.isLive) {
                    badgeEl.className = 'player-badge live-badge';
                    badgeEl.innerHTML = '<span class="live-dot"></span> ' + NexusConfig.t('player_live_badge');
                } else {
                    badgeEl.className = 'player-badge';
                    var badgeParts = [];
                    if (source.quality) badgeParts.push(source.quality);
                    if (source.provider) badgeParts.push(source.provider);
                    badgeEl.textContent = badgeParts.join(' • ');
                    if (badgeParts.length) badgeEl.classList.remove('hidden');
                    else badgeEl.classList.add('hidden');
                }
            }

            // Native Player Enforcement: NEVER use third-party iframes/embeds.
            // If the source is an embed or needs sniffing, resolve it to direct HLS via /api/streaming/resolve-native.
            var isResolvable = (source.url && source.url.indexOf('/api/streaming/resolve-native') !== -1) ||
                               source.type === 'embed' || source.isEmbed || (!source.url && source.embedUrl);

            if (isResolvable) {
                var self = this;
                this.showLoading();
                var xhr = new XMLHttpRequest();
                var endpoint = (window.NexusAPI && NexusAPI.backendUrl) ? NexusAPI.backendUrl('/api/streaming/resolve-native') : (NexusConfig.getBackendUrl() + '/api/streaming/resolve-native');
                xhr.open('POST', endpoint, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.timeout = 25000;
                xhr.onload = function () {
                    if (self.playAttemptId !== attemptId) return;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            var data = JSON.parse(xhr.responseText);
                            if (data && data.ok && data.streamUrl) {
                                source.url = (window.NexusAPI && NexusAPI.backendUrl) ? NexusAPI.backendUrl(data.streamUrl) : data.streamUrl;
                                source.type = data.type || 'hls';
                                source.isEmbed = false;
                                console.log('[NexusPlayer] Sniffed direct ' + source.type.toUpperCase() + ' stream:', source.url);
                                if (self.useAVPlay) self.playWithAVPlay(source, attemptId);
                                else self.playWithHTML5(source, attemptId);
                                return;
                            }
                        } catch (e) {}
                    }
                    console.warn('[NexusPlayer] Failed to sniff direct stream for', source.provider, ', trying next mirror...');
                    self.tryNextSource(NexusConfig.t('player_error'), attemptId);
                };
                xhr.onerror = function () {
                    if (self.playAttemptId !== attemptId) return;
                    console.warn('[NexusPlayer] Network error sniffing stream for', source.provider);
                    self.tryNextSource(NexusConfig.t('player_error'), attemptId);
                };
                xhr.ontimeout = function () {
                    if (self.playAttemptId !== attemptId) return;
                    console.warn('[NexusPlayer] Timeout sniffing stream for', source.provider);
                    self.tryNextSource(NexusConfig.t('player_error'), attemptId);
                };
                var payload = {
                    tmdbId: (this.meta && this.meta.tmdbId) || 0,
                    kind: (this.meta && this.meta.season) ? 'series' : 'movie',
                    season: (this.meta && this.meta.season) || undefined,
                    episode: (this.meta && this.meta.episode) || undefined,
                    provider: source.provider || undefined,
                    targetUrl: source.embedUrl || (source.url && source.url.indexOf('http') === 0 ? source.url : undefined)
                };
                xhr.send(JSON.stringify(payload));
                return;
            }

            if ((source.type === 'hls' || source.type === 'dash' || source.type === 'mp4') && this.useAVPlay) {
                this.playWithAVPlay(source, attemptId);
            } else {
                this.playWithHTML5(source, attemptId);
            }
        },

        playWithAVPlay: function (source, attemptId) {
            var self = this;
            var avplay = webapis.avplay;
            this.activeEngine = 'avplay';

            // Ensure AVPlay object exists in DOM
            var container = document.getElementById('player-video');
            if (container) {
                container.innerHTML = '<object id="avplay-obj" type="application/avplayer" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;background:transparent;pointer-events:none;"></object>';
            }

            try {
                avplay.open(source.url);
                try {
                    avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
                    avplay.setDisplayRect(0, 0, 1920, 1080);
                } catch (ignoreDisplayMethod) {}

                avplay.setListener({
                    onbufferingstart: function () { self.showLoading(); },
                    onbufferingprogress: function (percent) { self.updateLoadingText(NexusConfig.t('player_buffering') + ' ' + percent + '%'); },
                    onbufferingcomplete: function () { self.hideLoading(); },
                    oncurrentplaytime: function (time) {
                        self.currentTime = Number(time) || 0;
                        if (!self.isLive) {
                            try { self.duration = Number(avplay.getDuration()) || 0; } catch (ignore) {}
                        } else {
                            self.duration = 0;
                        }
                        self.updateProgress();
                        if (self.currentTime - self.lastProgressSaveTime > 15000) {
                            self.lastProgressSaveTime = self.currentTime;
                            self.saveWatchProgress();
                        }
                    },
                    onstreamcompleted: function () { self.handleStreamCompleted(); },
                    onerror: function (error) {
                        if (attemptId !== self.playAttemptId) return;
                        console.warn('[AVPlay] Playback error encountered, falling back to HTML5 engine:', error);
                        self.playWithHTML5(source, attemptId);
                    },
                    onevent: function (event, data) { console.log('[AVPlay] Event:', event, data); }
                });

                avplay.prepareAsync(function () {
                    if (attemptId !== self.playAttemptId) return;
                    try {
                        try {
                            avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
                            avplay.setDisplayRect(0, 0, 1920, 1080);
                        } catch (eGeom) {}

                        avplay.play();
                        self.isPlaying = true;
                        self.hideLoading();
                        self.showControls();
                        self.updatePlayPauseIcon();
                    } catch (error) {
                        console.warn('[AVPlay] Play invocation error, falling back to HTML5:', error);
                        self.playWithHTML5(source, attemptId);
                    }
                }, function (error) {
                    if (attemptId !== self.playAttemptId) return;
                    console.warn('[AVPlay] Prepare error, falling back to HTML5 engine:', error);
                    self.playWithHTML5(source, attemptId);
                });
            } catch (error) {
                console.warn('[AVPlay] Open error, falling back to HTML5 engine:', error);
                this.playWithHTML5(source, attemptId);
            }
        },

        playWithHTML5: function (source, attemptId) {
            var self = this;
            var container = document.getElementById('player-video');
            if (!container) return;
            container.innerHTML = '';

            if (this.hlsInstance) {
                try { this.hlsInstance.destroy(); } catch (e) {}
                this.hlsInstance = null;
            }

            var video = document.createElement('video');
            video.id = 'html5-video';
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.background = '#000';
            video.controls = false;
            video.autoplay = true;
            video.setAttribute('playsinline', 'playsinline');
            video.preload = 'auto';

            var startupTimer = window.setTimeout(function () {
                if (attemptId !== self.playAttemptId) return;
                if (!self.isPlaying) {
                    console.warn('[NexusPlayer] Startup watchdog timeout (10s). Stream stuck loading, trying next mirror...');
                    if (self.hlsInstance) {
                        try { self.hlsInstance.destroy(); } catch (e) {}
                        self.hlsInstance = null;
                    }
                    self.tryNextSource(NexusConfig.t('player_err_hls'), attemptId);
                }
            }, 10000);

            video.addEventListener('loadstart', function () { self.showLoading(); });
            video.addEventListener('canplay', function () { self.hideLoading(); });
            video.addEventListener('playing', function () {
                clearTimeout(startupTimer);
                self.isPlaying = true;
                self.hideLoading();
                self.showControls();
                self.updatePlayPauseIcon();
            });
            video.addEventListener('pause', function () {
                self.isPlaying = false;
                self.updatePlayPauseIcon();
            });
            video.addEventListener('timeupdate', function () {
                self.currentTime = Math.floor(video.currentTime * 1000);
                self.duration = isFinite(video.duration) ? Math.floor(video.duration * 1000) : 0;
                self.updateProgress();
                if (self.currentTime - self.lastProgressSaveTime > 15000) {
                    self.lastProgressSaveTime = self.currentTime;
                    self.saveWatchProgress();
                }
            });
            video.addEventListener('ended', function () { self.handleStreamCompleted(); });
            video.addEventListener('error', function () {
                clearTimeout(startupTimer);
                if (attemptId !== self.playAttemptId) return;
                console.error('[HTML5] Video error:', video.error);
                self.tryNextSource(NexusConfig.t('player_err_decoder'), attemptId);
            });
            video.addEventListener('waiting', function () {
                self.showLoading();
                var now = Date.now();
                // Auto downshift on repeated stalls
                if (self.selectedQualityIndex === -1 && self.hlsInstance && self.hlsInstance.currentLevel > 0) {
                    if (now - self.lastStallTime < 10000) {
                        self.consecutiveStalls++;
                        if (self.consecutiveStalls >= 2) {
                            var newLevel = self.hlsInstance.currentLevel - 1;
                            console.warn('[NexusPlayer] Repeated stalls, downshifting to level ' + newLevel);
                            self.hlsInstance.nextLevel = newLevel;
                            self.consecutiveStalls = 0;
                        }
                    } else {
                        self.consecutiveStalls = 1;
                    }
                    self.lastStallTime = now;
                }
            });

            container.appendChild(video);
            this.videoElement = video;
            this.activeEngine = 'html5';

            // Check if HLS stream and Hls.js is available
            var isHlsStream = source.type === 'hls' || /\.m3u8($|\?)/i.test(source.url);
            if (isHlsStream && window.Hls && window.Hls.isSupported()) {
                console.log('[NexusPlayer] Attaching Hls.js to video element');
                var hls = new window.Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                    maxBufferLength: 60,
                    maxBufferHole: 1.5,
                    backBufferLength: 10,
                    startLevel: -1,
                    abrEwmaDefaultEstimate: 2000000,
                    abrBandWidthFactor: 0.85,
                    abrBandWidthUpFactor: 0.65
                });
                this.hlsInstance = hls;
                hls.loadSource(source.url);
                hls.attachMedia(video);

                hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
                    // Populate quality levels for manual selection
                    self.qualityLevels = [];
                    if (hls.levels && hls.levels.length > 1) {
                        for (var qi = 0; qi < hls.levels.length; qi++) {
                            var lvl = hls.levels[qi];
                            self.qualityLevels.push({
                                id: qi,
                                label: lvl.height ? lvl.height + 'p' : Math.round((lvl.bitrate || 0) / 1000) + 'k',
                                height: lvl.height || 0,
                                bitrate: lvl.bitrate || 0
                            });
                        }
                        self.qualityLevels.sort(function (a, b) { return b.height - a.height || b.bitrate - a.bitrate; });
                    }
                    self.updateQualityButton();
                    video.play().catch(function (e) { console.warn('Autoplay prevented:', e); });
                });

                var networkErrorAttempts = 0;
                hls.on(window.Hls.Events.ERROR, function (event, data) {
                    if (data.fatal) {
                        switch (data.type) {
                            case window.Hls.ErrorTypes.NETWORK_ERROR:
                                networkErrorAttempts++;
                                console.warn('[HLS] Network error encountered (attempt ' + networkErrorAttempts + '):', data.details);
                                if (networkErrorAttempts === 1 && data.details !== 'manifestParsingError' && data.details !== 'manifestLoadError') {
                                    hls.startLoad();
                                } else {
                                    console.error('[HLS] Unrecoverable network error on source, failing over to next mirror');
                                    clearTimeout(startupTimer);
                                    try { hls.destroy(); } catch (e) {}
                                    self.hlsInstance = null;
                                    self.tryNextSource(NexusConfig.t('player_err_hls'), attemptId);
                                }
                                break;
                            case window.Hls.ErrorTypes.MEDIA_ERROR:
                                console.warn('[HLS] Media error encountered, recovering...');
                                hls.recoverMediaError();
                                break;
                            default:
                                console.error('[HLS] Fatal unrecoverable error:', data.details || data);
                                clearTimeout(startupTimer);
                                try { hls.destroy(); } catch (e) {}
                                self.hlsInstance = null;
                                self.tryNextSource(NexusConfig.t('player_err_hls'), attemptId);
                                break;
                        }
                    } else if (data.details === 'manifestParsingError') {
                        console.error('[HLS] Manifest parsing error on source, failing over to next mirror');
                        clearTimeout(startupTimer);
                        try { hls.destroy(); } catch (e) {}
                        self.hlsInstance = null;
                        self.tryNextSource(NexusConfig.t('player_err_hls'), attemptId);
                    }
                });
            } else {
                video.src = source.url;
                video.play().catch(function (err) {
                    console.warn('[HTML5] Play rejected:', err);
                });
            }
        },

        playEmbed: function (source) {
            console.warn('[NexusPlayer] Embed source blocked: 100% native player enforced. Trying next source.');
            this.tryNextSource(NexusConfig.t('player_error'));
        },

        tryNextSource: function (message, attemptId) {
            if (attemptId && attemptId !== this.playAttemptId) return;
            if (this.sourceIndex < this.alternatives.length) {
                var next = this.alternatives[this.sourceIndex];
                this.sourceIndex += 1;
                console.warn('[NexusPlayer] Trying alternative mirror', this.sourceIndex);
                this.showLoading();
                this.trySource(next);
                return;
            }
            this.cleanupEngine();
            this.isPlaying = false;
            this.showError(message || NexusConfig.t('player_error'));
        },

        cleanupEngine: function () {
            if (this.hlsInstance) {
                try { this.hlsInstance.destroy(); } catch (e) {}
                this.hlsInstance = null;
            }
            if (this.activeEngine === 'avplay' && this.useAVPlay) {
                try { webapis.avplay.stop(); } catch (ignoreStop) {}
                try { webapis.avplay.close(); } catch (ignoreClose) {}
            }
            if (this.videoElement) {
                try {
                    this.videoElement.pause();
                    this.videoElement.removeAttribute('src');
                    this.videoElement.load();
                } catch (ignoreVideo) {}
                this.videoElement = null;
            }
            if (this.iframeElement) {
                try { this.iframeElement.src = 'about:blank'; } catch (ignoreFrame) {}
                this.iframeElement = null;
            }
            this.activeEngine = null;
            this.isPlaying = false;
        },

        pause: function () {
            try {
                if (this.activeEngine === 'avplay') webapis.avplay.pause();
                else if (this.activeEngine === 'html5' && this.videoElement) this.videoElement.pause();
                this.isPlaying = false;
                this.updatePlayPauseIcon();
                this.showControls();
            } catch (error) { console.error('[NexusPlayer] Pause failed:', error); }
        },

        resume: function () {
            try {
                if (this.activeEngine === 'avplay') webapis.avplay.play();
                else if (this.activeEngine === 'html5' && this.videoElement) this.videoElement.play();
                else return;
                this.isPlaying = true;
                this.updatePlayPauseIcon();
                this.showControls();
            } catch (error) { console.error('[NexusPlayer] Resume failed:', error); }
        },

        togglePlayPause: function () {
            if (this.activeEngine === 'embed') { this.showControls(); return; }
            if (this.isPlaying) this.pause(); else this.resume();
        },

        stop: function () {
            if (this.stopping) return;
            this.stopping = true;
            console.log('[NexusPlayer] Stopping playback');
            this.clearNextEpisodeCountdown();
            this.saveWatchProgress();
            clearTimeout(this.controlsTimeout);
            this.cleanupEngine();
            this.playAttemptId += 1;
            this.currentSource = null;
            this.primarySource = null;
            this.alternatives = [];
            this.subtitles = [];
            this.subtitleCues = [];
            this.activeSubtitleIndex = -1;
            this.qualityLevels = [];
            this.selectedQualityIndex = -1;
            this.consecutiveStalls = 0;
            this.lastStallTime = 0;
            this.meta = null;
            this.isLive = false;
            this.skipTimings = null;
            this.activeSkipSegment = null;
            this.skipRequestId += 1;
            clearTimeout(this.seekHudTimeout);
            this.hidePlayerPage();
            this.stopping = false;
            if (window.Navigator && Navigator.restoreCurrent) Navigator.restoreCurrent();
        },

        saveWatchProgress: function () {
            if (!this.meta || this.isLive || !this.duration || this.duration <= 0) return;
            try {
                var storageKey = (NexusConfig.storage && NexusConfig.storage.watchProgress) || 'nexus_watch_progress';
                var raw = window.localStorage.getItem(storageKey);
                var progress = raw ? JSON.parse(raw) : {};
                var kind = this.meta.type || this.meta.kind || 'movie';
                var id = this.meta.tmdbId || this.meta.localId || '';
                if (!id) return;
                var entryKey = (kind === 'series' ? 's' : 'm') + '_' + id;
                var posSec = Math.floor(this.currentTime / 1000);
                var durSec = Math.floor(this.duration / 1000);
                if (posSec < 10) return;
                progress[entryKey] = {
                    tmdbId: this.meta.tmdbId || 0,
                    localId: this.meta.localId || '',
                    kind: kind,
                    title: this.meta.title || '',
                    posterUrl: this.meta.posterUrl || null,
                    backdropUrl: this.meta.backdropUrl || null,
                    rating: this.meta.rating || null,
                    year: this.meta.year || null,
                    position: posSec,
                    duration: durSec,
                    timestamp: Date.now()
                };
                window.localStorage.setItem(storageKey, JSON.stringify(progress));
            } catch (e) {
                console.warn('[NexusPlayer] Failed to save watch progress:', e);
            }
        },

        canPlayNextEpisode: function () {
            if (this.isSports || this.isLive || !this.meta) return false;
            if (typeof this.nextEpisodeHandler === 'function') return true;
            if (this.meta.type === 'series' && this.meta.episode) return true;
            return false;
        },

        handleStreamCompleted: function () {
            if (this.isSports || this.isLive) {
                console.warn('[NexusPlayer] Live stream interrupted or ended, reconnecting...');
                this.tryNextSource(NexusConfig.t('player_err_hls'));
                return;
            }
            this.saveWatchProgress();
            if (this.canPlayNextEpisode() && !this.nextEpisodeDismissed) {
                this.showNextEpisodeCountdown();
            } else {
                this.stop();
            }
        },

        showNextEpisodeCountdown: function () {
            if (this.isSports || this.isLive) return;
            var self = this;
            if (this.nextEpisodeActive) return;
            this.nextEpisodeActive = true;
            this.nextCountdownSec = 5;

            var card = document.getElementById('player-next-episode-card');
            if (!card) return;

            var label = document.getElementById('player-next-sec');
            if (label) label.textContent = '5';

            var titleEl = document.getElementById('player-next-title');
            if (titleEl && this.meta) {
                var nextEp = (Number(this.meta.episode) || 0) + 1;
                var s = Number(this.meta.season) || 1;
                titleEl.textContent = (NexusConfig.getLanguage() === 'ar' ? 'الحلقة التالية: S' : 'Next Episode: S') + s + ' E' + nextEp;
            }

            card.classList.remove('hidden');
            if (window.FocusManager) {
                var playBtn = document.getElementById('btn-next-play-now');
                if (playBtn) FocusManager.focus(playBtn);
            }

            this.clearNextEpisodeCountdown();
            this.nextCountdownTimer = setInterval(function () {
                self.nextCountdownSec -= 1;
                var lbl = document.getElementById('player-next-sec');
                if (lbl) lbl.textContent = String(self.nextCountdownSec);

                if (self.nextCountdownSec <= 0) {
                    self.clearNextEpisodeCountdown();
                    self.playNextEpisode();
                }
            }, 1000);
        },

        clearNextEpisodeCountdown: function () {
            if (this.nextCountdownTimer) {
                clearInterval(this.nextCountdownTimer);
                this.nextCountdownTimer = null;
            }
            this.nextEpisodeActive = false;
            var card = document.getElementById('player-next-episode-card');
            if (card) card.classList.add('hidden');
        },

        playNextEpisode: function () {
            var handler = this.nextEpisodeHandler;
            var meta = this.meta;
            this.clearNextEpisodeCountdown();
            if (typeof handler === 'function') {
                this.stop();
                handler();
                return;
            }
            if (meta && meta.type === 'series' && meta.episode) {
                var nextEp = (Number(meta.episode) || 0) + 1;
                var season = Number(meta.season) || 1;
                this.stop();
                if (window.DetailsPage && typeof DetailsPage.playEpisode === 'function') {
                    DetailsPage.playEpisode(season, nextEp);
                }
                return;
            }
            this.stop();
        },

        applySeek: function (positionMs) {
            try {
                if (this.activeEngine === 'avplay' && typeof webapis !== 'undefined' && webapis.avplay) {
                    webapis.avplay.seekTo(positionMs);
                } else if (this.activeEngine === 'html5' && this.videoElement) {
                    this.videoElement.currentTime = positionMs / 1000;
                }
                this.currentTime = positionMs;
                this.updateProgress();
            } catch (error) { console.error('[NexusPlayer] Seek failed:', error); }
        },

        seek: function (positionMs) {
            this.applySeek(positionMs);
            this.showControls();
        },

        seekBy: function (deltaMs) {
            if (this.isSports || this.isLive || this.activeEngine === 'embed' || !this.duration) return false;
            var next = this.currentTime + deltaMs;
            if (next < 0) next = 0;
            if (next > this.duration) next = this.duration;
            this.applySeek(next);
            this.showSeekHud(deltaMs);
            return true;
        },

        showSeekHud: function (deltaMs) {
            if (this.isSports || this.isLive) return;
            var hud = document.getElementById('player-seek-hud');
            if (!hud) return;

            var page = document.getElementById('player-page');
            if (page) page.classList.add('seeking');

            var direction = document.getElementById('player-seek-hud-direction');
            var current = document.getElementById('player-seek-hud-current');
            var total = document.getElementById('player-seek-hud-total');
            var fill = document.getElementById('player-seek-hud-fill');

            hud.classList.remove('hidden');
            if (direction) {
                direction.textContent = deltaMs === 0 ? '' : (deltaMs < 0 ? '-10s' : '+10s');
            }
            if (current) current.textContent = this.formatTime(this.currentTime);
            if (total) total.textContent = this.formatTime(this.duration);
            if (fill && this.duration > 0) {
                var pct = (this.currentTime / this.duration) * 100;
                if (pct < 0) pct = 0; if (pct > 100) pct = 100;
                fill.style.width = pct + '%';
            }

            clearTimeout(this.seekHudTimeout);
            this.seekHudTimeout = window.setTimeout(function () {
                var el = document.getElementById('player-seek-hud');
                if (el) el.classList.add('hidden');
                var shell = document.getElementById('player-page');
                if (shell) shell.classList.remove('seeking');
            }, 900);
        },

        getActiveSkipSegment: function () {
            if (this.isSports || this.isLive) return null;
            var timings = this.skipTimings;
            if (!timings || !timings.found) return null;
            var seconds = this.currentTime / 1000;
            var order = ['recap', 'intro', 'outro'];
            for (var i = 0; i < order.length; i++) {
                var key = order[i];
                var segment = timings[key];
                if (!segment) continue;
                var start = Number(segment.startTime);
                var end = Number(segment.endTime);
                if (seconds >= start && seconds < end) {
                    return { key: key, startTime: start, endTime: end };
                }
            }
            return null;
        },

        updateSkipSegment: function () {
            var button = document.getElementById('btn-skip-segment');
            if (!button) return;

            var segment = this.getActiveSkipSegment();
            var prevKey = this.activeSkipSegment ? this.activeSkipSegment.key : null;
            var nextKey = segment ? segment.key : null;
            this.activeSkipSegment = segment;

            if (!segment || this.isSports || this.isLive || this.activeEngine === 'embed') {
                if (prevKey !== null) {
                    button.classList.add('hidden');
                    if (window.FocusManager && FocusManager.currentFocused === button) {
                        FocusManager.register(document.querySelectorAll('#player-controls .focusable'));
                    }
                }
                return;
            }

            var label = document.getElementById('btn-skip-label');
            if (label) {
                label.textContent = NexusConfig.t(
                    segment.key === 'recap' ? 'player_skip_recap' :
                    (segment.key === 'intro' ? 'player_skip_intro' : 'player_skip_credits')
                );
            }

            if (prevKey === nextKey) return;
            button.classList.remove('hidden');

            var controls = document.getElementById('player-controls');
            if (window.FocusManager && controls && controls.classList.contains('visible')) {
                FocusManager.register(document.querySelectorAll('#player-controls .focusable, #btn-skip-segment'));
            }
        },

        skipActiveSegment: function () {
            var segment = this.getActiveSkipSegment();
            if (!segment || this.isSports || this.isLive) return false;
            var target = segment.key === 'outro'
                ? Math.max(0, this.duration - 500)
                : (segment.endTime + 0.4) * 1000;
            if (this.duration > 0 && target > this.duration) target = this.duration;
            this.applySeek(target);
            this.updateSkipSegment();
            return true;
        },

        skip: function (seconds) {
            if (this.isSports || this.isLive || this.activeEngine === 'embed' || !this.duration) return;
            var next = this.currentTime + seconds * 1000;
            if (next < 0) next = 0;
            if (next > this.duration) next = this.duration;
            this.seek(next);
        },

        formatTime: function (ms) {
            var totalSec = Math.floor((ms || 0) / 1000);
            var hours = Math.floor(totalSec / 3600);
            var mins = Math.floor((totalSec % 3600) / 60);
            var secs = totalSec % 60;
            var mm = mins < 10 ? '0' + mins : '' + mins;
            var ss = secs < 10 ? '0' + secs : '' + secs;
            if (hours > 0) return hours + ':' + mm + ':' + ss;
            return mm + ':' + ss;
        },

        showPlayerPage: function () {
            this.hidePlayerPage();
            document.documentElement.classList.add('player-open');
            document.body.classList.add('player-open');

            var isLiveStream = !!(this.isSports || this.isLive || (this.meta && this.meta.isLive) || (this.currentSource && this.currentSource.isLive));

            // Build player title with metadata
            var titleText = 'NexusNights';
            var badgeText = '';
            
            if (this.meta) {
                if (this.meta.title) {
                    titleText = this.meta.title;
                    if (this.meta.year) titleText += ' (' + this.meta.year + ')';
                    if (this.meta.season && this.meta.episode) {
                        titleText += ' • S' + this.meta.season + 'E' + this.meta.episode;
                    }
                }
                if (isLiveStream) {
                    badgeText = NexusConfig.t('player_live_badge');
                } else if (this.meta.quality) {
                    badgeText = this.meta.quality;
                }
            } else if (isLiveStream) {
                badgeText = NexusConfig.t('player_live_badge');
            }
            
            if (this.currentSource && this.currentSource.provider && !isLiveStream) {
                badgeText += (badgeText ? ' • ' : '') + this.currentSource.provider;
            }

            // SVG Icons
            var backSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
            var playSvg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
            var pauseSvg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
            var rewindSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><text x="12" y="15" font-size="8" font-family="sans-serif" font-weight="bold" fill="currentColor" text-anchor="middle">10</text></svg>';
            var forwardSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/><text x="12" y="15" font-size="8" font-family="sans-serif" font-weight="bold" fill="currentColor" text-anchor="middle">10</text></svg>';
            var reloadSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
            var ccSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:6px;"><rect x="2" y="4" width="20" height="16" rx="3"/><text x="7" y="15" font-size="7" font-weight="bold" fill="currentColor">CC</text></svg>';
            var audioSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:6px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
            var closeSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

            var html = '<div class="player-page" id="player-page">' +
                '<div class="player-container">' +
                '<div id="player-video"></div>' +
                
                // CINEMA TOP GRADIENT OVERLAY WITH TITLE ARTWORK
                '<div class="player-cinematic-overlay">' +
                '<div class="player-gradient-overlay"></div>' +
                '<div class="player-header visible" id="player-header">' +
                '<div class="player-header-info">' +
                '<button class="player-button player-button-icon-only focusable" id="btn-player-back" title="' + NexusConfig.t('player_back') + '">' + backSvg + '</button>' +
                '<div class="player-title-artwork">' +
                '<span class="player-title" id="player-title">' + NexusConfig.escapeHtml(titleText) + '</span>' +
                (badgeText ? '<span class="player-badge' + (isLiveStream ? ' live-badge' : '') + '" id="player-badge">' + NexusConfig.escapeHtml(badgeText) + '</span>' : '') +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +

                // Cinema Style Subtitle Overlay (Bottom Center - VOD only)
                (isLiveStream ? '' :
                '<div class="player-subtitle-overlay" id="player-subtitle-overlay">' +
                '<div class="player-subtitle-container">' +
                '<div class="player-subtitle-text" id="player-subtitle-text"></div>' +
                '</div>' +
                '</div>') +

                // One community skip action: recap, intro, or credits (VOD only)
                (isLiveStream ? '' :
                '<button type="button" class="player-skip-button hidden focusable" id="btn-skip-segment">' +
                SKIP_ICON +
                '<span id="btn-skip-label">' + NexusConfig.t('player_skip_intro') + '</span>' +
                '</button>') +

                // Next Episode Card (Netflix Style with 5s countdown - VOD series only)
                (isLiveStream ? '' :
                '<div class="player-next-card hidden" id="player-next-episode-card">' +
                '<div class="player-next-card-inner">' +
                '<div class="player-next-header">' +
                '<span class="player-next-badge">' + (NexusConfig.getLanguage() === 'ar' ? 'الحلقة التالية' : 'NEXT EPISODE') + '</span>' +
                '<span class="player-next-timer"><span id="player-next-sec">5</span>s</span>' +
                '</div>' +
                '<div class="player-next-info" id="player-next-title"></div>' +
                '<div class="player-next-actions">' +
                '<button class="player-button cinematic-button focusable player-button-primary" id="btn-next-play-now">' +
                (NexusConfig.getLanguage() === 'ar' ? 'تشغيل الآن' : 'Play Now') +
                '</button>' +
                '<button class="player-button cinematic-button focusable" id="btn-next-cancel">' +
                (NexusConfig.getLanguage() === 'ar' ? 'إلغاء' : 'Cancel') +
                '</button>' +
                '</div>' +
                '</div>' +
                '</div>') +

                // Quiet seek feedback while the controls are hidden (VOD only)
                (isLiveStream ? '' :
                '<div class="player-seek-hud hidden" id="player-seek-hud">' +
                '<span class="player-seek-hud-direction" id="player-seek-hud-direction">+10s</span>' +
                '<div class="player-seek-hud-time"><span id="player-seek-hud-current">00:00</span><span class="player-seek-hud-sep">/</span><span id="player-seek-hud-total">00:00</span></div>' +
                '<div class="player-seek-hud-track"><div class="player-seek-hud-fill" id="player-seek-hud-fill"></div></div>' +
                '</div>') +

                // Premium Loading Overlay with Logo
                '<div class="player-loading" id="player-loading">' +
                '<div class="cinematic-spinner">' +
                '<div class="spinner-ring"></div>' +
                '<div class="spinner-ring-inner"></div>' +
                '</div>' +
                '<div class="loading-text" id="player-loading-text">' + NexusConfig.t('player_loading_stream') + '</div>' +
                '</div>' +

                // Cinema Error Overlay
                '<div class="player-error hidden" id="player-error">' +
                '<div class="cinematic-error-container">' +
                '<div class="error-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>' +
                '<div class="error-message" id="player-error-message"></div>' +
                '<div class="error-actions">' +
                '<button class="player-button focusable cinematic-button" id="btn-player-retry">' + NexusConfig.t('player_retry') + '</button>' +
                '<button class="player-button focusable cinematic-button" id="btn-player-exit">' + NexusConfig.t('player_exit') + '</button>' +
                '</div>' +
                '</div>' +
                '</div>' +

                // Cinema Bottom Controls Bar - Floating Glass
                '<div class="player-controls visible" id="player-controls">' +
                
                (isLiveStream ?
                '<div class="player-live-bar" id="player-live-bar">' +
                '<span class="player-live-dot"></span>' +
                '<span class="player-live-status-text">' + NexusConfig.escapeHtml(NexusConfig.t('player_live_badge') || 'مباشر') + ' • HLS</span>' +
                '</div>'
                :
                // Premium Timeline with Thumb
                '<div class="player-timeline" id="player-timeline">' +
                '<span class="player-time cinematic-time" id="player-time-current">00:00</span>' +
                '<div class="player-progress-container focusable" id="player-progress-container" tabindex="0">' +
                '<div class="player-progress-background"></div>' +
                '<div class="player-progress-bar" id="player-progress-bar"></div>' +
                '<div class="player-progress-thumb" id="player-progress-thumb"></div>' +
                '</div>' +
                '<span class="player-time cinematic-time" id="player-time-total">00:00</span>' +
                '</div>') +

                // Premium Buttons Row - Cinema Style
                '<div class="player-buttons" id="player-buttons">' +
                (isLiveStream ? '' : '<button class="player-button cinematic-button focusable" id="btn-rewind" title="' + NexusConfig.t('player_rewind') + '">' + rewindSvg + '<span class="button-label">10s</span></button>') +
                '<button class="player-button player-button-play cinematic-button focusable" id="btn-play-pause" title="' + NexusConfig.t('player_play') + ' / ' + NexusConfig.t('player_pause') + '">' + playSvg + '</button>' +
                (isLiveStream ? '<button class="player-button cinematic-button focusable" id="btn-reload-stream" title="' + (NexusConfig.getLanguage() === 'ar' ? 'إعادة تحميل البث' : 'Reload Stream') + '">' + reloadSvg + '<span class="button-label">' + (NexusConfig.getLanguage() === 'ar' ? 'تحديث' : 'Reload') + '</span></button>' : '') +
                (isLiveStream ? '' : '<button class="player-button cinematic-button focusable" id="btn-forward" title="' + NexusConfig.t('player_forward') + '"><span class="button-label">10s</span>' + forwardSvg + '</button>') +
                (isLiveStream ? '' : '<button class="player-button cinematic-button focusable" id="btn-subtitles">' + ccSvg + '<span class="button-label" id="btn-subtitles-label">' + NexusConfig.t('player_subtitles') + '</span></button>') +
                (isLiveStream ? '' : '<button class="player-button cinematic-button focusable" id="btn-audio">' + audioSvg + '<span class="button-label" id="btn-audio-label">' + NexusConfig.t('player_audio') + '</span></button>') +
                (isLiveStream ? '' : '<button class="player-button cinematic-button focusable" id="btn-quality"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:6px;" aria-hidden="true" focusable="false"><rect x="2" y="13" width="4" height="8" rx="1"/><rect x="9" y="8" width="4" height="13" rx="1"/><rect x="16" y="3" width="4" height="18" rx="1"/></svg><span class="button-label" id="btn-quality-label">' + NexusConfig.t('player_quality_auto') + '</span></button>') +
                '<button class="player-button player-button-icon-only cinematic-button focusable" id="btn-close-player" title="' + NexusConfig.t('player_close_short') + '">' + closeSvg + '</button>' +
                '</div>' +

                '</div>' + // player-controls
                '</div>' + // player-container

                (isLiveStream ? '' :
                // Cinema Style Subtitle Selection Modal
                '<div class="player-modal-backdrop hidden" id="player-subtitles-modal">' +
                '<div class="cinematic-modal">' +
                '<div class="cinematic-modal-header">' +
                '<h3 class="modal-title"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-left:8px;"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="7" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/><line x1="2" y1="12" x2="22" y2="12"/></svg>' + NexusConfig.t('player_subs_title') + '</h3>' +
                '<div class="modal-subtitle">' + NexusConfig.t('player_subs_hint') + '</div>' +
                '</div>' +
                '<div class="cinematic-modal-body">' +
                '<div id="player-subtitles-list" class="cinematic-list"></div>' +
                '</div>' +
                '<div class="cinematic-modal-footer">' +
                '<button class="player-button focusable cinematic-button modal-close" id="btn-close-sub-modal">' + NexusConfig.t('player_close_short') + '</button>' +
                '</div>' +
                '</div>' +
                '</div>' +

                // Premium Audio Track Selection Modal  
                '<div class="player-modal-backdrop hidden" id="player-audio-modal">' +
                '<div class="cinematic-modal">' +
                '<div class="cinematic-modal-header">' +
                '<h3 class="modal-title"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-left:8px;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' + NexusConfig.t('player_audio_title') + '</h3>' +
                '<div class="modal-subtitle">' + NexusConfig.t('player_audio_hint') + '</div>' +
                '</div>' +
                '<div class="cinematic-modal-body">' +
                '<div id="player-audio-list" class="cinematic-list"></div>' +
                '</div>' +
                '<div class="cinematic-modal-footer">' +
                '<button class="player-button focusable cinematic-button modal-close" id="btn-close-audio-modal">' + NexusConfig.t('player_close_short') + '</button>' +
                '</div>' +
                '</div>' +
                '</div>' +

                // New: External Subtitle Loader Modal
                '<div class="player-modal-backdrop hidden" id="player-external-subs-modal">' +
                '<div class="cinematic-modal">' +
                '<div class="cinematic-modal-header">' +
                '<h3 class="modal-title"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-left:8px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' + NexusConfig.t('player_subs_load_more') + '</h3>' +
                '<div class="modal-subtitle" id="player-external-subs-status">' + NexusConfig.t('player_subs_searching') + '</div>' +
                '</div>' +
                '<div class="cinematic-modal-body">' +
                '<div id="player-external-subs-list" class="cinematic-list"></div>' +
                '</div>' +
                '<div class="cinematic-modal-footer">' +
                '<button class="player-button focusable cinematic-button modal-close" id="btn-close-external-subs-modal">' + NexusConfig.t('player_cancel') + '</button>' +
                '</div>' +
                '</div>' +
                '</div>' +

                // Quality Selection Modal
                '<div class="player-modal-backdrop hidden" id="player-quality-modal">' +
                '<div class="cinematic-modal">' +
                '<div class="cinematic-modal-header">' +
                '<h3 class="modal-title"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-left:8px;"><rect x="2" y="13" width="4" height="8" rx="1"/><rect x="9" y="8" width="4" height="13" rx="1"/><rect x="16" y="3" width="4" height="18" rx="1"/></svg>' + NexusConfig.t('player_quality_title') + '</h3>' +
                '<div class="modal-subtitle">' + NexusConfig.t('player_quality_hint') + '</div>' +
                '</div>' +
                '<div class="cinematic-modal-body">' +
                '<div id="player-quality-list" class="cinematic-list"></div>' +
                '</div>' +
                '<div class="cinematic-modal-footer">' +
                '<button class="player-button focusable cinematic-button modal-close" id="btn-close-quality-modal">' + NexusConfig.t('player_close_short') + '</button>' +
                '</div>' +
                '</div>' +
                '</div>') +

                '</div>'; // player-page

            document.getElementById('app').insertAdjacentHTML('beforeend', html);
            this.bindPlayerControls();
        },

        hidePlayerPage: function () {
            document.documentElement.classList.remove('player-open');
            document.body.classList.remove('player-open');
            var page = document.getElementById('player-page');
            if (page && page.parentNode) page.parentNode.removeChild(page);
        },

        bindPlayerControls: function () {
            var self = this;
            var toggle = document.getElementById('btn-play-pause');
            var reloadBtn = document.getElementById('btn-reload-stream');
            var rewind = document.getElementById('btn-rewind');
            var forward = document.getElementById('btn-forward');
            var backBtn = document.getElementById('btn-player-back');
            var closeBtn = document.getElementById('btn-close-player');
            var skipBtn = document.getElementById('btn-skip-segment');
            var subBtn = document.getElementById('btn-subtitles');
            var srcBtn = document.getElementById('btn-sources');
            var retry = document.getElementById('btn-player-retry');
            var exit = document.getElementById('btn-player-exit');
            var closeSubModal = document.getElementById('btn-close-sub-modal');
            var closeSrcModal = document.getElementById('btn-close-sources-modal');
            var progressBar = document.getElementById('player-progress-container');

            if (toggle) toggle.onclick = function () { self.togglePlayPause(); };
            if (reloadBtn) reloadBtn.onclick = function () { self.retryCurrent(); };
            if (rewind) rewind.onclick = function () { self.skip(-10); };
            if (forward) forward.onclick = function () { self.skip(10); };
            if (skipBtn) skipBtn.onclick = function () { self.skipActiveSegment(); };
            if (backBtn) backBtn.onclick = function () { self.stop(); };
            if (closeBtn) closeBtn.onclick = function () { self.stop(); };
            if (retry) retry.onclick = function () { self.retryCurrent(); };
            if (exit) exit.onclick = function () { self.stop(); };

            if (subBtn) subBtn.onclick = function () { self.openSubtitlesModal(); };
            
            var audioBtn = document.getElementById('btn-audio');
            if (audioBtn) audioBtn.onclick = function () { self.openAudioModal(); };
            
            var closeAudioModal = document.getElementById('btn-close-audio-modal');
            if (closeAudioModal) closeAudioModal.onclick = function () { self.closeModals(); };

            var qualityBtn = document.getElementById('btn-quality');
            if (qualityBtn) qualityBtn.onclick = function () { self.openQualityModal(); };

            var closeQualityModal = document.getElementById('btn-close-quality-modal');
            if (closeQualityModal) closeQualityModal.onclick = function () { self.closeModals(); };
            
            if (closeSubModal) closeSubModal.onclick = function () { self.closeModals(); };

            var closeSrcModalBtn = document.getElementById('btn-close-sources-modal');
            if (closeSrcModalBtn) closeSrcModalBtn.onclick = function () { self.closeModals(); };

            var closeExtSubsModal = document.getElementById('btn-close-external-subs-modal');
            if (closeExtSubsModal) closeExtSubsModal.onclick = function () { self.closeModals(); };

            if (progressBar) {
                progressBar.onclick = function (e) {
                    if (self.isLive || !self.duration) return;
                    var rect = progressBar.getBoundingClientRect();
                    var clickX = e.clientX - rect.left;
                    var pct = clickX / rect.width;
                    if (pct < 0) pct = 0; if (pct > 1) pct = 1;
                    self.seek(pct * self.duration);
                };
            }

            var nextPlayBtn = document.getElementById('btn-next-play-now');
            var nextCancelBtn = document.getElementById('btn-next-cancel');
            if (nextPlayBtn) nextPlayBtn.onclick = function () { self.playNextEpisode(); };
            if (nextCancelBtn) nextCancelBtn.onclick = function () {
                self.nextEpisodeDismissed = true;
                self.clearNextEpisodeCountdown();
            };

            var focusSelector = '#player-page .player-buttons .focusable';
            if (!this.isSports && !this.isLive) {
                focusSelector += ', #btn-skip-segment, #player-next-episode-card .focusable';
            }
            FocusManager.register(document.querySelectorAll(focusSelector));
        },

        openSubtitlesModal: function () {
            var modal = document.getElementById('player-subtitles-modal');
            var list = document.getElementById('player-subtitles-list');
            if (!modal || !list) return;

            var self = this;
            var html = '';

            // Option: Turn Off Subtitles
            var isOff = this.activeSubtitleIndex === -1;
            html += '<div class="player-modal-item focusable ' + (isOff ? 'active' : '') + '" data-sub-idx="-1" tabindex="0">';
            html += '<span>' + NexusConfig.escapeHtml(NexusConfig.t('player_subtitles_off')) +
                    '<span class="player-modal-item-note">' + NexusConfig.escapeHtml(NexusConfig.t('player_subs_off_note')) + '</span></span>';
            if (isOff) html += '<span>' + playerIconCheck(20) + '</span>';
            html += '</div>';

            // Available Subtitle Tracks
            for (var i = 0; i < this.subtitles.length; i++) {
                var item = this.subtitles[i];
                var isSelected = this.activeSubtitleIndex === i;
                var langBadge = this.subtitleLabel(this.normalizeLang(item.language || item.lang), item.label);
                html += '<div class="player-modal-item focusable ' + (isSelected ? 'active' : '') + '" data-sub-idx="' + i + '" tabindex="0">';
                html += '<span>' + NexusConfig.escapeHtml(item.label || langBadge);

                // Add external subtitle badge
                if (item.isExternal) {
                    html += '<span class="player-modal-item-badge">' + NexusConfig.escapeHtml(NexusConfig.t('player_subs_external')) + '</span>';
                }

                html += '</span>';
                if (isSelected) html += '<span>' + playerIconCheck(20) + '</span>';
                html += '</div>';
            }

            // Nothing loaded yet — tell the viewer where to get more.
            if (this.subtitles.length === 0) {
                html += '<div class="player-modal-empty">' + NexusConfig.escapeHtml(NexusConfig.t('player_subs_none')) + '</div>';
            }

            // Load More Subtitles Option (External)
            html += '<div class="player-modal-item player-modal-item-action focusable">' +
                    '<button class="cinematic-button" id="btn-load-more-subs" style="width: 100%; background: rgba(212,175,106,0.1); border-color: rgba(212,175,106,0.3); color: var(--color-brand-gold);">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 8px;">' +
                    '<path d="M12 5v14M5 12h14"/></svg>' +
                    NexusConfig.escapeHtml(NexusConfig.t('player_subs_load_more')) +
                    '</button>' +
                    '</div>';

            list.innerHTML = html;

            var items = list.querySelectorAll('[data-sub-idx]');
            for (var j = 0; j < items.length; j++) {
                items[j].onclick = function () {
                    var idx = parseInt(this.getAttribute('data-sub-idx'), 10);
                    self.selectSubtitle(idx);
                    self.closeModals();
                };
            }

            // Bind load more subtitles button
            var loadMoreBtn = document.getElementById('btn-load-more-subs');
            if (loadMoreBtn) {
                loadMoreBtn.onclick = function() {
                    self.openExternalSubtitlesModal();
                };
            }

            modal.classList.remove('hidden');
            FocusManager.register(modal.querySelectorAll('.focusable'));
        },
        
        openExternalSubtitlesModal: function() {
            var modal = document.getElementById('player-external-subs-modal');
            var list = document.getElementById('player-external-subs-list');
            var status = document.getElementById('player-external-subs-status');
            if (!modal || !list) return;

            var self = this;
            var settled = false;
            var guardTimer = null;

            function setStatus(text) { if (status) status.textContent = text; }

            function stateBlock(icon, message, withRetry) {
                return '<div class="player-modal-state">' +
                       (icon ? '<div class="player-modal-state-icon">' + icon + '</div>' : '') +
                       NexusConfig.escapeHtml(message) +
                       (withRetry ? '<div class="player-modal-state-actions">' +
                           '<button class="cinematic-button focusable" id="btn-retry-external-subs">' +
                           NexusConfig.escapeHtml(NexusConfig.t('player_subs_retry')) + '</button></div>' : '') +
                       '</div>';
            }

            function settle(finish) {
                if (settled) return;
                settled = true;
                if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; }
                try { finish(); } catch (eFinish) { console.error(eFinish); }
                FocusManager.register(modal.querySelectorAll('.focusable'));
            }

            function renderResults(results) {
                var html = '';
                var uniqueTracks = {};

                for (var i = 0; i < results.length; i++) {
                    var item = results[i];
                    var lang = self.normalizeLang(item.language);
                    var provider = item.provider || 'OpenSubtitles';
                    var quality = item.quality || (item.rating > 8 ? 'HD' : 'Normal');
                    var key = lang + '_' + (item.id || i);
                    if (uniqueTracks[key]) continue;
                    uniqueTracks[key] = true;

                    var alreadyLoaded = self.subtitles.some(function (sub) {
                        return sub.id && sub.id === item.id;
                    });

                    var downloadsText = String(item.downloads || item.downloadCount || 0);

                    html += '<div class="player-modal-item focusable ' + (alreadyLoaded ? 'loaded' : '') +
                            '" data-external-id="' + i + '" tabindex="0">' +
                            '<span>' + NexusConfig.escapeHtml(self.subtitleLabel(lang, item.languageName || item.fileName)) +
                            '<span class="player-modal-item-note">' +
                            NexusConfig.escapeHtml(provider + ' • ' + quality + ' • ') + PLAYER_ICON_DOWNLOAD + ' ' +
                            NexusConfig.escapeHtml(downloadsText) + '</span></span>' +
                            '<span class="player-modal-item-action-label">' +
                            NexusConfig.escapeHtml(alreadyLoaded ? NexusConfig.t('player_subs_downloaded') : NexusConfig.t('player_subs_download')) +
                            '</span>' +
                            '</div>';
                }

                setStatus(NexusConfig.t('player_subs_title'));
                list.innerHTML = html;

                var items = list.querySelectorAll('[data-external-id]');
                for (var j = 0; j < items.length; j++) {
                    items[j].onclick = (function (idx) {
                        return function () {
                            var item = results[idx];
                            if (!item) return;

                            var lang = self.normalizeLang(item.language);
                            var provider = item.provider || 'OpenSubtitles';

                            var existingIndex = -1;
                            for (var k = 0; k < self.subtitles.length; k++) {
                                if (self.subtitles[k].id === item.id) { existingIndex = k; break; }
                            }

                            if (existingIndex === -1) {
                                var newSub = {
                                    id: item.id,
                                    url: item.url || null,
                                    language: lang,
                                    label: self.subtitleLabel(lang, item.languageName || item.fileName),
                                    isExternal: true,
                                    provider: provider,
                                    quality: item.quality || 'Good',
                                    downloads: item.downloads || item.downloadCount || 0,
                                    rating: item.rating || 0
                                };
                                self.subtitles.push(newSub);
                                existingIndex = self.subtitles.length - 1;
                            }

                            self.selectSubtitle(existingIndex);
                            if (window.NexusApp && NexusApp.showToast) {
                                NexusApp.showToast(NexusConfig.t('player_subs_added'));
                            }

                            self.closeModals();
                        };
                    })(parseInt(items[j].getAttribute('data-external-id'), 10));
                }
            }

            function run() {
                settled = false;
                if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; }

                setStatus(NexusConfig.t('player_subs_searching'));
                list.innerHTML = stateBlock('<div class="loading-spinner" style="margin: 0 auto;"></div>', NexusConfig.t('player_subs_searching'), false);
                FocusManager.register(modal.querySelectorAll('.focusable'));

                if (!self.meta || !self.meta.tmdbId || !window.NexusAPI || !NexusAPI.getSubtitles) {
                    settle(function () {
                        setStatus(NexusConfig.t('player_subs_unavailable'));
                        list.innerHTML = stateBlock('', NexusConfig.t('player_subs_unavailable'), false);
                    });
                    return;
                }

                // Hard settle guard: never stay on spinner longer than 4.5s
                guardTimer = setTimeout(function () {
                    settle(function () {
                        setStatus(NexusConfig.t('player_subs_none'));
                        list.innerHTML = stateBlock('', NexusConfig.t('player_subs_none'), true);
                    });
                }, 4500);

                NexusAPI.getSubtitles(self.meta.tmdbId, self.meta.type || 'movie', self.meta.season, self.meta.episode)
                    .then(function (results) {
                        settle(function () {
                            if (!results || results.length === 0) {
                                setStatus(NexusConfig.t('player_subs_none'));
                                list.innerHTML = stateBlock('', NexusConfig.t('player_subs_none'), true);
                                return;
                            }
                            renderResults(results);
                        });
                    })
                    .catch(function (err) {
                        console.warn('[NexusPlayer] Subtitle search failed:', err && err.message);
                        settle(function () {
                            setStatus(NexusConfig.t('player_subs_error'));
                            list.innerHTML = stateBlock('', NexusConfig.t('player_subs_error'), true);
                        });
                    });
            }

            // Delegated retry handler
            list.onclick = function (e) {
                var node = e.target;
                while (node && node !== list) {
                    if (node.id === 'btn-retry-external-subs') { run(); return; }
                    node = node.parentNode;
                }
            };

            modal.classList.remove('hidden');
            run();
        },

        openSourcesModal: function () {
            var modal = document.getElementById('player-sources-modal');
            var list = document.getElementById('player-sources-list');
            if (!modal || !list) return;

            var self = this;
            var html = '';

            // Current primary source
            var allSources = [];
            if (this.primarySource) allSources.push(this.primarySource);
            if (this.alternatives && this.alternatives.length) {
                allSources = allSources.concat(this.alternatives);
            }

            for (var i = 0; i < allSources.length; i++) {
                var src = allSources[i];
                var isCurrent = self.currentSource && (self.currentSource.url === src.url || self.currentSource.provider === src.provider);
                html += '<div class="player-modal-item focusable ' + (isCurrent ? 'active' : '') + '" data-src-idx="' + i + '" tabindex="0">';
                html += '<span>' + NexusConfig.escapeHtml(src.provider || (NexusConfig.t('player_server') + ' ' + (i + 1))) + '</span>';
                if (isCurrent) html += '<span class="player-modal-item-check">' + playerIconCheck(18) + NexusConfig.escapeHtml(NexusConfig.t('player_now_playing')) + '</span>';
                html += '</div>';
            }

            list.innerHTML = html;

            var items = list.querySelectorAll('.player-modal-item');
            for (var j = 0; j < items.length; j++) {
                items[j].onclick = function () {
                    var idx = parseInt(this.getAttribute('data-src-idx'), 10);
                    if (allSources[idx]) {
                        self.trySource(allSources[idx]);
                    }
                    self.closeModals();
                };
            }

            modal.classList.remove('hidden');
            FocusManager.register(modal.querySelectorAll('.focusable'));
        },

        closeModals: function () {
            var subModal = document.getElementById('player-subtitles-modal');
            var audioModal = document.getElementById('player-audio-modal');
            var qualityModal = document.getElementById('player-quality-modal');
            var extSubsModal = document.getElementById('player-external-subs-modal');
            var srcModal = document.getElementById('player-sources-modal');
            if (subModal) subModal.classList.add('hidden');
            if (audioModal) audioModal.classList.add('hidden');
            if (qualityModal) qualityModal.classList.add('hidden');
            if (extSubsModal) extSubsModal.classList.add('hidden');
            if (srcModal) srcModal.classList.add('hidden');
            FocusManager.register(document.querySelectorAll('#player-controls .focusable'));
        },

        isAnyModalOpen: function () {
            var ids = ['player-subtitles-modal', 'player-audio-modal', 'player-quality-modal', 'player-external-subs-modal', 'player-sources-modal'];
            for (var i = 0; i < ids.length; i++) {
                var el = document.getElementById(ids[i]);
                if (el && !el.classList.contains('hidden')) return true;
            }
            return false;
        },

        openAudioModal: function () {
            var modal = document.getElementById('player-audio-modal');
            var list = document.getElementById('player-audio-list');
            if (!modal || !list) return;

            var self = this;
            var html = '';

            // Get audio tracks from HTML5 video or HLS
            var audioTracks = [];
            
            if (this.activeEngine === 'html5' && this.videoElement && this.videoElement.audioTracks) {
                for (var i = 0; i < this.videoElement.audioTracks.length; i++) {
                    var track = this.videoElement.audioTracks[i];
                    audioTracks.push({
                        id: track.id,
                        label: track.label || track.language || ('Audio ' + (i + 1)),
                        language: track.language,
                        enabled: track.enabled
                    });
                }
            } else if (this.hlsInstance && this.hlsInstance.audioTracks) {
                var hlsTracks = this.hlsInstance.audioTracks;
                for (var j = 0; j < hlsTracks.length; j++) {
                    var hlsTrack = hlsTracks[j];
                    audioTracks.push({
                        id: hlsTrack.id,
                        label: hlsTrack.name || hlsTrack.lang || ('Audio ' + (j + 1)),
                        language: hlsTrack.lang,
                        enabled: this.hlsInstance.audioTrack === j
                    });
                }
            }

            if (audioTracks.length === 0) {
                html = '<div class="player-modal-empty">' + NexusConfig.escapeHtml(NexusConfig.t('player_audio_none')) + '</div>';
            } else {
                for (var k = 0; k < audioTracks.length; k++) {
                    var audio = audioTracks[k];
                    var isActive = audio.enabled;
                    html += '<div class="player-modal-item focusable ' + (isActive ? 'active' : '') + '" data-audio-idx="' + k + '" tabindex="0">';
                    html += '<span>' + NexusConfig.escapeHtml(audio.label) + '</span>';
                    if (isActive) html += '<span class="player-modal-item-check">' + playerIconCheck(18) + NexusConfig.escapeHtml(NexusConfig.t('settings_active')) + '</span>';
                    html += '</div>';
                }
            }

            list.innerHTML = html;
            modal.classList.remove('hidden');

            // Bind click handlers
            var items = list.querySelectorAll('[data-audio-idx]');
            for (var m = 0; m < items.length; m++) {
                items[m].onclick = (function (idx) {
                    return function () {
                        self.selectAudioTrack(idx);
                        self.closeModals();
                    };
                })(parseInt(items[m].getAttribute('data-audio-idx'), 10));
            }

            FocusManager.register(document.querySelectorAll('#player-audio-modal .focusable'));
        },

        selectAudioTrack: function (index) {
            console.log('[NexusPlayer] Selecting audio track:', index);
            
            if (this.activeEngine === 'html5' && this.videoElement && this.videoElement.audioTracks) {
                // HTML5 AudioTracks API
                for (var i = 0; i < this.videoElement.audioTracks.length; i++) {
                    this.videoElement.audioTracks[i].enabled = (i === index);
                }
            } else if (this.hlsInstance && this.hlsInstance.audioTracks) {
                // Hls.js audio track selection
                this.hlsInstance.audioTrack = index;
            }

            var badge = document.getElementById('btn-audio-label');
            if (badge) {
                badge.textContent = 'Audio ' + (index + 1);
            }
        },

        openQualityModal: function () {
            var modal = document.getElementById('player-quality-modal');
            var list = document.getElementById('player-quality-list');
            if (!modal || !list) return;

            var self = this;
            var html = '';
            var curAutoLabel = '';
            if (this.hlsInstance && this.hlsInstance.currentLevel >= 0 && this.qualityLevels.length > 0) {
                for (var qi = 0; qi < this.qualityLevels.length; qi++) {
                    if (this.qualityLevels[qi].id === this.hlsInstance.currentLevel) {
                        curAutoLabel = ' (' + this.qualityLevels[qi].label + ')';
                        break;
                    }
                }
            }

            // Auto row
            var isAuto = this.selectedQualityIndex === -1;
            html += '<div class="player-modal-item focusable ' + (isAuto ? 'active' : '') + '" data-quality-idx="-1" tabindex="0">';
            html += '<span>' + NexusConfig.t('player_quality_auto') + curAutoLabel;
            html += '<span class="player-modal-item-note">' + NexusConfig.escapeHtml(NexusConfig.t('player_quality_auto_note')) + '</span></span>';
            if (isAuto) html += '<span class="player-modal-item-check">' + playerIconCheck(18) + NexusConfig.escapeHtml(NexusConfig.t('settings_active')) + '</span>';
            html += '</div>';

            if (this.qualityLevels.length === 0) {
                html += '<div class="player-modal-empty">' + NexusConfig.escapeHtml(NexusConfig.t('player_quality_none')) + '</div>';
            } else {
                for (var i = 0; i < this.qualityLevels.length; i++) {
                    var lvl = this.qualityLevels[i];
                    var isSel = this.selectedQualityIndex === lvl.id;
                    html += '<div class="player-modal-item focusable ' + (isSel ? 'active' : '') + '" data-quality-idx="' + lvl.id + '" tabindex="0">';
                    html += '<span>' + NexusConfig.escapeHtml(lvl.label) + '</span>';
                    if (isSel) html += '<span class="player-modal-item-check">' + playerIconCheck(18) + NexusConfig.escapeHtml(NexusConfig.t('settings_active')) + '</span>';
                    html += '</div>';
                }
            }

            list.innerHTML = html;
            modal.classList.remove('hidden');

            var items = list.querySelectorAll('[data-quality-idx]');
            for (var j = 0; j < items.length; j++) {
                items[j].onclick = (function (idx) {
                    return function () {
                        self.selectQuality(idx);
                        self.closeModals();
                    };
                })(parseInt(items[j].getAttribute('data-quality-idx'), 10));
            }

            FocusManager.register(document.querySelectorAll('#player-quality-modal .focusable'));
        },

        selectQuality: function (index) {
            this.selectedQualityIndex = index;
            if (this.hlsInstance) {
                if (index === -1) {
                    this.hlsInstance.currentLevel = -1; // Auto
                    this.hlsInstance.autoLevelEnabled = true;
                } else {
                    this.hlsInstance.currentLevel = index; // Lock specific level
                    this.hlsInstance.autoLevelEnabled = false;
                }
            }
            this.updateQualityButton();

            // Toast feedback
            var lvlLabel = NexusConfig.t('player_quality_auto');
            if (index >= 0) {
                for (var i = 0; i < this.qualityLevels.length; i++) {
                    if (this.qualityLevels[i].id === index) {
                        lvlLabel = this.qualityLevels[i].label;
                        break;
                    }
                }
            }
            if (window.NexusApp && NexusApp.showToast) {
                NexusApp.showToast(NexusConfig.t('player_quality_changed') + ' ' + lvlLabel);
            }
        },

        updateQualityButton: function () {
            var btn = document.getElementById('btn-quality-label');
            if (!btn) return;
            if (this.selectedQualityIndex === -1) {
                var curLabel = '';
                if (this.hlsInstance && this.hlsInstance.currentLevel >= 0 && this.qualityLevels.length > 0) {
                    for (var qi = 0; qi < this.qualityLevels.length; qi++) {
                        if (this.qualityLevels[qi].id === this.hlsInstance.currentLevel) {
                            curLabel = ' (' + this.qualityLevels[qi].label + ')';
                            break;
                        }
                    }
                }
                btn.textContent = NexusConfig.t('player_quality_auto') + curLabel;
            } else {
                var selLvl = null;
                for (var i = 0; i < this.qualityLevels.length; i++) {
                    if (this.qualityLevels[i].id === this.selectedQualityIndex) {
                        selLvl = this.qualityLevels[i];
                        break;
                    }
                }
                btn.textContent = selLvl ? selLvl.label : NexusConfig.t('player_quality_auto');
            }
        },

        retryCurrent: function () {
            if (!this.primarySource) { this.stop(); return; }
            this.sourceIndex = 0;
            this.trySource(this.primarySource);
        },

        updatePlayPauseIcon: function () {
            var btn = document.getElementById('btn-play-pause');
            if (!btn) return;
            var playSvg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
            var pauseSvg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
            btn.innerHTML = this.isPlaying ? pauseSvg : playSvg;
        },

        updateProgress: function () {
            if (this.isSports || this.isLive) return;

            // Update time numbers
            var currentEl = document.getElementById('player-time-current');
            var totalEl = document.getElementById('player-time-total');
            var progressBar = document.getElementById('player-progress-bar');

            if (currentEl) currentEl.textContent = this.formatTime(this.currentTime);
            if (totalEl && this.duration > 0) totalEl.textContent = this.formatTime(this.duration);

            if (progressBar && this.duration > 0) {
                var pct = (this.currentTime / this.duration) * 100;
                if (pct < 0) pct = 0; if (pct > 100) pct = 100;
                progressBar.style.width = pct + '%';
            }

            // Skip action + subtitle cue display
            this.updateSkipSegment();
            this.renderActiveSubtitleCue();
            this.updateQualityButton();

            // Next Episode Countdown check for series:
            if (this.canPlayNextEpisode() && !this.nextEpisodeActive && !this.nextEpisodeDismissed && this.duration > 60000) {
                var rem = this.duration - this.currentTime;
                var isOutro = this.activeSkipSegment && this.activeSkipSegment.key === 'outro';
                if (isOutro || (rem <= 20000 && rem > 0)) {
                    this.showNextEpisodeCountdown();
                }
            }
        },

        renderActiveSubtitleCue: function () {
            var overlay = document.getElementById('player-subtitle-overlay');
            var textEl = document.getElementById('player-subtitle-text');
            if (!overlay || !textEl) return;

            if (this.isSports || this.isLive || this.activeSubtitleIndex === -1 || !this.subtitleCues.length) {
                overlay.classList.remove('active');
                textEl.textContent = '';
                return;
            }

            var currentSec = this.currentTime / 1000;
            var matchedCue = null;

            for (var i = 0; i < this.subtitleCues.length; i++) {
                var cue = this.subtitleCues[i];
                if (currentSec >= cue.start && currentSec <= cue.end) {
                    matchedCue = cue;
                    break;
                }
            }

            if (matchedCue && matchedCue.text) {
                if (textEl.textContent !== matchedCue.text) {
                    textEl.textContent = matchedCue.text;
                }
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
                textEl.textContent = '';
            }
        },

        updateLoadingText: function (text) {
            var label = document.getElementById('player-loading-text');
            if (label) label.textContent = text;
        },

        showLoading: function () {
            var loading = document.getElementById('player-loading');
            if (loading) loading.classList.remove('hidden');
        },

        hideLoading: function () {
            var loading = document.getElementById('player-loading');
            if (loading) loading.classList.add('hidden');
        },

        showError: function (message) {
            var error = document.getElementById('player-error');
            var label = document.getElementById('player-error-message');
            if (label) label.textContent = message;
            if (error) error.classList.remove('hidden');
            this.hideLoading();
            this.showControls();
            FocusManager.register(document.querySelectorAll('#player-error .focusable'));
        },

        showControls: function () {
            var controls = document.getElementById('player-controls');
            var header = document.getElementById('player-header');
            var page = document.getElementById('player-page');
            if (!controls) return;

            var wasHidden = !controls.classList.contains('visible');
            controls.classList.add('visible');
            if (header) header.classList.add('visible');
            if (page) page.classList.add('controls-visible');

            // The chrome owns the timeline now; the transient seek HUD steps aside.
            var seekHud = document.getElementById('player-seek-hud');
            if (seekHud) seekHud.classList.add('hidden');
            var shell = document.getElementById('player-page');
            if (shell) shell.classList.remove('seeking');

            if (wasHidden && window.FocusManager) {
                var focusSelector = '#player-controls .focusable';
                if (!this.isSports && !this.isLive) {
                    focusSelector += ', #btn-skip-segment';
                }
                FocusManager.register(document.querySelectorAll(focusSelector));
            }

            clearTimeout(this.controlsTimeout);
            this.controlsTimeout = window.setTimeout(function () {
                var p = document.getElementById('player-page');
                if (!p) return;
                var error = document.getElementById('player-error');
                if (error && !error.classList.contains('hidden')) return;
                var subModal = document.getElementById('player-subtitles-modal');
                if (subModal && !subModal.classList.contains('hidden')) return;
                var srcModal = document.getElementById('player-sources-modal');
                if (srcModal && !srcModal.classList.contains('hidden')) return;
                var audioModal = document.getElementById('player-audio-modal');
                if (audioModal && !audioModal.classList.contains('hidden')) return;
                var qualityModal = document.getElementById('player-quality-modal');
                if (qualityModal && !qualityModal.classList.contains('hidden')) return;

                controls.classList.remove('visible');
                if (header) header.classList.remove('visible');
                p.classList.remove('controls-visible');
                if (window.FocusManager) FocusManager.clear();
            }, NexusConfig.playback.controlsTimeout || 4500);
        }
    };
})(window);
