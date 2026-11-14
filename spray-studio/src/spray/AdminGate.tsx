/**
 * The studio is for the team only for now: it checks the site's /admin sign-in (AR_ADMIN_PASSWORD
 * cookie) and otherwise shows a card that signs in and comes back here.
 */
import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { GlassPanel } from '../ui/Glass';

export const AdminGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  useEffect(() => {
    fetch('/api/spray/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => setState(j.admin ? 'in' : 'out'))
      .catch(() => setState('out'));
  }, []);
  if (state === 'in') return <>{children}</>;
  if (state === 'checking')
    return (
      <div className="min-h-[100svh] stage-vignette grid place-items-center">
        <span className="airo-breathe label-caps text-white/40">Checking sign-in…</span>
      </div>
    );
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  return (
    <div className="min-h-[100svh] stage-vignette grid place-items-center p-6">
      <GlassPanel className="max-w-sm w-full p-7 text-center">
        <img src="/brand/evade-logo.webp" alt="EVADE" className="h-8 mx-auto mb-5" />
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-white/10">
          <Lock className="size-5 text-white/80" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold mb-2">Spray Studio is team-only for now</h1>
        <p className="text-sm text-white/60 mb-6">Sign in with the MEDIALIFE admin password to open the studio.</p>
        <a
          href={`/admin/login?next=${next}`}
          className="inline-flex h-12 items-center justify-center rounded-full bg-[#f6c344] px-6 font-semibold text-[#15131a]"
        >
          Sign in
        </a>
      </GlassPanel>
    </div>
  );
};
