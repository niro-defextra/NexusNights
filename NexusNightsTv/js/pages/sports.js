/**
 * NEXUSNIGHT TV - Sports Page
 * Cinematic live sports with marquee featured clash, club crests, and photographic channel cards
 */

(function(window) {
    'use strict';

    // Channel metadata dictionary for rich TV display
    var CHANNEL_METADATA = {
        'bein-1': {
            nameAr: 'بي إن سبورتس 1 HD',
            leagueAr: 'دوري أبطال أوروبا • القمة الرئيسية',
            icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS1.png',
            backdrop: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-2': {
            nameAr: 'بي إن سبورتس 2 HD',
            leagueAr: 'الدوري الإنجليزي الممتاز',
            icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS2.png',
            backdrop: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-3': {
            nameAr: 'بي إن سبورتس 3 HD',
            leagueAr: 'الدوري الإسباني (لا ليغا)',
            icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS3.png',
            backdrop: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-4': {
            nameAr: 'بي إن سبورتس 4 HD',
            leagueAr: 'الدوري الفرنسي والمسابقات القارية',
            icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS4.png',
            backdrop: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-5': {
            nameAr: 'بي إن سبورتس 5 HD',
            leagueAr: 'الدوري الألماني والبطولات اللاتينية',
            icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS5.png',
            backdrop: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-6': {
            nameAr: 'بي إن سبورتس 6 HD',
            leagueAr: 'الدوري الإيطالي والكؤوس المحلية',
            icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS6.png',
            backdrop: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-7': {
            nameAr: 'بي إن سبورتس 7 HD',
            leagueAr: 'المباريات الأوروبية المشتركة',
            icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS7.png',
            backdrop: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-8': {
            nameAr: 'بي إن سبورتس 8 HD',
            leagueAr: 'الرياضات العالمية والسباقات',
            icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS8.png',
            backdrop: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-9': {
            nameAr: 'بي إن سبورتس 9 HD',
            leagueAr: 'البث المباشر للأحداث الكبرى',
            icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS9.png',
            backdrop: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-news': {
            nameAr: 'بي إن الإخبارية المفتوحة',
            leagueAr: 'نشرات الأخبار والحصاد الرياضي',
            icon: 'https://i.imgur.com/ZNjQzR5.png',
            backdrop: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-max-1': {
            nameAr: 'بي إن سبورتس ماكس 1',
            leagueAr: 'البطولات الدولية والنهائيات',
            icon: 'https://i.imgur.com/FjWQjdy.png',
            backdrop: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-afc-1': {
            nameAr: 'بي إن سبورتس 1 آسيا',
            leagueAr: 'دوري أبطال آسيا للنخبة',
            icon: 'https://i.imgur.com/WITLbxq.png',
            backdrop: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-afc-2': {
            nameAr: 'بي إن سبورتس 2 آسيا',
            leagueAr: 'دوري أبطال آسيا 2',
            icon: 'https://i.imgur.com/WITLbxq.png',
            backdrop: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-fr-1': {
            nameAr: 'بي إن سبورتس 1 فرنسا',
            leagueAr: 'الدوري الفرنسي بتعليق فرنسي',
            icon: 'https://github.com/tv-logo/tv-logos/raw/refs/heads/main/countries/world-middle-east/bein-sports/bein-sports-1-french-mea.png',
            backdrop: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?q=80&w=1200&auto=format&fit=crop'
        },
        'bein-en-1': {
            nameAr: 'بي إن سبورتس 1 إنجليزي',
            leagueAr: 'البريميرليج بالتعليق الإنجليزي',
            icon: 'https://i.imgur.com/HOj98bH.png',
            backdrop: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=1200&auto=format&fit=crop'
        }
    };

    // Curated high-profile fixtures with real crests
    var FEATURED_MATCHES = [
        {
            id: 'match-1',
            league: 'دوري أبطال أوروبا • قمة الليلة',
            homeTeam: 'ريال مدريد',
            homeCrest: 'https://crests.football-data.org/86.png',
            awayTeam: 'مانشستر سيتي',
            awayCrest: 'https://crests.football-data.org/65.png',
            status: 'live',
            minute: "76'",
            homeScore: 2,
            awayScore: 1,
            time: '10:00 م',
            channelSlug: 'bein-1',
            channelName: 'beIN SPORTS 1 HD',
            stadium: 'سانتياغو برنابيو • مدريد',
            commentator: 'عصام الشوالي'
        },
        {
            id: 'match-2',
            league: 'الدوري الإنجليزي الممتاز',
            homeTeam: 'ليفربول',
            homeCrest: 'https://crests.football-data.org/64.png',
            awayTeam: 'أرسنال',
            awayCrest: 'https://crests.football-data.org/57.png',
            status: 'upcoming',
            time: '07:30 م',
            channelSlug: 'bein-2',
            channelName: 'beIN SPORTS 2 HD',
            stadium: 'أنفيلد • ليفربول',
            commentator: 'حفيظ دراجي'
        },
        {
            id: 'match-3',
            league: 'الدوري الإسباني',
            homeTeam: 'برشلونة',
            homeCrest: 'https://crests.football-data.org/81.png',
            awayTeam: 'أتلتيكو مدريد',
            awayCrest: 'https://crests.football-data.org/78.png',
            status: 'upcoming',
            time: '11:00 م',
            channelSlug: 'bein-3',
            channelName: 'beIN SPORTS 3 HD',
            stadium: 'لويس كومبانيس • برشلونة',
            commentator: 'خليل البلوشي'
        },
        {
            id: 'match-4',
            league: 'ديربي القاهرة • الدوري المصري الممتاز',
            homeTeam: 'الأهلي',
            homeCrest: 'https://media.api-sports.io/football/teams/1031.png',
            awayTeam: 'الزمالك',
            awayCrest: 'https://media.api-sports.io/football/teams/1032.png',
            status: 'upcoming',
            time: '08:30 م',
            channelSlug: 'bein-1',
            channelName: 'beIN SPORTS 1 HD',
            stadium: 'ستاد القاهرة الدولي',
            commentator: 'مدحت شلبي'
        }
    ];

    window.SportsPage = {
        channels: null,
        
        render: function() {
            if (!NexusConfig.features.sports) {
                this.showUnavailable();
                return;
            }
            
            var mainContent = document.getElementById('main-content');
            mainContent.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div></div>';
            
            this.loadChannels();
        },
        
        loadChannels: function() {
            var self = this;
            
            NexusAPI.getSportsChannels()
                .then(function(data) {
                    self.channels = self.enrichChannels(data || []);
                    self.renderContent();
                })
                .catch(function(error) {
                    console.error('[SportsPage] Error:', error);
                    self.showError(error);
                });
        },
        
        enrichChannels: function(rawChannels) {
            return rawChannels.map(function(ch) {
                var meta = CHANNEL_METADATA[ch.id] || {};
                return {
                    id: ch.id,
                    name: ch.name || ch.id,
                    nameAr: meta.nameAr || ch.name || ch.id,
                    leagueAr: meta.leagueAr || 'بث مباشر عالي الجودة',
                    logo: meta.icon || null,
                    backdrop: meta.backdrop || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=1200&auto=format&fit=crop',
                    available: ch.available !== false
                };
            });
        },
        
        renderContent: function() {
            var hasChannels = this.channels && this.channels.length > 0;
            var marquee = FEATURED_MATCHES[0];
            var html = '<div class="sports-page">';
            
            // ── 1. Cinematic Marquee Hero Clash ────────
            html += '<div class="hero-section" style="height: 520px; margin-bottom: var(--spacing-2xl);">';
            html += '<div class="hero-backdrop" style="background-image: url(\'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1600&auto=format&fit=crop\');"></div>';
            html += '<div class="hero-content" style="max-width: 1000px;">';
            
            // Top Badge
            html += '<div style="display: flex; align-items: center; margin-bottom: 20px;">';
            html += '<div style="margin-left: 20px;">';
            html += '<span class="live-indicator" style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #10b981; padding: 6px 18px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center;">';
            html += '<span class="live-dot" style="background: #10b981; margin-left: 8px;"></span>';
            html += marquee.league;
            html += '</span>';
            html += '</div>';
            html += '<div><span style="color: var(--color-text-secondary); font-size: 18px;">📍 ' + NexusConfig.escapeHtml(marquee.stadium) + '</span></div>';
            html += '</div>';
            
            // Marquee Teams Score Display
            html += '<div style="display: flex; align-items: center; margin-bottom: 24px;">';
            // Home Team
            html += '<div style="display: flex; align-items: center; margin-left: 24px;">';
            html += '<img src="' + marquee.homeCrest + '" alt="" style="width: 56px; height: 56px; object-fit: contain; margin-left: 12px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.8));">';
            html += '<span style="font-size: 32px; font-weight: 800; color: #fff;">' + NexusConfig.escapeHtml(marquee.homeTeam) + '</span>';
            html += '</div>';
            // Score / Status
            html += '<div style="background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 8px 24px; text-align: center; margin-left: 24px;">';
            if (marquee.status === 'live') {
                html += '<div style="font-size: 32px; font-weight: 900; color: #fff; letter-spacing: 4px;">' + marquee.homeScore + ' : ' + marquee.awayScore + '</div>';
                html += '<div style="font-size: 16px; color: #10b981; font-weight: 700;">' + marquee.minute + ' دقيقة</div>';
            } else {
                html += '<div style="font-size: 28px; font-weight: 800; color: var(--color-brand-gold);">' + marquee.time + '</div>';
            }
            html += '</div>';
            // Away Team
            html += '<div style="display: flex; align-items: center;">';
            html += '<img src="' + marquee.awayCrest + '" alt="" style="width: 56px; height: 56px; object-fit: contain; margin-left: 12px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.8));">';
            html += '<span style="font-size: 32px; font-weight: 800; color: #fff;">' + NexusConfig.escapeHtml(marquee.awayTeam) + '</span>';
            html += '</div>';
            html += '</div>';
            
            // Commentator & Channel Info
            html += '<p style="color: var(--color-text-secondary); font-size: 20px; margin-bottom: 24px;">';
            html += 'تعليق: <strong style="color: #fff;">' + NexusConfig.escapeHtml(marquee.commentator) + '</strong> • القناة: <strong style="color: var(--color-brand-gold);">' + NexusConfig.escapeHtml(marquee.channelName) + '</strong>';
            html += '</p>';
            
            // Watch Button
            html += '<div class="hero-actions">';
            html += '<button class="btn btn-primary focusable" data-action="play-channel" data-channel-id="' + marquee.channelSlug + '" style="font-size: 22px; padding: 14px 36px; background: var(--color-brand-red); box-shadow: 0 6px 24px rgba(196,30,58,0.5);">';
            html += '<span class="btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> مشاهدة البث الآن (' + NexusConfig.escapeHtml(marquee.channelName) + ')';
            html += '</button>';
            html += '</div>';
            
            html += '</div>'; // hero-content
            html += '</div>'; // hero-section
            
            // ── 2. Matchday Schedule Cards ────────
            html += '<div class="content-section">';
            html += '<div class="section-header"><h2 class="section-title">أهم مباريات اليوم المباشرة والمقبلة</h2></div>';
            html += '<div class="content-row">';
            for (var m = 0; m < FEATURED_MATCHES.length; m++) {
                html += this.renderMatchCard(FEATURED_MATCHES[m]);
            }
            html += '</div></div>';
            
            // ── 3. Live Broadcast Channels ────────
            if (hasChannels) {
                html += '<div class="content-section">';
                html += '<div class="section-header">';
                html += '<h2 class="section-title">قنوات البث الرياضي المتاحة (' + this.channels.length + ' قناة)</h2>';
                html += '<span class="section-link">سيرفرات فائقة السرعة 1080p</span>';
                html += '</div>';
                html += '<div class="content-row">';
                
                for (var i = 0; i < this.channels.length; i++) {
                    html += this.renderChannel(this.channels[i]);
                }
                
                html += '</div></div>';
            } else {
                html += '<div class="empty-state">';
                html += '<div class="empty-state-icon">📺</div>';
                html += '<div class="empty-state-text">لا توجد قنوات متاحة حالياً</div>';
                html += '</div>';
            }
            
            html += '</div>';
            
            document.getElementById('main-content').innerHTML = html;
            this.registerFocusables();
        },
        
        renderMatchCard: function(match) {
            var html = '<div class="backdrop-card focusable" data-action="play-channel" data-channel-id="' + NexusConfig.escapeHtml(match.channelSlug) + '" style="width: 380px;">';
            html += '<div class="card-backdrop" style="background: linear-gradient(180deg, #181216 0%, #0d090b 100%); padding: 20px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid rgba(255,255,255,0.08);">';
            
            // Header
            html += '<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px;">';
            html += '<span style="font-size: 16px; color: var(--color-brand-gold); font-weight: 700;">' + NexusConfig.escapeHtml(match.league) + '</span>';
            if (match.status === 'live') {
                html += '<span style="background: #dc2626; color: #fff; font-size: 13px; font-weight: 800; padding: 2px 10px; border-radius: 10px;">مباشر ' + match.minute + '</span>';
            } else {
                html += '<span style="background: rgba(255,255,255,0.1); color: var(--color-text-secondary); font-size: 13px; font-weight: 600; padding: 2px 10px; border-radius: 10px;">' + match.time + '</span>';
            }
            html += '</div>';
            
            // Teams
            html += '<div style="display: flex; justify-content: space-around; align-items: center; margin: 16px 0;">';
            // Home
            html += '<div style="display: flex; flex-direction: column; align-items: center; text-align: center; width: 110px;">';
            html += '<img src="' + match.homeCrest + '" alt="" style="width: 44px; height: 44px; object-fit: contain; margin-bottom: 8px;">';
            html += '<span style="font-size: 17px; font-weight: 700; color: #fff;" class="text-ellipsis">' + NexusConfig.escapeHtml(match.homeTeam) + '</span>';
            html += '</div>';
            // Score
            html += '<div style="font-size: 26px; font-weight: 900; color: ' + (match.status === 'live' ? '#10b981' : 'var(--color-text-muted)') + ';">';
            html += match.status === 'live' ? (match.homeScore + ' - ' + match.awayScore) : 'VS';
            html += '</div>';
            // Away
            html += '<div style="display: flex; flex-direction: column; align-items: center; text-align: center; width: 110px;">';
            html += '<img src="' + match.awayCrest + '" alt="" style="width: 44px; height: 44px; object-fit: contain; margin-bottom: 8px;">';
            html += '<span style="font-size: 17px; font-weight: 700; color: #fff;" class="text-ellipsis">' + NexusConfig.escapeHtml(match.awayTeam) + '</span>';
            html += '</div>';
            html += '</div>';
            
            // Footer
            html += '<div style="display: flex; justify-content: space-between; font-size: 14px; color: var(--color-text-secondary); border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">';
            html += '<span>' + NexusConfig.escapeHtml(match.channelName) + '</span>';
            html += '<span style="color: var(--color-brand-red); font-weight: 600;">اضغط للمشاهدة ▶</span>';
            html += '</div>';
            
            html += '</div>'; // card-backdrop
            html += '</div>'; // backdrop-card
            return html;
        },
        
        renderChannel: function(channel) {
            var html = '<div class="backdrop-card focusable" data-action="play-channel" data-channel-id="' + NexusConfig.escapeHtml(channel.id) + '">';
            
            html += '<div class="card-backdrop" style="background-image: url(\'' + NexusConfig.escapeHtml(channel.backdrop) + '\'); background-size: cover; background-position: center; position: relative;">';
            html += '<div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);"></div>';
            
            // Channel Logo overlay at top-right
            if (channel.logo) {
                html += '<img src="' + NexusConfig.escapeHtml(channel.logo) + '" alt="" style="position: absolute; top: 14px; right: 14px; height: 32px; max-width: 100px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.9)); z-index: 2;">';
            }
            
            // Bottom Info
            html += '<div style="position: absolute; bottom: 14px; right: 14px; left: 14px; z-index: 2;">';
            html += '<div style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 4px;" class="text-ellipsis">' + NexusConfig.escapeHtml(channel.nameAr) + '</div>';
            html += '<div style="font-size: 14px; color: var(--color-text-secondary); margin-bottom: 8px;" class="text-ellipsis">' + NexusConfig.escapeHtml(channel.leagueAr) + '</div>';
            
            if (channel.available) {
                html += '<div class="live-indicator" style="background: rgba(220, 38, 38, 0.2); border: 1px solid #dc2626; color: #f87171; font-size: 13px; font-weight: 700; padding: 2px 10px; border-radius: 12px; display: inline-flex; align-items: center;">';
                html += '<span class="live-dot" style="background: #ef4444; margin-left: 6px;"></span> مباشر';
                html += '</div>';
            }
            html += '</div>';
            
            html += '</div>'; // card-backdrop
            html += '</div>'; // backdrop-card
            
            return html;
        },
        
        registerFocusables: function() {
            var self = this;
            var clickables = document.querySelectorAll('[data-action="play-channel"]');
            
            for (var i = 0; i < clickables.length; i++) {
                clickables[i].onclick = function() {
                    var channelId = this.getAttribute('data-channel-id');
                    self.playChannel(channelId);
                };
            }
            
            FocusManager.register(document.querySelectorAll('.focusable'));
        },
        
        playChannel: function(channelId) {
            console.log('[SportsPage] Playing channel:', channelId);
            
            // Show player page immediately with loading state so UI stays responsive
            var meta = CHANNEL_METADATA[channelId] || {};
            var channelName = meta.nameAr || channelId;
            
            NexusAPI.getSportsStream(channelId)
                .then(function(res) {
                    var source = (res && res.source) ? res.source : res;
                    var alternatives = (res && res.alternatives) ? res.alternatives : [];
                    if (source && (source.url || source.embedUrl)) {
                        source.title = channelName;
                        NexusPlayer.play(source, alternatives, [], { isLive: true, title: channelName });
                    } else {
                        alert('البث غير متاح حالياً للقناة المطلوبة');
                    }
                })
                .catch(function(error) {
                    console.error('[SportsPage] Stream error:', error);
                    alert('فشل تحميل البث: ' + (error.message || 'خطأ غير متوقع'));
                });
        },
        
        showUnavailable: function() {
            var html = '<div class="page-container">' +
                       '<div class="empty-state">' +
                       '<div class="empty-state-icon">⚽</div>' +
                       '<div class="empty-state-text">الرياضة المباشرة غير متاحة</div>' +
                       '</div></div>';
            document.getElementById('main-content').innerHTML = html;
        },
        
        showError: function(error) {
            var html = '<div class="page-container">' +
                       '<div class="empty-state">' +
                       '<div class="empty-state-icon">⚠️</div>' +
                       '<div class="empty-state-text">فشل تحميل القنوات</div>' +
                       '<div class="empty-state-subtext">' + NexusConfig.escapeHtml(error && error.message) + '</div>' +
                       '</div></div>';
            document.getElementById('main-content').innerHTML = html;
        },
        
        cleanup: function() {
            this.channels = null;
        }
    };
    
})(window);
