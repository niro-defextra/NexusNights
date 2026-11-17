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

    // Default fallback matches for when network fixtures endpoint is unreachable
    function getDefaultFallbackMatches() {
        var now = new Date();
        var h = (now.getHours() % 12) || 12;
        var ampm = now.getHours() >= 12 ? 'م' : 'ص';
        return [
            {
                id: 'match-fb-1',
                league: 'تصفيات كأس أمم إفريقيا • قمة الليلة',
                homeTeam: 'المغرب',
                homeCrest: 'https://media.api-sports.io/football/teams/31.png',
                awayTeam: 'النيجر',
                awayCrest: 'https://media.api-sports.io/football/teams/1504.png',
                status: 'live',
                minute: '45',
                time: h + ':00 ' + ampm,
                channelSlug: 'bein-1',
                channelName: 'beIN SPORTS 1 HD',
                stadium: 'المجمع الرياضي الأمير مولاي عبد الله',
                commentator: 'جواد بدة'
            },
            {
                id: 'match-fb-2',
                league: 'دوري الأمم الأوروبية',
                homeTeam: 'ويلز',
                homeCrest: 'https://media.api-sports.io/football/teams/767.png',
                awayTeam: 'البرتغال',
                awayCrest: 'https://media.api-sports.io/football/teams/27.png',
                status: 'live',
                minute: '50',
                time: '09:00 م',
                channelSlug: 'bein-2',
                channelName: 'beIN SPORTS 2 HD',
                stadium: 'ملعب كارديف سيتي',
                commentator: 'حفيظ دراجي'
            },
            {
                id: 'match-fb-3',
                league: 'دوري الأمم الأوروبية',
                homeTeam: 'بولندا',
                homeCrest: 'https://media.api-sports.io/football/teams/24.png',
                awayTeam: 'السويد',
                awayCrest: 'https://media.api-sports.io/football/teams/29.png',
                status: 'upcoming',
                time: '10:45 م',
                channelSlug: 'bein-3',
                channelName: 'beIN SPORTS 3 HD',
                stadium: 'الملعب الوطني • وارسو',
                commentator: 'خليل البلوشي'
            },
            {
                id: 'match-fb-4',
                league: 'تصفيات كأس أمم إفريقيا',
                homeTeam: 'مصر',
                homeCrest: 'https://media.api-sports.io/football/teams/32.png',
                awayTeam: 'مالاوي',
                awayCrest: 'https://media.api-sports.io/football/teams/1506.png',
                status: 'upcoming',
                time: '11:00 م',
                channelSlug: 'bein-1',
                channelName: 'beIN SPORTS 1 HD',
                stadium: 'ستاد القاهرة الدولي',
                commentator: 'علي محمد علي'
            }
        ];
    }

    window.SportsPage = {
        CHANNEL_METADATA: CHANNEL_METADATA,
        channels: null,
        fixtures: null,
        
        /**
         * Compact live entries for the shell's live band.
         * Reuses the same channel metadata as the sports screen so "on now"
         * reads identically wherever it appears.
         */
        getLiveBandData: function(rawChannels, limit) {
            var list = rawChannels && rawChannels.length ? rawChannels : [];
            var max = limit || 6;
            var out = [];
            for (var i = 0; i < list.length && out.length < max; i++) {
                var ch = list[i];
                var meta = CHANNEL_METADATA[ch.id] || {};
                out.push({
                    id: ch.id,
                    name: meta.nameAr || ch.name || ch.id,
                    meta: meta.leagueAr || 'بث مباشر عالي الجودة',
                    logo: meta.icon || null,
                    backdrop: meta.backdrop || null
                });
            }
            return out;
        },
        
        render: function() {
            if (!NexusConfig.features.sports) {
                this.showUnavailable();
                return;
            }
            
            var mainContent = document.getElementById('main-content');
            mainContent.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">' + NexusConfig.t('loading') + '</div></div>';
            
            this.loadChannels();
        },
        
        loadChannels: function() {
            var self = this;
            
            var pChannels = NexusAPI.getSportsChannels();
            var pFixtures = typeof NexusAPI.getSportsFixtures === 'function' ? NexusAPI.getSportsFixtures() : Promise.resolve(null);

            Promise.all([pChannels, pFixtures])
                .then(function(results) {
                    self.channels = self.enrichChannels(results[0] || []);
                    self.fixtures = results[1] || null;
                    self.renderContent();
                })
                .catch(function(error) {
                    console.error('[SportsPage] Error loading sports data:', error);
                    if (!self.channels) {
                        self.showError(error);
                    } else {
                        self.renderContent();
                    }
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
            var fixturesList = (this.fixtures && Array.isArray(this.fixtures.all) && this.fixtures.all.length > 0)
                ? this.fixtures.all
                : getDefaultFallbackMatches();
            
            var marquee = (this.fixtures && this.fixtures.featured)
                ? this.fixtures.featured
                : fixturesList[0];
            
            var html = '<div class="sports-page">';
            
            // ── 1. Cinematic Marquee Hero Clash ────────
            html += '<div class="hero-section" style="height: 520px; margin-bottom: var(--spacing-2xl);">';
            html += '<div class="hero-backdrop" style="background-image: url(\'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1600&auto=format&fit=crop\');"></div>';
            html += '<div class="hero-content" style="max-width: 1000px;">';
            
            // Top Badge
            html += '<div style="display: flex; align-items: center; margin-bottom: 20px;">';
            html += '<div style="margin-left: 20px;">';
            html += '<span class="live-indicator" style="background: var(--color-bg-elevated); border: 1px solid rgba(255, 255, 255, 0.18); color: var(--color-text-primary); padding: 6px 18px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center;">';
            html += '<span class="live-dot" style="background: var(--color-brand-red); margin-left: 8px;"></span>';
            html += NexusConfig.escapeHtml(marquee.league);
            html += '</span>';
            html += '</div>';
            html += '<div><span style="display: inline-flex; align-items: center; color: var(--color-text-secondary); font-size: 18px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 8px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + NexusConfig.escapeHtml(marquee.stadium || 'البث المباشر المعتمد') + '</span></div>';
            html += '</div>';
            
            // Marquee Teams Score Display
            html += '<div style="display: flex; align-items: center; margin-bottom: 24px;">';
            // Home Team
            html += '<div style="display: flex; align-items: center; margin-left: 24px;">';
            html += '<img src="' + NexusConfig.escapeHtml(marquee.homeCrest) + '" alt="" style="width: 56px; height: 56px; object-fit: contain; margin-left: 12px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.8));">';
            html += '<span style="font-size: 32px; font-weight: 800; color: #fff;">' + NexusConfig.escapeHtml(marquee.homeTeam) + '</span>';
            html += '</div>';
            // Score / Status
            html += '<div style="background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 8px 24px; text-align: center; margin-left: 24px;">';
            if (marquee.status === 'live') {
                html += '<div style="font-size: 26px; font-weight: 900; color: var(--color-brand-red); letter-spacing: 2px;">مباشر الآن</div>';
                html += '<div style="font-size: 16px; color: var(--color-brand-gold); font-weight: 700;">' + (marquee.minute ? (marquee.minute + ' دقيقة') : 'جارية الآن') + '</div>';
            } else {
                html += '<div style="font-size: 28px; font-weight: 800; color: var(--color-brand-gold);">' + NexusConfig.escapeHtml(marquee.time) + '</div>';
                html += '<div style="font-size: 14px; color: var(--color-text-secondary); font-weight: 600;">موعد المباراة</div>';
            }
            html += '</div>';
            // Away Team
            html += '<div style="display: flex; align-items: center;">';
            html += '<img src="' + NexusConfig.escapeHtml(marquee.awayCrest) + '" alt="" style="width: 56px; height: 56px; object-fit: contain; margin-left: 12px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.8));">';
            html += '<span style="font-size: 32px; font-weight: 800; color: #fff;">' + NexusConfig.escapeHtml(marquee.awayTeam) + '</span>';
            html += '</div>';
            html += '</div>';
            
            // Commentator & Channel Info
            html += '<p style="color: var(--color-text-secondary); font-size: 20px; margin-bottom: 24px;">';
            html += 'التعليق: <strong style="color: #fff;">' + NexusConfig.escapeHtml(marquee.commentator || 'أبرز معلقي beIN') + '</strong> • القناة: <strong style="color: var(--color-brand-gold);">' + NexusConfig.escapeHtml(marquee.channelName) + '</strong>';
            html += '</p>';
            
            // Watch Button
            html += '<div class="hero-actions">';
            html += '<button class="btn btn-primary focusable" data-action="play-channel" data-channel-id="' + NexusConfig.escapeHtml(marquee.channelSlug) + '" style="font-size: 22px; padding: 14px 36px; background: var(--color-brand-red); box-shadow: 0 6px 24px rgba(179,32,47,0.5);">';
            html += '<span class="btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> مشاهدة البث الآن (' + NexusConfig.escapeHtml(marquee.channelName) + ')';
            html += '</button>';
            html += '</div>';
            
            html += '</div>'; // hero-content
            html += '</div>'; // hero-section
            
            // ── 2. Matchday Schedule Cards ────────
            var displayMatches = fixturesList.slice(0, 10);
            if (displayMatches.length > 0) {
                html += '<div class="content-section">';
                html += '<div class="section-header">';
                html += '<h2 class="section-title">أهم مباريات اليوم المباشرة والمقبلة</h2>';
                html += '<span class="section-link">تحديث لحظي من جدول البث</span>';
                html += '</div>';
                html += '<div class="content-row">';
                for (var m = 0; m < displayMatches.length; m++) {
                    html += this.renderMatchCard(displayMatches[m]);
                }
                html += '</div></div>';
            }
            
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
                html += '<div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M17 2l-5 5-5-5"/></svg></div>';
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
            html += '<span style="font-size: 15px; color: var(--color-brand-gold); font-weight: 700; max-width: 240px;" class="text-ellipsis">' + NexusConfig.escapeHtml(match.league) + '</span>';
            if (match.status === 'live') {
                html += '<span style="background: var(--color-brand-red); color: #fff; font-size: 13px; font-weight: 800; padding: 2px 10px; border-radius: 10px;">مباشر ' + (match.minute ? match.minute : '') + '</span>';
            } else {
                html += '<span style="background: var(--color-bg-elevated); color: var(--color-text-secondary); font-size: 13px; font-weight: 600; padding: 2px 10px; border-radius: 10px;">' + NexusConfig.escapeHtml(match.time) + '</span>';
            }
            html += '</div>';
            
            // Teams
            html += '<div style="display: flex; justify-content: space-around; align-items: center; margin: 16px 0;">';
            // Home
            html += '<div style="display: flex; flex-direction: column; align-items: center; text-align: center; width: 110px;">';
            html += '<img src="' + NexusConfig.escapeHtml(match.homeCrest) + '" alt="" style="width: 44px; height: 44px; object-fit: contain; margin-bottom: 8px;">';
            html += '<span style="font-size: 17px; font-weight: 700; color: #fff;" class="text-ellipsis">' + NexusConfig.escapeHtml(match.homeTeam) + '</span>';
            html += '</div>';
            // Center Badge
            html += '<div style="text-align: center;">';
            if (match.status === 'live') {
                html += '<div style="font-size: 20px; font-weight: 900; color: var(--color-brand-red);">LIVE</div>';
                html += '<div style="font-size: 13px; color: var(--color-brand-gold); font-weight: 700;">جارية الآن</div>';
            } else {
                html += '<div style="font-size: 20px; font-weight: 900; color: var(--color-brand-gold);">VS</div>';
                html += '<div style="font-size: 13px; color: var(--color-text-muted);">' + NexusConfig.escapeHtml(match.time) + '</div>';
            }
            html += '</div>';
            // Away
            html += '<div style="display: flex; flex-direction: column; align-items: center; text-align: center; width: 110px;">';
            html += '<img src="' + NexusConfig.escapeHtml(match.awayCrest) + '" alt="" style="width: 44px; height: 44px; object-fit: contain; margin-bottom: 8px;">';
            html += '<span style="font-size: 17px; font-weight: 700; color: #fff;" class="text-ellipsis">' + NexusConfig.escapeHtml(match.awayTeam) + '</span>';
            html += '</div>';
            html += '</div>';
            
            // Footer
            html += '<div style="display: flex; justify-content: space-between; font-size: 14px; color: var(--color-text-secondary); border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">';
            html += '<span>' + NexusConfig.escapeHtml(match.channelName) + '</span>';
            html += '<span style="color: var(--color-brand-gold); font-weight: 600;">مشاهدة القناة <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" style="vertical-align: -3px;"><polygon points="5 3 19 12 5 21 5 3"/></svg></span>';
            html += '</div>';
            
            html += '</div>'; // card-backdrop
            html += '</div>'; // backdrop-card
            return html;
        },
        
        renderChannel: function(channel) {
            var html = '<div class="backdrop-card focusable" data-action="play-channel" data-channel-id="' + NexusConfig.escapeHtml(channel.id) + '">';
            
            html += '<div class="card-backdrop" style="background-image: url(\'' + NexusConfig.escapeHtml(channel.backdrop) + '\'); background-size: cover; background-position: center; position: relative;">';
            html += '<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);"></div>';
            
            // Channel Logo overlay at top-right
            if (channel.logo) {
                html += '<img src="' + NexusConfig.escapeHtml(channel.logo) + '" alt="" style="position: absolute; top: 14px; right: 14px; height: 32px; max-width: 100px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.9)); z-index: 2;">';
            }
            
            // Bottom Info
            html += '<div style="position: absolute; bottom: 14px; right: 14px; left: 14px; z-index: 2;">';
            html += '<div style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 4px;" class="text-ellipsis">' + NexusConfig.escapeHtml(channel.nameAr) + '</div>';
            html += '<div style="font-size: 14px; color: var(--color-text-secondary); margin-bottom: 8px;" class="text-ellipsis">' + NexusConfig.escapeHtml(channel.leagueAr) + '</div>';
            
            if (channel.available) {
                html += '<div class="live-indicator" style="background: var(--color-brand-red); border: 1px solid var(--color-brand-red); color: #fff; font-size: 13px; font-weight: 700; padding: 2px 10px; border-radius: 12px; display: inline-flex; align-items: center;">';
                html += '<span class="live-dot" style="background: #fff; margin-left: 6px;"></span> مباشر';
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
                        if (NexusApp.hideToast) NexusApp.hideToast();
                        NexusPlayer.play(source, alternatives, [], { isLive: true, title: channelName });
                    } else {
                        NexusApp.showToast('البث غير متاح حالياً للقناة المطلوبة');
                    }
                })
                .catch(function(error) {
                    console.error('[SportsPage] Stream error:', error);
                    NexusApp.showToast('فشل تحميل البث: ' + (error.message || 'خطأ غير متوقع'));
                });
        },
        
        showUnavailable: function() {
            NexusApp.showErrorState({
                title: 'الرياضة المباشرة غير متاحة',
                message: NexusConfig.getLanguage() === 'ar' ? 'لا توجد قنوات مباشرة متاحة الآن.' : 'No live channels are available right now.',
                actionLabel: NexusConfig.getLanguage() === 'ar' ? 'إعادة المحاولة' : 'Retry',
                onAction: function() { window.SportsPage.render(); }
            });
        },
        
        showError: function(error) {
            NexusApp.showErrorState({
                title: 'فشل تحميل القنوات',
                message: error && error.message,
                onAction: function() { window.SportsPage.render(); }
            });
        },
        
        cleanup: function() {
            this.channels = null;
            this.fixtures = null;
        }
    };
    
})(window);
