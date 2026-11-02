import { STRINGS } from '../strings';
import type { RoutePath } from '../types';

interface TopNavProps {
  currentRoute: RoutePath;
  onNavigate: (route: RoutePath) => void;
}

export function TopNav({ currentRoute, onNavigate }: TopNavProps) {
  const navItems: ReadonlyArray<{ path: RoutePath; label: string }> = [
    { path: '/', label: STRINGS.nav.home },
    { path: '/workspace', label: STRINGS.nav.workspace },
    { path: '/replays', label: STRINGS.nav.replays },
    { path: '/benchmarks', label: STRINGS.nav.benchmarks },
    { path: '/about', label: STRINGS.nav.about },
  ];

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#FAF9F6] border-b border-[#E3DFD7]">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('/');
        }}
        className="text-lg font-bold tracking-tight text-[#171614] whitespace-nowrap shrink-0"
      >
        {STRINGS.brand}
      </a>

      {/* Zone 2: Clean single-line text navigation links */}
      <nav aria-label="Primary" className="flex items-center gap-5 sm:gap-7 text-sm font-medium text-[#524F49] overflow-x-auto">
        {navItems.map((item) => {
          const active = currentRoute === item.path;
          return (
            <a
              key={item.path}
              href={item.path}
              aria-current={active ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(item.path);
              }}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 ${
                active
                  ? 'text-[#171614] border-[#1E40AF] font-semibold'
                  : 'border-transparent hover:text-[#171614] hover:border-[#C8C2B5]'
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="hidden sm:flex items-center shrink-0">
        <button
          type="button"
          onClick={() => onNavigate('/workspace')}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#1E40AF] rounded-lg hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {STRINGS.nav.primaryCta}
        </button>
      </div>
    </header>
  );
}
