/** NEXUSNIGHT TV - Global and local title details. */
(function (window) {
    'use strict';

    window.DetailsPage = {
        kind: 'movie',
        tmdbId: 0,
        localId: null,
        data: null,
        isLocal: false,
        selectedSeason: 1,

        render: function (params) {
            params = params || {};
            this.kind = params.kind === 'series' ? 'series' : 'movie';
            this.tmdbId = parseInt(params.tmdbId, 10) || 0;
            this.localId = params.localId || null;
            this.data = null;
            this.isLocal = !!(this.localId && !this.tmdbId);
            document.getElementById('main-content').innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">' + NexusConfig.t('loading') + '</div></div>';
            this.loadDetails();
        },

        loadDetails: function () {
            var self = this;
            var request = this.isLocal
                ? NexusAPI.getLocalTitle(this.localId)
                : (this.kind === 'movie' ? NexusAPI.getMovieDetails(this.tmdbId) : NexusAPI.getSeriesDetails(this.tmdbId));
            request.then(function (data) {
                self.data = data;
                self.renderContent();
            }).catch(function (error) {
                console.error('[DetailsPage] Error:', error);
                self.showError(error);
            });
        },

        getSeasonNumber: function (season) {
            return this.isLocal ? Number(season.season) : Number(season.seasonNumber);
        },

        renderContent: function () {
            var d = this.data || {};
            var backdropUrl = d.backdropUrl ? NexusConfig.getImageUrl(d.backdropUrl, 'backdrop') : null;
            var posterUrl = d.posterUrl ? NexusConfig.getImageUrl(d.posterUrl, 'poster') : null;
            var logoUrl = d.logoUrl ? NexusConfig.getImageUrl(d.logoUrl, 'logo') : null;
            var title = NexusConfig.escapeHtml(d.title || 'NEXUSNIGHT');
            var html = '<div class="details-page">';
            if (backdropUrl) html += '<div class="details-backdrop" style="background-image:url(\'' + NexusConfig.escapeHtml(backdropUrl) + '\')"></div>';
            html += '<div class="details-content"><div class="details-header">';
            if (posterUrl) html += '<img class="details-poster" src="' + NexusConfig.escapeHtml(posterUrl) + '" alt="' + title + '">';
            html += '<div class="details-info">';
            if (logoUrl) html += '<img class="details-logo" src="' + NexusConfig.escapeHtml(logoUrl) + '" alt="' + title + '">';
            else html += '<h1 class="details-title">' + title + '</h1>';
            if (d.originalTitle && d.originalTitle !== d.title) html += '<div class="details-original-title">' + NexusConfig.escapeHtml(d.originalTitle) + '</div>';

            html += '<div class="details-meta">';
            if (d.rating) html += '<span class="text-gold">★ ' + Number(d.rating).toFixed(1) + '</span>';
            if (d.year) html += '<span>' + NexusConfig.escapeHtml(d.year) + '</span>';
            var runtimeMinutes = d.runtime || (d.runtimeSec ? Math.round(Number(d.runtimeSec) / 60) : null);
            if (runtimeMinutes) html += '<span>' + NexusConfig.escapeHtml(runtimeMinutes) + ' دقيقة</span>'; 
            if (this.kind === 'series' && (d.numberOfSeasons || d.seasonCount)) html += '<span>' + NexusConfig.escapeHtml(d.numberOfSeasons || d.seasonCount) + ' موسم</span>';
            html += '</div>';

            if (d.overview) html += '<p class="details-overview">' + NexusConfig.escapeHtml(d.overview) + '</p>';
            if (d.genres && d.genres.length) {
                html += '<div class="details-genres">';
                for (var g = 0; g < d.genres.length; g++) {
                    var genreName = typeof d.genres[g] === 'string' ? d.genres[g] : d.genres[g].name;
                    if (genreName) html += '<span class="genre-tag">' + NexusConfig.escapeHtml(genreName) + '</span>';
                }
                html += '</div>';
            }

            html += '<div class="details-actions">';
            var playSvg = '<span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></span>';
            html += this.kind === 'movie'
                ? '<button class="btn btn-primary focusable" id="btn-play-movie">' + playSvg + ' ' + NexusConfig.t('hero_play') + '</button>'
                : '<button class="btn btn-primary focusable" id="btn-play-series">' + playSvg + ' ' + (NexusConfig.getLanguage() === 'ar' ? 'تشغيل أول حلقة' : 'Play Episode 1') + '</button>';
            html += '</div></div></div>';

            if (this.kind === 'series' && d.seasons && d.seasons.length) html += this.renderSeasons(d.seasons);
            html += '</div></div>';
            document.getElementById('main-content').innerHTML = html;

            if (this.kind === 'series' && d.seasons && d.seasons.length) {
                var firstSeason = null;
                for (var i = 0; i < d.seasons.length; i++) {
                    var number = this.getSeasonNumber(d.seasons[i]);
                    if (number > 0) { firstSeason = number; break; }
                }
                if (firstSeason !== null) {
                    this.selectedSeason = firstSeason;
                    this.loadSeason(firstSeason);
                }
            }
            this.registerFocusables();
        },

        renderSeasons: function (seasons) {
            var html = '<div class="seasons-section"><h3 class="section-title">المواسم</h3><div class="season-selector">';
            var first = true;
            for (var i = 0; i < seasons.length; i++) {
                var seasonNumber = this.getSeasonNumber(seasons[i]);
                if (seasonNumber <= 0) continue;
                html += '<button class="season-button focusable ' + (first ? 'active' : '') + '" data-season="' + seasonNumber + '">الموسم ' + seasonNumber + '</button>';
                first = false;
            }
            html += '</div><div id="episodes-container"></div></div>';
            return html;
        },

        loadSeason: function (seasonNumber) {
            var self = this;
            var container = document.getElementById('episodes-container');
            if (!container) return;
            container.innerHTML = '<div class="loading-spinner" style="margin:48px auto"></div>';
            var request;
            if (this.isLocal) {
                var seasons = this.data.seasons || [];
                var found = null;
                for (var i = 0; i < seasons.length; i++) {
                    if (Number(seasons[i].season) === Number(seasonNumber)) { found = seasons[i]; break; }
                }
                request = Promise.resolve(found || { episodes: [] });
            } else {
                request = NexusAPI.getSeasonDetails(this.tmdbId, seasonNumber);
            }
            request.then(function (season) {
                self.renderEpisodes(season && season.episodes ? season.episodes : []);
            }).catch(function (error) {
                console.error('[DetailsPage] Season error:', error);
                container.innerHTML = '<div class="error-message">فشل تحميل الحلقات</div>';
            });
        },

        renderEpisodes: function (episodes) {
            var container = document.getElementById('episodes-container');
            if (!container) return;
            if (!episodes || !episodes.length) {
                container.innerHTML = '<div class="empty-state-text">لا توجد حلقات لهذا الموسم</div>';
                return;
            }
            var html = '<div class="episodes-grid">';
            for (var i = 0; i < episodes.length; i++) {
                var ep = episodes[i];
                var episodeNumber = this.isLocal ? ep.episode : ep.episodeNumber;
                var seasonNumber = this.isLocal ? ep.season : ep.seasonNumber;
                var still = ep.stillUrl ? NexusConfig.getImageUrl(ep.stillUrl, 'still') : null;
                var mediaId = this.isLocal ? ep.id : (ep.localMediaId || '');
                html += '<div class="episode-card focusable" data-season="' + (seasonNumber || this.selectedSeason) + '" data-episode="' + episodeNumber + '" data-media-id="' + NexusConfig.escapeHtml(mediaId) + '">';
                html += still ? '<img class="episode-thumbnail" loading="lazy" src="' + NexusConfig.escapeHtml(still) + '" alt="Episode ' + episodeNumber + '">' : '<div class="episode-thumbnail"></div>';
                html += '<div class="episode-info"><div class="episode-number">الحلقة ' + episodeNumber + '</div>';
                html += '<div class="episode-title">' + NexusConfig.escapeHtml(ep.name || ep.title || ('Episode ' + episodeNumber)) + '</div>';
                if (ep.overview) {
                    var overview = ep.overview.length > 120 ? ep.overview.substring(0, 120) + '…' : ep.overview;
                    html += '<div class="episode-overview text-clamp-2">' + NexusConfig.escapeHtml(overview) + '</div>';
                }
                html += '</div></div>';
            }
            html += '</div>';
            container.innerHTML = html;
            this.registerEpisodesFocusables();
        },

        registerFocusables: function () {
            var self = this;
            var playButton = document.getElementById(this.kind === 'movie' ? 'btn-play-movie' : 'btn-play-series');
            if (playButton) playButton.onclick = function () {
                if (self.kind === 'movie') self.playMovie();
                else self.playFirstEpisode();
            };
            var seasonButtons = document.querySelectorAll('.season-button');
            for (var i = 0; i < seasonButtons.length; i++) {
                seasonButtons[i].onclick = function () { self.selectSeason(parseInt(this.getAttribute('data-season'), 10)); };
            }
            FocusManager.register(document.querySelectorAll('.focusable'));
        },

        registerEpisodesFocusables: function () {
            var self = this;
            var episodes = document.querySelectorAll('.episode-card');
            for (var i = 0; i < episodes.length; i++) {
                episodes[i].onclick = function () {
                    self.playEpisode(
                        parseInt(this.getAttribute('data-season'), 10),
                        parseInt(this.getAttribute('data-episode'), 10),
                        this.getAttribute('data-media-id') || null
                    );
                };
            }
            FocusManager.register(document.querySelectorAll('.focusable'));
        },

        selectSeason: function (seasonNumber) {
            this.selectedSeason = seasonNumber;
            var buttons = document.querySelectorAll('.season-button');
            for (var i = 0; i < buttons.length; i++) {
                var active = parseInt(buttons[i].getAttribute('data-season'), 10) === seasonNumber;
                if (active) buttons[i].classList.add('active');
                else buttons[i].classList.remove('active');
            }
            this.loadSeason(seasonNumber);
        },

        playFirstEpisode: function () {
            if (this.isLocal && this.data.firstMediaId) {
                this.startPlayback(NexusAPI.getLocalPlayback(this.data.firstMediaId));
                return;
            }
            var firstSeason = this.selectedSeason || 1;
            this.playEpisode(firstSeason, 1, null);
        },

        playMovie: function () {
            var request = this.isLocal && this.data.mediaId
                ? NexusAPI.getLocalPlayback(this.data.mediaId)
                : NexusAPI.getPreferredPlayback('movie', this.tmdbId, this.localId, 1, 1);
            this.saveWatchProgress();
            this.startPlayback(request);
        },

        playEpisode: function (season, episode, mediaId) {
            var request = mediaId
                ? NexusAPI.getLocalPlayback(mediaId)
                : NexusAPI.getPreferredPlayback('series', this.tmdbId, this.localId, season, episode);
            this.saveWatchProgress();
            this.startPlayback(request, { season: season, episode: episode });
        },

        /**
         * Save watch progress to localStorage when playback starts
         */
        saveWatchProgress: function () {
            try {
                var d = this.data;
                if (!d) return;
                var storageKey = NexusConfig.storage.watchProgress;
                var raw = window.localStorage.getItem(storageKey);
                var progress = raw ? JSON.parse(raw) : {};
                var entryKey = (this.kind === 'movie' ? 'm' : 's') + '_' + (this.tmdbId || this.localId || '');
                if (!entryKey || entryKey === 'm_' || entryKey === 's_') return;
                progress[entryKey] = {
                    tmdbId: this.tmdbId || 0,
                    localId: this.localId || '',
                    kind: this.kind,
                    title: d.title || '',
                    posterUrl: d.posterUrl || null,
                    backdropUrl: d.backdropUrl || null,
                    rating: d.rating || null,
                    year: d.year || null,
                    position: 0,
                    duration: 0,
                    timestamp: Date.now()
                };
                window.localStorage.setItem(storageKey, JSON.stringify(progress));
                console.log('[DetailsPage] Watch progress saved for:', entryKey);
            } catch (e) {
                console.warn('[DetailsPage] Failed to save watch progress:', e);
            }
        },

        startPlayback: function (request, extraMeta) {
            var self = this;
            extraMeta = extraMeta || {};
            // Resolve the stream without dismantling the details page: focus
            // stays on the play control, and a failed lookup only surfaces a
            // quiet status line instead of a dead screen.
            NexusApp.showToast(NexusConfig.getLanguage() === 'ar' ? 'جاري تحضير التشغيل…' : 'Preparing playback…', 0);
            request.then(function (playback) {
                if (!playback || !playback.source) throw new Error('لا تتوفر مصادر تشغيل لهذا المحتوى');
                var meta = {
                    tmdbId: self.tmdbId,
                    localId: self.localId,
                    type: self.kind || 'movie',
                    title: (self.data && (self.data.title || self.data.name)) || playback.title || 'NEXUSNIGHT',
                    year: self.data && (self.data.releaseYear || (self.data.release_date && self.data.release_date.split('-')[0])),
                    season: extraMeta.season || (self.kind === 'series' ? (self.selectedSeason || 1) : undefined),
                    episode: extraMeta.episode || (self.kind === 'series' ? 1 : undefined),
                    posterUrl: playback.posterUrl || (self.data && self.data.posterUrl),
                    backdropUrl: playback.backdropUrl || (self.data && self.data.backdropUrl)
                };
                NexusApp.hideToast();
                NexusPlayer.play(playback.source, playback.alternatives, playback.subtitles, meta);
            }).catch(function (error) {
                console.error('[DetailsPage] Playback error:', error);
                NexusApp.showToast(error.message || 'فشل تحميل مصادر التشغيل');
            });
        },

        showError: function (error) {
            NexusApp.showErrorState({
                title: 'فشل تحميل التفاصيل',
                message: error && error.message,
                onAction: function () { Navigator.goBack(); }
            });
        },
        cleanup: function () { this.data = null; this.kind = null; this.tmdbId = 0; this.localId = null; this.isLocal = false; }
    };
})(window);
