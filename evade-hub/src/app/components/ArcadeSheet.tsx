// Bobo's Arcade: every EVADE game and experience in one sheet, shown as arcade cabinets (marquee, screen, control
// panel), plus the hub's own quick games and the EVADE places (globe, collection). The list always comes from
// src/evade/catalog.ts (games.json): nothing is hard-coded here. Opens from the Arcade button, the menu, a machine
// tapped in the 3D / AR hideout (the experience's `arcade` event opens that machine's card), and /evade/hub/?arcade.
//
// Flat colours only. Locked cabinets say how to open them (merch code or a mission, from src/evade/unlocks.ts);
// "soon" ones can't be played yet. The same sheet holds the unlock form (code + email) and the unlock moment.
// The team copy (/labs/evade-hub/) has nothing locked and says so.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, KeyRound, Lock, LogOut, MapPin, Play, QrCode, Sparkles, Trophy, Users, X } from 'lucide-react';
import type { PlayGameInfo } from '@/shared/contracts';
import { arcadeState, launch, type ArcadeState } from '@/evade/catalog';
import {
  CHALLENGES, PRODUCTS, TEAM, challengeDone, claimCode, formatCode, markSeen, missionsDone, normalizeCode,
  onUnlocksChange, ownedProducts, signOut, signedInEmail, type WayState,
} from '@/evade/unlocks';
import { IS_PHONE } from '@/experience/core/device';
import { useApp, useController } from '../context';
import { Dialog } from './Dialog';
import './arcade.css';

/** Best score key the experience writes for its quick games (src/experience/play/game.ts). */
const bestOf = (id: string): number => {
  try { return Math.max(0, Number(localStorage.getItem(`cbx.play.best.${id}`)) || 0); } catch { return 0; }
};

/** A flat accent that reads on the dark sheet: dark accents (EVADE blue, indigo) are lifted toward white. */
function readable(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#f6c344';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  if (L >= 0.2) return hex;
  const k = 0.45;
  const mix = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

/** Ink or white text on a flat accent fill. */
function onFill(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#15131a';
  const n = parseInt(m[1], 16);
  const y = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return y > 150 ? '#15131a' : '#ffffff';
}

const accentVars = (color: string) => ({ '--ac': color, '--ac-text': readable(color), '--ac-on': onFill(color) }) as React.CSSProperties;

export function ArcadeSheet() {
  const c = useController();
  const open = useApp((s) => s.sheetOpen && s.tab === 'games');
  const focus = useApp((s) => s.arcadeFocus);
  const form = useApp((s) => s.unlockForm);
  const party = useApp((s) => s.celebrate);
  const [items, setItems] = useState<ArcadeState[] | null>(null);
  const [cameFromList, setCameFromList] = useState(false);
  const [rev, setRev] = useState(0);

  // re-read on every open, and whenever what's unlocked changes (a code claimed, rules arrived)
  useEffect(() => onUnlocksChange(() => setRev((n) => n + 1)), []);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void arcadeState().then((list) => { if (live) setItems(list); });
    return () => { live = false; };
  }, [open, rev]);
  useEffect(() => { if (!open) setCameFromList(false); }, [open]);

  const item = focus && items ? items.find((i) => i.id === focus) ?? null : null;
  // a machine with an id the catalogue doesn't know: show the whole arcade instead of an empty card
  useEffect(() => { if (focus && items && !item) c.setArcadeFocus(null); }, [focus, items, item, c]);

  // each view starts at its top (the sheet keeps its scroll otherwise: a form half under the fold)
  const viewKey = party ? 'party' : form ? 'form' : item ? `card-${item.id}` : 'list';
  useEffect(() => {
    const d = document.querySelector<HTMLElement>('dialog.ev-arcade-dialog');
    if (d) d.scrollTop = 0;
  }, [viewKey]);

  const view = party ? (
    <Celebrate ids={party.ids} why={party.why} items={items} />
  ) : form ? (
    <UnlockForm code={form.code} auto={form.auto} items={items} />
  ) : item ? (
    <ArcadeCard item={item} items={items} onBack={() => { setCameFromList(false); c.setArcadeFocus(null); }} backLabel={cameFromList ? 'Back to the arcade' : 'See every game'} />
  ) : (
    <ArcadeList items={items} onPick={(id) => { setCameFromList(true); c.setArcadeFocus(id); }} />
  );
  return (
    <Dialog open={open} onClose={() => c.closeSheet()} labelledBy="ev-arc-title" className="ev-arcade-dialog" lightDismiss={!form}>
      {view}
    </Dialog>
  );
}

function Marquee({ title, small }: { title: string; small?: string }) {
  return (
    <header className="ev-arc-marquee">
      <span className="ev-arc-lights" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--k': i } as React.CSSProperties} />)}</span>
      <h2 id="ev-arc-title">{title}</h2>
      {small && <p className="ev-arc-tally">{small}</p>}
      <span className="ev-arc-lights is-bottom" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--k': 13 - i } as React.CSSProperties} />)}</span>
    </header>
  );
}

function CloseX() {
  const c = useController();
  return (
    <button type="button" className="ev-arc-x" onClick={() => c.closeSheet()} aria-label="Close Bobo's Arcade">
      <X size={22} aria-hidden="true" />
    </button>
  );
}

// ------------------------------------------------------------------ the list
function ArcadeList({ items, onPick }: { items: ArcadeState[] | null; onPick: (id: string) => void }) {
  const c = useController();
  const quick: readonly PlayGameInfo[] = c.experience?.playGames ?? [];
  const games = useMemo(() => (items ?? []).filter((i) => i.kind === 'game'), [items]);
  const places = useMemo(() => (items ?? []).filter((i) => i.kind === 'place'), [items]);
  const open = games.filter((g) => !g.locked && !g.soon).length;
  const tally = !items ? 'Loading the machines…' : TEAM ? `${games.length} games · team view, all open` : `${open} of ${games.length} machines open`;

  return (
    <div className="ev-arc">
      <CloseX />
      <Marquee title="Bobo's Arcade" small={tally} />
      {items && !TEAM && <Progress games={games} />}
      {TEAM ? <TeamNote /> : items && <Keys />}

      {quick.length > 0 && (
        <section className="ev-arc-sec" aria-labelledby="ev-arc-quick">
          <h3 id="ev-arc-quick" className="ev-arc-h"><Sparkles size={14} aria-hidden="true" /> Quick play in the hideout</h3>
          <div className="ev-arc-quick">
            {quick.map((g) => {
              const best = bestOf(g.id);
              const color = g.color || '#4fd6e8';
              return (
                <button key={g.id} type="button" className="ev-quick" style={accentVars(color)} onClick={() => void c.startQuickGame(g.id)}
                  aria-label={`${g.label}. ${g.lead}${best ? ` Best ${best}.` : ''} Play here`}>
                  {g.icon
                    ? <span className="ev-quick-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: g.icon }} />
                    : <span className="ev-quick-ic" aria-hidden="true"><Play size={20} fill="currentColor" /></span>}
                  <span className="ev-quick-t"><b>{g.label}</b><small>{g.lead}</small></span>
                  {best > 0 && <span className="ev-quick-best" aria-hidden="true">Best {best}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="ev-arc-sec" aria-labelledby="ev-arc-games">
        <h3 id="ev-arc-games" className="ev-arc-h">The machines</h3>
        {!items && <div className="ev-arc-loading" aria-hidden="true"><i /><i /><i /><i /></div>}
        <ul className="ev-cabs">
          {games.map((g, i) => (
            <li key={g.id} style={{ '--i': i } as React.CSSProperties}>
              <Cabinet item={g} onClick={() => onPick(g.id)} />
            </li>
          ))}
        </ul>
      </section>

      {!TEAM && items && <Missions items={items} onPick={onPick} />}

      {places.length > 0 && (
        <section className="ev-arc-sec" aria-labelledby="ev-arc-places">
          <h3 id="ev-arc-places" className="ev-arc-h"><MapPin size={14} aria-hidden="true" /> Around the hideout</h3>
          <ul className="ev-places">
            {places.map((p) => (
              <li key={p.id}>
                <button type="button" className={`ev-place${p.locked ? ' is-locked' : ''}`} style={accentVars(p.color)} onClick={() => onPick(p.id)}>
                  <img src={p.img} alt="" loading="lazy" decoding="async" />
                  <span className="ev-place-t"><b>{p.name}</b><small>{p.locked ? waysLine(p.access.ways, p.access.note) : p.sub}</small></span>
                  <span className="ev-place-go" aria-hidden="true">{p.locked ? <Lock size={16} /> : '›'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="ev-arc-foot">Each game opens in its own page. Its home button brings you back here.</p>
    </div>
  );
}

/** One machine in the grid: marquee with the name, the screen (thumbnail), the control panel, the line under it. */
function Cabinet({ item, onClick }: { item: ArcadeState; onClick: () => void }) {
  const state = item.soon ? 'soon' : item.locked ? 'locked' : 'ready';
  const how = waysLine(item.access.ways, item.access.note);
  const label = `${item.name}. ${item.sub}.${item.needs ? ` Needs ${item.needs}.` : ''}${state === 'locked' ? ` Locked. To unlock: ${how}.` : ''}${state === 'soon' ? ' Coming soon.' : ''}`;
  return (
    <button type="button" className={`ev-cab is-${state}`} style={accentVars(item.color)} onClick={onClick} aria-label={label}>
      <span className="ev-cab-marq"><b>{item.name}</b></span>
      <span className="ev-cab-screen">
        <img src={item.img} alt="" loading="lazy" decoding="async" />
        {state === 'locked' && <span className="ev-cab-lock"><Lock size={18} strokeWidth={2.6} aria-hidden="true" /></span>}
        {state === 'soon' && <span className="ev-cab-soon">Soon</span>}
      </span>
      <span className="ev-cab-panel" aria-hidden="true"><i className="stick" /><i className="b1" /><i className="b2" /></span>
      <span className="ev-cab-sub">{state === 'locked' ? <><Lock size={12} strokeWidth={2.6} aria-hidden="true" /> {how}</> : item.sub}</span>
      {item.needs && state !== 'locked' && <span className="ev-chip">{item.needs}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ one experience's card
function ArcadeCard({ item, items, onBack, backLabel }: { item: ArcadeState; items: ArcadeState[] | null; onBack: () => void; backLabel: string }) {
  const c = useController();
  const [going, setGoing] = useState(false);
  const state = item.soon ? 'soon' : item.locked ? 'locked' : 'ready';
  const desktopNote = !IS_PHONE && item.kind === 'game';
  const go = () => {
    if (state !== 'ready' || going) return;
    setGoing(true);
    try { navigator.vibrate?.(8); } catch { /* not allowed */ }
    launch(item);
  };
  return (
    <div className={`ev-arc ev-card is-${state}`} style={accentVars(item.color)}>
      <CloseX />
      <button type="button" className="ev-arc-back" onClick={onBack}><ChevronLeft size={18} aria-hidden="true" /> {backLabel}</button>
      <div className="ev-card-cab">
        <div className="ev-card-marq"><span className="ev-arc-lights" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--k': i } as React.CSSProperties} />)}</span><h2 id="ev-arc-title">{item.name}</h2></div>
        <div className="ev-card-screen">
          <img src={item.img} alt="" decoding="async" />
          {state === 'locked' && <span className="ev-cab-lock is-big"><Lock size={30} strokeWidth={2.4} aria-hidden="true" /></span>}
          {state === 'soon' && <span className="ev-cab-soon is-big">Coming soon</span>}
        </div>
        <div className="ev-cab-panel is-big" aria-hidden="true"><i className="stick" /><i className="b1" /><i className="b2" /><i className="b3" /></div>
      </div>
      <p className="ev-card-sub">{item.sub}</p>
      <div className="ev-card-chips">
        <span className="ev-chip is-kind">{item.kind === 'place' ? 'Place' : 'Game'}</span>
        {item.needs && <span className="ev-chip">Needs: {item.needs}</span>}
      </div>
      {state === 'locked' && (
        <HowToUnlock item={item} items={items} onCode={() => c.openUnlock('')} onPick={(id) => c.setArcadeFocus(id)} />
      )}
      {state !== 'locked' && (
        <button type="button" className="ev-play" onClick={go} disabled={state !== 'ready' || going} data-autofocus>
          {state === 'ready' ? (going ? 'Opening…' : <><Play size={20} fill="currentColor" aria-hidden="true" /> {item.kind === 'place' ? 'Open' : 'Play'}</>) : 'Coming soon'}
        </button>
      )}
      {desktopNote && state === 'ready' && (
        <p className="ev-card-note"><QrCode size={16} aria-hidden="true" /> On a computer? The game's page shows a QR code to open it on your phone.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ unlocking
/** "Got the keychain or Win Cola Run" (the ways not done yet, short). */
function waysLine(ways: WayState[], note?: string): string {
  if (note) return note;
  const open = ways.filter((w) => !w.done);
  if (!open.length) return 'Unlocked';
  return open.map((w) => w.short).join(' or ');
}

/** The machine's rule as steps: any one of them opens it. Each step has its one action. */
function HowToUnlock({ item, items, onCode, onPick }: { item: ArcadeState; items: ArcadeState[] | null; onCode: () => void; onPick: (id: string) => void }) {
  const ways = item.access.ways;
  return (
    <section className="ev-how" aria-labelledby="ev-how-h">
      <h3 id="ev-how-h"><Lock size={16} strokeWidth={2.6} aria-hidden="true" /> {ways.length > 1 ? 'Unlock it: do any one of these' : 'Unlock it'}</h3>
      {item.access.note && <p className="ev-how-note">{item.access.note}</p>}
      <ol>
        {ways.map((w, i) => {
          const target = w.play ? items?.find((x) => x.id === w.play) : null;
          return (
            <li key={i} className={w.done ? 'is-done' : ''}>
              <span className="ev-how-ic" aria-hidden="true">{w.way.kind === 'merch' ? <QrCode size={18} /> : <Trophy size={18} />}</span>
              <span className="ev-how-t">
                <b>{w.way.kind === 'merch' ? 'Merch' : 'Mission'}</b>
                {w.label}
              </span>
              {w.way.kind === 'merch' ? (
                w.released ? <button type="button" className="ev-how-go" onClick={onCode} data-autofocus={i === 0 || undefined}><KeyRound size={16} aria-hidden="true" /> Enter code</button>
                  : <span className="ev-how-soon">Soon</span>
              ) : target ? (
                target.locked ? <button type="button" className="ev-how-go is-ghost" onClick={() => onPick(target.id)}><Lock size={14} aria-hidden="true" /> {target.name}</button>
                  : <button type="button" className="ev-how-go" onClick={() => launch(target)}><Play size={15} fill="currentColor" aria-hidden="true" /> Play</button>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="ev-how-foot">Missions count on this phone. Merch codes work on any phone you sign in on.</p>
    </section>
  );
}

/** One flat segment per machine: gold = open. */
function Progress({ games }: { games: ArcadeState[] }) {
  return (
    <div className="ev-prog" aria-hidden="true">
      {games.map((g) => <i key={g.id} className={g.soon ? 'is-soon' : g.locked ? '' : 'is-on'} />)}
    </div>
  );
}

function TeamNote() {
  return (
    <p className="ev-team"><Users size={16} aria-hidden="true" /><span><b>Team view.</b> Every machine is open here. Fans get the locked version at <a href="/evade/hub/?arcade">/evade/hub/</a>.</span></p>
  );
}

/** The fan's merch: what they've unlocked, and the way to add a code. */
function Keys() {
  const c = useController();
  const owned = ownedProducts();
  const email = signedInEmail();
  const mine = PRODUCTS.filter((p) => owned.has(p.id));
  if (!mine.length) {
    return (
      <button type="button" className="ev-keys is-empty" onClick={() => c.openUnlock('')}>
        <img src="/merch/keychain-qr.webp" alt="" loading="lazy" decoding="async" />
        <span><b>Got EVADE merch?</b><small>Scan the QR on it, or type the code from its card, to open more machines.</small></span>
        <span className="ev-keys-go"><KeyRound size={18} aria-hidden="true" /> Unlock</span>
      </button>
    );
  }
  return (
    <div className="ev-keys">
      <span className="ev-keys-h"><KeyRound size={14} aria-hidden="true" /> Your merch</span>
      <ul>
        {mine.map((p) => <li key={p.id}><Check size={14} strokeWidth={3} aria-hidden="true" /> {p.name}</li>)}
      </ul>
      <div className="ev-keys-row">
        <button type="button" className="ev-how-go" onClick={() => c.openUnlock('')}><KeyRound size={16} aria-hidden="true" /> Add a code</button>
        {email && <button type="button" className="ev-link" onClick={() => signOut()}><LogOut size={14} aria-hidden="true" /> Not {email.replace(/^(.).*(@.*)$/, '$1•••$2')}? Sign out</button>}
      </div>
    </div>
  );
}

/** Every mission: done or not, and what it opens. Tap = go and do it. */
function Missions({ items, onPick }: { items: ArcadeState[]; onPick: (id: string) => void }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const opens = (id: string) => items.filter((i) => i.access.ways.some((w) => w.way.kind === 'challenge' && w.way.id === id));
  const list = CHALLENGES.filter((ch) => opens(ch.id).length);
  if (!list.length) return null;
  const done = list.filter((ch) => challengeDone(ch.id)).length;
  return (
    <section className="ev-arc-sec" aria-labelledby="ev-arc-missions">
      <h3 id="ev-arc-missions" className="ev-arc-h"><Trophy size={14} aria-hidden="true" /> Missions · {done} of {list.length} done</h3>
      <ul className="ev-missions">
        {list.map((ch) => {
          const ok = challengeDone(ch.id);
          const target = ch.play ? byId.get(ch.play) : null;
          const what = opens(ch.id).map((i) => i.name).join(', ');
          const progress = ch.count ? ` (${Math.min(ch.count, missionsDone())}/${ch.count})` : '';
          return (
            <li key={ch.id}>
              <button type="button" className={`ev-mission${ok ? ' is-done' : ''}`} disabled={ok}
                onClick={() => { if (target && !target.locked && !target.soon) launch(target); else if (target) onPick(target.id); }}>
                <span className="ev-mission-tick" aria-hidden="true">{ok ? <Check size={16} strokeWidth={3} /> : null}</span>
                <span className="ev-mission-t"><b>{ch.task}{progress}</b><small>{ok ? 'Done' : 'Opens'} {what}</small></span>
                {!ok && target && <span className="ev-mission-go" aria-hidden="true">{target.locked ? <Lock size={14} /> : <Play size={14} fill="currentColor" />}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Code + email. The same claim as the Collector Hub: first email to use a code owns it; email + code signs in again. */
function UnlockForm({ code: code0, auto, items }: { code: string; auto: boolean; items: ArcadeState[] | null }) {
  const c = useController();
  const [code, setCode] = useState(code0);
  const [email, setEmail] = useState(signedInEmail() ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: 'code' | 'email' } | null>(null);
  const sent = useRef(false);
  const before = useRef<Set<string> | null>(null);
  useEffect(() => { if (items && !before.current) before.current = new Set(items.filter((i) => !i.locked).map((i) => i.id)); }, [items]);

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    if (!before.current) before.current = new Set((await arcadeState()).filter((i) => !i.locked).map((i) => i.id));
    const r = await claimCode(code, email);
    setBusy(false);
    if (!r.ok) { setErr({ text: r.message, field: r.field }); return; }
    const now = await arcadeState();
    const fresh = now.filter((i) => !i.locked && !i.soon && !before.current!.has(i.id)).map((i) => i.id);
    markSeen(now.filter((i) => !i.locked).map((i) => i.id));
    if (fresh.length) c.celebrate(fresh, r.firstClaim ? `${r.code} is yours` : 'Welcome back');
    else {
      c.closeUnlock();
      c.showToast('found', r.firstClaim ? `${r.code} is yours. Nothing new to open with it yet.` : 'Signed in. Your merch is on this phone now.', 4200);
    }
  };
  useEffect(() => {
    if (auto && !sent.current && normalizeCode(code0) && email) { sent.current = true; void submit(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const pretty = (v: string) => {
    const n = normalizeCode(v);
    return n ? formatCode(n) : v.toUpperCase();
  };
  return (
    <div className="ev-arc ev-unlock">
      <CloseX />
      <button type="button" className="ev-arc-back" onClick={() => c.closeUnlock()}><ChevronLeft size={18} aria-hidden="true" /> Back to the arcade</button>
      <Marquee title="Unlock with your merch" />
      <figure className="ev-unlock-art">
        <img src="/merch/keychain-qr.webp" alt="The back of the Eclipse can keychain, with its Scan to activate QR code" decoding="async" />
        <figcaption>Scan the QR on your merch, or type the code from the card in the box.</figcaption>
      </figure>
      <form className="ev-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <label htmlFor="ev-code">Your code</label>
        <input id="ev-code" name="code" value={code} onChange={(e) => setCode(e.target.value)} onBlur={() => setCode(pretty(code))}
          placeholder="BOBO-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text" maxLength={20}
          aria-invalid={err?.field === 'code'} aria-describedby={err?.field === 'code' ? 'ev-form-err' : undefined} data-autofocus={!code0 || undefined} />
        <label htmlFor="ev-email">Your email</label>
        <input id="ev-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          autoComplete="email" inputMode="email" aria-invalid={err?.field === 'email'} aria-describedby="ev-email-hint" data-autofocus={(!!code0 && !email) || undefined} />
        <p id="ev-email-hint" className="ev-form-hint">Your code is linked to this email for good. Use the same two to sign in on another phone.</p>
        {err && <p id="ev-form-err" className="ev-form-err" role="alert">{err.text}</p>}
        <button type="submit" className="ev-play" disabled={busy || !code.trim() || !email.trim()}>
          {busy ? 'Unlocking…' : <><KeyRound size={20} aria-hidden="true" /> Unlock</>}
        </button>
      </form>
      <p className="ev-arc-foot">For fans 13 and up. We only use your email to link your merch and sign you in.</p>
    </div>
  );
}

/** The unlock moment: the new machines light up one by one, padlocks pop, flat confetti. */
function Celebrate({ ids, why, items }: { ids: string[]; why: string; items: ArcadeState[] | null }) {
  const c = useController();
  const list = (items ?? []).filter((i) => ids.includes(i.id));
  const first = list.find((i) => i.kind === 'game') ?? list[0];
  useEffect(() => { markSeen(ids); }, [ids]);
  return (
    <div className="ev-arc ev-party">
      <CloseX />
      <span className="ev-confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--k': i } as React.CSSProperties} />)}</span>
      <Marquee title="Unlocked!" small={why} />
      <p className="ev-party-lead">{list.length === 1 ? 'A new machine is open in Bobo\'s Arcade.' : `${list.length} new machines are open in Bobo's Arcade.`}</p>
      <ul className="ev-party-list">
        {list.map((it, i) => (
          <li key={it.id} style={{ ...accentVars(it.color), '--i': i } as React.CSSProperties}>
            <span className="ev-party-screen"><img src={it.img} alt="" decoding="async" /><span className="ev-party-lock" aria-hidden="true"><Lock size={22} strokeWidth={2.6} /></span></span>
            <span className="ev-party-t"><b>{it.name}</b><small>{it.sub}</small></span>
          </li>
        ))}
      </ul>
      {first && (
        <button type="button" className="ev-play" onClick={() => launch(first)} data-autofocus>
          <Play size={20} fill="currentColor" aria-hidden="true" /> {first.kind === 'place' ? `Open ${first.name}` : `Play ${first.name}`}
        </button>
      )}
      <button type="button" className="ev-arc-back is-wide" onClick={() => c.endCelebrate()}>See every machine</button>
    </div>
  );
}
