/**
 * NEXUSNIGHT TV - Series Page
 * Cinematic spotlight hero and categorized TV series rails
 */
(function (window) {
    'use strict';

    window.SeriesPage = {
        sections: ['trending-tv-today', 'airing-today', 'popular-tv', 'top-rated-tv', 'on-the-air', 'local-library'],
        heroSeries: null,

        render: function () {
            document.getElementById('main-content').innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div></div>';
            this.loadSeries();
        },

        loadSeries: function () {
            var self = this;
            NexusAPI.getGlobalHome().then(function (home) {
                self.renderContent(home || { sections: [] });
            }).catch(function (error) {
                console.error('[SeriesPage] Error:', error);
                self.showError(error);
            });
        },

        renderContent: function (home) {
            var sections = home.sections || [];
            var validSections = [];
            var allSeries = [];

            for (var i = 0; i < sections.length; i++) {
                if (this.sections.indexOf(sections[i].key) !== -1 && sections[i].items && sections[i].items.length) {
                    var items = sections[i].items.filter(function (item) { return item.kind === 'series'; });
                    if (items.length) {
                        validSections.push({ title: sections[i].title, items: items });
                        for (var k = 0; k < items.length; k++) allSeries.push(items[k]);
                    }
                }
            }

            var html = '<div class="page-container">';

            // Spotlight Hero: pick the top series
            if (allSeries.length > 0) {
                var hero = allSeries[0];
                this.heroSeries = hero;
                html += this.renderSpotlightHero(hero);
            }

            if (validSections.length > 0) {
                for (var s = 0; s < validSections.length; s++) {
                    html += this.renderSection(validSections[s].title, validSections[s].items);
                }
            } else {
                html += '<div class="empty-state"><div class="empty-state-text">لا توجد مسلسلات متاحة حالياً</div></div>';
            }

            html += '</div>';
            document.getElementById('main-content').innerHTML = html;
            this.registerFocusables();
        },

        renderSpotlightHero: function (hero) {
            var backdropUrl = hero.backdropUrl ? NexusConfig.getImageUrl(hero.backdropUrl, 'backdrop') : null;
            var logoUrl = hero.logoUrl ? NexusConfig.getImageUrl(hero.logoUrl, 'logo') : null;
            var targetId = hero.tmdbId > 0 ? hero.tmdbId : (hero.localId || hero.id || '');
            var localId = hero.localId || '';
            var tmdbId = hero.tmdbId || 0;

            var html = '<div class="hero-section" style="height: 520px; margin-bottom: var(--spacing-xl);">';
            if (backdropUrl) {
                html += '<div class="hero-backdrop" style="background-image: url(\'' + NexusConfig.escapeHtml(backdropUrl) + '\')"></div>';
            }
            html += '<div class="hero-content">';

            // Tag
            html += '<div style="margin-bottom: 12px;"><span style="background: rgba(196,30,58,0.25); border: 1px solid var(--color-brand-red); color: #f87171; padding: 4px 14px; border-radius: 12px; font-size: 14px; font-weight: 700;">مسلسل مميز</span></div>';

            if (logoUrl) {
                html += '<img class="hero-logo" src="' + NexusConfig.escapeHtml(logoUrl) + '" alt="' + NexusConfig.escapeHtml(hero.title) + '">';
            } else {
                html += '<h1 class="hero-title" style="font-size: 64px; margin-bottom: 12px;">' + NexusConfig.escapeHtml(hero.title) + '</h1>';
            }

            html += '<div class="hero-meta" style="margin-bottom: 14px;">';
            if (hero.rating) html += '<div class="hero-meta-item"><span class="hero-rating text-gold">★ ' + Number(hero.rating).toFixed(1) + '</span></div>';
            if (hero.year) html += '<div class="hero-meta-item"><span class="hero-year">' + NexusConfig.escapeHtml(hero.year) + '</span></div>';
            html += '</div>';

            if (hero.overview) {
                var overview = hero.overview.length > 200 ? hero.overview.substring(0, 200) + '...' : hero.overview;
                html += '<p class="hero-overview" style="margin-bottom: 20px;">' + NexusConfig.escapeHtml(overview) + '</p>';
            }

            html += '<div class="hero-actions">';
            html += '<button class="btn btn-primary focusable" data-action="play" data-kind="series" data-id="' + NexusConfig.escapeHtml(targetId) + '" data-local-id="' + NexusConfig.escapeHtml(localId) + '" data-tmdb-id="' + tmdbId + '">';
            html += '<span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> ' + (NexusConfig.getLanguage() === 'ar' ? 'تشغيل أول حلقة' : 'Play Episode 1');
            html += '</button>';
            html += '<button class="btn btn-secondary focusable" data-action="details" data-kind="series" data-id="' + NexusConfig.escapeHtml(targetId) + '" data-local-id="' + NexusConfig.escapeHtml(localId) + '" data-tmdb-id="' + tmdbId + '">';
            html += '<span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span> ' + (NexusConfig.getLanguage() === 'ar' ? 'التفاصيل والمواسم' : 'Details & Seasons');
            html += '</button>';
            html += '</div>';

            html += '</div>';
            html += '</div>';
            return html;
        },

        renderSection: function (title, items) {
            var html = '<section class="content-section"><div class="section-header"><h2 class="section-title">' + NexusConfig.escapeHtml(title) + '</h2></div><div class="content-row">';
            for (var i = 0; i < items.length; i++) html += this.renderCard(items[i]);
            return html + '</div></section>';
        },

        renderCard: function (item) {
            var posterUrl = item.posterUrl ? NexusConfig.getImageUrl(item.posterUrl, 'poster') : null;
            var backdropUrl = item.backdropUrl ? NexusConfig.getImageUrl(item.backdropUrl, 'backdrop') : null;
            var image = posterUrl || backdropUrl;
            var targetId = item.tmdbId > 0 ? item.tmdbId : (item.localId || item.id);
            var html = '<div class="content-card focusable" data-kind="series" data-id="' + NexusConfig.escapeHtml(targetId) + '" data-local-id="' + NexusConfig.escapeHtml(item.localId || '') + '" data-tmdb-id="' + (item.tmdbId || 0) + '">';
            html += image ? '<img class="card-poster" loading="lazy" src="' + NexusConfig.escapeHtml(image) + '" alt="' + NexusConfig.escapeHtml(item.title) + '">' : '<div class="card-poster loading"></div>';
            html += '<div class="card-info"><div class="card-title text-ellipsis">' + NexusConfig.escapeHtml(item.title) + '</div><div class="card-meta">';
            if (item.rating) html += '<span class="card-rating text-gold">★ ' + Number(item.rating).toFixed(1) + '</span> ';
            if (item.year) html += '<span>' + NexusConfig.escapeHtml(item.year) + '</span>';
            return html + '</div></div></div>';
        },

        registerFocusables: function () {
            var cards = document.querySelectorAll('.content-card');
            for (var i = 0; i < cards.length; i++) {
                cards[i].onclick = function () {
                    Navigator.navigateTo('details', {
                        kind: 'series',
                        tmdbId: this.getAttribute('data-tmdb-id'),
                        localId: this.getAttribute('data-local-id') || null
                    });
                };
            }

            var actionBtns = document.querySelectorAll('[data-action]');
            for (var b = 0; b < actionBtns.length; b++) {
                actionBtns[b].onclick = function () {
                    var action = this.getAttribute('data-action');
                    var tmdbId = parseInt(this.getAttribute('data-tmdb-id'), 10) || 0;
                    var localId = this.getAttribute('data-local-id') || null;
                    if (action === 'details') {
                        Navigator.navigateTo('details', { kind: 'series', tmdbId: tmdbId, localId: localId });
                    } else if (action === 'play') {
                        var mainContent = document.getElementById('main-content');
                        mainContent.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">جاري التحميل...</div></div>';
                        NexusAPI.getPreferredPlayback('series', tmdbId, localId, 1, 1).then(function (playback) {
                            if (playback && playback.source) NexusPlayer.play(playback.source, playback.alternatives, playback.subtitles);
                            else throw new Error('لا تتوفر مصادر تشغيل');
                        }).catch(function (err) {
                            alert(err.message || 'فشل التشغيل');
                            Navigator.goBack();
                        });
                    }
                };
            }

            FocusManager.register(document.querySelectorAll('.focusable'));
        },

        showError: function (error) {
            document.getElementById('main-content').innerHTML = '<div class="page-container"><div class="empty-state"><div class="empty-state-icon">⚠</div><div class="empty-state-text">فشل تحميل المسلسلات</div><div class="empty-state-subtext">' + NexusConfig.escapeHtml(error && error.message) + '</div></div></div>';
        },
        cleanup: function () {}
    };
})(window);
