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
            this.sourceIndex = 0;
            this.currentTime = 0;
            this.duration = 0;
            this.stopping = false;
            this.skippedEmbedSources = 0;
            this.activeSubtitleIndex = -1;
            this.subtitleCues = [];

            this.showPlayerPage();

            var playerPage = document.getElementById('player-page');
            if (playerPage) {
                playerPage.classList.toggle('is-live', !!(source.isLive || (meta && meta.isLive)));
            }

            // Fetch extra unified subtitles (Arabic & English) if TMDB metadata is available
            this.fetchExternalSubtitles();

            this.trySource(source);
        },

        fetchExternalSubtitles: function () {
            var self = this;
            if (!this.meta || !this.meta.tmdbId || !window.NexusAPI || !NexusAPI.getSubtitles) return;

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
                var computedTitle = (this.meta && this.meta.title) || source.title || (this.isLive ? 'بث مباشر' : 'NEXUSNIGHT');
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
                    badgeEl.textContent = (source.quality || '1080p') + ' • ' + (source.provider || 'HD');
                }
            }

            if (source.type === 'embed' || source.embedUrl) {
                if (typeof tizen !== 'undefined' && tizen.application) {
                    this.skippedEmbedSources += 1;
                    this.tryNextSource(NexusConfig.t('player_err_embed'), attemptId);
                } else {
                    this.playEmbed(source);
                }
            } else if ((source.type === 'hls' || source.type === 'dash' || source.type === 'mp4') && this.useAVPlay) {
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
                    onstreamcompleted: function () { self.stop(); },
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

            video.addEventListener('loadstart', function () { self.showLoading(); });
            video.addEventListener('canplay', function () { self.hideLoading(); });
            video.addEventListener('playing', function () {
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
            video.addEventListener('ended', function () { self.stop(); });
            video.addEventListener('error', function () {
                if (attemptId !== self.playAttemptId) return;
                console.error('[HTML5] Video error:', video.error);
                self.tryNextSource(NexusConfig.t('player_err_decoder'), attemptId);
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
                    lowLatencyMode: true,
                    backBufferLength: 60
                });
                this.hlsInstance = hls;
                hls.loadSource(source.url);
                hls.attachMedia(video);

                hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
                    video.play().catch(function (e) { console.warn('Autoplay prevented:', e); });
                });

                hls.on(window.Hls.Events.ERROR, function (event, data) {
                    if (data.fatal) {
                        switch (data.type) {
                            case window.Hls.ErrorTypes.NETWORK_ERROR:
                                console.warn('[HLS] Network error encountered, trying recover...');
                                hls.startLoad();
                                break;
                            case window.Hls.ErrorTypes.MEDIA_ERROR:
                                console.warn('[HLS] Media error encountered, recovering...');
                                hls.recoverMediaError();
                                break;
                            default:
                                console.error('[HLS] Fatal unrecoverable error:', data);
                                hls.destroy();
                                self.hlsInstance = null;
                                self.tryNextSource(NexusConfig.t('player_err_hls'), attemptId);
                                break;
                        }
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
            var container = document.getElementById('player-video');
            if (!container) return;
            container.innerHTML = '';
            var frame = document.createElement('iframe');
            frame.id = 'provider-embed';
            frame.src = source.embedUrl || source.url;
            frame.title = 'NEXUSNIGHT playback';
            frame.setAttribute('allowfullscreen', 'true');
            frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
            frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            frame.style.width = '100%';
            frame.style.height = '100%';
            frame.style.border = '0';
            frame.addEventListener('load', this.hideLoading.bind(this));
            container.appendChild(frame);
            this.iframeElement = frame;
            this.activeEngine = 'embed';
            this.isPlaying = true;
            this.showControls();
            this.hideLoading();
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
            this.meta = null;
            this.isLive = false;
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

        seek: function (positionMs) {
            try {
                if (this.activeEngine === 'avplay') webapis.avplay.seekTo(positionMs);
                else if (this.activeEngine === 'html5' && this.videoElement) this.videoElement.currentTime = positionMs / 1000;
                this.showControls();
            } catch (error) { console.error('[NexusPlayer] Seek failed:', error); }
        },

        skip: function (seconds) {
            if (this.isLive || this.activeEngine === 'embed' || !this.duration) return;
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

            // Build player title with metadata
            var titleText = 'NEXUSNIGHT';
            var badgeText = '1080p';
            
            if (this.meta) {
                if (this.meta.title) {
                    titleText = this.meta.title;
                    if (this.meta.year) titleText += ' (' + this.meta.year + ')';
                    if (this.meta.season && this.meta.episode) {
                        titleText += ' • S' + this.meta.season + 'E' + this.meta.episode;
                    }
                }
                if (this.meta.isLive) {
                    badgeText = 'LIVE • ' + (this.meta.quality || '1080p');
                } else if (this.meta.quality) {
                    badgeText = this.meta.quality;
                }
            }
            
            if (this.currentSource && this.currentSource.provider) {
                badgeText += ' • ' + this.currentSource.provider;
            }

            // SVG Icons
            var backSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
            var playSvg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
            var pauseSvg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
            var rewindSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><text x="12" y="15" font-size="8" font-family="sans-serif" font-weight="bold" fill="currentColor" text-anchor="middle">10</text></svg>';
            var forwardSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/><text x="12" y="15" font-size="8" font-family="sans-serif" font-weight="bold" fill="currentColor" text-anchor="middle">10</text></svg>';
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
                '<span class="player-badge" id="player-badge">' + NexusConfig.escapeHtml(badgeText) + '</span>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +

                // Cinema Style Subtitle Overlay (Bottom Center)
                '<div class="player-subtitle-overlay" id="player-subtitle-overlay">' +
                '<div class="player-subtitle-container">' +
                '<div class="player-subtitle-text" id="player-subtitle-text"></div>' +
                '</div>' +
                '</div>' +

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
                
                // Premium Timeline with Thumb
                '<div class="player-timeline" id="player-timeline">' +
                '<span class="player-time cinematic-time" id="player-time-current">00:00</span>' +
                '<div class="player-progress-container focusable" id="player-progress-container" tabindex="0">' +
                '<div class="player-progress-background"></div>' +
                '<div class="player-progress-bar" id="player-progress-bar"></div>' +
                '<div class="player-progress-thumb" id="player-progress-thumb"></div>' +
                '</div>' +
                '<span class="player-time cinematic-time" id="player-time-total">00:00</span>' +
                '</div>' +

                // Premium Buttons Row - Cinema Style
                '<div class="player-buttons" id="player-buttons">' +
                '<button class="player-button cinematic-button focusable" id="btn-rewind" title="' + NexusConfig.t('player_rewind') + '">' + rewindSvg + '<span class="button-label">10s</span></button>' +
                '<button class="player-button player-button-play cinematic-button focusable" id="btn-play-pause" title="' + NexusConfig.t('player_play') + ' / ' + NexusConfig.t('player_pause') + '">' + playSvg + '</button>' +
                '<button class="player-button cinematic-button focusable" id="btn-forward" title="' + NexusConfig.t('player_forward') + '"><span class="button-label">10s</span>' + forwardSvg + '</button>' +
                '<button class="player-button cinematic-button focusable" id="btn-subtitles">' + ccSvg + '<span class="button-label" id="btn-subtitles-label">' + NexusConfig.t('player_subtitles') + '</span></button>' +
                '<button class="player-button cinematic-button focusable" id="btn-audio">' + audioSvg + '<span class="button-label" id="btn-audio-label">' + NexusConfig.t('player_audio') + '</span></button>' +
                '<button class="player-button player-button-icon-only cinematic-button focusable" id="btn-close-player" title="' + NexusConfig.t('player_close_short') + '">' + closeSvg + '</button>' +
                '</div>' +

                '</div>' + // player-controls
                '</div>' + // player-container

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
            var rewind = document.getElementById('btn-rewind');
            var forward = document.getElementById('btn-forward');
            var backBtn = document.getElementById('btn-player-back');
            var closeBtn = document.getElementById('btn-close-player');
            var subBtn = document.getElementById('btn-subtitles');
            var srcBtn = document.getElementById('btn-sources');
            var retry = document.getElementById('btn-player-retry');
            var exit = document.getElementById('btn-player-exit');
            var closeSubModal = document.getElementById('btn-close-sub-modal');
            var closeSrcModal = document.getElementById('btn-close-sources-modal');
            var progressBar = document.getElementById('player-progress-container');

            if (toggle) toggle.onclick = function () { self.togglePlayPause(); };
            if (rewind) rewind.onclick = function () { self.skip(-10); };
            if (forward) forward.onclick = function () { self.skip(10); };
            if (backBtn) backBtn.onclick = function () { self.stop(); };
            if (closeBtn) closeBtn.onclick = function () { self.stop(); };
            if (retry) retry.onclick = function () { self.retryCurrent(); };
            if (exit) exit.onclick = function () { self.stop(); };

            if (subBtn) subBtn.onclick = function () { self.openSubtitlesModal(); };
            
            var audioBtn = document.getElementById('btn-audio');
            if (audioBtn) audioBtn.onclick = function () { self.openAudioModal(); };
            
            var closeAudioModal = document.getElementById('btn-close-audio-modal');
            if (closeAudioModal) closeAudioModal.onclick = function () { self.closeModals(); };
            
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

            FocusManager.register(document.querySelectorAll('#player-page .player-buttons .focusable'));
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
            var extSubsModal = document.getElementById('player-external-subs-modal');
            var srcModal = document.getElementById('player-sources-modal');
            if (subModal) subModal.classList.add('hidden');
            if (audioModal) audioModal.classList.add('hidden');
            if (extSubsModal) extSubsModal.classList.add('hidden');
            if (srcModal) srcModal.classList.add('hidden');
            FocusManager.register(document.querySelectorAll('#player-controls .focusable'));
        },

        isAnyModalOpen: function () {
            var ids = ['player-subtitles-modal', 'player-audio-modal', 'player-external-subs-modal', 'player-sources-modal'];
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

            // Subtitle cue display
            this.renderActiveSubtitleCue();
        },

        renderActiveSubtitleCue: function () {
            var overlay = document.getElementById('player-subtitle-overlay');
            var textEl = document.getElementById('player-subtitle-text');
            if (!overlay || !textEl) return;

            if (this.activeSubtitleIndex === -1 || !this.subtitleCues.length) {
                overlay.classList.remove('active');
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
                textEl.textContent = matchedCue.text;
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
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
            if (!controls) return;

            var wasHidden = !controls.classList.contains('visible');
            controls.classList.add('visible');
            if (header) header.classList.add('visible');

            if (wasHidden && window.FocusManager) {
                FocusManager.register(document.querySelectorAll('#player-controls .focusable'));
            }

            clearTimeout(this.controlsTimeout);
            this.controlsTimeout = window.setTimeout(function () {
                var page = document.getElementById('player-page');
                if (!page) return;
                var error = document.getElementById('player-error');
                if (error && !error.classList.contains('hidden')) return;
                var subModal = document.getElementById('player-subtitles-modal');
                if (subModal && !subModal.classList.contains('hidden')) return;
                var srcModal = document.getElementById('player-sources-modal');
                if (srcModal && !srcModal.classList.contains('hidden')) return;

                controls.classList.remove('visible');
                if (header) header.classList.remove('visible');
                if (window.FocusManager) FocusManager.clear();
            }, NexusConfig.playback.controlsTimeout || 4500);
        }
    };
})(window);
