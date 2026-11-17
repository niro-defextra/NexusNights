/**
 * NEXUSNIGHT TV - Navigation Manager
 * Handles page routing and transitions
 */

(function(window) {
    'use strict';
    
    /**
     * Navigation Manager
     */
    window.Navigator = {
        currentPage: null,
        currentParams: {},
        history: [],
        pages: {},
        
        /**
         * Initialize navigator
         */
        init: function() {
            this.bindBackButton();
            console.log('[Navigator] Initialized');
        },
        
        /**
         * Register a page
         */
        registerPage: function(name, pageObject) {
            this.pages[name] = pageObject;
            console.log('[Navigator] Registered page:', name);
        },
        
        /**
         * Navigate to a page
         */
        navigateTo: function(pageName, params) {
            params = params || {};
            
            console.log('[Navigator] Navigating to:', pageName, params);
            
            var page = this.pages[pageName];
            if (!page) {
                console.error('[Navigator] Page not found:', pageName);
                return;
            }
            
            // Save current page to history
            if (this.currentPage) {
                this.history.push({
                    name: this.currentPage,
                    params: this.currentParams || {},
                    scrollTop: this.getScrollTop()
                });
                
                // Cleanup current page
                var currentPageObj = this.pages[this.currentPage];
                if (currentPageObj && currentPageObj.cleanup) {
                    currentPageObj.cleanup();
                }
            }
            
            // Clear focus
            FocusManager.clear();
            
            // Update active menu item
            this.updateActiveMenuItem(pageName);
            
            // Reset scroll to top for the new page
            var mainContent = document.getElementById('main-content');
            if (mainContent) mainContent.scrollTop = 0;
            
            // Render new page
            this.currentPage = pageName;
            this.currentParams = params;
            page.render(params);
        },
        
        /**
         * Go back to previous page
         */
        goBack: function() {
            if (this.history.length === 0) {
                console.log('[Navigator] No history, exiting app');
                this.exitApp();
                return;
            }
            
            var previous = this.history.pop();
            console.log('[Navigator] Going back to:', previous.name);
            
            // Cleanup current page
            if (this.currentPage) {
                var currentPageObj = this.pages[this.currentPage];
                if (currentPageObj && currentPageObj.cleanup) {
                    currentPageObj.cleanup();
                }
            }
            
            // Clear focus
            FocusManager.clear();
            
            // Update active menu item
            this.updateActiveMenuItem(previous.name);
            
            // Render previous page
            this.currentPage = previous.name;
            this.currentParams = previous.params || {};
            var page = this.pages[previous.name];
            if (page) {
                page.render(this.currentParams);
                
                // Restore scroll position
                setTimeout(function() {
                    var mainContent = document.getElementById('main-content');
                    if (mainContent) {
                        mainContent.scrollTop = previous.scrollTop || 0;
                    }
                }, 100);
            }
        },
        
        /**
         * Re-render the page that opened an overlay such as the video player.
         */
        restoreCurrent: function() {
            var page = this.currentPage ? this.pages[this.currentPage] : null;
            if (!page) return;
            FocusManager.clear();
            page.render(this.currentParams || {});
        },

        /**
         * Get current scroll position
         */
        getScrollTop: function() {
            var mainContent = document.getElementById('main-content');
            return mainContent ? mainContent.scrollTop : 0;
        },
        
        /**
         * Update active menu item
         */
        updateActiveMenuItem: function(pageName) {
            var menuItems = document.querySelectorAll('.menu-item');
            for (var i = 0; i < menuItems.length; i++) {
                var item = menuItems[i];
                if (item.getAttribute('data-page') === pageName) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            }
        },
        
        /**
         * Bind back button
         */
        bindBackButton: function() {
            var self = this;
            window.addEventListener('nexusback', function() {
                self.goBack();
            });
        },
        
        /**
         * Exit application
         */
        exitApp: function() {
            console.log('[Navigator] Exiting application');
            
            // Samsung Tizen API
            if (typeof tizen !== 'undefined' && tizen.application) {
                try {
                    tizen.application.getCurrentApplication().exit();
                } catch (e) {
                    console.error('[Navigator] Failed to exit:', e);
                }
            } else {
                console.log('[Navigator] Tizen API not available');
            }
        },
        
        /**
         * Clear navigation history
         */
        clearHistory: function() {
            this.history = [];
        }
    };
    
})(window);
