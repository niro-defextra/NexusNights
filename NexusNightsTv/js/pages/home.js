/**
 * NEXUSNIGHT TV - Home Page
 * Cinematic hero and content discovery with TMDB global data
 */

(function(window) {
    'use strict';
    
    window.HomePage = {
        data: null,
        
        /**
         * Render home page
         */
        render: function() {
            var mainContent = document.getElementById('main-content');
            mainContent.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">' + NexusConfig.t('loading') + '</div></div>';
            
            // Safety check: Ensure NexusAPI is loaded
            if (typeof NexusAPI === 'undefined') {
                console.error('[HomePage] FATAL: NexusAPI is not defined!');
                mainContent.innerHTML = '<div class="error-message">خطأ: لم يتم تحميل النظام بشكل صحيح. يرجى إعادة تحميل الصفحة.</div>';
                return;
            }
            
            var self = this;
            // Primary: fetch TMDB global data; fallback: local library
            NexusAPI.getGlobalHome()
                .then(function(data) {
                    self.onDataLoaded(data);
                })
                .catch(function() {
                    console.warn('[HomePage] Global data failed, falling back to local library');
                    NexusAPI.getLocalHome()
                        .then(function(data) {
                            self.onDataLoaded(data);
                        })
                        .catch(function(err) {
                            self.onError(err);
                        });
                });
        },
        
        /**
         * Data loaded successfully
         */
        onDataLoaded: function(data) {
            this.data = data;
            console.log('[HomePage] Data loaded:', data);
            
            var html = '<div class="page-container">';
            
            // Live band slot — what is on right now, ahead of the hero
            html += '<div class="live-band-slot" id="home-live-band-slot"></div>';
            
            // Hero Section
            if (data.hero) {
                html += this.renderHero(data.hero);
            }
            
            // Continue Watching Section
            var cwSection = this.getContinueWatchingSection();
            if (cwSection) {
                html += this.renderSection(cwSection);
            }
            
            // Content Sections
            if (data.sections && data.sections.length > 0) {
                for (var i = 0; i < data.sections.length; i++) {
                    html += this.renderSection(data.sections[i]);
                }
            }
            
            html += '</div>';
            
            document.getElementById('main-content').innerHTML = html;
            
            // Register focusable elements
            this.registerFocusables();
            
            // Fill the live band once channel data resolves
            this.loadLiveBand();
        },
        
        /**
         * Live band — what is on right now, ahead of the hero.
         * Rendered only when live channel data exists; silent otherwise.
         */
        loadLiveBand: function() {
            if (!NexusConfig.features.sports) return;
            var slot = document.getElementById('home-live-band-slot');
            if (!slot) return;
            if (typeof SportsPage === 'undefined' || typeof SportsPage.getLiveBandData !== 'function') return;
            var self = this;
            var isAr = NexusConfig.getLanguage() === 'ar';
            
            NexusAPI.getSportsChannels().then(function(channels) {
                var items = SportsPage.getLiveBandData(channels, 6);
                if (!items.length) return;
                
                var band = '<div class="live-band">';
                band += '<div class="live-band-head">';
                band += '<span class="live-band-title">' + (isAr ? 'قنوات تُبث حالياً' : 'On now') + '</span>';
                band += '</div>';
                band += '<div class="live-band-track">';
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    band += '<div class="live-cell focusable" data-action="play-channel" data-channel-id="' + NexusConfig.escapeHtml(it.id) + '">';
                    if (it.backdrop) {
                        band += '<img class="live-cell-poster" loading="lazy" src="' + NexusConfig.escapeHtml(it.backdrop) + '" alt="">';
                    }
                    band += '<div class="live-cell-body">';
                    band += '<div class="live-cell-name text-ellipsis">' + NexusConfig.escapeHtml(it.name) + '</div>';
                    if (it.meta) band += '<div class="live-cell-meta text-ellipsis">' + NexusConfig.escapeHtml(it.meta) + '</div>';
                    band += '</div>';
                    band += '<span class="live-cell-badge">LIVE</span>';
                    band += '</div>';
                }
                band += '</div></div>';
                slot.innerHTML = band;
                
                // Re-register so the new cells join the D-pad order in place,
                // and pick up the shared [data-action] click handling.
                self.registerFocusables();
                if (NexusApp.setLiveCount) NexusApp.setLiveCount(items.length);
            }).catch(function(error) {
                console.warn('[HomePage] Live band unavailable:', error && error.message);
                if (NexusApp.setLiveCount) NexusApp.setLiveCount(0);
            });
        },
        
        /**
         * Build a Continue Watching section from localStorage
         */
        getContinueWatchingSection: function() {
            if (!NexusConfig.features.continueWatching) return null;
            try {
                var raw = window.localStorage.getItem(NexusConfig.storage.watchProgress);
                if (!raw) return null;
                var progress = JSON.parse(raw);
                if (!progress || typeof progress !== 'object') return null;
                var keys = Object.keys(progress);
                if (!keys.length) return null;
                var items = [];
                for (var i = 0; i < keys.length; i++) {
                    var entry = progress[keys[i]];
                    if (!entry || !entry.title) continue;
                    // Only include items with meaningful progress (> 30s) and not finished (< 95%)
                    if (entry.position && entry.duration && entry.position > 30 && (entry.position / entry.duration) < 0.95) {
                        items.push({
                            tmdbId: entry.tmdbId || 0,
                            localId: entry.localId || '',
                            kind: entry.kind || 'movie',
                            title: entry.title,
                            posterUrl: entry.posterUrl || null,
                            backdropUrl: entry.backdropUrl || null,
                            rating: entry.rating || null,
                            year: entry.year || null,
                            progressPercent: Math.round((entry.position / entry.duration) * 100)
                        });
                    }
                }
                if (!items.length) return null;
                // Sort by timestamp descending (most recent first)
                items.sort(function(a, b) {
                    var tA = progress[Object.keys(progress).filter(function(k) { return progress[k].title === a.title; })[0]];
                    var tB = progress[Object.keys(progress).filter(function(k) { return progress[k].title === b.title; })[0]];
                    return ((tB && tB.timestamp) || 0) - ((tA && tA.timestamp) || 0);
                });
                return {
                    key: 'continue-watching',
                    title: 'متابعة المشاهدة',
                    items: items
                };
            } catch (e) {
                console.warn('[HomePage] Failed to load watch progress:', e);
                return null;
            }
        },
        
        /**
         * Render hero section
         */
        renderHero: function(hero) {
            var backdropUrl = hero.backdropUrl ? NexusConfig.getImageUrl(hero.backdropUrl, 'backdrop') : null;
            var logoUrl = hero.logoUrl ? NexusConfig.getImageUrl(hero.logoUrl, 'logo') : null;
            var targetId = hero.tmdbId > 0 ? hero.tmdbId : (hero.localId || hero.id || '');
            var localId = hero.localId || '';
            var tmdbId = hero.tmdbId || 0;
            
            var html = '<div class="hero-section">';
            
            // Backdrop
            if (backdropUrl) {
                html += '<div class="hero-backdrop" style="background-image: url(\'' + NexusConfig.escapeHtml(backdropUrl) + '\')"></div>';
            }
            
            html += '<div class="hero-content">';
            
            // Clear Logo (from TMDB) or Title text
            if (logoUrl) {
                html += '<img class="hero-logo" src="' + NexusConfig.escapeHtml(logoUrl) + '" alt="' + NexusConfig.escapeHtml(hero.title) + '">';
            } else {
                html += '<h1 class="hero-title">' + NexusConfig.escapeHtml(hero.title) + '</h1>';
            }
            
            // Meta line: badge, rating, year, genres
            html += '<div class="hero-meta">';
            html += '<div class="hero-meta-item"><span class="hero-quality-badge" style="background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; padding: 2px 8px; font-size: 14px; font-weight: 700; margin-left: 12px; letter-spacing: 0.5px;">4K ULTRA HD</span></div>';
            if (hero.rating) {
                html += '<div class="hero-meta-item"><span class="hero-rating text-gold">★ ' + Number(hero.rating).toFixed(1) + '</span></div>';
            }
            if (hero.year) {
                html += '<div class="hero-meta-item"><span class="hero-year">' + NexusConfig.escapeHtml(hero.year) + '</span></div>';
            }
            if (hero.genres && hero.genres.length > 0) {
                var genreTexts = [];
                for (var g = 0; g < hero.genres.length; g++) {
                    var gName = typeof hero.genres[g] === 'string' ? hero.genres[g] : (hero.genres[g].name || '');
                    if (gName) genreTexts.push(NexusConfig.escapeHtml(gName));
                }
                if (genreTexts.length) {
                    html += '<div class="hero-meta-item"><span class="hero-genres">' + genreTexts.join(' • ') + '</span></div>';
                }
            }
            html += '</div>';
            
            // Overview
            if (hero.overview) {
                var overview = hero.overview.length > 250 ? hero.overview.substring(0, 250) + '...' : hero.overview;
                html += '<p class="hero-overview">' + NexusConfig.escapeHtml(overview) + '</p>';
            }
            
            // Actions
            html += '<div class="hero-actions">';
            html += '<button class="btn btn-primary focusable" data-action="play" data-kind="' + NexusConfig.escapeHtml(hero.kind) + '" data-id="' + NexusConfig.escapeHtml(targetId) + '" data-local-id="' + NexusConfig.escapeHtml(localId) + '" data-tmdb-id="' + tmdbId + '">';
            html += '<span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> ' + NexusConfig.t('hero_play');
            html += '</button>';
            html += '<button class="btn btn-secondary focusable" data-action="details" data-kind="' + NexusConfig.escapeHtml(hero.kind) + '" data-id="' + NexusConfig.escapeHtml(targetId) + '" data-local-id="' + NexusConfig.escapeHtml(localId) + '" data-tmdb-id="' + tmdbId + '">';
            html += '<span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span> ' + NexusConfig.t('hero_details');
            html += '</button>';
            html += '</div>';
            
            html += '</div>'; // hero-content
            html += '</div>'; // hero-section
            
            return html;
        },
        
        /**
         * Render content section
         */
        renderSection: function(section) {
            if (!section.items || section.items.length === 0) {
                return '';
            }
            
            var html = '<div class="content-section">';
            
            // Section Header
            html += '<div class="section-header">';
            html += '<h2 class="section-title">' + NexusConfig.escapeHtml(section.title) + '</h2>';
            html += '</div>';
            
            // Content Row
            html += '<div class="content-row">';
            
            for (var i = 0; i < section.items.length; i++) {
                var item = section.items[i];
                html += this.renderCard(item);
            }
            
            html += '</div>'; // content-row
            html += '</div>'; // content-section
            
            return html;
        },
        
        /**
         * Render content card
         */
        renderCard: function(item) {
            var posterUrl = item.posterUrl ? NexusConfig.getImageUrl(item.posterUrl, 'poster') : null;
            var backdropUrl = item.backdropUrl ? NexusConfig.getImageUrl(item.backdropUrl, 'backdrop') : null;
            var targetId = item.tmdbId > 0 ? item.tmdbId : (item.localId || item.id || '');
            
            // Use poster by default, backdrop if no poster
            var imageUrl = posterUrl || backdropUrl;
            
            var html = '<div class="content-card focusable" data-kind="' + NexusConfig.escapeHtml(item.kind) + '" data-id="' + NexusConfig.escapeHtml(targetId) + '" data-local-id="' + NexusConfig.escapeHtml(item.localId || '') + '" data-tmdb-id="' + (item.tmdbId || 0) + '">';
            
            if (imageUrl) {
                html += '<img class="card-poster" loading="lazy" src="' + NexusConfig.escapeHtml(imageUrl) + '" alt="' + NexusConfig.escapeHtml(item.title) + '">';
            } else {
                html += '<div class="card-poster loading"></div>';
            }
            
            html += '<div class="card-info">';
            html += '<div class="card-title text-ellipsis">' + NexusConfig.escapeHtml(item.title) + '</div>';
            html += '<div class="card-meta">';
            
            if (item.rating) {
                html += '<span class="card-rating text-gold">★ ' + Number(item.rating).toFixed(1) + '</span> ';
            }
            if (item.year) {
                html += '<span>' + NexusConfig.escapeHtml(item.year) + '</span>';
            }
            // Show progress bar for continue-watching items
            if (item.progressPercent) {
                html += '<div class="card-progress" style="width:100%;height:3px;background:rgba(255,255,255,0.15);margin-top:4px;border-radius:2px">';
                html += '<div style="width:' + item.progressPercent + '%;height:100%;background:var(--color-brand-red);border-radius:2px"></div>';
                html += '</div>';
            }
            
            html += '</div>';
            html += '</div>'; // card-info
            html += '</div>'; // content-card
            
            return html;
        },
        
        /**
         * Register focusable elements
         */
        registerFocusables: function() {
            var self = this;
            
            // Get all focusable elements
            var focusables = document.querySelectorAll('.focusable');
            FocusManager.register(focusables);
            
            // Bind click handlers
            var buttons = document.querySelectorAll('[data-action]');
            for (var i = 0; i < buttons.length; i++) {
                buttons[i].onclick = function() {
                    self.handleAction(this);
                };
            }
            
            var cards = document.querySelectorAll('.content-card');
            for (var j = 0; j < cards.length; j++) {
                cards[j].onclick = function() {
                    self.showDetails(this);
                };
            }
        },
        
        /**
         * Handle button action
         */
        handleAction: function(button) {
            var action = button.getAttribute('data-action');
            var kind = button.getAttribute('data-kind');
            var id = button.getAttribute('data-id');
            var localId = button.getAttribute('data-local-id');
            var tmdbId = parseInt(button.getAttribute('data-tmdb-id'), 10) || 0;
            
            console.log('[HomePage] Action:', action, kind, id);
            
            if (action === 'play') {
                this.playContent(kind, tmdbId, localId);
            } else if (action === 'details') {
                Navigator.navigateTo('details', { kind: kind, tmdbId: tmdbId, localId: localId || null });
            } else if (action === 'play-channel') {
                this.playChannel(button.getAttribute('data-channel-id'));
            }
        },
        
        /**
         * Play a live channel from the home live band
         */
        playChannel: function(channelId) {
            console.log('[HomePage] Playing channel:', channelId);
            if (NexusApp.showToast) NexusApp.showToast(NexusConfig.getLanguage() === 'ar' ? 'جاري تحضير البث…' : 'Preparing stream…', 0);
            NexusAPI.getSportsStream(channelId)
                .then(function(res) {
                    var source = (res && res.source) ? res.source : res;
                    var alternatives = (res && res.alternatives) ? res.alternatives : [];
                    if (source && (source.url || source.embedUrl)) {
                        if (NexusApp.hideToast) NexusApp.hideToast();
                        var channelName = (source.title || channelId).toUpperCase();
                        NexusPlayer.play(source, alternatives, [], { isLive: true, title: channelName, quality: '1080p HD' });
                    } else {
                        NexusApp.showToast('البث غير متاح حالياً للقناة المطلوبة');
                    }
                })
                .catch(function(error) {
                    console.error('[HomePage] Stream error:', error);
                    NexusApp.showToast('فشل تحميل البث: ' + (error.message || 'خطأ غير متوقع'));
                });
        },
        
        /**
         * Show content details
         */
        showDetails: function(card) {
            var kind = card.getAttribute('data-kind');
            var tmdbId = parseInt(card.getAttribute('data-tmdb-id'), 10) || 0;
            var localId = card.getAttribute('data-local-id');
            Navigator.navigateTo('details', { kind: kind, tmdbId: tmdbId, localId: localId || null });
        },
        
        /**
         * Play content
         */
        playContent: function(kind, tmdbId, localId) {
            var self = this;
            console.log('[HomePage] Playing:', kind, tmdbId, localId);
            if (NexusApp.showToast) NexusApp.showToast(NexusConfig.getLanguage() === 'ar' ? 'جاري تحضير التشغيل…' : 'Preparing playback…', 0);
            var apiCall;
            if (tmdbId > 0 || localId) {
                apiCall = NexusAPI.getPreferredPlayback(kind, tmdbId, localId, 1, 1);
            } else {
                apiCall = Promise.reject(new Error('معرّف المحتوى غير متاح'));
            }
            apiCall.then(function(playback) {
                if (!playback || !playback.source) throw new Error('لا تتوفر مصادر تشغيل لهذا المحتوى');
                var meta = {
                    tmdbId: tmdbId,
                    localId: localId,
                    type: kind || 'movie',
                    title: playback.title || (self.data && self.data.hero && self.data.hero.title) || 'NEXUSNIGHT',
                    year: playback.releaseYear || (self.data && self.data.hero && self.data.hero.year),
                    posterUrl: playback.posterUrl,
                    backdropUrl: playback.backdropUrl
                };
                NexusApp.hideToast();
                NexusPlayer.play(playback.source, playback.alternatives, playback.subtitles, meta);
            }).catch(function(error) {
                console.error('[HomePage] Playback error:', error);
                NexusApp.showToast(error.message || 'فشل تحميل مصادر التشغيل');
            });
        },
        
        /**
         * Error handler
         */
        onError: function(error) {
            console.error('[HomePage] Error:', error);
            NexusApp.showErrorState({
                title: 'فشل تحميل المحتوى',
                message: error && error.message,
                onAction: function() { HomePage.render(); }
            });
        },
        
        /**
         * Cleanup
         */
        cleanup: function() {
            this.data = null;
        }
    };
    
})(window);
