/**
 * Subtitle Search Modal
 * Search and load external subtitles from OpenSubtitles.com
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { Close } from './Icons';

interface SubtitleResult {
  id: string;
  language: string;
  languageName: string;
  fileName: string;
  downloadCount: number;
  rating: number;
  hearingImpaired: boolean;
  movieHashMatch: boolean;
}

interface Props {
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  onSelect: (fileId: string, language: string, languageName: string) => void;
  onClose: () => void;
}

const LANGUAGE_FLAGS: Record<string, string> = {
  ar: '🇸🇦',
  en: '🇬🇧',
  tr: '🇹🇷',
  fr: '🇫🇷',
  es: '🇪🇸',
  de: '🇩🇪',
  it: '🇮🇹',
  pt: '🇵🇹',
  ru: '🇷🇺',
  ja: '🇯🇵',
  ko: '🇰🇷',
  zh: '🇨🇳',
  hi: '🇮🇳',
  nl: '🇳🇱',
  sv: '🇸🇪',
  no: '🇳🇴',
  da: '🇩🇰',
  fi: '🇫🇮',
  pl: '🇵🇱',
  cs: '🇨🇿',
  el: '🇬🇷',
  he: '🇮🇱',
  th: '🇹🇭',
  vi: '🇻🇳',
  id: '🇮🇩',
  ms: '🇲🇾',
  ro: '🇷🇴',
  hu: '🇭🇺',
  uk: '🇺🇦',
  bg: '🇧🇬',
  hr: '🇭🇷',
  sr: '🇷🇸',
  sk: '🇸🇰',
  sl: '🇸🇮',
  fa: '🇮🇷',
  ur: '🇵🇰',
};

export function SubtitleSearchModal({ tmdbId, type, season, episode, onSelect, onClose }: Props) {
  const { lang, t } = useI18n();
  const [subtitles, setSubtitles] = useState<SubtitleResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<string>('ar,en,tr');

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    api.searchExternalSubtitles(
      { tmdbId, type, season, episode, languages: selectedLanguages },
      ac.signal
    )
      .then((res) => {
        setSubtitles(res.subtitles);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to search subtitles');
          setLoading(false);
        }
      });

    return () => ac.abort();
  }, [tmdbId, type, season, episode, selectedLanguages]);

  // Sort: Arabic first, then higher download count
  const sortedSubtitles = useMemo(() => {
    return [...subtitles].sort((a, b) => {
      const aIsAr = a.language === 'ar';
      const bIsAr = b.language === 'ar';
      if (aIsAr && !bIsAr) return -1;
      if (!aIsAr && bIsAr) return 1;
      return (b.downloadCount || 0) - (a.downloadCount || 0);
    });
  }, [subtitles]);

  const handleSelect = (subtitle: SubtitleResult) => {
    onSelect(subtitle.id, subtitle.language, subtitle.languageName);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm animate-fade"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gilt/30 bg-crypt/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-coal/50">
          <h2 className="font-display text-xl font-semibold text-bone">
            {lang === 'ar' ? '🔍 البحث عن ترجمات' : '🔍 Search Subtitles'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-dust transition hover:bg-white/10 hover:text-bone"
            aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
          >
            <Close className="size-5" />
          </button>
        </div>

        {/* Language Filter */}
        <div className="border-b border-white/10 px-6 py-3 bg-coal/30">
          <label className="block text-sm font-medium text-dust mb-2">
            {lang === 'ar' ? 'اللغات' : 'Languages'}
          </label>
          <select
            value={selectedLanguages}
            onChange={(e) => setSelectedLanguages(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-coal px-3 py-2 text-sm text-bone focus:border-gilt focus:outline-none focus:ring-2 focus:ring-gilt/50"
          >
            <option value="ar,en,tr">{lang === 'ar' ? 'عربي، إنجليزي، تركي' : 'Arabic, English, Turkish'}</option>
            <option value="ar,en">{lang === 'ar' ? 'عربي، إنجليزي' : 'Arabic, English'}</option>
            <option value="ar">{lang === 'ar' ? 'عربي فقط' : 'Arabic only'}</option>
            <option value="en">{lang === 'ar' ? 'إنجليزي فقط' : 'English only'}</option>
            <option value="tr">{lang === 'ar' ? 'تركي فقط' : 'Turkish only'}</option>
            <option value="ar,en,tr,fr,es,de,it">{lang === 'ar' ? 'كل اللغات الشائعة' : 'All common languages'}</option>
          </select>
        </div>

        {/* Subtitle List */}
        <div className="max-h-[60vh] min-h-[300px] overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="size-8 animate-spin rounded-full border-2 border-gilt border-t-transparent" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-blood/30 bg-blood/10 p-4 text-sm text-blood">
              {error}
            </div>
          )}

          {!loading && !error && sortedSubtitles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-lg font-semibold text-dust">
                {lang === 'ar' ? 'لم يتم العثور على ترجمات' : 'No subtitles found'}
              </p>
              <p className="mt-2 text-sm text-dust">
                {lang === 'ar' ? 'جرب تغيير اللغات أو المحتوى' : 'Try different languages or content'}
              </p>
            </div>
          )}

          {!loading && !error && sortedSubtitles.length > 0 && (
            <div className="space-y-2">
              {sortedSubtitles.map((subtitle) => (
                <button
                  key={subtitle.id}
                  onClick={() => handleSelect(subtitle)}
                  className={`group flex w-full items-center justify-between rounded-xl border p-4 text-start transition active:scale-[0.98] ${
                    subtitle.language === 'ar'
                      ? 'border-gilt/40 bg-gilt/[0.04] hover:border-gilt hover:bg-gilt/[0.08]'
                      : 'border-white/10 bg-coal/50 hover:border-white/20 hover:bg-coal'
                  }`}
                >
                  <div className="flex flex-1 items-start gap-3 min-w-0">
                    {/* Flag */}
                    <div className="text-2xl flex-shrink-0">
                      {LANGUAGE_FLAGS[subtitle.language] || '🌐'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-bone">
                          {subtitle.languageName}
                        </span>
                        {subtitle.language === 'ar' && (
                          <span className="rounded bg-gilt/20 px-2 py-0.5 text-xs font-semibold text-gilt">
                            {lang === 'ar' ? 'عربي' : 'Arabic'}
                          </span>
                        )}
                        {subtitle.hearingImpaired && (
                          <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-dust">
                            {lang === 'ar' ? 'ضعاف السمع' : 'HI'}
                          </span>
                        )}
                        {subtitle.movieHashMatch && (
                          <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                            {lang === 'ar' ? 'مطابق' : 'Perfect Match'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm text-dust font-mono text-[12px]" dir="ltr">
                        {subtitle.fileName}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-dust">
                        <span>📥 {formatNumber(subtitle.downloadCount)}</span>
                        {subtitle.rating > 0 && (
                          <span>⭐ {subtitle.rating.toFixed(1)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="text-gilt opacity-0 transition group-hover:opacity-100 flex-shrink-0 ml-3 rtl:rotate-180">
                    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-3 bg-coal/30">
          <p className="text-xs text-dust text-center">
            {lang === 'ar' 
              ? 'محرك ترجمات ذكي متكامل (Stremio OpenSubs v3 + OpenSubtitles)'
              : 'Unified Subtitles Engine (Stremio OpenSubs v3 + OpenSubtitles)'}
          </p>
        </div>
      </div>
    </div>
  );
}
