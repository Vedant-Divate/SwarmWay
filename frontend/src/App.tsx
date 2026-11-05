import { useCallback, useEffect, useState } from 'react';
import { checkSolverHealth } from './api/client';
import { TopNav } from './components/TopNav';
import { AboutScreen } from './screens/AboutScreen';
import { BenchmarksScreen } from './screens/BenchmarksScreen';
import { LandingScreen } from './screens/LandingScreen';
import { ReplaysScreen } from './screens/ReplaysScreen';
import { WorkspaceScreen } from './screens/WorkspaceScreen';
import type { BundledReplayMeta, RoutePath } from './types';
import { BASE_PATH, stripBase, toHref } from './utils/base';
import { normalizeRoutePath } from './utils/mapf';
import { useReducedMotion } from './utils/prefs';

export default function App() {
  const [route, setRoute] = useState<RoutePath>(() => {
    if (typeof window === 'undefined') return '/';
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      return '/workspace';
    }
    return normalizeRoutePath(stripBase(window.location.pathname));
  });

  const [checkingHealth, setCheckingHealth] = useState<boolean>(true);
  const [isOffline, setIsOffline] = useState<boolean>(true);
  const [selectedReplayMeta, setSelectedReplayMeta] = useState<BundledReplayMeta | null>(null);

  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    checkSolverHealth()
      .then((res) => {
        if (!active) return;
        setIsOffline(res === null);
      })
      .finally(() => {
        if (active) setCheckingHealth(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(normalizeRoutePath(stripBase(window.location.pathname)));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextRoute: RoutePath) => {
    const href = toHref(nextRoute);
    if (window.location.pathname !== href) {
      window.history.pushState(null, '', href);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleSelectReplay = useCallback(
    (meta: BundledReplayMeta) => {
      setSelectedReplayMeta(meta);
      navigate('/workspace');
    },
    [navigate]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F5F1] text-[#171614]">
      <TopNav currentRoute={route} onNavigate={navigate} />

      <div className="flex-1">
        {route === '/' && (
          <LandingScreen
            isOffline={isOffline}
            checkingHealth={checkingHealth}
            reducedMotion={reducedMotion}
            onNavigate={navigate}
            onPlayReplay={handleSelectReplay}
          />
        )}
        {route === '/workspace' && (
          <WorkspaceScreen
            isOffline={isOffline}
            reducedMotion={reducedMotion}
            initialReplayMeta={selectedReplayMeta}
            onNavigate={navigate}
          />
        )}
        {route === '/replays' && (
          <ReplaysScreen isOffline={isOffline} onSelectReplay={handleSelectReplay} />
        )}
        {route === '/benchmarks' && (
          <BenchmarksScreen isOffline={isOffline} onNavigate={navigate} />
        )}
        {route === '/about' && <AboutScreen isOffline={isOffline} />}
      </div>
    </div>
  );
}
