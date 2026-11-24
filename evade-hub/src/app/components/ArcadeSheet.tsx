// Bobo's Arcade: every EVADE game and experience in one sheet, shown as arcade cabinets (marquee, screen, control
// panel), plus the hub's own quick games and the EVADE places (globe, collection). The list always comes from
// src/evade/catalog.ts (games.json): nothing is hard-coded here. Opens from the Arcade button, the menu, a machine
// tapped in the 3D / AR hideout (the experience's `arcade` event opens that machine's card), and /evade/hub/?arcade.
//
// Flat colours only. Locked cabinets show the real unlock task; "soon" ones can't be played yet.
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Lock, MapPin, Play, QrCode, Sparkles, X } from 'lucide-react';
import type { PlayGameInfo } from '@/shared/contracts';
import { arcadeState, launch, type ArcadeState } from '@/evade/catalog';
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
  const [items, setItems] = useState<ArcadeState[] | null>(null);
  const [cameFromList, setCameFromList] = useState(false);

  // re-read on every open: an experience may have unlocked something since (local flags)
  useEffect(() => {
    if (!open) return;
    let live = true;
    void arcadeState().then((list) => { if (live) setItems(list); });
    return () => { live = false; };
  }, [open]);
  useEffect(() => { if (!open) setCameFromList(false); }, [open]);

  const item = focus && items ? items.find((i) => i.id === focus) ?? null : null;
  // a machine with an id the catalogue doesn't know: show the whole arcade instead of an empty card
  useEffect(() => { if (focus && items && !item) c.setArcadeFocus(null); }, [focus, items, item, c]);

  return (
    <Dialog open={open} onClose={() => c.closeSheet()} labelledBy="ev-arc-title" className="ev-arcade-dialog">
      {item ? (
        <ArcadeCard item={item} onBack={() => { setCameFromList(false); c.setArcadeFocus(null); }} backLabel={cameFromList ? 'Back to the arcade' : 'See every game'} />
      ) : (
        <ArcadeList items={items} onPick={(id) => { setCameFromList(true); c.setArcadeFocus(id); }} />
      )}
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
  const tally = items ? `${games.length} games · ${open} ready to play` : 'Loading the machines…';

  return (
    <div className="ev-arc">
      <CloseX />
      <Marquee title="Bobo's Arcade" small={tally} />

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

      {places.length > 0 && (
        <section className="ev-arc-sec" aria-labelledby="ev-arc-places">
          <h3 id="ev-arc-places" className="ev-arc-h"><MapPin size={14} aria-hidden="true" /> Around the hideout</h3>
          <ul className="ev-places">
            {places.map((p) => (
              <li key={p.id}>
                <button type="button" className="ev-place" style={accentVars(p.color)} onClick={() => onPick(p.id)}>
                  <img src={p.img} alt="" loading="lazy" decoding="async" />
                  <span className="ev-place-t"><b>{p.name}</b><small>{p.sub}</small></span>
                  <span className="ev-place-go" aria-hidden="true">›</span>
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
  const label = `${item.name}. ${item.sub}.${item.needs ? ` Needs ${item.needs}.` : ''}${state === 'locked' && item.unlock ? ` Locked: ${item.unlock.task} to unlock.` : ''}${state === 'soon' ? ' Coming soon.' : ''}`;
  return (
    <button type="button" className={`ev-cab is-${state}`} style={accentVars(item.color)} onClick={onClick} aria-label={label}>
      <span className="ev-cab-marq"><b>{item.name}</b></span>
      <span className="ev-cab-screen">
        <img src={item.img} alt="" loading="lazy" decoding="async" />
        {state === 'locked' && <span className="ev-cab-lock"><Lock size={18} strokeWidth={2.6} aria-hidden="true" /></span>}
        {state === 'soon' && <span className="ev-cab-soon">Soon</span>}
      </span>
      <span className="ev-cab-panel" aria-hidden="true"><i className="stick" /><i className="b1" /><i className="b2" /></span>
      <span className="ev-cab-sub">{state === 'locked' && item.unlock ? <><Lock size={12} strokeWidth={2.6} aria-hidden="true" /> {item.unlock.task}</> : item.sub}</span>
      {item.needs && state !== 'locked' && <span className="ev-chip">{item.needs}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ one experience's card
function ArcadeCard({ item, onBack, backLabel }: { item: ArcadeState; onBack: () => void; backLabel: string }) {
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
      {state === 'locked' && item.unlock && (
        <p className="ev-card-lock"><Lock size={18} strokeWidth={2.4} aria-hidden="true" /><span><b>Locked.</b> {item.unlock.task} to unlock it.</span></p>
      )}
      <button type="button" className="ev-play" onClick={go} disabled={state !== 'ready' || going} data-autofocus>
        {state === 'ready' ? (going ? 'Opening…' : <><Play size={20} fill="currentColor" aria-hidden="true" /> {item.kind === 'place' ? 'Open' : 'Play'}</>)
          : state === 'locked' ? <><Lock size={18} aria-hidden="true" /> Locked</> : 'Coming soon'}
      </button>
      {desktopNote && state === 'ready' && (
        <p className="ev-card-note"><QrCode size={16} aria-hidden="true" /> On a computer? The game's page shows a QR code to open it on your phone.</p>
      )}
    </div>
  );
}
