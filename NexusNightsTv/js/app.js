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
            
            // Register pages
            this.registerPages();
            
            // Setup sidebar
            this.setupSidebar();
            
            // Test backend connection (with delay to ensure everything is loaded)
            var self = this;
            setTimeout(function() {
                console.log('[App] Starting backend test after initialization...');
                self.testBackend();
            }, 100);
            
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
         * Setup sidebar navigation
         */
        setupSidebar: function() {
            var sidebar = document.getElementById('sidebar');
            var mainContent = document.getElementById('main-content');
            
            if (!sidebar || !mainContent) {
                console.error('[App] Sidebar or main content not found');
                return;
            }
            
            // Show sidebar and main content
            sidebar.classList.remove('hidden');
            mainContent.classList.remove('hidden');
            
            // Apply language updates now that DOM is visible
            NexusConfig.applyLanguageToDom();
            
            // Bind menu items
            var menuItems = document.querySelectorAll('.menu-item');
            for (var i = 0; i < menuItems.length; i++) {
                menuItems[i].onclick = (function() {
                    var page = this.getAttribute('data-page');
                    return function() {
                        Navigator.navigateTo(page);
                    };
                }).call(menuItems[i]);
            }
            
            // Register menu items as focusable
            FocusManager.register(menuItems);
            
            console.log('[App] Sidebar configured');
        },
        
        /**
         * Test backend connection (using fetch directly to avoid NexusAPI dependency issues)
         */
        testBackend: function() {
            var self = this;
            var backendUrl = NexusConfig.getBackendUrl();
            
            console.log('[App] Testing backend connection to:', backendUrl);
            
            // Use fetch directly instead of NexusAPI
            fetch(backendUrl + '/api/health')
                .then(function(response) {
                    if (response.ok) {
                        return response.json().then(function(data) {
                            return !!(data && (data.ok === true || data.status || data.library));
                        }).catch(function() {
                            // If JSON parsing fails, check if we got any response
                            return response.text().then(function(text) {
                                return text && text.length > 0;
                            });
                        });
                    }
                    return false;
                })
                .then(function(success) {
                    if (success) {
                        console.log('[App] ✓ Backend connection successful');
                        self.start();
                    } else {
                        console.warn('[App] ✗ Backend connection failed');
                        self.showConnectionError();
                    }
                })
                .catch(function(error) {
                    console.error('[App] ✗ Backend connection error:', error);
                    // Try to start anyway - maybe it's a CORS issue but backend works
                    console.log('[App] Trying to start application anyway...');
                    self.start();
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
        },
        
        /**
         * Show connection error
         */
        showConnectionError: function() {
            var loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.innerHTML = 
                    '<div class="empty-state">' +
                    '<div class="empty-state-icon">⚠️</div>' +
                    '<div class="empty-state-text">فشل الاتصال بالخادم</div>' +
                    '<div class="empty-state-subtext">' + NexusConfig.escapeHtml(NexusConfig.getBackendUrl()) + '</div>' +
                    '<div style="margin-top: 32px;">' +
                    '<button class="btn btn-primary" id="btn-retry">إعادة المحاولة</button>' +
                    '</div>' +
                    '</div>';
                
                var retryBtn = document.getElementById('btn-retry');
                if (retryBtn) {
                    var self = this;
                    retryBtn.onclick = function() {
                        loadingScreen.innerHTML = 
                            '<div class="loading-logo">NEXUSNIGHT</div>' +
                            '<div class="loading-spinner"></div>' +
                            '<div class="loading-text">جاري الاتصال...</div>';
                        self.testBackend();
                    };
                    
                    // Focus retry button
                    setTimeout(function() {
                        FocusManager.register([retryBtn]);
                    }, 100);
                }
            }
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
