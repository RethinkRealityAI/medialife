// Friendly names, icons and flat colours for the trigger words (quick-action buttons, chat lines, game words).
import type { LucideIcon } from 'lucide-react';
import {
  Footprints, Hand, Heart, House, Moon, Music, PartyPopper, Rainbow, Snowflake, Sparkles, Sunrise, WandSparkles,
} from 'lucide-react';

interface ActionLook { label: string; icon: LucideIcon; color: string }

const LOOKS: Record<string, ActionLook> = {
  house: { label: 'House', icon: House, color: 'var(--cb-orange)' },
  sparkle: { label: 'Sparkle', icon: Sparkles, color: 'var(--cb-yellow)' },
  running: { label: 'Running', icon: Footprints, color: 'var(--cb-green)' },
  wakeup: { label: 'Wake up', icon: Sunrise, color: 'var(--cb-yellow)' },
  sleep: { label: 'Sleep', icon: Moon, color: 'var(--cb-purple)' },
  dance: { label: 'Dance', icon: Music, color: 'var(--cb-pink)' },
  wave: { label: 'Wave', icon: Hand, color: 'var(--cb-blue)' },
  magic: { label: 'Magic', icon: WandSparkles, color: 'var(--cb-purple)' },
  cold: { label: 'Cold', icon: Snowflake, color: 'var(--cb-sky)' },
  party: { label: 'Party', icon: PartyPopper, color: 'var(--cb-pink)' },
  rainbow: { label: 'Rainbow', icon: Rainbow, color: 'var(--cb-red)' },
  stare: { label: 'Happi Burst', icon: Heart, color: 'var(--cb-pink)' },
};

const key = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

export function actionLook(keyword: string): ActionLook {
  return LOOKS[key(keyword)] ?? {
    // admin-added keywords: split CamelCase into words
    label: keyword.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
    icon: Sparkles,
    color: 'var(--cb-pink-soft)',
  };
}

export const actionLabel = (keyword: string) => actionLook(keyword).label;
