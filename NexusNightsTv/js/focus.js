/**
 * NEXUSNIGHT TV - Focus Manager
 * Handles remote control navigation and focus management
 */

(function(window) {
    'use strict';
    
    /**
     * Focus Manager
     * Manages focus states and directional navigation
     */
    window.FocusManager = {
        currentFocused: null,
        focusableElements: [],
        history: [],
        debug: false,
        
        /**
         * Initialize focus management
         */
        init: function() {
            this.debug = NexusConfig.app.focusDebug;
            this.bindKeys();
            this.registerMediaKeys();
            this.log('FocusManager initialized');
        },
        
        /**
         * Bind remote control keys
         */
        bindKeys: function() {
            var self = this;
            
            document.addEventListener('keydown', function(e) {
                self.log('Key pressed:', e.keyCode);
                if (self.isPlayerOpen() && e.keyCode !== 10009 && e.keyCode !== 461 && window.NexusPlayer) {
                    NexusPlayer.showControls();
                }
                
                switch (e.keyCode) {
                    case 37: // Left (physical D-pad direction)
                        e.preventDefault();
                        self.move('left');
                        break;
                    case 38: // Up
                        e.preventDefault();
                        self.move('up');
                        break;
                    case 39: // Right (physical D-pad direction)
                        e.preventDefault();
                        self.move('right');
                        break;
                    case 40: // Down
                        e.preventDefault();
                        self.move('down');
                        break;
                    case 13: // Enter/OK
                        e.preventDefault();
                        self.activate();
                        break;
                    case 415: // MediaPlay
                    case 19: // MediaPause
                    case 10252: // MediaPlayPause
                        if (self.isPlayerOpen()) {
                            e.preventDefault();
                            NexusPlayer.togglePlayPause();
                        }
                        break;
                    case 412: // MediaRewind
                        if (self.isPlayerOpen()) { e.preventDefault(); NexusPlayer.skip(-10); NexusPlayer.showControls(); }
                        break;
                    case 417: // MediaFastForward
                        if (self.isPlayerOpen()) { e.preventDefault(); NexusPlayer.skip(10); NexusPlayer.showControls(); }
                        break;
                    case 413: // MediaStop
                        if (self.isPlayerOpen()) { e.preventDefault(); NexusPlayer.stop(); }
                        break;
                    case 10009: // Back button (Samsung)
                    case 461:   // Back button (alternative)
                        e.preventDefault();
                        self.back();
                        break;
                }
            });
        },
        
        /**
         * Register focusable elements
         */
        register: function(elements) {
            var next = [];
            if (elements) {
                if (elements.length !== undefined && typeof elements !== 'string') next = Array.prototype.slice.call(elements);
                else next = [elements];
            }
            var player = this.isPlayerOpen();
            if (!player) {
                var menu = document.querySelectorAll('.menu-item');
                for (var m = 0; m < menu.length; m++) {
                    if (next.indexOf(menu[m]) === -1) next.push(menu[m]);
                }
            }
            this.focusableElements = next.filter(function (el) {
                if (!el || el.disabled) return false;
                var rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
            this.log('Registered', this.focusableElements.length, 'focusable elements');
            if (this.currentFocused && this.focusableElements.indexOf(this.currentFocused) !== -1) return;
            if (this.currentFocused) this.currentFocused.classList.remove('focused');
            this.currentFocused = null;
            if (this.focusableElements.length > 0) this.focus(this.focusableElements[0]);
        },

        isPlayerOpen: function() {
            return !!document.getElementById('player-page');
        },

        registerMediaKeys: function() {
            if (typeof tizen === 'undefined' || !tizen.tvinputdevice || !tizen.tvinputdevice.registerKey) return;
            var keys = ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaRewind', 'MediaFastForward'];
            for (var i = 0; i < keys.length; i++) {
                try { tizen.tvinputdevice.registerKey(keys[i]); }
                catch (error) { this.log('Media key unavailable:', keys[i], error); }
            }
        },
        
        /**
         * Focus an element
         */
        focus: function(element) {
            if (!element) return;
            
            // Remove focus from current
            if (this.currentFocused) {
                this.currentFocused.classList.remove('focused');
            }
            
            // Add focus to new element
            element.classList.add('focused');
            this.currentFocused = element;
            
            // Expand or collapse sidebar based on focus location
            var sidebar = document.getElementById('sidebar');
            if (sidebar) {
                if (element.classList.contains('menu-item') || sidebar.contains(element)) {
                    sidebar.classList.add('expanded');
                } else {
                    sidebar.classList.remove('expanded');
                }
            }
            
            // Scroll into view
            this.scrollIntoView(element);
            
            this.log('Focused:', element);
            
            // Trigger focus event
            var event = new CustomEvent('nexusfocus', { detail: { element: element } });
            element.dispatchEvent(event);
        },
        
        /**
         * Move focus in a direction
         */
        move: function(direction) {
            if (!this.currentFocused || this.focusableElements.length === 0) {
                return;
            }
            
            var current = this.currentFocused;
            var currentRect = current.getBoundingClientRect();
            var candidates = [];
            
            // Find candidates in the correct direction
            for (var i = 0; i < this.focusableElements.length; i++) {
                var el = this.focusableElements[i];
                if (el === current || el.disabled) continue;
                var rect = el.getBoundingClientRect();
                if (!rect.width || !rect.height) continue;
                
                if (this.isInDirection(currentRect, rect, direction)) {
                    var distance = this.calculateDistance(currentRect, rect, direction);
                    candidates.push({ element: el, distance: distance });
                }
            }
            
            // Sort by distance
            candidates.sort(function(a, b) { return a.distance - b.distance; });
            
            // Focus nearest candidate
            if (candidates.length > 0) {
                this.focus(candidates[0].element);
            } else {
                this.log('No candidate found for direction:', direction);
            }
        },
        
        /**
         * Check if element is in the given direction
         */
        isInDirection: function(fromRect, toRect, direction) {
            var threshold = 50; // Tolerance for alignment
            
            switch (direction) {
                case 'left':
                    return toRect.right <= fromRect.left + threshold &&
                           Math.abs(toRect.top - fromRect.top) < fromRect.height + threshold;
                case 'right':
                    return toRect.left >= fromRect.right - threshold &&
                           Math.abs(toRect.top - fromRect.top) < fromRect.height + threshold;
                case 'up':
                    return toRect.bottom <= fromRect.top + threshold &&
                           Math.abs(toRect.left - fromRect.left) < fromRect.width + threshold;
                case 'down':
                    return toRect.top >= fromRect.bottom - threshold &&
                           Math.abs(toRect.left - fromRect.left) < fromRect.width + threshold;
                default:
                    return false;
            }
        },
        
        /**
         * Calculate distance between elements
         */
        calculateDistance: function(fromRect, toRect, direction) {
            var dx, dy;
            
            switch (direction) {
                case 'left':
                case 'right':
                    dx = Math.abs(toRect.left - fromRect.left);
                    dy = Math.abs(toRect.top - fromRect.top);
                    break;
                case 'up':
                case 'down':
                    dx = Math.abs(toRect.left - fromRect.left);
                    dy = Math.abs(toRect.top - fromRect.top);
                    break;
                default:
                    return Infinity;
            }
            
            // Euclidean distance
            return Math.sqrt(dx * dx + dy * dy);
        },
        
        /**
         * Scroll element into view
         */
        scrollIntoView: function(element) {
            var rect = element.getBoundingClientRect();
            var container = this.findScrollParent(element);
            
            if (!container) return;
            
            var containerRect = container.getBoundingClientRect();
            
            // Calculate scroll positions
            var scrollTop = container.scrollTop;
            var scrollLeft = container.scrollLeft;
            
            // Vertical scrolling
            if (rect.top < containerRect.top) {
                container.scrollTop = scrollTop - (containerRect.top - rect.top) - 50;
            } else if (rect.bottom > containerRect.bottom) {
                container.scrollTop = scrollTop + (rect.bottom - containerRect.bottom) + 50;
            }
            
            // Horizontal scrolling
            if (rect.left < containerRect.left) {
                container.scrollLeft = scrollLeft - (containerRect.left - rect.left) - 50;
            } else if (rect.right > containerRect.right) {
                container.scrollLeft = scrollLeft + (rect.right - containerRect.right) + 50;
            }
        },
        
        /**
         * Find scrollable parent
         */
        findScrollParent: function(element) {
            var parent = element.parentElement;
            
            while (parent) {
                var overflow = window.getComputedStyle(parent).overflow;
                if (overflow === 'auto' || overflow === 'scroll' || 
                    parent.classList.contains('scroll-container') ||
                    parent.classList.contains('content-row') ||
                    parent.classList.contains('main-content')) {
                    return parent;
                }
                parent = parent.parentElement;
            }
            
            return null;
        },
        
        /**
         * Activate focused element
         */
        activate: function() {
            if (!this.currentFocused) return;
            
            this.log('Activated:', this.currentFocused);
            
            // Trigger click event
            this.currentFocused.click();
        },
        
        /**
         * Go back
         */
        back: function() {
            this.log('Back pressed');
            if (this.isPlayerOpen() && window.NexusPlayer) {
                NexusPlayer.stop();
                return;
            }
            var event = new CustomEvent('nexusback');
            window.dispatchEvent(event);
        },
        
        /**
         * Clear all focusable elements
         */
        clear: function() {
            if (this.currentFocused) {
                this.currentFocused.classList.remove('focused');
            }
            this.currentFocused = null;
            this.focusableElements = [];
            this.log('Cleared all focusable elements');
        },
        
        /**
         * Save current focus to history
         */
        pushHistory: function() {
            if (this.currentFocused) {
                this.history.push(this.currentFocused);
            }
        },
        
        /**
         * Restore focus from history
         */
        popHistory: function() {
            var element = this.history.pop();
            if (element) {
                var rect = element.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    this.focus(element);
                    return true;
                }
            }
            return false;
        },
        
        /**
         * Focus first element
         */
        focusFirst: function() {
            if (this.focusableElements.length > 0) {
                this.focus(this.focusableElements[0]);
            }
        },
        
        /**
         * Log debug messages
         */
        log: function() {
            if (this.debug) {
                console.log.apply(console, ['[FocusManager]'].concat(Array.prototype.slice.call(arguments)));
            }
        }
    };
    
})(window);
