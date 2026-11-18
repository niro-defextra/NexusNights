import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { useI18n } from '../i18n';
import { go } from '../router';
import { Sigil } from '../components/Icons';
import { PhonePlate, RoomPlate, TvPlate } from './downloads/DevicePlates';
import type { PlatformId } from './downloads/Constellation';
import './downloads/downloads.css';

const Constellation = lazy(() => import('./downloads/Constellation'));

const APK = '/downloads/NexusNight.apk';
const WGT = '/downloads/NexusNightTV.wgt';
const DISCORD =
  'https://discord.com/oauth2/authorize?client_id=1365445429700853853&scope=applications.commands+applications.entitlements';

type Copy = {
  badge: string;
  title: [string, string, string];
  lede: string;
  primary: string;
  secondary: string;
  jumpLabel: string;
  foot: string[];
  installHeading: string;
  installLede: string;
  steps: Array<{ title: string; body: string }>;
  band: { title: string; body: string; meta: string; cta: string };
  close: { title: string; home: string; sports: string };
  platforms: Array<{
    id: PlatformId;
    name: string;
    meta: string;
    badge: string;
    lede: string;
    specs: Array<[string, string]>;
    cta: string;
    note: string;
    href: string;
    external?: boolean;
  }>;
};

const EN: Copy = {
  badge: 'NEXUSNIGHTS ECOSYSTEM',
  title: ['Take the ', 'night', ' with you.'],
  lede: 'NexusNights runs natively in three places — the phone in your pocket, the cinema screen in your living room, and the voice channel you already gather in. Same synchronized library, same night, zero compromise.',
  primary: 'Explore platforms',
  secondary: 'Open in Discord',
  jumpLabel: 'Three native portals',
  foot: ['Native Hardware Decoding', 'Zero Account Friction on TV', 'Self-Hosted Room Sync'],
  installHeading: 'Three simple steps. Once.',
  installLede:
    'Every installer delivers the complete standalone client with hardware acceleration and direct HLS streaming.',
  steps: [
    {
      title: 'Get the package',
      body: 'Download the file tailored directly for the hardware and screen you are sitting in front of.',
    },
    {
      title: 'Install & Authorize',
      body: 'Android takes a single tap on unknown sources. Samsung TV connects through developer mode or Tizen Studio.',
    },
    {
      title: 'Connect & Enjoy',
      body: 'Launch the app to enjoy instantaneous 4K streaming, synchronized room parties, and custom subtitles.',
    },
  ],
  band: {
    title: 'Zero installation. The channel is your private cinema.',
    body: 'Launch NexusNights right inside any Discord voice channel. Everyone in the channel watches the exact same frame in real-time, with in-player chat and host playback authority.',
    meta: 'Available on Discord Desktop and Web clients.',
    cta: 'Launch Discord Activity',
  },
  close: {
    title: 'One Night. Three Screens. Absolute Freedom.',
    home: 'Back to Library',
    sports: 'Live Sports Center',
  },
  platforms: [
    {
      id: 'tv',
      name: 'Samsung Smart TV',
      meta: 'WGT WIDGET',
      badge: 'Living Room Cinema',
      lede: 'Engineered specifically for the big screen and your remote control. Hardware-accelerated 4K decoding with AVPlay, instant audio track selection, and customized Arabic subtitles with zero login needed.',
      specs: [
        ['Target OS', 'Samsung Tizen 5.0+'],
        ['Package Type', 'WGT Standalone Widget'],
        ['Decoding Engine', 'AVPlay Hardware 4K'],
        ['Control Method', 'Native Smart TV Remote'],
      ],
      cta: 'Download TV Widget (.wgt)',
      note: 'Install directly via Tizen Studio or SDB developer command line to your TV.',
      href: WGT,
    },
    {
      id: 'android',
      name: 'Android & Tablets',
      meta: 'APK PACKAGE',
      badge: 'Cinema in Your Pocket',
      lede: 'The full cinematic library on the go. Retains your timeline position across devices, plays seamlessly in the background and with screen locked, and stays in sync with live room parties.',
      specs: [
        ['Platform', 'Android 7.0+ (API 24)'],
        ['Package Type', 'APK Native Build'],
        ['Architecture', 'Capacitor 6 + Chromium Engine'],
        ['Capabilities', 'Background Audio · Room Sync'],
      ],
      cta: 'Download Android APK (.apk)',
      note: 'Allow installation from this source once if prompted by your Android package installer.',
      href: APK,
    },
    {
      id: 'discord',
      name: 'Discord Voice Activity',
      meta: 'ZERO INSTALL',
      badge: 'Synchronized Watch Party',
      lede: 'Watch movies and series together where the conversation already happens. Shared synchronized timeline, built-in voice room chat, and dedicated host playback controls with no installation required.',
      specs: [
        ['Installation', 'Instant (Zero-Install)'],
        ['Environment', 'Discord Voice Channels'],
        ['Synchronization', 'Sub-second WebSocket Sync'],
        ['Platforms', 'Discord Desktop & Web'],
      ],
      cta: 'Launch Discord Activity',
      note: 'Opens the official Discord authorization dialog for the NexusNights activity.',
      href: DISCORD,
      external: true,
    },
  ],
};

const AR: Copy = {
  badge: 'منظومة NEXUSNIGHTS المتكاملة',
  title: ['شاشتك المفضلة، ', 'سهرتك', ' بلا حدود.'],
  lede: 'يعمل NexusNights في ثلاثة أماكن أصيلة: شاشة التلفزيون في صالتك، هاتفك المحمول في جيبك، وداخل قنوات ديسكورد الصوتية. نفس المكتبة، نفس السهرة المشتركة، وبأعلى جودة ممكنة.',
  primary: 'استكشف المنصات',
  secondary: 'افتح في ديسكورد',
  jumpLabel: 'ثلاثة تطبيقات أصيلة',
  foot: ['فك تشفير عتادي 4K', 'بدون أي حساب على التلفزيون', 'مزامنة فورية للغرف'],
  installHeading: 'ثلاث خطوات سريعة، لمرة واحدة.',
  installLede: 'كل تطبيق يأتيك بحجم خفيف جداً ومجهّز فورياً لتشغيل كل مسلسلاتك وأفلامك وبثوثك المباشرة.',
  steps: [
    {
      title: 'نزّل الحزمة',
      body: 'اختر الملف المخصص لجهازك مباشرة من الروابط أدناه.',
    },
    {
      title: 'التثبيت والتصريح',
      body: 'أندرويد يتطلب الموافقة على المصادر غير المعروفة، وتلفزيون سامسونج يقبل التثبيت عبر وضع المطوّر أو Tizen Studio.',
    },
    {
      title: 'انطلق واستمتع',
      body: 'افتح التطبيق واستمتع بتشغيل فوري، ترجمات عربية دقيقة، ومزامنة كاملة مع سهرات أصدقائك.',
    },
  ],
  band: {
    title: 'بلا أي تثبيت. القناة الصوتية تصبح سينما خاصة بكم.',
    body: 'شغّل NexusNights داخل أي قناة صوتية في ديسكورد، حيث يشاهد جميع أصدقائك نفس الإطار في نفس اللحظة مع دردشة مدمجة في المشغّل وتحكم سلس للمضيف.',
    meta: 'متاح على تطبيق ديسكورد للكمبيوتر والمتصفح.',
    cta: 'تشغيل النشاط في ديسكورد',
  },
  close: {
    title: 'ليلة واحدة. ثلاث شاشات. حرية كاملة.',
    home: 'العودة للمكتبة',
    sports: 'مركز البث الرياضي المباشر',
  },
  platforms: [
    {
      id: 'tv',
      name: 'Samsung Smart TV',
      meta: 'ودجت WGT',
      badge: 'سينما الصالة المريحة',
      lede: 'مصمّم خصيصاً لأجهزة التحكم عن بعد (الريموت) وتجربة الشاشات الكبيرة. فك تشفير عتادي فائق السرعة عبر محرك AVPlay، جودة 4K/1080p، بدون الحاجة لتسجيل دخول أو لوحة مفاتيح مع ترجمات عربية كاملة.',
      specs: [
        ['النظام المدعوم', 'Samsung Tizen OS 5.0 أو أحدث'],
        ['نوع الملف', 'ودجت أصلي WGT'],
        ['محرك العرض', 'AVPlay Hardware 4K'],
        ['طريقة التحكم', 'ريموت التلفزيون الذكي'],
      ],
      cta: 'تحميل ودجت التلفزيون (.wgt)',
      note: 'ثبّته مباشرة عبر Tizen Studio أو من خلال شبكة المطوّر SDB على تلفزيونك.',
      href: WGT,
    },
    {
      id: 'android',
      name: 'أندرويد والهواتف الذكية',
      meta: 'ملف APK',
      badge: 'السينما في جيبك',
      lede: 'المكتبة كاملة معك أينما ذهبت. يدعم مواصلة العرض والشاشة مقفلة، والتنقل السريع بين الحلقات، مع مزامنة لحظية في الغرف الجماعية أثناء ابتعادك عن شاشة التلفزيون.',
      specs: [
        ['النظام المدعوم', 'أندرويد 7.0+ (API 24)'],
        ['نوع الملف', 'تطبيق أصلي APK'],
        ['البنية', 'Capacitor Native Engine'],
        ['المزايا', 'تشغيل في الخلفية · غرف مشاهدة'],
      ],
      cta: 'تحميل ملف APK (.apk)',
      note: 'اضغط على السماح بالتثبيت من هذا المصدر عند طلب النظام.',
      href: APK,
    },
    {
      id: 'discord',
      name: 'نشاط ديسكورد الصوتي',
      meta: 'تشغيل فوري',
      badge: 'سهرة جماعية متزامنة',
      lede: 'انقل السهرة حيث يتواجد أصدقاؤك بالفعل. شريط تشغيل مشترك متزامن ثانية بثانية، دردشة نصية وتفاعلية داخل المشغّل، وتحكم كامل للمضيف دون أي برامج إضافية.',
      specs: [
        ['التثبيت', 'فوري (Zero-Install)'],
        ['بيئة التشغيل', 'قنوات Discord الصوتية'],
        ['التزامن', 'مزامنة فورية عبر السيرفر'],
        ['المنصات', 'ديسكورد سطح المكتب والويب'],
      ],
      cta: 'فتح النشاط في ديسكورد',
      note: 'يفتح نافذة تصريح النشاط الرسمية لتطبيق NexusNights داخل ديسكورد.',
      href: DISCORD,
      external: true,
    },
  ],
};

const DownloadGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 20h16" />
  </svg>
);

const ArrowGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h13" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

export function Downloads() {
  const { lang, dir } = useI18n();
  const copy = lang === 'ar' ? AR : EN;
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<PlatformId | null>(null);

  useEffect(() => {
    document.title = lang === 'ar' ? 'NexusNights — التنزيلات' : 'NexusNights — Downloads';
  }, [lang]);

  // a hairline that measures the read, themed from the palette
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.setProperty('--p', ratio.toFixed(4));
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    paint();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
    };
  }, []);

  // one reveal per section, staggered inside it — not the same entrance everywhere
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('.dl-reveal'));
    if (!items.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.classList.add('dl-anim');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    items.forEach((item) => io.observe(item));
    return () => {
      io.disconnect();
      root.classList.remove('dl-anim');
    };
  }, [lang]);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const plates: Record<PlatformId, ReactElement> = {
    android: <PhonePlate />,
    tv: <TvPlate />,
    discord: <RoomPlate />,
  };

  return (
    <div className="dl" dir={dir} ref={rootRef}>
      <div className="dl-progress" aria-hidden="true" />

      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="dl-hero">
        <div className="dl-hero__copy">
          <div className="flex items-center gap-2.5 text-xs font-semibold tracking-wider text-gilt/90 mb-1">
            <Sigil className="size-5 text-blood-hot" />
            <span>{copy.badge}</span>
          </div>
          <h1 className="dl-display dl-hero__title">
            {copy.title[0]}
            <em>{copy.title[1]}</em>
            {copy.title[2]}
          </h1>
          <p className="dl-lede">{copy.lede}</p>

          <div className="dl-hero__actions">
            <button type="button" className="dl-btn" onClick={() => jump('platforms')}>
              <DownloadGlyph />
              {copy.primary}
            </button>
            <a
              className="dl-btn dl-btn--ghost"
              href={DISCORD}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.secondary}
              <ArrowGlyph />
            </a>
          </div>

          <nav className="dl-jump" aria-label={copy.jumpLabel}>
            {copy.platforms.map((platform) => (
              <a
                key={platform.id}
                href={`#${platform.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  jump(platform.id);
                }}
                onMouseEnter={() => setActive(platform.id)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(platform.id)}
                onBlur={() => setActive(null)}
              >
                <span>{platform.name}</span>
                <span className="dl-mono">{platform.meta}</span>
              </a>
            ))}
          </nav>
        </div>

        <div className="dl-hero__stage">
          <Suspense fallback={null}>
            <Constellation active={active} />
          </Suspense>
        </div>

        <div className="dl-hero__foot">
          {copy.foot.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      </section>

      {/* ── dossiers ─────────────────────────────────────────────────── */}
      <section className="dl-section" id="platforms">
        {copy.platforms.map((platform, index) => (
          <article
            key={platform.id}
            id={platform.id}
            className={`dl-row dl-reveal${index % 2 === 1 ? ' dl-row--flip' : ''}`}
            onMouseEnter={() => setActive(platform.id)}
            onMouseLeave={() => setActive(null)}
            aria-labelledby={`${platform.id}-name`}
          >
            <div className="dl-art">
              <div className="dl-art__inner">{plates[platform.id]}</div>
            </div>

            <div className="dl-row__body">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-full bg-blood/20 border border-blood-hot/30 px-2.5 py-0.5 text-[0.72rem] font-bold text-blood-hot tracking-wide">
                  {platform.badge}
                </span>
                <span className="text-xs font-mono text-dust/80 tracking-wider uppercase">{platform.meta}</span>
              </div>
              <h2 className="dl-row__name" id={`${platform.id}-name`}>
                {platform.name}
              </h2>
              <p className="dl-lede">{platform.lede}</p>

              <dl className="dl-spec">
                {platform.specs.map(([term, value]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <a
                className="dl-btn"
                href={platform.href}
                {...(platform.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : { download: '' })}
              >
                <DownloadGlyph />
                {platform.cta}
              </a>
              <p className="dl-row__note">{platform.note}</p>
            </div>
          </article>
        ))}
      </section>

      {/* ── install path ─────────────────────────────────────────────── */}
      <section className="dl-section">
        <div className="dl-reveal" style={{ maxWidth: '52ch' }}>
          <h2 className="dl-display" style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.4rem)' }}>
            {copy.installHeading}
          </h2>
          <p className="dl-lede" style={{ marginBlockStart: '1rem' }}>
            {copy.installLede}
          </p>
        </div>

        <div className="dl-path">
          {copy.steps.map((step, index) => (
            <div
              key={step.title}
              className="dl-step dl-reveal"
              style={{ '--i': index } as CSSProperties}
            >
              <span className="dl-step__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── discord band ─────────────────────────────────────────────── */}
      <section className="dl-band">
        <div className="dl-band__inner">
          <div>
            <h2>{copy.band.title}</h2>
            <p>{copy.band.body}</p>
            <p className="dl-band__meta">{copy.band.meta}</p>
          </div>
          <a className="dl-btn" href={DISCORD} target="_blank" rel="noopener noreferrer">
            {copy.band.cta}
            <ArrowGlyph />
          </a>
        </div>
      </section>

      {/* ── close ────────────────────────────────────────────────────── */}
      <section className="dl-section dl-close">
        <h2>{copy.close.title}</h2>
        <div className="dl-close__links">
          <a href="#/" onClick={(event) => { event.preventDefault(); go.home(); }}>
            {copy.close.home}
          </a>
          <a href="#/sports" onClick={(event) => { event.preventDefault(); go.sports(); }}>
            {copy.close.sports}
          </a>
        </div>
      </section>
    </div>
  );
}
