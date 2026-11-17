/**
 * NEXUSNIGHT TV - API Client
 * Matches the existing Express API mounted under /api.
 * ES5-compatible for Samsung Tizen 5.0 / Chromium 63.
 */
(function (window) {
    'use strict';

    function trimSlash(value) {
        return String(value || '').replace(/\/+$/, '');
    }

    function backendUrl(path) {
        if (!path) return trimSlash(NexusConfig.getBackendUrl());
        if (/^https?:\/\//i.test(path)) return path;
        return trimSlash(NexusConfig.getBackendUrl()) + (path.charAt(0) === '/' ? path : '/' + path);
    }

    function normalizeSource(source) {
        if (!source || typeof source !== 'object') return source;
        var result = {};
        Object.keys(source).forEach(function (key) { result[key] = source[key]; });
        if (result.url) result.url = backendUrl(result.url);
        if (result.embedUrl) result.embedUrl = backendUrl(result.embedUrl);
        return result;
    }

    function normalizeSubtitles(list) {
        if (!Array.isArray(list)) return [];
        return list.map(function (track) {
            var normalized = {};
            Object.keys(track || {}).forEach(function (key) { normalized[key] = track[key]; });
            if (normalized.url) normalized.url = backendUrl(normalized.url);
            return normalized;
        });
    }

    function normalizePlayback(response) {
        response = response || {};
        var config = response.playback || response;
        var source = normalizeSource(config.source);
        var alternatives = Array.isArray(config.alternatives) ? config.alternatives.map(normalizeSource) : [];
        var subtitles = normalizeSubtitles(config.subtitles);
        return {
            source: source || null,
            alternatives: alternatives,
            subtitles: subtitles,
            canAutoSwitch: !!config.canAutoSwitch,
            hasLocal: !!config.hasLocal,
            localMediaId: config.localMediaId || null,
            diagnosticsCount: config.diagnosticsCount || 0,
            title: response.title || '',
            overview: response.overview || '',
            posterUrl: response.posterUrl || null,
            backdropUrl: response.backdropUrl || null,
            releaseYear: response.releaseYear || null,
            skipTimings: response.skipTimings || null
        };
    }

    function normalizeLocalCard(item, isEpisode) {
        item = item || {};
        var titleId = isEpisode ? item.titleId : item.id;
        return {
            id: titleId || item.id || '',
            tmdbId: Number(item.tmdbId) || 0,
            kind: item.kind === 'series' ? 'series' : 'movie',
            title: isEpisode ? (item.titleName || item.title || '') : (item.title || ''),
            originalTitle: item.originalTitle || item.titleName || item.title || '',
            overview: item.overview || '',
            posterUrl: item.posterUrl || item.stillUrl || item.thumbUrl || null,
            backdropUrl: item.backdropUrl || item.stillUrl || null,
            logoUrl: item.logoUrl || null,
            releaseDate: item.releaseDate || item.airDate || null,
            rating: item.rating || null,
            year: item.year || (item.airDate ? parseInt(String(item.airDate).substring(0, 4), 10) : null),
            availability: 'local',
            localId: titleId || item.id || '',
            localMediaId: isEpisode ? item.id : null
        };
    }

    function normalizeHome(home, lang) {
        home = home || {};
        if (Array.isArray(home.sections)) return home;

        // When TMDB is disabled, /api/discovery/home intentionally returns
        // the local library shape: { hero, rows }. Convert it for the TV UI.
        var normalized = { hero: null, sections: [] };
        if (home.hero) normalized.hero = normalizeLocalCard(home.hero, false);
        var rows = Array.isArray(home.rows) ? home.rows : [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i] || {};
            var items = Array.isArray(row.items) ? row.items : [];
            var isEpisode = row.kind === 'episode';
            var cards = items.map(function (item) { return normalizeLocalCard(item, isEpisode); });
            if (!cards.length) continue;
            normalized.sections.push({
                key: isEpisode ? 'recent-episodes' : 'local-library',
                title: isEpisode ? (lang === 'ar' ? 'الحلقات المتاحة في مكتبتك' : 'Available Episodes') : (lang === 'ar' ? 'مكتبتك المحلية' : 'Your Local Library'),
                items: cards
            });
        }
        return normalized;
    }

    function sectionFromHome(home, keys) {
        var sections = home && Array.isArray(home.sections) ? home.sections : [];
        var selected = [];
        for (var i = 0; i < sections.length; i++) {
            if (keys.indexOf(sections[i].key) !== -1) selected.push(sections[i]);
        }
        return selected;
    }

    window.NexusAPI = {
        request: function (endpoint, options) {
            options = options || {};
            var url = backendUrl(endpoint);
            var method = options.method || 'GET';

            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open(method, url, true);
                xhr.timeout = options.timeout || 30000;
                xhr.withCredentials = !!options.withCredentials;

                if (options.headers) {
                    Object.keys(options.headers).forEach(function (key) {
                        xhr.setRequestHeader(key, options.headers[key]);
                    });
                }

                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        if (!xhr.responseText) { resolve(null); return; }
                        try { resolve(JSON.parse(xhr.responseText)); }
                        catch (error) { resolve(xhr.responseText); }
                    } else {
                        var message = 'HTTP ' + xhr.status;
                        try {
                            var body = JSON.parse(xhr.responseText);
                            if (body && (body.message || body.error)) message += ': ' + (body.message || body.error);
                        } catch (ignore) {}
                        reject(new Error(message));
                    }
                };
                xhr.onerror = function () { reject(new Error('Network error: تعذّر الاتصال بالخادم')); };
                xhr.ontimeout = function () { reject(new Error('Request timeout')); };
                xhr.onabort = function () { reject(new Error('Request aborted')); };

                if (options.body) {
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.send(JSON.stringify(options.body));
                } else {
                    xhr.send();
                }
            });
        },

        testConnection: function () {
            return this.request('/api/health').then(function (data) {
                return !!(data && (data.ok === true || data.status || data.library));
            });
        },

        // Home and Discovery
        getGlobalHome: function (lang) {
            lang = lang || NexusConfig.getLanguage();
            return this.request('/api/discovery/home?lang=' + encodeURIComponent(lang)).then(function (home) {
                return normalizeHome(home, lang);
            });
        },

        getLocalHome: function (lang) {
            lang = lang || NexusConfig.getLanguage();
            return this.request('/api/home?lang=' + encodeURIComponent(lang)).then(function (home) {
                return normalizeHome(home, lang);
            });
        },

        getTrending: function (kind, timeWindow, lang) {
            var self = this;
            kind = kind || 'movie';
            timeWindow = timeWindow || 'week';
            lang = lang || NexusConfig.getLanguage();
            if (kind === 'all') {
                return Promise.all([
                    self.request('/api/tmdb/trending/movies/' + encodeURIComponent(timeWindow) + '?lang=' + encodeURIComponent(lang)),
                    self.request('/api/tmdb/trending/tv/' + encodeURIComponent(timeWindow) + '?lang=' + encodeURIComponent(lang))
                ]).then(function (results) {
                    return { movies: results[0], series: results[1] };
                });
            }
            var type = kind === 'series' || kind === 'tv' ? 'tv' : 'movies';
            return this.request('/api/tmdb/trending/' + type + '/' + encodeURIComponent(timeWindow) + '?lang=' + encodeURIComponent(lang));
        },

        getPopularMovies: function (page, lang) {
            page = page || 1;
            lang = lang || NexusConfig.getLanguage();
            return this.getGlobalHome(lang).then(function (home) {
                var sections = sectionFromHome(home, ['popular-movies']);
                return { page: page, results: sections.length ? sections[0].items : [] };
            });
        },

        getTopRatedMovies: function (page, lang) {
            page = page || 1;
            lang = lang || NexusConfig.getLanguage();
            return this.getGlobalHome(lang).then(function (home) {
                var sections = sectionFromHome(home, ['top-rated-movies']);
                return { page: page, results: sections.length ? sections[0].items : [] };
            });
        },

        getNowPlayingMovies: function (page, lang) {
            page = page || 1;
            lang = lang || NexusConfig.getLanguage();
            return this.getGlobalHome(lang).then(function (home) {
                var sections = sectionFromHome(home, ['now-playing']);
                return { page: page, results: sections.length ? sections[0].items : [] };
            });
        },

        getMovieDetails: function (tmdbId, lang) {
            lang = lang || NexusConfig.getLanguage();
            return this.request('/api/discovery/movie/' + encodeURIComponent(tmdbId) + '?lang=' + encodeURIComponent(lang));
        },

        // TV Series
        getPopularSeries: function (page, lang) {
            page = page || 1;
            lang = lang || NexusConfig.getLanguage();
            return this.getGlobalHome(lang).then(function (home) {
                var sections = sectionFromHome(home, ['popular-tv']);
                return { page: page, results: sections.length ? sections[0].items : [] };
            });
        },

        getTopRatedSeries: function (page, lang) {
            page = page || 1;
            lang = lang || NexusConfig.getLanguage();
            return this.getGlobalHome(lang).then(function (home) {
                var sections = sectionFromHome(home, ['top-rated-tv']);
                return { page: page, results: sections.length ? sections[0].items : [] };
            });
        },

        getSeriesDetails: function (tmdbId, lang) {
            lang = lang || NexusConfig.getLanguage();
            return this.request('/api/discovery/tv/' + encodeURIComponent(tmdbId) + '?lang=' + encodeURIComponent(lang));
        },

        getSeasonDetails: function (tmdbId, seasonNumber, lang) {
            lang = lang || NexusConfig.getLanguage();
            return this.request('/api/discovery/tv/' + encodeURIComponent(tmdbId) + '/season/' + encodeURIComponent(seasonNumber) + '?lang=' + encodeURIComponent(lang));
        },

        // Search: backend returns local/global cards, TV UI consumes a unified result list.
        search: function (query, lang, page) {
            lang = lang || NexusConfig.getLanguage();
            page = page || 1;
            var path = '/api/search?q=' + encodeURIComponent(query || '') + '&lang=' + encodeURIComponent(lang) + '&page=' + page;
            return this.request(path).then(function (data) {
                data = data || {};
                var local = Array.isArray(data.local) ? data.local : [];
                var global = Array.isArray(data.global) ? data.global : [];
                data.results = local.concat(global);
                return data;
            });
        },

        // Playback: server wraps sources under response.playback.
        getMoviePlayback: function (tmdbId, lang) {
            lang = lang || NexusConfig.getLanguage();
            return this.request('/api/playback/movie/' + encodeURIComponent(tmdbId) + '?lang=' + encodeURIComponent(lang)).then(normalizePlayback);
        },

        getEpisodePlayback: function (tmdbId, season, episode, lang) {
            lang = lang || NexusConfig.getLanguage();
            var path = '/api/playback/tv/' + encodeURIComponent(tmdbId) + '/seasons/' + encodeURIComponent(season) + '/episodes/' + encodeURIComponent(episode) + '?lang=' + encodeURIComponent(lang);
            return this.request(path).then(normalizePlayback);
        },

        // Local library support. IDs are library IDs, not TMDB IDs.
        getLocalTitle: function (localId, lang) {
            lang = lang || NexusConfig.getLanguage();
            return this.request('/api/titles/' + encodeURIComponent(localId) + '?lang=' + encodeURIComponent(lang));
        },

        getLocalMedia: function (mediaId, lang) {
            lang = lang || NexusConfig.getLanguage();
            return this.request('/api/media/' + encodeURIComponent(mediaId) + '?lang=' + encodeURIComponent(lang));
        },

        getLocalPlayback: function (mediaId) {
            var self = this;
            return this.getLocalMedia(mediaId).then(function (media) {
                if (!media || !media.playback || !media.playable) {
                    throw new Error('الملف المحلي غير جاهز للتشغيل');
                }
                if (media.playback.mode === 'direct') {
                    return { source: { url: backendUrl('/api/stream/' + encodeURIComponent(mediaId)), type: 'mp4', provider: 'Local Library' }, alternatives: [], subtitles: normalizeSubtitles(media.subtitles) };
                }
                if (media.playback.mode !== 'hls') throw new Error('صيغة الملف المحلي غير مدعومة');
                return new Promise(function (resolve, reject) {
                    var attempts = 0;
                    function checkStatus() {
                        attempts += 1;
                        self.request('/api/hls/' + encodeURIComponent(mediaId) + '/status', { timeout: 20000 }).then(function (status) {
                            if (status && status.canStart) {
                                resolve({ source: { url: backendUrl('/api/hls/' + encodeURIComponent(mediaId) + '/master.m3u8'), type: 'hls', provider: 'Local Library' }, alternatives: [], subtitles: normalizeSubtitles(media.subtitles) });
                            } else if (status && status.state === 'error') {
                                reject(new Error('تعذّر تجهيز الفيديو المحلي: ' + (status.error || 'خطأ في المعالجة')));
                            } else if (attempts >= 45) {
                                reject(new Error('استغرق تجهيز الفيديو وقتًا أطول من المتوقع'));
                            } else {
                                window.setTimeout(checkStatus, 2000);
                            }
                        }).catch(reject);
                    }
                    checkStatus();
                });
            });
        },

        getPreferredPlayback: function (kind, tmdbId, localId, season, episode) {
            var self = this;
            function remotePlayback() {
                return (kind === 'movie'
                    ? self.getMoviePlayback(tmdbId)
                    : self.getEpisodePlayback(tmdbId, season || 1, episode || 1)).then(function (playback) {
                    if (playback && playback.source) return playback;
                    if (playback && playback.localMediaId) {
                        return self.getLocalPlayback(playback.localMediaId).catch(function () { return playback; });
                    }
                    return playback;
                });
            }
            if (!localId) return remotePlayback();
            return this.getLocalTitle(localId).then(function (title) {
                var mediaId = null;
                if (kind === 'movie') mediaId = title.mediaId;
                else {
                    var seasons = title.seasons || [];
                    for (var i = 0; i < seasons.length && !mediaId; i++) {
                        if (Number(seasons[i].season) !== Number(season || 1)) continue;
                        var episodes = seasons[i].episodes || [];
                        for (var j = 0; j < episodes.length; j++) {
                            if (Number(episodes[j].episode) === Number(episode || 1)) { mediaId = episodes[j].id; break; }
                        }
                    }
                    if (!mediaId) mediaId = title.firstMediaId;
                }
                if (!mediaId) return remotePlayback();
                return self.getLocalPlayback(mediaId).catch(function () { return remotePlayback(); });
            }).catch(function () { return remotePlayback(); });
        },

        // Subtitles Search & Download
        getSubtitles: function (tmdbId, type, season, episode) {
            if (!tmdbId) return Promise.resolve([]);
            var endpoint = '/api/subtitles/search?tmdbId=' + encodeURIComponent(tmdbId) + '&type=' + encodeURIComponent(type || 'movie');
            if (season) endpoint += '&season=' + encodeURIComponent(season);
            if (episode) endpoint += '&episode=' + encodeURIComponent(episode);
            return this.request(endpoint, { timeout: 15000 }).then(function (res) {
                return (res && Array.isArray(res.subtitles)) ? res.subtitles : [];
            }).catch(function (err) {
                console.warn('[NexusAPI] Subtitles search failed:', err.message);
                return [];
            });
        },

        getSubtitleDownload: function (fileId) {
            if (!fileId) return Promise.reject(new Error('Missing fileId'));
            return this.request('/api/subtitles/download/' + encodeURIComponent(fileId), { timeout: 15000 });
        },

        // Enhanced External Subtitles Search (Multiple Sources)
        searchExternalSubtitles: function (tmdbId, title, type) {
            if (!tmdbId && !title) return Promise.resolve([]);

            var queryParams = [];
            if (tmdbId) queryParams.push('tmdbId=' + encodeURIComponent(tmdbId));
            if (title) queryParams.push('title=' + encodeURIComponent(title));
            if (type) queryParams.push('type=' + encodeURIComponent(type));

            var endpoint = '/api/subtitles/search/external?' + queryParams.join('&');

            return this.request(endpoint, { timeout: 20000 }).then(function (res) {
                if (!res || !Array.isArray(res.results)) return [];

                // Process and normalize results
                return res.results.map(function (item) {
                    return {
                        id: item.id || item.subID || Math.random().toString(36).substr(2, 9),
                        language: item.language || 'en',
                        languageName: item.languageName || (item.language === 'ar' ? 'العربية' : 'English'),
                        provider: item.provider || 'OpenSubtitles',
                        quality: item.quality || (item.rating > 8 ? 'Excellent' : (item.rating > 6 ? 'Good' : 'Normal')),
                        downloads: item.downloads || item.downloadCount || 0,
                        rating: item.rating || item.score || 0,
                        url: item.url || item.downloadLink,
                        format: item.format || 'srt'
                    };
                }).filter(function (item) {
                    // Filter by language preference (Arabic or English)
                    var prefLang = NexusConfig.getLanguage();
                    return item.language === prefLang || item.language === 'en' || item.language === 'ar';
                }).sort(function (a, b) {
                    // Sort by: language match first, then downloads, then rating
                    var prefLang = NexusConfig.getLanguage();
                    if (a.language === prefLang && b.language !== prefLang) return -1;
                    if (b.language === prefLang && a.language !== prefLang) return 1;
                    if (a.downloads !== b.downloads) return b.downloads - a.downloads;
                    return b.rating - a.rating;
                });
            }).catch(function (err) {
                console.warn('[NexusAPI] External subtitles search failed:', err.message);
                return [];
            });
        },

        // Get detailed subtitle information
        getSubtitleInfo: function (fileId) {
            if (!fileId) return Promise.reject(new Error('Missing fileId'));
            return this.request('/api/subtitles/info/' + encodeURIComponent(fileId), { timeout: 15000 });
        },

        // Sports: channels & live streams
        getSportsChannels: function () {
            return this.request('/api/sports/status').then(function (data) {
                var keys = data && Array.isArray(data.channels) ? data.channels : [];
                return keys.map(function (key) {
                    return { id: key, name: String(key).replace(/-/g, ' ').toUpperCase(), available: true };
                });
            }).catch(function () {
                // Fallback to static catalog keys if status endpoint is offline
                return [
                    { id: 'bein-1', name: 'BEIN SPORTS 1', available: true },
                    { id: 'bein-2', name: 'BEIN SPORTS 2', available: true },
                    { id: 'bein-3', name: 'BEIN SPORTS 3', available: true },
                    { id: 'bein-4', name: 'BEIN SPORTS 4', available: true },
                    { id: 'bein-5', name: 'BEIN SPORTS 5', available: true },
                    { id: 'bein-6', name: 'BEIN SPORTS 6', available: true },
                    { id: 'bein-7', name: 'BEIN SPORTS 7', available: true },
                    { id: 'bein-8', name: 'BEIN SPORTS 8', available: true },
                    { id: 'bein-9', name: 'BEIN SPORTS 9', available: true },
                    { id: 'bein-news', name: 'BEIN SPORTS NEWS', available: true }
                ];
            });
        },

        getSportsStream: function (channelId) {
            var channelKey = String(channelId || 'bein-1').toLowerCase();
            var daddyIds = {
                'bein-1': 91, 'bein-2': 92, 'bein-3': 93, 'bein-4': 94, 'bein-5': 95,
                'bein-6': 96, 'bein-7': 97, 'bein-8': 98, 'bein-9': 99, 'bein-news': 100,
                'bein-fr-1': 116, 'bein-fr-2': 117, 'bein-fr-3': 118,
                'bein-max-1': 91, 'bein-afc-1': 91, 'bein-afc-2': 92, 'bein-en-1': 91
            };
            var daddyId = daddyIds[channelKey] || 91;

            // Direct local or backend HLS proxy
            var isLocalDev = window.location && (window.location.port === '8080' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            var hlsUrl = isLocalDev
                ? '/api/sports/stream/' + encodeURIComponent(channelKey) + '/manifest.m3u8'
                : backendUrl('/api/sports/stream/' + encodeURIComponent(channelKey) + '/manifest.m3u8');

            var primary = {
                url: hlsUrl,
                type: 'hls',
                provider: 'beIN Sports HD (Direct HLS)',
                isLive: true
            };

            var alternatives = [
                {
                    url: 'https://thedaddy.li/player/stream-' + daddyId + '.php',
                    embedUrl: 'https://thedaddy.li/player/stream-' + daddyId + '.php',
                    type: 'embed',
                    provider: 'Daddy Fast Stream (سيرفر البث الاحتياطي 1)',
                    isLive: true
                },
                {
                    url: 'https://thedaddy.li/stream/stream-' + daddyId + '.php',
                    embedUrl: 'https://thedaddy.li/stream/stream-' + daddyId + '.php',
                    type: 'embed',
                    provider: 'Daddy Live Stream (سيرفر البث المباشر 2)',
                    isLive: true
                },
                {
                    url: 'https://thedaddy.li/cast/stream-' + daddyId + '.php',
                    embedUrl: 'https://thedaddy.li/cast/stream-' + daddyId + '.php',
                    type: 'embed',
                    provider: 'Daddy Cast (سيرفر البث الذكي 3)',
                    isLive: true
                }
            ];

            return Promise.resolve({
                source: primary,
                alternatives: alternatives,
                subtitles: []
            });
        },

        // Providers
        getProviderStatus: function () {
            return this.request('/api/streaming/providers');
        },

        getProviderHealth: function () {
            return this.request('/api/playback/provider-health');
        }
    };
})(window);