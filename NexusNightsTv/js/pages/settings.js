/**
 * NEXUSNIGHT TV - Settings Page
 * Language, Backend IP configuration, Connection Testing, About
 * Strict ES5 for Samsung Tizen 5.0
 */

(function(window) {
    'use strict';
    
    window.SettingsPage = {
        render: function() {
            var currentLang = NexusConfig.getLanguage();
            var backendUrl = NexusConfig.getBackendUrl();
            
            var html = '<div class="settings-page">';
            html += '<h1 class="settings-title">' + NexusConfig.t('settings_title') + '</h1>';
            
            // Language Settings
            html += '<div class="settings-section">';
            html += '<h2 class="settings-section-title">' + NexusConfig.t('settings_lang_section') + '</h2>';
            html += '<div class="settings-item focusable" id="setting-lang-ar" tabindex="0">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_lang_ar') + '</div>';
            html += '<div class="settings-item-value" style="' + (currentLang === 'ar' ? 'color: var(--color-brand-red); font-weight: 700;' : '') + '">' + (currentLang === 'ar' ? NexusConfig.t('settings_active') : NexusConfig.t('settings_activate')) + '</div>';
            html += '</div>';
            html += '<div class="settings-item focusable" id="setting-lang-en" tabindex="0">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_lang_en') + '</div>';
            html += '<div class="settings-item-value" style="' + (currentLang === 'en' ? 'color: var(--color-brand-red); font-weight: 700;' : '') + '">' + (currentLang === 'en' ? NexusConfig.t('settings_active') : NexusConfig.t('settings_activate')) + '</div>';
            html += '</div>';
            html += '</div>';
            
            // Connection Settings
            html += '<div class="settings-section">';
            html += '<h2 class="settings-section-title">' + NexusConfig.t('settings_server_section') + '</h2>';
            html += '<div class="settings-item">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_current_server') + '</div>';
            html += '<div class="settings-item-value" id="current-backend-val" style="color: var(--color-brand-gold); direction: ltr; font-family: monospace;">' + NexusConfig.escapeHtml(backendUrl) + '</div>';
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
            html += '<div class="settings-item-value">' + NexusConfig.app.name + ' TV (Samsung Tizen 5.0)</div>';
            html += '</div>';
            html += '<div class="settings-item">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_version') + '</div>';
            html += '<div class="settings-item-value">v' + NexusConfig.app.version + ' Cinematic Rail Edition</div>';
            html += '</div>';
            html += '<div class="settings-item">';
            html += '<div class="settings-item-label">' + NexusConfig.t('settings_engine') + '</div>';
            html += '<div class="settings-item-value" style="color: var(--color-brand-gold);">' + (typeof webapis !== 'undefined' && webapis.avplay ? 'Samsung AVPlay Engine (Hardware Accelerated)' : 'HTML5 + Hls.js Cinema Engine') + '</div>';
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
            var entered = window.prompt(NexusConfig.getLanguage() === 'ar' ? 'أدخل عنوان خادم NexusNight (مثال: https://nexusunights.tech):' : 'Enter NexusNight server URL (e.g. https://nexusunights.tech):', current);
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
            valueEl.textContent = isAr ? 'جاري الاختبار...' : 'Testing...';
            valueEl.style.color = 'var(--color-brand-gold)';
            
            NexusAPI.testConnection()
                .then(function(success) {
                    if (success) {
                        valueEl.textContent = isAr ? 'الاتصال ناجح (Online)' : 'Connected (Online)';
                        valueEl.style.color = 'var(--color-brand-gold)';
                    } else {
                        valueEl.textContent = isAr ? 'فشل الاتصال بالخادم' : 'Connection Failed';
                        valueEl.style.color = 'var(--color-text-primary)';
                    }
                    setTimeout(function() {
                        if (valueEl) {
                            valueEl.textContent = NexusConfig.t('settings_test_server_hint');
                            valueEl.style.color = '';
                        }
                    }, 4000);
                })
                .catch(function(err) {
                    valueEl.textContent = (isAr ? 'تعذر الاتصال (' : 'Failed (') + (err.message || 'Error') + ')';
                    valueEl.style.color = 'var(--color-text-primary)';
                    setTimeout(function() {
                        if (valueEl) {
                            valueEl.textContent = NexusConfig.t('settings_test_server_hint');
                            valueEl.style.color = '';
                        }
                    }, 4000);
                });
        },
        
        cleanup: function() {}
    };
    
})(window);
