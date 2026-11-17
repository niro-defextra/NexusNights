/**
 * NEXUSNIGHT TV - Search Page
 * Remote-friendly Arabic/English on-screen TV keyboard with instant debounced search
 */
(function (window) {
    'use strict';

    window.SearchPage = {
        query: '',
        results: null,
        debounceTimer: null,
        keyboards: {
            ar: [
                ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر'],
                ['ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف'],
                ['ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي', 'ى', 'ة'],
                ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
            ],
            en: [
                ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
                ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
                ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
            ]
        },
        currentLang: 'ar',

        render: function () {
            this.currentLang = NexusConfig.getLanguage();
            var isAr = this.currentLang === 'ar';
            var html = '<div class="search-page">';
            
            // Header
            html += '<div class="search-header">';
            html += '<h1 class="search-title" style="font-size: 36px; margin-bottom: 20px;">' + (isAr ? 'البحث عن فيلم أو مسلسل' : 'Search Movies & TV Shows') + '</h1>';
            html += '<div class="search-input-wrapper">';
            html += '<input type="text" id="search-input" class="search-input focusable" readonly value="' + NexusConfig.escapeHtml(this.query) + '" placeholder="' + (isAr ? 'اكتب اسم الفيلم أو المسلسل...' : 'Type title to search...') + '">';
            html += '</div>';
            html += '</div>';

            // Split Layout Container: Keyboard on top, Live Results below
            html += '<div class="keyboard-container">' + this.renderKeyboard() + '</div>';
            html += '<div class="search-results" id="search-results"></div>';
            html += '</div>';

            document.getElementById('main-content').innerHTML = html;
            this.registerFocusables();

            if (this.query && this.query.trim().length > 1) {
                this.performSearch();
            }
        },

        renderKeyboard: function () {
            var keyboard = this.keyboards[this.currentLang] || this.keyboards.ar;
            var isAr = this.currentLang === 'ar';
            var html = '';
            for (var i = 0; i < keyboard.length; i++) {
                html += '<div class="keyboard-row">';
                for (var j = 0; j < keyboard[i].length; j++) {
                    var key = keyboard[i][j];
                    html += '<button class="keyboard-key focusable" data-key="' + NexusConfig.escapeHtml(key) + '">' + NexusConfig.escapeHtml(key) + '</button>';
                }
                html += '</div>';
            }

            var backspaceSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-left:6px;"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>';
            var langSwitchText = isAr ? 'EN' : 'العربية';

            html += '<div class="keyboard-row">';
            html += '<button class="keyboard-key special focusable" data-key="space">' + (isAr ? 'مسافة' : 'Space') + '</button>';
            html += '<button class="keyboard-key special focusable" data-key="backspace">' + backspaceSvg + (isAr ? 'حذف' : 'Delete') + '</button>';
            html += '<button class="keyboard-key special focusable" data-key="clear">' + (isAr ? 'مسح' : 'Clear') + '</button>';
            html += '<button class="keyboard-key special focusable" data-key="switch-lang">' + langSwitchText + '</button>';
            html += '<button class="keyboard-key special focusable" data-key="search" style="background: var(--color-brand-red); font-weight: 700;">' + (isAr ? 'بحث' : 'Search') + '</button>';
            html += '</div>';

            return html;
        },

        registerFocusables: function () {
            var self = this;
            var keys = document.querySelectorAll('.keyboard-key');
            for (var i = 0; i < keys.length; i++) {
                keys[i].onclick = function () {
                    self.handleKeyPress(this.getAttribute('data-key'));
                };
            }
            FocusManager.register(document.querySelectorAll('.focusable'));
        },

        handleKeyPress: function (key) {
            var input = document.getElementById('search-input');
            if (!input) return;

            switch (key) {
                case 'space':
                    this.query += ' ';
                    break;
                case 'backspace':
                    this.query = this.query.slice(0, -1);
                    break;
                case 'clear':
                    this.query = '';
                    this.clearResults();
                    input.value = '';
                    return;
                case 'switch-lang':
                    this.currentLang = this.currentLang === 'ar' ? 'en' : 'ar';
                    this.render();
                    return;
                case 'search':
                    if (this.query.trim().length > 0) this.performSearch();
                    return;
                default:
                    this.query += key;
                    break;
            }

            input.value = this.query;

            // Live instant search (debounced 350ms)
            clearTimeout(this.debounceTimer);
            var self = this;
            if (this.query.trim().length >= 2) {
                this.debounceTimer = setTimeout(function () {
                    self.performSearch();
                }, 350);
            } else if (this.query.trim().length === 0) {
                this.clearResults();
            }
        },

        performSearch: function () {
            var self = this;
            var resultsContainer = document.getElementById('search-results');
            if (!resultsContainer) return;
            resultsContainer.innerHTML = '<div class="loading-spinner" style="margin:48px auto"></div>';

            NexusAPI.search(this.query).then(function (data) {
                self.results = data;
                self.renderResults();
            }).catch(function (error) {
                console.error('[SearchPage] Error:', error);
                resultsContainer.innerHTML = '<div class="error-message">تعذر إتمام البحث: ' + NexusConfig.escapeHtml(error.message) + '</div>';
            });
        },

        renderResults: function () {
            var container = document.getElementById('search-results');
            var items = this.results && Array.isArray(this.results.results) ? this.results.results : [];
            if (!container) return;
            if (!items.length) {
                container.innerHTML = '<div class="empty-state" style="min-height: 250px;"><div class="empty-state-text">لا توجد نتائج مطابقة لـ "' + NexusConfig.escapeHtml(this.query) + '"</div><div class="empty-state-subtext">تأكد من كتابة الاسم بدقة أو جرب البحث بلغة أخرى</div></div>';
                return;
            }

            var html = '<h2 class="section-title" style="padding:0 var(--spacing-xl);margin-top:36px;margin-bottom:24px;">نتائج البحث (' + items.length + ')</h2>';
            html += '<div class="search-results-grid" style="padding: 0 var(--spacing-xl);">';
            for (var i = 0; i < items.length; i++) {
                html += this.renderCard(items[i]);
            }
            html += '</div>';
            container.innerHTML = html;

            var cards = container.querySelectorAll('.content-card');
            for (var j = 0; j < cards.length; j++) {
                cards[j].onclick = function () {
                    Navigator.navigateTo('details', {
                        kind: this.getAttribute('data-kind'),
                        tmdbId: this.getAttribute('data-tmdb-id'),
                        localId: this.getAttribute('data-local-id') || null
                    });
                };
            }
            FocusManager.register(document.querySelectorAll('.focusable'));
        },

        renderCard: function (item) {
            var posterUrl = item.posterUrl ? NexusConfig.getImageUrl(item.posterUrl, 'poster') : null;
            var backdropUrl = item.backdropUrl ? NexusConfig.getImageUrl(item.backdropUrl, 'backdrop') : null;
            var image = posterUrl || backdropUrl;
            var title = item.title || item.name || '';
            var kind = item.kind || (item.media_type === 'tv' ? 'series' : 'movie');
            var targetId = item.tmdbId > 0 ? item.tmdbId : (item.localId || item.id || '');

            var html = '<div class="content-card focusable" data-kind="' + NexusConfig.escapeHtml(kind) + '" data-id="' + NexusConfig.escapeHtml(targetId) + '" data-tmdb-id="' + (item.tmdbId || 0) + '" data-local-id="' + NexusConfig.escapeHtml(item.localId || '') + '">';
            html += image ? '<img class="card-poster" loading="lazy" src="' + NexusConfig.escapeHtml(image) + '" alt="' + NexusConfig.escapeHtml(title) + '">' : '<div class="card-poster loading"></div>';
            html += '<div class="card-info"><div class="card-title text-ellipsis">' + NexusConfig.escapeHtml(title) + '</div><div class="card-meta">';
            if (item.rating) html += '<span class="card-rating text-gold">★ ' + Number(item.rating).toFixed(1) + '</span> ';
            if (item.year) html += '<span>' + NexusConfig.escapeHtml(item.year) + '</span>';
            return html + '</div></div></div>';
        },

        clearResults: function () {
            var container = document.getElementById('search-results');
            if (container) container.innerHTML = '';
            this.results = null;
        },

        cleanup: function () {
            clearTimeout(this.debounceTimer);
            this.query = '';
            this.results = null;
        }
    };
})(window);
