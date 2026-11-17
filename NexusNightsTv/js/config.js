/**
 * NEXUSNIGHT TV - Configuration & i18n
 * Settings for Samsung Tizen 5.0 compatibility (Strict ES5)
 */

(function(window) {
    'use strict';
    
    // Translation dictionary for Arabic (Default) and English
    var TRANSLATIONS = {
        ar: {
            app_name: 'NEXUSNIGHT',
            loading: 'جاري التحميل...',
            loading_stream: 'جاري تحميل البث...',
            nav_home: 'الرئيسية',
            nav_movies: 'أفلام',
            nav_series: 'مسلسلات',
            nav_sports: 'رياضة',
            nav_search: 'بحث',
            nav_settings: 'إعدادات',
            hero_play: 'تشغيل',
            hero_details: 'التفاصيل',
            hero_live: 'مباشر الآن',
            row_trending_movies: 'الأفلام الرائجة اليوم',
            row_top_series: 'المسلسلات الأكثر مشاهدة',
            row_top_rated: 'أفضل الأعمال تقييماً',
            row_latest: 'أحدث الإضافات',
            row_featured_sports: 'مباريات اليوم الكبرى',
            row_sports_channels: 'قنوات بي إن سبورتس المباشرة',
            player_play: 'تشغيل',
            player_pause: 'إيقاف مؤقت',
            player_rewind: '10 ثوانٍ للخلف',
            player_forward: '10 ثوانٍ للأمام',
            player_subtitles: 'الترجمة',
            player_subtitles_off: 'إيقاف الترجمة',
            player_subtitles_ar: 'العربية (Arabic)',
            player_subtitles_en: 'الإنجليزية (English)',
            player_sources: 'المصادر',
            player_close: 'إغلاق المشغّل',
            player_live_badge: 'بث مباشر • 1080p',
            player_error: 'تعذّر تشغيل مصدر الفيديو',
            player_retry: 'إعادة المحاولة',
            player_exit: 'خروج',
            settings_title: 'الإعدادات',
            settings_lang_section: 'اللغة (Language)',
            settings_lang_ar: 'العربية (RTL)',
            settings_lang_en: 'English (LTR)',
            settings_active: '✓ مفعّل',
            settings_activate: 'تفعيل',
            settings_server_section: 'الاتصال بالسيرفر (Server Connection)',
            settings_current_server: 'عنوان الخادم الحالي',
            settings_edit_server: 'تغيير عنوان الخادم (IP / URL)',
            settings_edit_server_hint: 'اضغط للتعديل',
            settings_test_server: 'اختبار الاتصال بالخادم',
            settings_test_server_hint: 'اضغط للاختبار',
            settings_about_section: 'حول التطبيق (About)',
            settings_app_name: 'اسم التطبيق',
            settings_version: 'الإصدار',
            settings_engine: 'حالة محرك العرض'
        },
        en: {
            app_name: 'NEXUSNIGHT',
            loading: 'Loading...',
            loading_stream: 'Loading Stream...',
            nav_home: 'Home',
            nav_movies: 'Movies',
            nav_series: 'Series',
            nav_sports: 'Sports',
            nav_search: 'Search',
            nav_settings: 'Settings',
            hero_play: 'Play',
            hero_details: 'Details',
            hero_live: 'Live Now',
            row_trending_movies: 'Trending Movies Today',
            row_top_series: 'Most Watched Series',
            row_top_rated: 'Top Rated',
            row_latest: 'New Releases',
            row_featured_sports: "Today's Marquee Clashes",
            row_sports_channels: 'Live beIN Sports Channels',
            player_play: 'Play',
            player_pause: 'Pause',
            player_rewind: '10s Rewind',
            player_forward: '10s Forward',
            player_subtitles: 'Subtitles',
            player_subtitles_off: 'Subtitles Off',
            player_subtitles_ar: 'Arabic (العربية)',
            player_subtitles_en: 'English',
            player_sources: 'Sources',
            player_close: 'Close Player',
            player_live_badge: 'LIVE STREAM • 1080p',
            player_error: 'Unable to play video source',
            player_retry: 'Retry',
            player_exit: 'Exit',
            settings_title: 'Settings',
            settings_lang_section: 'Language',
            settings_lang_ar: 'Arabic (العربية RTL)',
            settings_lang_en: 'English (LTR)',
            settings_active: '✓ Active',
            settings_activate: 'Activate',
            settings_server_section: 'Server Connection',
            settings_current_server: 'Current Server URL',
            settings_edit_server: 'Change Server URL (IP / URL)',
            settings_edit_server_hint: 'Click to edit',
            settings_test_server: 'Test Server Connection',
            settings_test_server_hint: 'Click to test',
            settings_about_section: 'About Application',
            settings_app_name: 'Application Name',
            settings_version: 'Version',
            settings_engine: 'Playback Engine Status'
        }
    };

    /**
     * Global configuration object
     */
    window.NexusConfig = {
        // Backend API Configuration - Using production backend with image proxy
        apiBaseUrl: 'https://nexusunights.tech',
        
        // TMDB Image Configuration
        tmdbImageBase: 'https://image.tmdb.org/t/p',
        
        // Image sizes for TV optimization
        imageSizes: {
            poster: 'w342',
            backdrop: 'w780',
            logo: 'w300',
            profile: 'w185',
            still: 'w300'
        },
        
        // Application Settings
        app: {
            name: 'NEXUSNIGHT',
            version: '1.2.0',
            defaultLanguage: 'ar',
            supportedLanguages: ['ar', 'en'],
            focusDebug: false
        },
        
        // Playback Settings
        playback: {
            preferredQuality: '1080p',
            autoplay: true,
            defaultVolume: 0.8,
            controlsTimeout: 4500
        },
        
        // Content Loading
        content: {
            itemsPerPage: 20,
            rowSize: 8,
            prefetchThreshold: 5
        },
        
        // Storage Keys
        storage: {
            language: 'nexus_language',
            backend: 'nexus_backend_url',
            volume: 'nexus_volume',
            watchProgress: 'nexus_watch_progress'
        },
        
        // Feature Flags
        features: {
            sports: true,
            search: true,
            continueWatching: true,
            recommendations: true
        }
    };
    
    /**
     * Translate a key into current language
     */
    NexusConfig.t = function(key) {
        var lang = this.getLanguage();
        var dict = TRANSLATIONS[lang] || TRANSLATIONS.ar;
        if (dict && dict[key]) return dict[key];
        if (TRANSLATIONS.en && TRANSLATIONS.en[key]) return TRANSLATIONS.en[key];
        return key;
    };

    /**
     * Get stored backend URL or default
     */
    NexusConfig.getBackendUrl = function() {
        try {
            var stored = window.localStorage.getItem(this.storage.backend);
            // Upgrade legacy localhost:3001 to production
            if (stored && (stored.indexOf('localhost:3001') !== -1 || stored.indexOf('127.0.0.1:3001') !== -1)) {
                stored = 'https://nexusunights.tech';
                window.localStorage.setItem(this.storage.backend, stored);
            }
            return stored || this.apiBaseUrl;
        } catch (e) {
            return this.apiBaseUrl;
        }
    };
    
    /**
     * Set backend URL
     */
    NexusConfig.setBackendUrl = function(url) {
        try {
            window.localStorage.setItem(this.storage.backend, url);
            this.apiBaseUrl = url;
            return true;
        } catch (e) {
            console.error('Failed to save backend URL:', e);
            return false;
        }
    };
    
    /**
     * Get current language
     */
    NexusConfig.getLanguage = function() {
        try {
            var stored = window.localStorage.getItem(this.storage.language);
            return (stored === 'en' || stored === 'ar') ? stored : this.app.defaultLanguage;
        } catch (e) {
            return this.app.defaultLanguage;
        }
    };
    
    /**
     * Set language and immediately update UI
     */
    NexusConfig.setLanguage = function(lang) {
        try {
            if (this.app.supportedLanguages.indexOf(lang) === -1) {
                console.error('Unsupported language:', lang);
                return false;
            }
            
            var currentLang = this.getLanguage();
            if (currentLang === lang) {
                console.log('[NexusConfig] Language already set to:', lang);
                return true;
            }
            
            console.log('[NexusConfig] Changing language from', currentLang, 'to', lang);
            window.localStorage.setItem(this.storage.language, lang);
            this.app.defaultLanguage = lang;
            
            // Force DOM update immediately
            this.applyLanguageToDom();
            
            // Show success message and suggest reload for full effect
            console.log('[NexusConfig] Language changed successfully to', lang);
            
            // If we're on settings page, update the settings UI too
            if (window.SettingsPage && typeof SettingsPage.onLanguageChange === 'function') {
                SettingsPage.onLanguageChange(lang);
            }
            
            return true;
        } catch (e) {
            console.error('[NexusConfig] Failed to save language:', e);
            return false;
        }
    };
    
    /**
     * Apply current translations to static DOM elements
     */
    NexusConfig.applyLanguageToDom = function() {
        var lang = this.getLanguage();
        console.log('[NexusConfig] Applying language:', lang);
        
        // Update HTML document direction
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
        
        // Wait for DOM to be ready (especially for sidebar which might be hidden)
        var self = this;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                self._updateLabels();
            });
        } else {
            this._updateLabels();
        }
        
        var loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = this.t('loading');
        }
    };
    
    /**
     * Internal: Update all labels after DOM is ready
     */
    NexusConfig._updateLabels = function() {
        var labels = {
            'home': this.t('nav_home'),
            'movies': this.t('nav_movies'),
            'series': this.t('nav_series'),
            'sports': this.t('nav_sports'),
            'search': this.t('nav_search'),
            'settings': this.t('nav_settings')
        };
        
        var menuItems = document.querySelectorAll('.menu-item');
        console.log('[NexusConfig] Found menu items:', menuItems.length);
        
        for (var i = 0; i < menuItems.length; i++) {
            var page = menuItems[i].getAttribute('data-page');
            var labelEl = menuItems[i].querySelector('.menu-label');
            if (page && labels[page]) {
                if (labelEl) {
                    labelEl.textContent = labels[page];
                } else {
                    // If label doesn't exist yet, create it
                    var span = document.createElement('span');
                    span.className = 'menu-label';
                    span.textContent = labels[page];
                    span.style.display = 'inline-block';
                    span.style.marginLeft = '12px';
                    span.style.fontSize = '24px';
                    span.style.fontWeight = '500';
                    span.style.opacity = '0.9';
                    span.style.transition = 'opacity 0.3s ease';
                    menuItems[i].appendChild(span);
                }
                console.log('[NexusConfig] Updated label for:', page, '->', labels[page]);
            }
        }
        
        // Also update any buttons with translation keys
        var buttons = document.querySelectorAll('[data-translate]');
        for (var j = 0; j < buttons.length; j++) {
            var key = buttons[j].getAttribute('data-translate');
            var translation = this.t(key);
            if (translation !== key) {
                buttons[j].textContent = translation;
            }
        }
        
        // Force sidebar expansion temporarily to ensure labels are visible for update
        var sidebar = document.getElementById('sidebar');
        if (sidebar) {
            var wasExpanded = sidebar.classList.contains('expanded');
            if (!wasExpanded) {
                sidebar.classList.add('expanded');
                setTimeout(function() {
                    sidebar.classList.remove('expanded');
                }, 100);
            }
        }
    };

    /**
     * Build full image URL (with proxy support)
     */
    NexusConfig.getImageUrl = function(path, size) {
        if (!path) return null;
        
        // If it's already a full URL, return as-is
        if (/^https?:\/\//i.test(path)) return path;
        
        // If it starts with /api, it's a backend URL
        if (path.indexOf('/api') === 0 || path.charAt(0) === '/') {
            return String(this.getBackendUrl()).replace(/\/+$/, '') + path;
        }
        
        // For TMDB images, use the proxy to avoid CORS
        var sizeCode = this.imageSizes[size] || size || 'original';
        var imagePath = path.charAt(0) === '/' ? path : '/' + path;
        return String(this.getBackendUrl()).replace(/\/+$/, '') + '/api/proxy/tmdb-image?path=' + encodeURIComponent(imagePath) + '&size=' + encodeURIComponent(sizeCode);
    };

    /**
     * Escape data before inserting dynamic values into TV markup
     */
    NexusConfig.escapeHtml = function(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * Initialize configuration on load
     */
    NexusConfig.init = function() {
        var lang = this.getLanguage();
        console.log('[NexusConfig] Initializing with language:', lang);
        
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
        
        // Ensure backend URL defaults to production
        this.apiBaseUrl = this.getBackendUrl();
        
        // Apply translations
        this.applyLanguageToDom();
        
        console.log('[NexusConfig] Initialized successfully:', {
            backend: this.apiBaseUrl,
            language: lang,
            direction: document.documentElement.dir
        });
    };
    
    // Auto-initialize
    NexusConfig.init();
    
})(window);
