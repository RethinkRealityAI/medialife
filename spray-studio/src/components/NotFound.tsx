/**
 * The 404 screen.
 *
 * A mistyped room code is the likely way anyone gets here — `/join/ABC` is
 * one keystroke from `/join/ABCD` — so the page is short, admits nothing is
 * broken, and points at the one door worth opening: a fresh studio (/spray/).
 *
 * **The noindex meta is not cosmetic.** This is a single-page app on Netlify:
 * the SPA fallback answers every unmatched path with `index.html` and a 200,
 * because that is the only way client-side routing can work at all. A crawler
 * that follows a stale or invented link therefore gets a success status for a
 * page that does not exist, and would happily index it. Injecting
 * `<meta name="robots" content="noindex">` while this component is mounted is
 * what tells it otherwise, and removing it on unmount keeps the tag from
 * outliving the route inside a session — the real pages must stay indexable.
 */
import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, SprayCan } from 'lucide-react';
import { GlassPanel } from '../ui/Glass';
import { track } from '../analytics/track';
import { ActivatedBy, EvadeLogo } from '../ui/Brand';

export default function NotFound() {
  const { pathname } = useLocation();

  // One miss is one miss: guarded on the path it last reported, because
  // StrictMode mounts effects twice in development.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (reported.current === pathname) return;
    reported.current = pathname;
    track('notfound', { path: pathname });
  }, [pathname]);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  return (
    <div className="min-h-[100svh] stage-vignette grid place-items-center px-5 text-white">
      <GlassPanel data-testid="not-found" className="w-full max-w-md p-8 text-center">
        <EvadeLogo className="h-7 w-auto mx-auto mb-5" />
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-[15px] bg-[#f6c344] shadow-[3px_3px_0_#15131a] -rotate-6">
          <SprayCan size={20} className="text-[#15131a]" />
        </span>

        <h1 className="paint-title text-[34px] leading-none">Nothing here</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-white/75">
          This wall is blank. If you were joining a studio, check the room code: it is four to eight
          letters and numbers, and capitals matter.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/"
            className="tap flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#f6c344] px-6 py-3 text-[14px] font-bold text-[#15131a] shadow-[0_4px_0_#b98d1f]"
          >
            Open a studio
            <ArrowRight size={15} />
          </Link>
        </div>
        <ActivatedBy className="h-9 w-auto mx-auto mt-7" />
      </GlassPanel>
    </div>
  );
}
