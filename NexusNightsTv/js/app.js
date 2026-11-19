/**
 * NEXUSNIGHT TV - Main Application
 * Initializes and coordinates all modules
 */

(function(window) {
    'use strict';
    
    /**
     * Main Application
     */
    window.NexusApp = {
        initialized: false,
        
        // "No signal" — one authored stroke weight, no emoji
        ICON_OFFLINE: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="6" y="12" width="36" height="24" rx="3"/>' +
            '<line x1="16" y1="42" x2="32" y2="42"/>' +
            '<line x1="24" y1="36" x2="24" y2="42"/>' +
            '<line x1="8" y1="9" x2="40" y2="41"/>' +
            '</svg>',
        
        /**
         * Initialize application
         */
        init: function() {
            if (this.initialized) return;
            
            console.log('='.repeat(60));
            console.log('NEXUSNIGHT TV v' + NexusConfig.app.version);
            console.log('Samsung Tizen 5.0 Application');
            console.log('='.repeat(60));
            
            // Debug: Check what's loaded
            console.log('[App] Checking loaded modules...');
            console.log('[App] NexusConfig:', typeof NexusConfig !== 'undefined' ? '✓ Loaded' : '✗ Missing');
            console.log('[App] NexusAPI:', typeof NexusAPI !== 'undefined' ? '✓ Loaded' : '✗ Missing');
            console.log('[App] FocusManager:', typeof FocusManager !== 'undefined' ? '✓ Loaded' : '✗ Missing');
            console.log('[App] Navigator:', typeof Navigator !== 'undefined' ? '✓ Loaded' : '✗ Missing');
            
            // Check critical dependencies
            if (typeof NexusConfig === 'undefined') {
                console.error('[App] FATAL: NexusConfig not loaded!');
                return;
            }
            
            // Initialize modules
            this.initModules();

            // Artwork failure is normal on a TV: the URL may be a dead proxy or
            // the panel may be offline. Every failed image becomes a designed
            // surface instead of the browser's broken-image glyph.
            this.watchArtwork();
            
            // Register pages
            this.registerPages();
            
            // Bring up the tab-bar shell
            this.setupNav();
            
            // Start immediately — every page renders its own offline state
            this.start();
            
            // Probe the backend in the background; it never blocks the shell
            var self = this;
            setTimeout(function() {
                self.probeBackend();
            }, 400);
            
            this.initialized = true;
        },
        
        /**
         * Initialize core modules
         */
        initModules: function() {
            console.log('[App] Initializing modules...');
            
            // Initialize Focus Manager (if available)
            if (typeof FocusManager !== 'undefined' && typeof FocusManager.init === 'function') {
                FocusManager.init();
                console.log('[App] FocusManager initialized');
            } else {
                console.warn('[App] FocusManager not available for initialization');
            }
            
            // Initialize Navigator (if available)
            if (typeof Navigator !== 'undefined' && typeof Navigator.init === 'function') {
                Navigator.init();
                console.log('[App] Navigator initialized');
            } else {
                console.warn('[App] Navigator not available for initialization');
            }
            
            // Initialize Player (if available)
            if (typeof NexusPlayer !== 'undefined' && typeof NexusPlayer.init === 'function') {
                NexusPlayer.init();
                console.log('[App] NexusPlayer initialized');
            } else {
                console.warn('[App] NexusPlayer not available for initialization');
            }
            
            console.log('[App] Modules initialization complete');
        },
        
        /**
         * Register all pages
         */
        registerPages: function() {
            console.log('[App] Registering pages...');
            
            Navigator.registerPage('home', HomePage);
            Navigator.registerPage('movies', MoviesPage);
            Navigator.registerPage('series', SeriesPage);
            Navigator.registerPage('sports', SportsPage);
            Navigator.registerPage('search', SearchPage);
            Navigator.registerPage('settings', SettingsPage);
            Navigator.registerPage('details', DetailsPage);
            
            console.log('[App] Pages registered');
        },
        
        /**
         * Bring up the top tab bar and bind it to the router
         */
        setupNav: function() {
            var navTabs = document.getElementById('nav-tabs');
            var mainContent = document.getElementById('main-content');
            
            if (!navTabs || !mainContent) {
                console.warn('[App] Tab bar or main content not found');
                return;
            }
            
            navTabs.classList.remove('hidden');
            mainContent.classList.remove('hidden');
            
            // Apply language updates now that the DOM is visible
            NexusConfig.applyLanguageToDom();
            
            var tabs = navTabs.querySelectorAll('.tab');
            for (var i = 0; i < tabs.length; i++) {
                tabs[i].onclick = (function(tab) {
                    return function() {
                        Navigator.navigateTo(tab.getAttribute('data-page'));
                    };
                })(tabs[i]);
            }
            
            FocusManager.register(tabs);

            // Clock display for TV header
            function updateClock() {
                var clockEl = document.getElementById('nav-clock');
                if (!clockEl) return;
                var now = new Date();
                var h = now.getHours();
                var m = now.getMinutes();
                clockEl.textContent = (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
            }
            updateClock();
            setInterval(updateClock, 10000);
            
            console.log('[App] Tab bar configured with', tabs.length, 'tabs');
        },
        
        /**
         * Show or hide the live counter chip in the tab bar
         */
        setLiveCount: function(count) {
            var chip = document.getElementById('nav-live-chip');
            var text = document.getElementById('nav-live-text');
            if (!chip) return;
            count = count || 0;
            if (count > 0) {
                if (text) text.textContent = count + ' ' + (NexusConfig.getLanguage() === 'ar' ? 'مباشر' : 'LIVE');
                chip.classList.remove('hidden');
            } else {
                chip.classList.add('hidden');
            }
        },
        
        /**
         * A failed poster, backdrop or logo is a designed state, not a browser
         * glyph. The capture-phase listener catches every image the app renders,
         * including artwork injected after navigation.
         */
        watchArtwork: function() {
            document.addEventListener('error', function(event) {
                var img = event.target;
                if (!img || img.tagName !== 'IMG') return;

                img.classList.add('is-broken');

                if (img.className.indexOf('hero-logo') !== -1 || img.className.indexOf('details-logo') !== -1) {
                    var hero = img.parentElement;
                    var title = img.getAttribute('alt') || '';
                    var heading = document.createElement('h1');
                    heading.className = img.className.indexOf('hero-logo') !== -1 ? 'hero-title' : 'details-title';
                    heading.textContent = title;
                    if (hero && title) hero.insertBefore(heading, img);
                    img.style.display = 'none';
                    return;
                }

                if (img.className.indexOf('team-crest') !== -1) {
                    var frame = img.parentElement;
                    if (frame && frame.classList) frame.classList.add('has-broken-crest');
                    return;
                }

                var host = img.parentElement;
                while (host && host !== document.body) {
                    if (host.classList && (host.classList.contains('content-card') ||
                        host.classList.contains('backdrop-card') ||
                        host.classList.contains('live-cell') ||
                        host.classList.contains('match-card') ||
                        host.classList.contains('channel-card'))) {
                        host.classList.add('has-broken-art');
                        break;
                    }
                    host = host.parentElement;
                }
            }, true);
        },

        /**
         * Turn transport and HTTP failures into one calm sentence a viewer can
         * act on. The raw message never reaches the screen.
         */
        describeError: function(error) {
            var isAr = NexusConfig.getLanguage() === 'ar';
            var message = typeof error === 'string' ? error : ((error && (error.message || error.statusText)) || '');
            var status = (error && error.status) || 0;
            var match = /HTTP\s+(\d+)/i.exec(message);
            if (match) status = parseInt(match[1], 10);

            if (status === 404) {
                return isAr ? 'هذا المحتوى غير متوفر حالياً' : 'This title is not available right now';
            }
            if (status === 401 || status === 403) {
                return isAr ? 'لا تملك صلاحية الوصول إلى هذا المحتوى' : 'This content is not available to you';
            }
            if (status >= 500) {
                return isAr ? 'الخادم لا يستجيب الآن — حاول بعد قليل' : 'The server is not responding — try again shortly';
            }
            if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
                return isAr ? 'انتهت مهلة الاتصال — تحقّق من الشبكة' : 'The connection timed out — check your network';
            }
            if (/network|failed to fetch|load failed|offline/i.test(message)) {
                return isAr ? 'لا يوجد اتصال بالشبكة' : 'No network connection';
            }
            return isAr ? 'تعذّر إكمال الطلب — حاول مرة أخرى' : 'The request could not be completed — try again';
        },

        /**
         * A designed offline/empty surface. Always leaves focus on something real.
         */
        showErrorState: function(options) {
            options = options || {};
            var mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            var isAr = NexusConfig.getLanguage() === 'ar';
            var title = options.title || (isAr ? 'تعذّر تحميل المحتوى' : 'Content unavailable');
            var message = options.message || '';
            if (message && (typeof message !== 'string' || /^(HTTP\s|Network|Failed|TypeError|timeout|timed out|Load failed)/i.test(message))) {
                message = this.describeError(message);
            }
            message = message ? NexusConfig.escapeHtml(message) : '';
            var actionLabel = options.actionLabel || (isAr ? 'إعادة المحاولة' : 'Retry');
            
            mainContent.innerHTML =
                '<div class="page-container state-page">' +
                '<div class="empty-state">' +
                '<div class="empty-state-icon">' + NexusApp.ICON_OFFLINE + '</div>' +
                '<div class="empty-state-text">' + NexusConfig.escapeHtml(title) + '</div>' +
                '<div class="empty-state-subtext">' + message + '</div>' +
                '<div class="state-actions">' +
                '<button class="btn btn-primary focusable" id="state-action">' + NexusConfig.escapeHtml(actionLabel) + '</button>' +
                '</div>' +
                '</div></div>';
            
            var button = document.getElementById('state-action');
            if (button && typeof options.onAction === 'function') button.onclick = options.onAction;
            
            FocusManager.register(mainContent.querySelectorAll('.focusable'));
        },
        
        /**
         * A quiet status line. Never steals focus and never tears down the page.
         */
        showToast: function(message, duration) {
            var app = document.getElementById('app');
            if (!app) return;
            this.hideToast();
            var toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            toast.textContent = message;
            app.appendChild(toast);
            window.requestAnimationFrame(function() { toast.classList.add('toast-in'); });
            if (duration !== 0) {
                var self = this;
                window.setTimeout(function() { self.hideToast(); }, duration || 2600);
            }
        },
        
        hideToast: function() {
            var toast = document.getElementById('app-toast');
            if (toast && toast.parentElement) toast.parentElement.removeChild(toast);
        },
        
        /**
         * Probe the backend in the background. A missing backend is an expected
         * state — every page draws its own offline surface — so this never throws
         * and never blocks the shell.
         */
        probeBackend: function() {
            var backendUrl = NexusConfig.getBackendUrl();
            console.log('[App] Probing backend at', backendUrl);
            
            fetch(backendUrl + '/api/health')
                .then(function(response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.json();
                })
                .then(function() {
                    console.log('[App] Backend online');
                })
                .catch(function() {
                    console.log('[App] Backend unreachable — running offline');
                });
        },
        
        /**
         * Start application
         */
        start: function() {
            console.log('[App] Starting application...');
            
            // Hide loading screen
            var loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(function() {
                    loadingScreen.remove();
                }, 300);
            }
            
            // Navigate to home page
            Navigator.navigateTo('home');
            
            console.log('[App] Application started successfully');
            console.log('='.repeat(60));
        }
    };
    
    /**
     * Initialize when DOM is ready
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            NexusApp.init();
        });
    } else {
        NexusApp.init();
    }
    
})(window);
