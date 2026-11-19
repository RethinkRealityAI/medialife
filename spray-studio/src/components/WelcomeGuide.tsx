/**
 * First-join welcome guide.
 *
 * A one-shot "how it works" modal shown the first time someone lands in a
 * session. Two variants share one skeleton:
 *
 *   controller — the phone. Explains the ways to paint (Aim / Paint / Pad, the
 *                last one only when its flag is on), plus a row of quick tips.
 *   studio     — the big screen. Pick a piece of merch, spray it, bring phones
 *                in with the QR, save to get a share link.
 *
 * The mounting side owns first-run persistence; this component only renders
 * when told to and calls `onClose` when the player is ready.
 *
 * Every card carries a small flat inline SVG illustration (no screenshots, no
 * gradients), drawn in the card's accent with ink outlines like the Spray Bobo
 * splash art.
 */
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crosshair, Pencil, Square, Undo2, Redo2, Palette, ChevronDown, Droplets, Smartphone,
  MousePointer, QrCode, Share2, Shirt, SprayCan, X, Keyboard, Sticker, Library,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFlags } from '../config/flags';
import { ActivatedBy, EvadeLogo } from '../ui/Brand';

/* ------------------------------------------------------------------
   Content
   ------------------------------------------------------------------ */

type Art = 'merch' | 'spray' | 'phone' | 'share' | 'aim' | 'touch' | 'pad';

interface GuideCard {
  /** Small accent-coloured caps label — the mode name / step number. */
  tag: string;
  headline: string;
  body: string;
  icon: LucideIcon;
  accent: string;
  art: Art;
}

interface GuideTip {
  icons: LucideIcon[];
  label: string;
}

const YELLOW = '#F6C344';
const BLUE = '#3F9BE6';
const SKY = '#8CC8F8';
const MAGENTA = '#E85BD8';
const GREEN = '#3DDC84';
const INK = '#15131A';

const CONTROLLER_CARDS: GuideCard[] = [
  {
    tag: 'Aim',
    headline: 'Your phone is the can',
    body: 'Point your phone at the big screen and hold your thumb down to spray. The paint lands where you point. Tap Recentre if your aim drifts.',
    icon: Crosshair,
    accent: YELLOW,
    art: 'aim',
  },
  {
    tag: 'Paint',
    headline: 'Paint with your finger',
    body: 'Spray the merch right here on your phone. One finger paints, two fingers turn it and zoom.',
    icon: Pencil,
    accent: SKY,
    art: 'touch',
  },
  {
    tag: 'Pad',
    headline: 'Flat pad',
    body: 'A flat pad laid over the whole piece. Handy for neat fills.',
    icon: Square,
    accent: MAGENTA,
    art: 'pad',
  },
];

const CONTROLLER_TIPS: GuideTip[] = [
  { icons: [Smartphone], label: 'Shake your phone to recentre' },
  { icons: [Undo2, Redo2], label: 'Undo and redo' },
  { icons: [Palette], label: 'Tap the colour button to swap caps' },
  { icons: [ChevronDown], label: 'Hide the tools for more room' },
  { icons: [Droplets], label: 'Hold still to make drips' },
];

const STUDIO_CARDS: GuideCard[] = [
  {
    tag: '01',
    headline: 'Pick your merch',
    body: 'Choose a piece from the list. Drag with the right mouse button (or two fingers) to spin it round.',
    icon: Shirt,
    accent: YELLOW,
    art: 'merch',
  },
  {
    tag: '02',
    headline: 'Spray it',
    body: 'Drag with your mouse or finger to spray. Pick a colour, or switch to the brush for clean lines.',
    icon: MousePointer,
    accent: SKY,
    art: 'spray',
  },
  {
    tag: '03',
    headline: 'Use your phone',
    body: 'Scan the QR code with your phone camera and it turns into a spray can. Up to four friends can paint at once.',
    icon: QrCode,
    accent: MAGENTA,
    art: 'phone',
  },
  {
    tag: '04',
    headline: 'Save and share',
    body: 'Done? Tap Save & share to get a link and a QR code for your piece.',
    icon: Share2,
    accent: GREEN,
    art: 'share',
  },
];

const STUDIO_TIPS: GuideTip[] = [
  { icons: [Undo2, Redo2], label: 'Ctrl+Z / Ctrl+Shift+Z to undo and redo' },
  { icons: [Keyboard], label: 'Press B to swap spray and brush' },
  { icons: [Sticker], label: 'Decals: tap one to stick it on, drag to move' },
];
/** Staff only (not on the kiosk): the asset library. */
const ASSETS_TIP: GuideTip = { icons: [Library], label: 'Assets: drag models, pictures or video onto the print' };

/* ------------------------------------------------------------------
   Illustrations: flat shapes, ink outlines, one accent per card.
   ------------------------------------------------------------------ */

const SPLAT = 'M0-14c4 0 4 5 8 4s5-4 7-1-2 6 0 9 6 4 4 7-7 0-9 3-1 7-5 7-3-5-6-5-6 4-9 1 1-6-1-8-7-2-7-6 6-3 6-6-4-5-1-8 6 2 7-2z';

const GuideArt: React.FC<{ art: Art; accent: string }> = ({ art, accent }) => {
  const stroke = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 120 80" className="w-full h-full" aria-hidden>
      {art === 'merch' && (
        <>
          <rect x="34" y="8" width="48" height="64" rx="7" fill="#fff" {...stroke} transform="rotate(-6 58 40)" />
          <path transform="translate(56 38) scale(1.1)" d={SPLAT} fill={accent} />
          <circle cx="74" cy="22" r="4" fill={BLUE} />
          <path d="M92 30a14 14 0 0 1 0 22" fill="none" {...stroke} />
          <path d="M88 50l4 3 3-4" fill="none" {...stroke} />
        </>
      )}
      {art === 'spray' && (
        <>
          <rect x="18" y="14" width="44" height="58" rx="6" fill="#fff" {...stroke} />
          <path d="M26 54c8-10 16 4 28-10" fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round" />
          <circle cx="58" cy="30" r="3" fill={accent} />
          <circle cx="52" cy="24" r="2" fill={accent} />
          <path d="M72 46l14-14 6 2 10 22-8 8-22-10z" fill={YELLOW} {...stroke} />
          <path d="M70 46l6 6" {...stroke} />
        </>
      )}
      {art === 'phone' && (
        <>
          <rect x="16" y="10" width="40" height="60" rx="8" fill="#fff" {...stroke} />
          <rect x="24" y="22" width="24" height="24" fill={INK} />
          <rect x="28" y="26" width="7" height="7" fill="#fff" />
          <rect x="37" y="35" width="7" height="7" fill="#fff" />
          <rect x="28" y="37" width="5" height="5" fill={accent} />
          <rect x="72" y="20" width="26" height="48" rx="6" fill={accent} {...stroke} />
          <rect x="78" y="12" width="14" height="10" rx="3" fill="#fff" {...stroke} />
          <circle cx="60" cy="16" r="3" fill={accent} />
          <circle cx="66" cy="10" r="2" fill={accent} />
        </>
      )}
      {art === 'share' && (
        <>
          <rect x="22" y="12" width="40" height="56" rx="6" fill="#fff" {...stroke} />
          <path transform="translate(42 40)" d={SPLAT} fill={YELLOW} />
          <circle cx="84" cy="22" r="8" fill={accent} {...stroke} />
          <circle cx="98" cy="52" r="8" fill={SKY} {...stroke} />
          <circle cx="74" cy="60" r="8" fill={MAGENTA} {...stroke} />
          <path d="M66 36l12-8M66 46l24 6M66 52l2 4" fill="none" {...stroke} />
        </>
      )}
      {art === 'aim' && (
        <>
          <rect x="62" y="10" width="44" height="34" rx="4" fill="#fff" {...stroke} />
          <path transform="translate(84 27) scale(.8)" d={SPLAT} fill={accent} />
          <rect x="18" y="38" width="22" height="36" rx="6" fill={accent} {...stroke} transform="rotate(-24 29 56)" />
          <path d="M40 40l18-10" fill="none" stroke={accent} strokeWidth="4" strokeDasharray="2 6" strokeLinecap="round" />
        </>
      )}
      {art === 'touch' && (
        <>
          <rect x="38" y="6" width="44" height="68" rx="9" fill="#fff" {...stroke} />
          <path transform="translate(60 38)" d={SPLAT} fill={accent} />
          <circle cx="72" cy="52" r="9" fill={YELLOW} {...stroke} />
        </>
      )}
      {art === 'pad' && (
        <>
          <rect x="22" y="12" width="76" height="56" rx="8" fill="#fff" {...stroke} />
          <path d="M34 50l14-14 12 10 18-20" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
};

/* ------------------------------------------------------------------
   Pieces
   ------------------------------------------------------------------ */

const cardSpring = { type: 'spring', stiffness: 420, damping: 34 } as const;

const ModeCard: React.FC<{
  card: GuideCard;
  index: number;
  stacked: boolean;
}> = ({ card, index, stacked }) => {
  const Icon = card.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...cardSpring, delay: 0.12 + index * 0.07 }}
      className={`relative rounded-2xl bg-white/[0.05] border border-white/12 overflow-hidden ${
        stacked ? 'flex flex-col' : 'flex items-stretch'
      }`}
    >
      <div
        className={`shrink-0 grid place-items-center ${stacked ? 'h-[92px] w-full' : 'w-[92px]'}`}
        style={{ background: `${card.accent}26` }}
      >
        <div className={stacked ? 'h-[76px] w-[114px]' : 'h-[62px] w-[84px]'}>
          <GuideArt art={card.art} accent={card.accent} />
        </div>
      </div>
      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex items-center gap-2 mb-1">
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
            style={{ background: card.accent }}
          >
            <Icon size={13} style={{ color: INK }} />
          </span>
          <span className="label-caps" style={{ color: card.accent }}>
            {card.tag}
          </span>
        </div>
        <h3 className="text-[15px] font-bold text-white leading-tight mb-1">{card.headline}</h3>
        <p className="text-[13px] leading-relaxed text-white/75">{card.body}</p>
      </div>
    </motion.div>
  );
};

/* ------------------------------------------------------------------
   WelcomeGuide
   ------------------------------------------------------------------ */

export const WelcomeGuide: React.FC<{
  open: boolean;
  onClose: () => void;
  role: 'studio' | 'controller';
  /** Show the Assets line (the studio, not the kiosk). */
  assets?: boolean;
}> = ({ open, onClose, role, assets }) => {
  const isStudio = role === 'studio';
  const flags = useFlags();
  // Filtered at render, not at the source: the Pad card is written and ready,
  // and the day the owner switches Pad back on it reappears in the guide.
  const cards = (isStudio ? STUDIO_CARDS : CONTROLLER_CARDS).filter(
    (card) => card.tag !== 'Pad' || flags.ui.padMode
  );
  const tips = isStudio ? (assets ? [...STUDIO_TIPS, ASSETS_TIP] : STUDIO_TIPS) : CONTROLLER_TIPS;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const title = isStudio ? 'Welcome to Spray Studio' : 'You are the spray can';
  const subtitle = isStudio
    ? 'Spray your own take on EVADE merch. Here is how it works.'
    : 'Paint the big screen from your phone. Switch modes any time at the top.';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
          initial="hidden"
          animate="shown"
          exit="hidden"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Backdrop */}
          <motion.div
            variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          <motion.div
            variants={{
              hidden: { opacity: 0, scale: 0.92, y: 18 },
              shown: { opacity: 1, scale: 1, y: 0 },
            }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={`relative w-full ${
              isStudio ? 'max-w-4xl' : 'max-w-md'
            } glass-modal rounded-3xl overflow-hidden flex flex-col max-h-[88vh]`}
          >
            {/* ------------------------------ header ------------------------------ */}
            <header className="relative shrink-0 px-5 sm:px-6 pt-5 pb-4 flex items-start gap-3.5">
              <motion.div
                initial={{ scale: 0.6, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: -6, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.05 }}
                className="w-11 h-11 rounded-[14px] bg-[#F6C344] grid place-items-center shadow-[3px_3px_0_#15131a] shrink-0"
              >
                <SprayCan size={21} className="text-[#15131a]" />
              </motion.div>

              <div className="flex-1 min-w-0 pt-0.5">
                <EvadeLogo className="h-5 w-auto mb-1.5" />
                <h2 className="paint-title text-[24px] sm:text-[28px] leading-tight">{title}</h2>
                <p className="text-[13px] text-white/70 mt-1 leading-snug">{subtitle}</p>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close guide"
                className="tap glass rounded-full w-11 h-11 grid place-items-center text-white/80 hover:text-white shrink-0"
              >
                <X size={16} />
              </button>
            </header>

            {/* ------------------------------ body ------------------------------ */}
            <div className="relative flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 pb-5">
              <div className={isStudio ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'flex flex-col gap-3'}>
                {cards.map((card, index) => (
                  <ModeCard key={card.tag} card={card} index={index} stacked={isStudio} />
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...cardSpring, delay: 0.12 + cards.length * 0.07 }}
                className="mt-4"
              >
                <div className="label-caps text-white/60 mb-2">Quick tips</div>
                <div className="flex flex-wrap gap-1.5">
                  {tips.map((tip) => (
                    <span
                      key={tip.label}
                      className="rounded-full border border-white/12 bg-white/[0.06] pl-2.5 pr-3 py-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-white/85"
                    >
                      {tip.icons.map((TipIcon, iconIndex) => (
                        <TipIcon key={iconIndex} size={12} className="text-[#F6C344] shrink-0" />
                      ))}
                      {tip.label}
                    </span>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* ------------------------------ footer ------------------------------ */}
            <footer className="relative shrink-0 px-5 sm:px-6 pt-3 pb-5 safe-bottom border-t border-white/[0.08] flex flex-col sm:flex-row items-center gap-3">
              <motion.button
                type="button"
                onClick={onClose}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...cardSpring, delay: 0.24 }}
                className="paint-btn tap w-full sm:flex-1 min-h-12 py-4 px-10 text-[#15131a] text-[15px] font-bold tracking-wide flex items-center justify-center gap-2"
                style={{ '--paint': YELLOW } as React.CSSProperties}
              >
                <SprayCan size={16} />
                Let's paint
              </motion.button>
              <ActivatedBy className="h-7 sm:h-9 w-auto shrink-0" />
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeGuide;
