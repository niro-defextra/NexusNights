import { useRoute, hrefs } from '../router';
import { useI18n } from '../i18n';
import { Home, Trophy, Download, Users } from './Icons';

export function BottomNav() {
  const route = useRoute();
  const { lang, t } = useI18n();

  // Hide on video player or POC pages where full height is needed
  if (route.name === 'watch' || route.name === 'embed-poc') {
    return null;
  }

  const isHome = route.name === 'home';
  const isSports = route.name === 'sports' || route.name === 'sports-watch';
  const isDownloads = route.name === 'downloads';
  const isRooms = route.name === 'discover-rooms';

  const navItems = [
    {
      label: t('home'),
      href: hrefs.home,
      active: isHome,
      icon: Home,
    },
    {
      label: t('sports'),
      href: hrefs.sports,
      active: isSports,
      icon: Trophy,
    },
    {
      label: lang === 'ar' ? 'التنزيلات' : 'Downloads',
      href: hrefs.downloads,
      active: isDownloads,
      icon: Download,
    },
    {
      label: lang === 'ar' ? 'الغرف' : 'Rooms',
      href: '#/discover-rooms',
      active: isRooms,
      icon: Users,
    },
  ];

  return (
    <nav
      aria-label={lang === 'ar' ? 'التنقل الرئيسي للهاتف' : 'Mobile Bottom Navigation'}
      className="fixed inset-x-0 bottom-0 z-40 sm:hidden bg-ink/90 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-4px_30px_rgba(0,0,0,0.85)] pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 px-3 transition-transform duration-300"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all duration-200 active:scale-90 ${
                item.active
                  ? 'text-blood-hot'
                  : 'text-dust/70 hover:text-bone hover:bg-white/[0.03]'
              }`}
            >
              <div className="relative">
                <Icon className={`size-5 transition-transform duration-200 ${item.active ? 'scale-110' : ''}`} />
                {item.active && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-blood-hot shadow-[0_0_8px_rgba(220,48,68,0.9)]" />
                )}
              </div>
              <span
                className={`text-[0.68rem] tracking-tight leading-none ${
                  item.active ? 'font-bold text-bone' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
