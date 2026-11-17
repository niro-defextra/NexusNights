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
                var tabs = document.querySelectorAll('#nav-tabs .tab');
                for (var m = 0; m < tabs.length; m++) {
                    if (next.indexOf(tabs[m]) === -1) next.push(tabs[m]);
                }
            }
            this.focusableElements = next.filter(function (el) {
                if (!el || el.disabled) return false;
                var rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
            this.log('Registered', this.focusableElements.length, 'focusable elements');
            var current = this.currentFocused;
            // A live element that is not a tab keeps focus — the page just re-rendered
            // around it. A tab is only a waypoint: the page's own content takes it next.
            if (current && this.focusableElements.indexOf(current) !== -1 &&
                !current.classList.contains('tab')) {
                return;
            }
            if (current && current.classList.contains('focused')) current.classList.remove('focused');
            this.currentFocused = null;
            if (!this.focusableElements.length) return;
            var preferred = null;
            for (var i = 0; i < this.focusableElements.length; i++) {
                if (!this.focusableElements[i].classList.contains('tab')) { preferred = this.focusableElements[i]; break; }
            }
            this.focus(preferred || this.focusableElements[0]);
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

            this.updateLitState(element);

            // Scroll into view
            this.scrollIntoView(element);
            
            this.log('Focused:', element);
            
            // Trigger focus event
            var event = new CustomEvent('nexusfocus', { detail: { element: element } });
            element.dispatchEvent(event);
        },

        /**
         * Signature — the surface that owns focus lifts one tone, its siblings settle back.
         * The tab the visitor is reaching for brightens; the row they are reading stays lit.
         */
        updateLitState: function(element) {
            var tabList = document.querySelector('#nav-tabs .nav-tab-list');
            if (tabList) {
                if (element.classList.contains('tab')) tabList.classList.add('tab-lit');
                else tabList.classList.remove('tab-lit');
            }

            var main = document.getElementById('main-content');
            if (!main) return;
            var sections = main.querySelectorAll('.content-section');
            var lit = null;
            var node = element;
            while (node && node !== main) {
                if (node.classList && node.classList.contains('content-section')) { lit = node; break; }
                node = node.parentElement;
            }
            for (var i = 0; i < sections.length; i++) {
                if (sections[i] === lit) sections[i].classList.add('row-lit');
                else sections[i].classList.remove('row-lit');
            }
            if (lit) main.classList.add('has-row-focus');
            else main.classList.remove('has-row-focus');
        },
        
        /**
         * Move focus in a direction with 2D spatial navigation
         */
        move: function(direction) {
            if (!this.currentFocused || this.focusableElements.length === 0) {
                if (this.focusableElements.length > 0) this.focus(this.focusableElements[0]);
                return;
            }
            
            var current = this.currentFocused;
            var currentRect = current.getBoundingClientRect();
            var fromCenterX = (currentRect.left + currentRect.right) / 2;
            var fromCenterY = (currentRect.top + currentRect.bottom) / 2;

            var candidates = [];
            
            // Find candidates in the correct direction
            for (var i = 0; i < this.focusableElements.length; i++) {
                var el = this.focusableElements[i];
                if (el === current || el.disabled) continue;
                var rect = el.getBoundingClientRect();
                if (!rect.width || !rect.height) continue;
                
                var toCenterX = (rect.left + rect.right) / 2;
                var toCenterY = (rect.top + rect.bottom) / 2;
                var isCandidate = false;
                var score = 0;

                if (direction === 'up') {
                    if (toCenterY < fromCenterY - 4) {
                        isCandidate = true;
                        var dy = Math.max(0, currentRect.top - rect.bottom);
                        var dx = Math.abs(toCenterX - fromCenterX);
                        var overlapX = Math.max(0, Math.min(currentRect.right, rect.right) - Math.max(currentRect.left, rect.left));
                        score = dy * 1.5 + dx * 0.8;
                        if (overlapX > 0) score -= 100 + overlapX * 0.5;
                    }
                } else if (direction === 'down') {
                    if (toCenterY > fromCenterY + 4) {
                        isCandidate = true;
                        var dy = Math.max(0, rect.top - currentRect.bottom);
                        var dx = Math.abs(toCenterX - fromCenterX);
                        var overlapX = Math.max(0, Math.min(currentRect.right, rect.right) - Math.max(currentRect.left, rect.left));
                        score = dy * 1.5 + dx * 0.8;
                        if (overlapX > 0) score -= 100 + overlapX * 0.5;
                    }
                } else if (direction === 'left') {
                    if (toCenterX < fromCenterX - 4) {
                        isCandidate = true;
                        var dx = Math.max(0, currentRect.left - rect.right);
                        var dy = Math.abs(toCenterY - fromCenterY);
                        var overlapY = Math.max(0, Math.min(currentRect.bottom, rect.bottom) - Math.max(currentRect.top, rect.top));
                        score = dx * 1.5 + dy * 1.2;
                        if (overlapY > 0) score -= 80 + overlapY * 0.5;
                    }
                } else if (direction === 'right') {
                    if (toCenterX > fromCenterX + 4) {
                        isCandidate = true;
                        var dx = Math.max(0, rect.left - currentRect.right);
                        var dy = Math.abs(toCenterY - fromCenterY);
                        var overlapY = Math.max(0, Math.min(currentRect.bottom, rect.bottom) - Math.max(currentRect.top, rect.top));
                        score = dx * 1.5 + dy * 1.2;
                        if (overlapY > 0) score -= 80 + overlapY * 0.5;
                    }
                }

                if (isCandidate) {
                    candidates.push({ element: el, score: score });
                }
            }
            
            // Sort by lowest score (closest + best alignment)
            candidates.sort(function(a, b) { return a.score - b.score; });
            
            // Focus nearest candidate
            if (candidates.length > 0) {
                this.focus(candidates[0].element);
            } else {
                this.log('No candidate found for direction:', direction);
            }
        },
        
        /**
         * Scroll element into view with support for both horizontal carousels and vertical page scroll
         */
        scrollIntoView: function(element) {
            if (!element) return;
            var node = element.parentElement;
            var isRtl = document.documentElement.getAttribute('dir') === 'rtl';

            while (node && node !== document.body && node !== document.documentElement) {
                var style = window.getComputedStyle(node);
                var canScrollX = (style.overflowX === 'auto' || style.overflowX === 'scroll' || node.classList.contains('content-row') || node.classList.contains('live-band-track'));
                var canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll' || node.classList.contains('main-content') || node.id === 'main-content');

                if (canScrollX) {
                    var elRect = element.getBoundingClientRect();
                    var nodeRect = node.getBoundingClientRect();
                    if (isRtl) {
                        if (elRect.right > nodeRect.right - 80) {
                            node.scrollLeft += (elRect.right - (nodeRect.right - 80));
                        } else if (elRect.left < nodeRect.left + 80) {
                            node.scrollLeft -= ((nodeRect.left + 80) - elRect.left);
                        }
                    } else {
                        if (elRect.left < nodeRect.left + 80) {
                            node.scrollLeft -= ((nodeRect.left + 80) - elRect.left);
                        } else if (elRect.right > nodeRect.right - 80) {
                            node.scrollLeft += (elRect.right - (nodeRect.right - 80));
                        }
                    }
                }

                if (canScrollY) {
                    var elRectY = element.getBoundingClientRect();
                    var nodeRectY = node.getBoundingClientRect();
                    if (elRectY.top < nodeRectY.top + 110) {
                        node.scrollTop -= ((nodeRectY.top + 110) - elRectY.top);
                    } else if (elRectY.bottom > nodeRectY.bottom - 80) {
                        node.scrollTop += (elRectY.bottom - (nodeRectY.bottom - 80));
                    }
                }

                node = node.parentElement;
            }
        },
        
        /**
         * Find scrollable parent
         */
        findScrollParent: function(element) {
            var parent = element.parentElement;
            
            while (parent) {
                var style = window.getComputedStyle(parent);
                if (style.overflowX === 'auto' || style.overflowX === 'scroll' ||
                    style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                    parent.classList.contains('scroll-container') ||
                    parent.classList.contains('content-row') ||
                    parent.classList.contains('live-band-track') ||
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
                // If a player modal (subtitles, audio, sources, etc.) is open,
                // close it first instead of stopping playback.
                if (NexusPlayer.isAnyModalOpen && NexusPlayer.isAnyModalOpen()) {
                    NexusPlayer.closeModals();
                    return;
                }
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
