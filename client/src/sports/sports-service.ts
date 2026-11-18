export interface SportsProgram {
  id: string;
  channelId: string;
  title: string;
  desc: string;
  start: Date;
  stop: Date;
  isLive: boolean;
  isUpcoming: boolean;
  progressPercent: number;
  timeFormatted: string;
  durationMinutes: number;
}

export interface StreamSource {
  id: string;
  label: string;
  type: 'hls' | 'embed';
  url: string;
}

export interface SportsChannel {
  id: string;
  daddyId?: number;
  slug: string;
  name: string;
  nameAr: string;
  leagueAr: string;
  category: 'main' | 'afc' | 'max' | 'xtra' | 'en_fr' | 'news';
  icon: string;
  backdropUrl: string;
  currentProgram?: SportsProgram;
  nextProgram?: SportsProgram;
  programs: SportsProgram[];
  streamSources: StreamSource[];
}

export interface BigMatchFixture {
  id: string;
  league: string;
  leagueBadge: string;
  leagueKey: 'all' | 'cl' | 'pl' | 'laliga' | 'arab' | 'europe';
  homeTeam: string;
  homeCrest: string;
  awayTeam: string;
  awayCrest: string;
  homeScore?: number;
  awayScore?: number;
  status: 'live' | 'upcoming' | 'finished';
  minute?: string;
  time: string;
  channelSlug: string;
  channelName: string;
  stadium: string;
  commentator: string;
  backdrop: string;
}

function buildChannelServers(channelId: number, baseLabel: string, slug: string): StreamSource[] {
  const sources: StreamSource[] = [];

  // Priority 1: 100% Ad-Free, Direct Native HLS Cinema Stream via Nexus Engine
  sources.push({
    id: `nexus-hls-${slug}`,
    label: `${baseLabel} - مشغل Nexus الأصلي (1080p - بدون أي إعلانات نهائياً)`,
    type: 'hls',
    url: `/api/sports/stream/${slug}/manifest.m3u8`,
  });

  // Fallback Embed Servers (for external redundancy)
  sources.push(
    {
      id: `daddy-stream-${channelId}`,
      label: `${baseLabel} - سيرفر احتياطي 1 (Full HD مباشر)`,
      type: 'embed',
      url: `https://thedaddy.li/stream/stream-${channelId}.php`,
    },
    {
      id: `daddy-cast-${channelId}`,
      label: `${baseLabel} - سيرفر احتياطي 2 (سيرفر الكاست المباشر)`,
      type: 'embed',
      url: `https://thedaddy.li/cast/stream-${channelId}.php`,
    },
    {
      id: `daddy-player-${channelId}`,
      label: `${baseLabel} - سيرفر احتياطي 3 (المشغل السريع النظيف)`,
      type: 'embed',
      url: `https://thedaddy.li/player/stream-${channelId}.php`,
    },
    {
      id: `daddy-watch-${channelId}`,
      label: `${baseLabel} - سيرفر احتياطي 4 (سيرفر المشاهدة المباشرة)`,
      type: 'embed',
      url: `https://thedaddy.li/watch/stream-${channelId}.php`,
    },
    {
      id: `daddy-plus-${channelId}`,
      label: `${baseLabel} - سيرفر احتياطي 5 (سيرفر بلس الاحتياطي)`,
      type: 'embed',
      url: `https://thedaddy.li/plus/stream-${channelId}.php`,
    },
    {
      id: `daddy-casting-${channelId}`,
      label: `${baseLabel} - سيرفر احتياطي 6 (سيرفر الأجهزة الذكية)`,
      type: 'embed',
      url: `https://thedaddy.li/casting/stream-${channelId}.php`,
    }
  );

  return sources;
}

// Curated authentic channels with verified streaming endpoints and real photographic backdrops
export const CHANNELS_CATALOG: Omit<SportsChannel, 'programs' | 'currentProgram' | 'nextProgram'>[] = [
  {
    id: '7836FEA9-6B39-4A1A-8352-DC5FCB97A16C',
    daddyId: 91,
    slug: 'bein-1',
    name: 'beIN SPORTS 1',
    nameAr: 'بي إن سبورتس 1',
    leagueAr: 'الدوري الإنجليزي ودوري أبطال أوروبا',
    category: 'main',
    icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS1.png',
    backdropUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(91, 'beIN 1', 'bein-1'),
  },
  {
    id: 'beINSports2.qa@MENA',
    daddyId: 92,
    slug: 'bein-2',
    name: 'beIN SPORTS 2',
    nameAr: 'بي إن سبورتس 2',
    leagueAr: 'الدوري الإسباني (La Liga)',
    category: 'main',
    icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS2.png',
    backdropUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(92, 'beIN 2', 'bein-2'),
  },
  {
    id: 'beINSports3.qa@MENA',
    daddyId: 93,
    slug: 'bein-3',
    name: 'beIN SPORTS 3',
    nameAr: 'بي إن سبورتس 3',
    leagueAr: 'الدوري الألماني والفرنسي',
    category: 'main',
    icon: 'https://i.imgur.com/UYSMao3.png',
    backdropUrl: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(93, 'beIN 3', 'bein-3'),
  },
  {
    id: 'beINSports4.qa@MENA',
    daddyId: 94,
    slug: 'bein-4',
    name: 'beIN SPORTS 4',
    nameAr: 'بي إن سبورتس 4',
    leagueAr: 'دوري أبطال أفريقيا والكونفدرالية',
    category: 'main',
    icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS4.png',
    backdropUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(94, 'beIN 4', 'bein-4'),
  },
  {
    id: 'beINSports5.qa@MENA',
    daddyId: 95,
    slug: 'bein-5',
    name: 'beIN SPORTS 5',
    nameAr: 'بي إن سبورتس 5',
    leagueAr: 'بطولات التنس الكبرى (جراند سلام)',
    category: 'main',
    icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS5.png',
    backdropUrl: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(95, 'beIN 5', 'bein-5'),
  },
  {
    id: 'beINSports6.qa@MENA',
    daddyId: 96,
    slug: 'bein-6',
    name: 'beIN SPORTS 6',
    nameAr: 'بي إن سبورتس 6',
    leagueAr: 'الألعاب والرياضات المتنوعة',
    category: 'main',
    icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS6.png',
    backdropUrl: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(96, 'beIN 6', 'bein-6'),
  },
  {
    id: 'beINSports7.qa@MENA',
    daddyId: 97,
    slug: 'bein-7',
    name: 'beIN SPORTS 7',
    nameAr: 'بي إن سبورتس 7',
    leagueAr: 'المباريات الأوروبية المشتركة',
    category: 'main',
    icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS7.png',
    backdropUrl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(97, 'beIN 7', 'bein-7'),
  },
  {
    id: 'beINSports8.qa@MENA',
    daddyId: 98,
    slug: 'bein-8',
    name: 'beIN SPORTS 8',
    nameAr: 'بي إن سبورتس 8',
    leagueAr: 'الرياضات العالمية والسباقات',
    category: 'main',
    icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS8.png',
    backdropUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(98, 'beIN 8', 'bein-8'),
  },
  {
    id: '5C08D9D3-C713-4F1F-947E-87C761428B9B',
    daddyId: 99,
    slug: 'bein-9',
    name: 'beIN SPORTS 9',
    nameAr: 'بي إن سبورتس 9',
    leagueAr: 'البث المباشر للأحداث الكبرى',
    category: 'main',
    icon: 'https://github.com/ayoubboukous27/beIN-Sports-EPG-Worldwide/raw/refs/heads/main/Logos/BS9.png',
    backdropUrl: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(99, 'beIN 9', 'bein-9'),
  },
  {
    id: 'beINSportsNews.qa@SD',
    daddyId: 100,
    slug: 'bein-news',
    name: 'beIN SPORTS NEWS',
    nameAr: 'بي إن الإخبارية المفتوحة',
    leagueAr: 'نشرات الأخبار والحصاد الرياضي',
    category: 'news',
    icon: 'https://i.imgur.com/ZNjQzR5.png',
    backdropUrl: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(100, 'beIN News', 'bein-news'),
  },
  {
    id: 'beINSportsMax1.qa@MENA',
    daddyId: 597,
    slug: 'bein-max-1',
    name: 'beIN SPORTS MAX 1',
    nameAr: 'بي إن سبورتس ماكس 1',
    leagueAr: 'البطولات الدولية والنهائيات',
    category: 'max',
    icon: 'https://i.imgur.com/FjWQjdy.png',
    backdropUrl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(597, 'beIN MAX 1', 'bein-max-1'),
  },
  {
    id: 'beINSportsXtra1.qa@SD',
    daddyId: 100,
    slug: 'bein-xtra-1',
    name: 'beIN SPORTS XTRA 1',
    nameAr: 'بي إن سبورتس إكسترا 1',
    leagueAr: 'البث الإضافي والتغطيات الحصرية',
    category: 'xtra',
    icon: 'https://i.imgur.com/O9lTxQA.png',
    backdropUrl: 'https://images.unsplash.com/photo-1471295253337-3ceaaedca402?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(100, 'beIN XTRA 1', 'bein-xtra-1'),
  },
  {
    id: 'beINSportsAFC1.qa@SD',
    daddyId: 91,
    slug: 'bein-afc-1',
    name: 'beIN SPORTS 1 AFC',
    nameAr: 'بي إن سبورتس 1 آسيا',
    leagueAr: 'دوري أبطال آسيا للنخبة',
    category: 'afc',
    icon: 'https://i.imgur.com/nk3JCpg.png',
    backdropUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(91, 'beIN AFC 1', 'bein-afc-1'),
  },
  {
    id: 'beINSportsAFC2.qa@SD',
    daddyId: 92,
    slug: 'bein-afc-2',
    name: 'beIN SPORTS 2 AFC',
    nameAr: 'بي إن سبورتس 2 آسيا',
    leagueAr: 'دوري أبطال آسيا للنخبة',
    category: 'afc',
    icon: 'https://i.imgur.com/WITLbxq.png',
    backdropUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(92, 'beIN AFC 2', 'bein-afc-2'),
  },
  {
    id: 'beINSports1.qa@France',
    daddyId: 116,
    slug: 'bein-fr-1',
    name: 'beIN SPORTS 1 FR',
    nameAr: 'بي إن سبورتس 1 فرنسا',
    leagueAr: 'الدوري الفرنسي بتعليق فرنسي',
    category: 'en_fr',
    icon: 'https://github.com/tv-logo/tv-logos/raw/refs/heads/main/countries/world-middle-east/bein-sports/bein-sports-1-french-mea.png',
    backdropUrl: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(116, 'beIN FR 1', 'bein-fr-1'),
  },
  {
    id: '8C1EC4FC-35E6-4866-A75D-37FCFAE18839',
    daddyId: 61,
    slug: 'bein-en-1',
    name: 'beIN SPORTS EN 1',
    nameAr: 'بي إن سبورتس 1 إنجليزي',
    leagueAr: 'البريميرليج بالتعليق الإنجليزي',
    category: 'en_fr',
    icon: 'https://i.imgur.com/HOj98bH.png',
    backdropUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=1200&auto=format&fit=crop',
    streamSources: buildChannelServers(61, 'beIN EN 1', 'bein-en-1'),
  },
];

// NOTE: No hardcoded/fake match data. Matches come only from the real EPG feed.
/**
 * Fetches dynamic sports match fixtures from backend /api/sports/fixtures with graceful fallback
 */
export async function fetchSportsFixtures(): Promise<BigMatchFixture[]> {
  try {
    const res = await fetch('/api/sports/fixtures');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.all) && data.all.length > 0) {
        return data.all.map((f: any) => ({
          id: f.id,
          league: f.league,
          leagueBadge: f.rawLeague || f.league,
          leagueKey: f.league.includes('أبطال أوروبا') ? 'cl' : f.league.includes('الإنجليزي') ? 'pl' : f.league.includes('الإسباني') ? 'laliga' : 'europe',
          homeTeam: f.homeTeam,
          homeCrest: f.homeCrest,
          awayTeam: f.awayTeam,
          awayCrest: f.awayCrest,
          status: f.status,
          minute: f.minute || undefined,
          time: f.time,
          channelSlug: f.channelSlug,
          channelName: f.channelName,
          stadium: f.stadium || 'البث المباشر المعتمد',
          commentator: f.commentator || 'قنوات beIN SPORTS الرسمية',
          backdrop: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1600&auto=format&fit=crop',
        }));
      }
    }
  } catch (err) {
    console.warn('[SportsService] Server fixtures fetch failed:', err);
  }
  // Never fabricate fake matches. Return empty so the UI shows "no matches".
  return [];
}

const CUSTOM_STREAMS_KEY = 'nexusnight_sports_custom_streams';

export function getCustomStreams(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CUSTOM_STREAMS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setCustomStream(channelSlug: string, url: string): void {
  try {
    const current = getCustomStreams();
    if (!url.trim()) {
      delete current[channelSlug];
    } else {
      current[channelSlug] = url.trim();
    }
    localStorage.setItem(CUSTOM_STREAMS_KEY, JSON.stringify(current));
  } catch {
    // Ignore storage errors
  }
}

function parseXmlDate(dateStr: string, tzStr = '+0000'): Date {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);
  const hour = parseInt(dateStr.slice(8, 10), 10);
  const minute = parseInt(dateStr.slice(10, 12), 10);
  const second = parseInt(dateStr.slice(12, 14), 10);

  let tzMinutes = 0;
  if (tzStr && tzStr.length >= 5) {
    const sign = tzStr[0] === '-' ? -1 : 1;
    const tzHours = parseInt(tzStr.slice(1, 3), 10);
    const tzMins = parseInt(tzStr.slice(3, 5), 10);
    tzMinutes = sign * (tzHours * 60 + tzMins);
  }

  const utcMillis = Date.UTC(year, month, day, hour, minute, second) - tzMinutes * 60 * 1000;
  return new Date(utcMillis);
}

export function formatProgramTime(date: Date, lang = 'ar'): string {
  try {
    return date.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }
}

export interface RealSportsEvent {
  id: string;
  channelId: string;
  channelSlug: string;
  channelName: string;
  channelNameAr: string;
  channelIcon: string;
  leagueAr: string;
  title: string;
  desc: string;
  start: Date;
  stop: Date;
  isLive: boolean;
  isUpcoming: boolean;
  timeCairo: string;
  progressPercent: number;
  backdropUrl: string;
}

export function extractRealSportsEvents(channels: SportsChannel[], lang = 'ar'): {
  liveNow: RealSportsEvent[];
  upcomingToday: RealSportsEvent[];
} {
  const liveNow: RealSportsEvent[] = [];
  const upcomingToday: RealSportsEvent[] = [];

  for (const ch of channels) {
    if (ch.currentProgram && ch.currentProgram.isLive) {
      liveNow.push({
        id: ch.currentProgram.id,
        channelId: ch.id,
        channelSlug: ch.slug,
        channelName: ch.name,
        channelNameAr: ch.nameAr,
        channelIcon: ch.icon,
        leagueAr: ch.leagueAr,
        title: ch.currentProgram.title,
        desc: ch.currentProgram.desc,
        start: ch.currentProgram.start,
        stop: ch.currentProgram.stop,
        isLive: true,
        isUpcoming: false,
        timeCairo: formatProgramTime(ch.currentProgram.start, lang) + ' - ' + formatProgramTime(ch.currentProgram.stop, lang),
        progressPercent: ch.currentProgram.progressPercent,
        backdropUrl: ch.backdropUrl,
      });
    }

    // Collect upcoming events for this channel
    for (const prog of ch.programs) {
      if (prog.isUpcoming) {
        upcomingToday.push({
          id: prog.id,
          channelId: ch.id,
          channelSlug: ch.slug,
          channelName: ch.name,
          channelNameAr: ch.nameAr,
          channelIcon: ch.icon,
          leagueAr: ch.leagueAr,
          title: prog.title,
          desc: prog.desc,
          start: prog.start,
          stop: prog.stop,
          isLive: false,
          isUpcoming: true,
          timeCairo: formatProgramTime(prog.start, lang),
          progressPercent: 0,
          backdropUrl: ch.backdropUrl,
        });
      }
    }
  }

  // Sort upcoming events by start time
  upcomingToday.sort((a, b) => a.start.getTime() - b.start.getTime());

  return {
    liveNow,
    upcomingToday: upcomingToday.slice(0, 12),
  };
}

let cachedChannels: SportsChannel[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function fetchSportsEPG(forceRefresh = false): Promise<SportsChannel[]> {
  const now = new Date();
  const nowTime = now.getTime();

  if (!forceRefresh && cachedChannels && nowTime - lastFetchTime < CACHE_TTL_MS) {
    return recomputeLiveState(cachedChannels);
  }

  const sources = [
    'https://raw.githubusercontent.com/ayoubboukous27/Bein-Sports-MENA-epg/main/epg_mapped_with_logos.xml',
    'https://al7omed.github.io/bein-epg/guide.xml',
  ];

  let xmlText = '';
  for (const src of sources) {
    try {
      const resp = await fetch(src, { cache: 'no-cache' });
      if (resp.ok) {
        xmlText = await resp.text();
        if (xmlText.length > 5000) break;
      }
    } catch {
      // try next source
    }
  }

  const customStreams = getCustomStreams();

  const channelsMap = new Map<string, SportsChannel>();
  for (const cat of CHANNELS_CATALOG) {
    const customUrl = customStreams[cat.slug];
    const streamSources = [...cat.streamSources];
    if (customUrl) {
      streamSources.unshift({
        id: 'custom',
        label: 'رابطك الخاص (Custom Stream)',
        type: customUrl.includes('.m3u8') ? 'hls' : 'embed',
        url: customUrl,
      });
    }

    const chObj: SportsChannel = {
      ...cat,
      programs: [],
      streamSources,
    };
    channelsMap.set(cat.id, chObj);
    if (cat.slug === 'bein-1') {
      channelsMap.set('beINSports1.qa@MENA', chObj);
      channelsMap.set('7836FEA9-6B39-4A1A-8352-DC5FCB97A16C', chObj);
    }
  }

  if (xmlText) {
    const progRegex = /<programme\s+start="(\d{14})\s*([+-]\d{4})?"\s+stop="(\d{14})\s*([+-]\d{4})?"\s+channel="([^"]+)">[\s\S]*?<title[^>]*>([^<]+)<\/title>(?:[\s\S]*?<desc[^>]*>([\s\S]*?)<\/desc>)?/g;
    let m: RegExpExecArray | null;

    while ((m = progRegex.exec(xmlText)) !== null) {
      const startStr = m[1];
      const startTz = m[2] || '+0000';
      const stopStr = m[3];
      const stopTz = m[4] || '+0000';
      const channelId = m[5];
      const title = m[6] ? m[6].trim() : 'Unknown';
      const desc = m[7] ? m[7].trim() : '';

      const channel = channelsMap.get(channelId);
      if (!channel) continue;

      const startDate = parseXmlDate(startStr, startTz);
      const stopDate = parseXmlDate(stopStr, stopTz);
      const isLive = now >= startDate && now < stopDate;
      const isUpcoming = now < startDate;

      const totalDuration = Math.max(1, (stopDate.getTime() - startDate.getTime()) / 1000 / 60);
      const elapsed = (now.getTime() - startDate.getTime()) / 1000 / 60;
      const progressPercent = isLive ? Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100))) : 0;

      const prog: SportsProgram = {
        id: `${channelId}-${startStr}`,
        channelId,
        title,
        desc,
        start: startDate,
        stop: stopDate,
        isLive,
        isUpcoming,
        progressPercent,
        timeFormatted: `${formatProgramTime(startDate)} - ${formatProgramTime(stopDate)}`,
        durationMinutes: Math.round(totalDuration),
      };

      channel.programs.push(prog);
    }
  }

  // Deduplicate channels: the same channel object can be registered under several
  // keys (e.g. beIN 1 under its catalog id, the EPG id and a UUID), which
  // previously produced duplicate entries and duplicate React keys.
  const seenChannelIds = new Set<string>();
  const result: SportsChannel[] = [];
  for (const channel of channelsMap.values()) {
    if (seenChannelIds.has(channel.id)) continue;
    seenChannelIds.add(channel.id);
    channel.programs.sort((a, b) => a.start.getTime() - b.start.getTime());
    const current = channel.programs.find((p) => p.isLive);
    const next = channel.programs.find((p) => p.isUpcoming);
    channel.currentProgram = current;
    channel.nextProgram = next;
    result.push(channel);
  }

  cachedChannels = result;
  lastFetchTime = nowTime;
  return result;
}

function recomputeLiveState(channels: SportsChannel[]): SportsChannel[] {
  const now = new Date();
  return channels.map((ch) => {
    const updatedPrograms = ch.programs.map((p) => {
      const isLive = now >= p.start && now < p.stop;
      const isUpcoming = now < p.start;
      const totalDuration = Math.max(1, (p.stop.getTime() - p.start.getTime()) / 1000 / 60);
      const elapsed = (now.getTime() - p.start.getTime()) / 1000 / 60;
      const progressPercent = isLive ? Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100))) : 0;
      return { ...p, isLive, isUpcoming, progressPercent };
    });

    const currentProgram = updatedPrograms.find((p) => p.isLive);
    const nextProgram = updatedPrograms.find((p) => p.isUpcoming);

    return {
      ...ch,
      programs: updatedPrograms,
      currentProgram,
      nextProgram,
    };
  });
}
