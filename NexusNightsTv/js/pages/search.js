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
        focusResultsOnRender: false,
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

            html += '<div class="search-header">';
            html += '<h1 class="search-title">' + (isAr ? 'البحث' : 'Search') + '</h1>';
            html += '</div>';

            html += '<div class="search-layout">';

            // Keyboard column — input and keys share one measure
            html += '<div class="search-keyboard-column">';
            html += '<div class="search-input-wrapper">';
            html += '<input type="text" id="search-input" class="search-input" readonly aria-label="' + (isAr ? 'حقل البحث' : 'Search field') + '" value="' + NexusConfig.escapeHtml(this.query) + '" placeholder="' + (isAr ? 'اسم الفيلم أو المسلسل' : 'Movie or series title') + '">';
            html += '</div>';
            html += '<div class="keyboard-container">' + this.renderKeyboard() + '</div>';
            html += '</div>';

            // Results column — the live answer beside the keys
            html += '<div class="search-results-panel" id="search-results-panel">';
            html += this.renderHint();
            html += '</div>';

            html += '</div>';
            html += '</div>';

            document.getElementById('main-content').innerHTML = html;
            this.registerFocusables();

            if (this.query && this.query.trim().length > 1) {
                this.performSearch();
            }
        },

        renderHint: function () {
            var isAr = this.currentLang === 'ar';
            return '<div class="search-hint">' +
                '<div class="search-hint-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="21" cy="21" r="13"/><line x1="31" y1="31" x2="41" y2="41" stroke-linecap="round"/></svg></div>' +
                '<div class="search-hint-title">' + (isAr ? 'ستظهر النتائج هنا' : 'Results appear here') + '</div>' +
                '<div class="search-hint-text">' + (isAr ? 'اكتب حرفين على لوحة المفاتيح، وسيبدأ البحث تلقائياً.' : 'Type two letters on the keyboard and search starts on its own.') + '</div>' +
                '<div class="search-hint-keys">' + (isAr ? 'للوصول إلى النتائج استخدم سهم اليسار' : 'Use the left arrow to reach results') + '</div>' +
                '</div>';
        },

        renderKeyboard: function () {
            var keyboard = this.keyboards[this.currentLang] || this.keyboards.ar;
            var isAr = this.currentLang === 'ar';
            var html = '';
            for (var i = 0; i < keyboard.length; i++) {
                html += '<div class="keyboard-row">';
                for (var j = 0; j < keyboard[i].length; j++) {
                    var key = keyboard[i][j];
                    html += '<button class="keyboard-key focusable" data-key="' + NexusConfig.escapeHtml(key) + '" aria-label="' + NexusConfig.escapeHtml(key) + '">' + NexusConfig.escapeHtml(key) + '</button>';
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
            html += '<button class="keyboard-key special primary focusable" data-key="search">' + (isAr ? 'بحث' : 'Search') + '</button>';
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
                    if (this.query.trim().length > 0) {
                        this.focusResultsOnRender = true;
                        this.performSearch();
                    }
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
            var resultsContainer = document.getElementById('search-results-panel');
            if (!resultsContainer) return;
            var isAr = this.currentLang === 'ar';
            resultsContainer.innerHTML = '<div class="search-loading"><div class="loading-spinner"></div><div class="loading-text">' + (isAr ? 'جاري البحث…' : 'Searching…') + '</div></div>';

            NexusAPI.search(this.query).then(function (data) {
                self.results = data;
                self.renderResults();
            }).catch(function (error) {
                console.error('[SearchPage] Error:', error);
                self.focusResultsOnRender = false;
                resultsContainer.innerHTML = '<div class="search-hint is-error"><div class="search-hint-title">' + (isAr ? 'تعذّر البحث' : 'Search unavailable') + '</div><div class="search-hint-text">' + NexusConfig.escapeHtml(NexusApp.describeError(error)) + '</div></div>';
            });
        },

        renderResults: function () {
            var container = document.getElementById('search-results-panel');
            var items = this.results && Array.isArray(this.results.results) ? this.results.results : [];
            var isAr = this.currentLang === 'ar';
            if (!container) return;
            if (!items.length) {
                this.focusResultsOnRender = false;
                container.innerHTML = '<div class="search-hint"><div class="search-hint-title">' + (isAr ? 'لا نتائج لـ «' + NexusConfig.escapeHtml(this.query) + '»' : 'No results for “' + NexusConfig.escapeHtml(this.query) + '”') + '</div><div class="search-hint-text">' + (isAr ? 'جرّب اسماً أقصر أو بدّل اللغة.' : 'Try a shorter title or switch the keyboard language.') + '</div></div>';
                return;
            }

            var html = '<div class="search-results-head">';
            html += '<h2 class="section-title">' + (isAr ? 'النتائج' : 'Results') + '</h2>';
            html += '<span class="search-results-count">' + items.length + '</span>';
            html += '</div>';
            html += '<div class="search-results-list">';
            for (var i = 0; i < items.length; i++) {
                html += this.renderResultRow(items[i]);
            }
            html += '</div>';
            container.innerHTML = html;

            var rows = container.querySelectorAll('.search-result');
            for (var j = 0; j < rows.length; j++) {
                rows[j].onclick = function () {
                    Navigator.navigateTo('details', {
                        kind: this.getAttribute('data-kind'),
                        tmdbId: this.getAttribute('data-tmdb-id'),
                        localId: this.getAttribute('data-local-id') || null
                    });
                };
            }
            FocusManager.register(document.querySelectorAll('.focusable'));

            if (this.focusResultsOnRender && rows.length) {
                this.focusResultsOnRender = false;
                FocusManager.focus(rows[0]);
            }
        },

        renderResultRow: function (item) {
            var posterUrl = item.posterUrl ? NexusConfig.getImageUrl(item.posterUrl, 'poster') : null;
            var backdropUrl = item.backdropUrl ? NexusConfig.getImageUrl(item.backdropUrl, 'backdrop') : null;
            var image = posterUrl || backdropUrl;
            var title = item.title || item.name || '';
            var kind = item.kind || (item.media_type === 'tv' ? 'series' : 'movie');
            var targetId = item.tmdbId > 0 ? item.tmdbId : (item.localId || item.id || '');
            var isAr = this.currentLang === 'ar';
            var meta = [];
            if (item.year) meta.push(NexusConfig.escapeHtml(item.year));
            meta.push(kind === 'series' ? (isAr ? 'مسلسل' : 'Series') : (isAr ? 'فيلم' : 'Movie'));
            if (item.rating) meta.push('<span class="text-gold">★ ' + Number(item.rating).toFixed(1) + '</span>');

            var html = '<div class="search-result focusable" data-kind="' + NexusConfig.escapeHtml(kind) + '" data-id="' + NexusConfig.escapeHtml(targetId) + '" data-tmdb-id="' + (item.tmdbId || 0) + '" data-local-id="' + NexusConfig.escapeHtml(item.localId || '') + '">';
            html += '<div class="search-result-art">';
            if (image) {
                html += '<img class="search-result-poster" loading="lazy" src="' + NexusConfig.escapeHtml(image) + '" alt="">';
            }
            html += '<span class="search-result-initial" aria-hidden="true">' + NexusConfig.escapeHtml(title.charAt(0)) + '</span>';
            html += '</div>';
            html += '<div class="search-result-body">';
            html += '<div class="search-result-title text-ellipsis">' + NexusConfig.escapeHtml(title) + '</div>';
            html += '<div class="search-result-meta">' + meta.join(' · ') + '</div>';
            html += '</div>';
            html += '<span class="search-result-action" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></span>';
            html += '</div>';
            return html;
        },

        clearResults: function () {
            var container = document.getElementById('search-results-panel');
            if (container) container.innerHTML = this.renderHint();
            this.results = null;
        },

        cleanup: function () {
            clearTimeout(this.debounceTimer);
            this.query = '';
            this.results = null;
        }
    };
})(window);
