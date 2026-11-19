/**
 * NEXUSNIGHT TV - Settings Page
 * Language, Backend IP configuration, Connection Testing, About
 * Strict ES5 for Samsung Tizen 5.0
 */

(function(window) {
    'use strict';
    
    window.SettingsPage = {
        activeCheck: '<svg class="settings-check" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 12 10 18 20 6"/></svg>',

        render: function() {
            var currentLang = NexusConfig.getLanguage();
            var backendUrl = NexusConfig.getBackendUrl();
            var check = this.activeCheck;

            var html = '<div class="settings-page">';
            html += '<h1 class="settings-title">' + NexusConfig.t('settings_title') + '</h1>';

            // Language Settings
            html += '<div class="settings-section">';
            html += '<h2 class="settings-section-title">' + NexusConfig.t('settings_lang_section') + '</h2>';
            html += '<div class="settings-item focusable" id="setting-lang-ar" tabindex="0">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_lang_ar') + '</div>';
            html += '<div class="settings-item-value' + (currentLang === 'ar' ? ' is-current' : '') + '">' + (currentLang === 'ar' ? check + NexusConfig.t('settings_active') : NexusConfig.t('settings_activate')) + '</div>';
            html += '</div>';
            html += '<div class="settings-item focusable" id="setting-lang-en" tabindex="0">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_lang_en') + '</div>';
            html += '<div class="settings-item-value' + (currentLang === 'en' ? ' is-current' : '') + '">' + (currentLang === 'en' ? check + NexusConfig.t('settings_active') : NexusConfig.t('settings_activate')) + '</div>';
            html += '</div>';
            html += '</div>';

            // Connection Settings
            html += '<div class="settings-section">';
            html += '<h2 class="settings-section-title">' + NexusConfig.t('settings_server_section') + '</h2>';
            html += '<div class="settings-item">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_current_server') + '</div>';
            html += '<div class="settings-item-value is-data" id="current-backend-val">' + NexusConfig.escapeHtml(backendUrl) + '</div>';
            html += '</div>';
            html += '<div class="settings-item focusable" id="setting-change-backend" tabindex="0">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_edit_server') + '</div>';
            html += '<div class="settings-item-value">' + NexusConfig.t('settings_edit_server_hint') + '</div>';
            html += '</div>';
            html += '<div class="settings-item focusable" id="setting-test-connection" tabindex="0">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_test_server') + '</div>';
            html += '<div class="settings-item-value">' + NexusConfig.t('settings_test_server_hint') + '</div>';
            html += '</div>';
            html += '</div>';

            // About
            html += '<div class="settings-section">';
            html += '<h2 class="settings-section-title">' + NexusConfig.t('settings_about_section') + '</h2>';
            html += '<div class="settings-item">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_app_name') + '</div>';
            html += '<div class="settings-item-value">NexusNights TV</div>';
            html += '</div>';
            html += '<div class="settings-item">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_version') + '</div>';
            html += '<div class="settings-item-value">v' + NexusConfig.app.version + '</div>';
            html += '</div>';
            html += '<div class="settings-item">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_engine') + '</div>';
            html += '<div class="settings-item-value is-data">' + (typeof webapis !== 'undefined' && webapis.avplay ? 'Samsung AVPlay' : 'HLS.js') + '</div>';
            html += '</div>';
            html += '</div>';

            html += '</div>';

            document.getElementById('main-content').innerHTML = html;
            this.registerFocusables();
        },
        
        registerFocusables: function() {
            var self = this;
            
            // Language buttons
            var langAr = document.getElementById('setting-lang-ar');
            if (langAr) {
                langAr.onclick = function() { self.setLanguage('ar'); };
            }
            
            var langEn = document.getElementById('setting-lang-en');
            if (langEn) {
                langEn.onclick = function() { self.setLanguage('en'); };
            }
            
            // Change Backend URL
            var changeBackend = document.getElementById('setting-change-backend');
            if (changeBackend) {
                changeBackend.onclick = function() { self.promptBackendUrl(); };
            }
            
            // Test connection
            var testConn = document.getElementById('setting-test-connection');
            if (testConn) {
                testConn.onclick = function() { self.testConnection(); };
            }
            
            FocusManager.register(document.querySelectorAll('.focusable'));
        },
        
        promptBackendUrl: function() {
            var current = NexusConfig.getBackendUrl();
            var entered = window.prompt(NexusConfig.getLanguage() === 'ar' ? 'أدخل عنوان خادم NexusNights (مثال: https://nexusunights.tech):' : 'Enter the NexusNights server URL (e.g. https://nexusunights.tech):', current);
            if (entered && entered.trim()) {
                var url = entered.trim().replace(/\/+$/, '');
                NexusConfig.setBackendUrl(url);
                var valEl = document.getElementById('current-backend-val');
                if (valEl) valEl.textContent = url;
                NexusApp.showToast((NexusConfig.getLanguage() === 'ar' ? 'تم حفظ عنوان الخادم: ' : 'Server URL saved: ') + url);
                this.testConnection();
            }
        },
        
        setLanguage: function(lang) {
            console.log('[SettingsPage] Setting language:', lang);
            if (NexusConfig.setLanguage(lang)) {
                // Re-render settings page immediately with updated translations
                this.render();
            }
        },
        
        testConnection: function() {
            var valueEl = document.querySelector('#setting-test-connection .settings-item-value');
            if (!valueEl) return;
            var isAr = NexusConfig.getLanguage() === 'ar';
            valueEl.textContent = isAr ? 'جاري الاختبار…' : 'Testing…';
            valueEl.className = 'settings-item-value';

            NexusAPI.testConnection()
                .then(function(success) {
                    if (success) {
                        valueEl.textContent = isAr ? 'تم الاتصال' : 'Connected';
                        valueEl.className = 'settings-item-value is-current';
                    } else {
                        valueEl.textContent = isAr ? 'تعذّر الاتصال' : 'No connection';
                        valueEl.className = 'settings-item-value is-warn';
                    }
                    setTimeout(function() {
                        if (valueEl) {
                            valueEl.textContent = NexusConfig.t('settings_test_server_hint');
                            valueEl.className = 'settings-item-value';
                        }
                    }, 4000);
                })
                .catch(function(err) {
                    valueEl.textContent = NexusApp.describeError(err);
                    valueEl.className = 'settings-item-value is-warn';
                    setTimeout(function() {
                        if (valueEl) {
                            valueEl.textContent = NexusConfig.t('settings_test_server_hint');
                            valueEl.className = 'settings-item-value';
                        }
                    }, 4000);
                });
        },
        
        cleanup: function() {}
    };
    
})(window);
