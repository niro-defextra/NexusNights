/**
 * NEXUSNIGHT TV - Cinema Player Adapter
 * AVPlay hardware engine for Samsung TV; HTML5 + Hls.js for browser / webview fallback.
 * Full custom subtitle parser & overlay (Arabic / English / Provider tracks).
 * Strict ES5 for Samsung Tizen 5.0 compatibility.
 */
(function (window) {
    'use strict';

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

        init: function () {
            this.useAVPlay = typeof webapis !== 'undefined' && !!webapis.avplay;
            console.log('[NexusPlayer] Initialized. AVPlay Available:', this.useAVPlay);
        },

        play: function (source, alternatives, subtitles, meta) {
            if (!source || (!source.url && !source.embedUrl)) {
                alert('لا يوجد مصدر تشغيل صالح لهذا المحتوى');
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
            
            console.log('[NexusPlayer] Fetching external subtitles for TMDB ID:', this.meta.tmdbId);
            
            NexusAPI.getSubtitles(this.meta.tmdbId, this.meta.type || 'movie')
                .then(function (extSubs) {
                    if (!extSubs || !extSubs.length) {
                        console.log('[NexusPlayer] No external subtitles found');
                        return;
                    }
                    
                    // Create array of new subtitles
                    var newSubtitles = [];
                    for (var i = 0; i < extSubs.length; i++) {
                        var item = extSubs[i];
                        var sub = {
                            id: item.id,
                            url: item.url || null,
                            language: item.language || 'ar',
                            label: item.languageName || item.fileName || (item.language === 'ar' ? 'العربية' : 'English'),
                            isExternal: true,
                            provider: item.provider || 'OpenSubtitles',
                            quality: item.quality || 'Good',
                            downloads: item.downloads || 0,
                            rating: item.rating || 0
                        };
                        
                        // Only add if not already in the list
                        var exists = self.subtitles.some(function(existing) {
                            return existing.language === sub.language && existing.provider === sub.provider;
                        });
                        
                        if (!exists) {
                            newSubtitles.push(sub);
                        }
                    }
                    
                    if (newSubtitles.length > 0) {
                        console.log('[NexusPlayer] Adding', newSubtitles.length, 'external subtitle tracks');
                        self.subtitles = self.subtitles.concat(newSubtitles);
                        
                        // Show notification about new external subtitles
                        self.showExternalSubtitleNotification(newSubtitles);
                        
                        // Automatically activate preferred Arabic subtitle if not already active
                        self.autoSelectPreferredSubtitle();
                    }
                })
                .catch(function (err) {
                    console.warn('[NexusPlayer] External subtitle fetch error:', err.message);
                });
        },
        
        showExternalSubtitleNotification: function(newSubtitles) {
            if (!newSubtitles || newSubtitles.length === 0) return;
            
            // Create a temporary notification
            var notification = document.createElement('div');
            notification.className = 'player-external-sub-notification';
            notification.style.cssText = 'position: absolute; top: 100px; right: 32px; background: rgba(0,0,0,0.9); ' +
                'border: 1px solid rgba(212,175,55,0.5); border-radius: 12px; padding: 16px 24px; ' +
                'color: #ffffff; font-size: 22px; z-index: 1000; backdrop-filter: blur(10px); ' +
                'max-width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); animation: slideInRight 0.4s ease;';
            
            var arCount = newSubtitles.filter(function(s) { return s.language === 'ar'; }).length;
            var enCount = newSubtitles.filter(function(s) { return s.language === 'en'; }).length;
            
            var message = 'تم تحميل ترجمات خارجية جديدة:';
            if (arCount > 0) message += '<br>• ' + arCount + ' ترجمة عربية';
            if (enCount > 0) message += '<br>• ' + enCount + ' English subtitles';
            
            notification.innerHTML = '<div style="margin-bottom: 8px; font-weight: 600;">' + message + '</div>' +
                                   '<div style="font-size: 18px; opacity: 0.8;">اضغط على زر الترجمة للاختيار</div>';
            
            var playerPage = document.getElementById('player-page');
            if (playerPage) {
                playerPage.appendChild(notification);
                
                // Auto-remove after 5 seconds
                setTimeout(function() {
                    if (notification.parentNode) {
                        notification.style.animation = 'fadeOut 0.4s ease forwards';
                        setTimeout(function() {
                            if (notification.parentNode) notification.parentNode.removeChild(notification);
                        }, 400);
                    }
                }, 5000);
            }
        },

        autoSelectPreferredSubtitle: function () {
            if (this.activeSubtitleIndex !== -1 || !this.subtitles.length) return;
            var preferredLang = NexusConfig.getLanguage(); // 'ar' or 'en'
            for (var i = 0; i < this.subtitles.length; i++) {
                var lang = String(this.subtitles[i].language || this.subtitles[i].lang || '').toLowerCase();
                if (lang === preferredLang || lang.indexOf(preferredLang) === 0) {
                    this.selectSubtitle(i);
                    break;
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
                if (badge) badge.textContent = NexusConfig.t('player_subtitles') + ' (Off)';
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
            this.currentSource = source;
            this.isLive = !!(source.isLive || (this.meta && this.meta.isLive));
            var attemptId = ++this.playAttemptId;

            this.cleanupEngine();
            this.showLoading();

            var titleEl = document.getElementById('player-title');
            if (titleEl) {
                titleEl.textContent = (this.meta && this.meta.title) || source.title || source.provider || 'NEXUSNIGHT';
            }

            var badgeEl = document.getElementById('player-badge');
            if (badgeEl) {
                if (this.isLive) {
                    badgeEl.className = 'player-badge live-badge';
                    badgeEl.textContent = NexusConfig.t('player_live_badge');
                } else {
                    badgeEl.className = 'player-badge';
                    badgeEl.textContent = (source.quality || '1080p') + ' • ' + (source.provider || 'HD');
                }
            }

            if (source.type === 'embed' || source.embedUrl) {
                if (typeof tizen !== 'undefined' && tizen.application) {
                    this.skippedEmbedSources += 1;
                    this.tryNextSource('مصدر Embed يحتاج تفاعل خارجي. جاري تجربة مصدر مباشر بديل.', attemptId);
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
            try {
                avplay.open(source.url);
                avplay.setDisplayRect(0, 0, 1920, 1080);
                avplay.setListener({
                    onbufferingstart: function () { self.showLoading(); },
                    onbufferingprogress: function (percent) { self.updateLoadingText('جاري تحميل البث ' + percent + '%'); },
                    onbufferingcomplete: function () { self.hideLoading(); },
                    oncurrentplaytime: function (time) {
                        self.currentTime = Number(time) || 0;
                        try { self.duration = Number(avplay.getDuration()) || 0; } catch (ignore) {}
                        self.updateProgress();
                    },
                    onstreamcompleted: function () { self.stop(); },
                    onerror: function (error) {
                        if (attemptId !== self.playAttemptId) return;
                        console.error('[AVPlay] Playback error:', error);
                        self.tryNextSource('فشل تشغيل المصدر الحالي', attemptId);
                    },
                    onevent: function (event, data) { console.log('[AVPlay] Event:', event, data); }
                });

                avplay.prepareAsync(function () {
                    if (attemptId !== self.playAttemptId) return;
                    try {
                        avplay.play();
                        self.isPlaying = true;
                        self.hideLoading();
                        self.showControls();
                        self.updatePlayPauseIcon();
                    } catch (error) {
                        console.error('[AVPlay] Play error:', error);
                        self.tryNextSource('تعذّر بدء تشغيل الفيديو', attemptId);
                    }
                }, function (error) {
                    if (attemptId !== self.playAttemptId) return;
                    console.error('[AVPlay] Prepare error:', error);
                    self.tryNextSource('تعذّر تجهيز مصدر الفيديو', attemptId);
                });
            } catch (error) {
                console.error('[AVPlay] Open error:', error);
                this.tryNextSource('تعذّر فتح مصدر الفيديو', attemptId);
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
            });
            video.addEventListener('ended', function () { self.stop(); });
            video.addEventListener('error', function () {
                if (attemptId !== self.playAttemptId) return;
                console.error('[HTML5] Video error:', video.error);
                self.tryNextSource('تعذّر تشغيل الملف باستخدام المشغّل', attemptId);
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
                                self.tryNextSource('تعذّر فك تشفير بث HLS', attemptId);
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
                '<button class="player-button player-button-icon-only focusable" id="btn-player-back" title="رجوع">' + backSvg + '</button>' +
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
                '<div class="loading-text" id="player-loading-text">جاري تحميل البث السينمائي...</div>' +
                '</div>' +

                // Cinema Error Overlay
                '<div class="player-error hidden" id="player-error">' +
                '<div class="cinematic-error-container">' +
                '<div class="error-icon">⚠</div>' +
                '<div class="error-message" id="player-error-message"></div>' +
                '<div class="error-actions">' +
                '<button class="player-button focusable cinematic-button" id="btn-player-retry">إعادة المحاولة</button>' +
                '<button class="player-button focusable cinematic-button" id="btn-player-exit">خروج</button>' +
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
                '<button class="player-button cinematic-button focusable" id="btn-rewind" title="10 ثوان للخلف">' + rewindSvg + '<span class="button-label">10s</span></button>' +
                '<button class="player-button player-button-play cinematic-button focusable" id="btn-play-pause" title="تشغيل / إيقاف">' + playSvg + '</button>' +
                '<button class="player-button cinematic-button focusable" id="btn-forward" title="10 ثوان للأمام"><span class="button-label">10s</span>' + forwardSvg + '</button>' +
                '<button class="player-button cinematic-button focusable" id="btn-subtitles">' + ccSvg + '<span class="button-label" id="btn-subtitles-label">الترجمة</span></button>' +
                '<button class="player-button cinematic-button focusable" id="btn-audio">' + audioSvg + '<span class="button-label" id="btn-audio-label">الصوت</span></button>' +
                '<button class="player-button player-button-icon-only cinematic-button focusable" id="btn-close-player" title="إغلاق">' + closeSvg + '</button>' +
                '</div>' +

                '</div>' + // player-controls
                '</div>' + // player-container

                // Cinema Style Subtitle Selection Modal
                '<div class="player-modal-backdrop hidden" id="player-subtitles-modal">' +
                '<div class="cinematic-modal">' +
                '<div class="cinematic-modal-header">' +
                '<h3 class="modal-title">🎬 اختيار الترجمة</h3>' +
                '<div class="modal-subtitle">اختر لغة الترجمة المناسبة</div>' +
                '</div>' +
                '<div class="cinematic-modal-body">' +
                '<div id="player-subtitles-list" class="cinematic-list"></div>' +
                '</div>' +
                '<div class="cinematic-modal-footer">' +
                '<button class="player-button focusable cinematic-button modal-close" id="btn-close-sub-modal">إغلاق</button>' +
                '</div>' +
                '</div>' +
                '</div>' +

                // Premium Audio Track Selection Modal  
                '<div class="player-modal-backdrop hidden" id="player-audio-modal">' +
                '<div class="cinematic-modal">' +
                '<div class="cinematic-modal-header">' +
                '<h3 class="modal-title">🎵 اختيار مسار الصوت</h3>' +
                '<div class="modal-subtitle">اختر لغة أو نوع الصوت المناسب</div>' +
                '</div>' +
                '<div class="cinematic-modal-body">' +
                '<div id="player-audio-list" class="cinematic-list"></div>' +
                '</div>' +
                '<div class="cinematic-modal-footer">' +
                '<button class="player-button focusable cinematic-button modal-close" id="btn-close-audio-modal">إغلاق</button>' +
                '</div>' +
                '</div>' +
                '</div>' +

                // New: External Subtitle Loader Modal
                '<div class="player-modal-backdrop hidden" id="player-external-subs-modal">' +
                '<div class="cinematic-modal">' +
                '<div class="cinematic-modal-header">' +
                '<h3 class="modal-title">📥 تحميل ترجمات خارجية</h3>' +
                '<div class="modal-subtitle">جاري البحث عن ترجمات متاحة...</div>' +
                '</div>' +
                '<div class="cinematic-modal-body">' +
                '<div id="player-external-subs-list" class="cinematic-list"></div>' +
                '</div>' +
                '<div class="cinematic-modal-footer">' +
                '<button class="player-button focusable cinematic-button modal-close" id="btn-close-external-subs-modal">إلغاء</button>' +
                '</div>' +
                '</div>' +
                '</div>' +

                '</div>'; // player-page

            document.getElementById('app').insertAdjacentHTML('beforeend', html);
            this.bindPlayerControls();
        },

        hidePlayerPage: function () {
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
            html += '<span>إيقاف الترجمة (Subtitles Off)</span>';
            if (isOff) html += '<span>✓</span>';
            html += '</div>';

            // Available Subtitle Tracks
            for (var i = 0; i < this.subtitles.length; i++) {
                var item = this.subtitles[i];
                var isSelected = this.activeSubtitleIndex === i;
                var langBadge = (item.language === 'ar' || item.lang === 'ar') ? 'العربية' : (item.language || 'English');
                html += '<div class="player-modal-item focusable ' + (isSelected ? 'active' : '') + '" data-sub-idx="' + i + '" tabindex="0">';
                html += '<span>' + NexusConfig.escapeHtml(item.label || langBadge);
                
                // Add external subtitle badge
                if (item.isExternal) {
                    html += '<span style="margin-right: 8px; font-size: 16px; color: var(--color-brand-gold); opacity: 0.9;">(خارجي)</span>';
                }
                
                html += '</span>';
                if (isSelected) html += '<span>✓</span>';
                html += '</div>';
            }

            // Load More Subtitles Option (External)
            html += '<div class="player-modal-item focusable" style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 12px; padding-top: 16px;">' +
                    '<button class="cinematic-button" id="btn-load-more-subs" style="width: 100%; background: rgba(212,175,55,0.1); border-color: rgba(212,175,55,0.3); color: var(--color-brand-gold);">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 8px;">' +
                    '<path d="M12 5v14M5 12h14"/></svg>' +
                    'تحميل ترجمات إضافية من الإنترنت' +
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
            if (!modal || !list) return;
            
            var self = this;
            
            // Show loading state
            list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-text-muted);">' +
                            '<div class="loading-spinner" style="margin: 0 auto 20px;"></div>' +
                            'جاري البحث عن ترجمات متاحة...</div>';
            
            modal.classList.remove('hidden');
            
            // Fetch external subtitles from multiple sources
            if (this.meta && this.meta.tmdbId && window.NexusAPI && NexusAPI.searchExternalSubtitles) {
                NexusAPI.searchExternalSubtitles(this.meta.tmdbId, this.meta.title, this.meta.type || 'movie')
                    .then(function(results) {
                        if (!results || results.length === 0) {
                            list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-text-muted);">' +
                                           'لم يتم العثور على ترجمات إضافية</div>';
                            return;
                        }
                        
                        var html = '';
                        var uniqueTracks = {};
                        
                        for (var i = 0; i < results.length; i++) {
                            var item = results[i];
                            var key = item.language + '_' + item.provider + '_' + item.quality;
                            
                            // Avoid duplicates
                            if (uniqueTracks[key]) continue;
                            uniqueTracks[key] = true;
                            
                            // Check if already loaded
                            var alreadyLoaded = self.subtitles.some(function(sub) {
                                return sub.language === item.language && 
                                       sub.provider === item.provider &&
                                       sub.quality === item.quality;
                            });
                            
                            html += '<div class="player-modal-item focusable ' + (alreadyLoaded ? 'loaded' : '') + 
                                   '" data-external-id="' + i + '" tabindex="0">' +
                                   '<span>' + NexusConfig.escapeHtml(item.languageName || item.language) + 
                                   '<span style="margin-right: 8px; font-size: 16px; opacity: 0.7;">(' + 
                                   (item.provider || 'Unknown') + ' • ' + (item.quality || 'Normal') + 
                                   ' • ⬇' + (item.downloads || 0) + ')</span></span>' +
                                   '<span>' + (alreadyLoaded ? '✓ تم التحميل' : 'تحميل') + '</span>' +
                                   '</div>';
                        }
                        
                        list.innerHTML = html;
                        
                        // Bind click handlers
                        var items = list.querySelectorAll('[data-external-id]');
                        for (var j = 0; j < items.length; j++) {
                            items[j].onclick = (function(idx) {
                                return function() {
                                    var item = results[idx];
                                    if (!item) return;
                                    
                                    // Add to subtitles list
                                    var newSub = {
                                        id: item.id,
                                        url: item.url,
                                        language: item.language,
                                        label: item.languageName || item.language,
                                        isExternal: true,
                                        provider: item.provider,
                                        quality: item.quality,
                                        downloads: item.downloads,
                                        rating: item.rating
                                    };
                                    
                                    self.subtitles.push(newSub);
                                    console.log('[NexusPlayer] Added external subtitle:', newSub);
                                    
                                    // Show success message
                                    list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-brand-gold);">' +
                                                   '<div style="font-size: 28px; margin-bottom: 16px;">✓</div>' +
                                                   'تم إضافة الترجمة بنجاح!<br>' +
                                                   '<span style="font-size: 18px; opacity: 0.8;">يمكنك اختيارها من قائمة الترجمات</span>' +
                                                   '</div>';
                                    
                                    // Close both modals after 2 seconds
                                    setTimeout(function() {
                                        self.closeModals();
                                        var extModal = document.getElementById('player-external-subs-modal');
                                        if (extModal) extModal.classList.add('hidden');
                                        
                                        // Re-open subtitles modal to show the new addition
                                        setTimeout(function() {
                                            self.openSubtitlesModal();
                                        }, 300);
                                    }, 2000);
                                };
                            })(parseInt(items[j].getAttribute('data-external-id'), 10));
                        }
                    })
                    .catch(function(err) {
                        console.error('[NexusPlayer] External subtitle search failed:', err);
                        list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-text-muted);">' +
                                       'حدث خطأ أثناء البحث عن الترجمات</div>';
                    });
            } else {
                list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-text-muted);">' +
                               'خدمة البحث عن الترجمات غير متوفرة حالياً</div>';
            }
            
            FocusManager.register(modal.querySelectorAll('.focusable'));
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
                html += '<span>' + NexusConfig.escapeHtml(src.provider || ('سيرفر ' + (i + 1))) + '</span>';
                if (isCurrent) html += '<span>(يعمل الآن ✓)</span>';
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
            if (subModal) subModal.classList.add('hidden');
            if (audioModal) audioModal.classList.add('hidden');
            if (extSubsModal) extSubsModal.classList.add('hidden');
            FocusManager.register(document.querySelectorAll('#player-controls .focusable'));
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
                html = '<div style="padding: 20px; text-align: center; color: var(--color-text-muted);">لا تتوفر مسارات صوت متعددة</div>';
            } else {
                for (var k = 0; k < audioTracks.length; k++) {
                    var audio = audioTracks[k];
                    var isActive = audio.enabled;
                    html += '<div class="player-modal-item focusable ' + (isActive ? 'active' : '') + '" data-audio-idx="' + k + '" tabindex="0">';
                    html += '<span>' + NexusConfig.escapeHtml(audio.label) + '</span>';
                    if (isActive) html += '<span style="margin-right: auto; color: var(--color-brand-gold);">✓ مُفعّل</span>';
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
