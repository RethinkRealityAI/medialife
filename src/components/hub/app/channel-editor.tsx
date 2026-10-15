/**
 * Editable list of a creator's channels: platform, handle, audience size and
 * which one is their main channel.
 */
import { Plus, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORMS, PLATFORM_IDS, type Channel, type PlatformId } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export type ChannelDraft = {
  key: string;
  platform: PlatformId;
  handle: string;
  audience: string;
  primary: boolean;
};

let seq = 0;
/** Keys for rows added in the browser. Rows from the server use their index, so SSR and hydration agree. */
export const draftKey = () => `ch-new-${++seq}`;

export const toDrafts = (channels: Channel[]): ChannelDraft[] =>
  channels.map((c, i) => ({
    key: `ch-${i}`,
    platform: c.platform,
    handle: c.handle,
    audience: c.audience == null ? "" : String(c.audience),
    primary: c.primary,
  }));

export const fromDrafts = (rows: ChannelDraft[]) =>
  rows
    .filter((r) => r.handle.trim())
    .map((r) => {
      const n = Number(r.audience.replace(/[^\d]/g, ""));
      return {
        platform: r.platform,
        handle: r.handle.trim(),
        audience:
          r.audience.trim() && Number.isFinite(n) ? Math.min(2_000_000_000, Math.round(n)) : null,
        primary: r.primary,
      };
    });

const MAX = 12;

export function ChannelEditor({
  value,
  onChange,
}: {
  value: ChannelDraft[];
  onChange: (rows: ChannelDraft[]) => void;
}) {
  const set = (key: string, patch: Partial<ChannelDraft>) =>
    onChange(
      value.map((r) =>
        r.key === key ? { ...r, ...patch } : patch.primary ? { ...r, primary: false } : r,
      ),
    );

  return (
    <div className="space-y-3">
      {value.length ? (
        <ul className="space-y-3">
          {value.map((r, i) => {
            const p = PLATFORMS[r.platform];
            const n = i + 1;
            return (
              <li key={r.key} className="@container rounded-lg border border-border p-3">
                <fieldset>
                  <legend className="sr-only">Channel {n}</legend>
                  <div className="grid grid-cols-1 gap-3 @lg:grid-cols-[10rem_minmax(0,1fr)_9rem]">
                    <div className="space-y-1">
                      <label
                        htmlFor={`${r.key}-platform`}
                        className="text-xs text-muted-foreground"
                      >
                        Platform
                      </label>
                      <select
                        id={`${r.key}-platform`}
                        value={r.platform}
                        onChange={(e) => set(r.key, { platform: e.target.value as PlatformId })}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {PLATFORM_IDS.map((id) => (
                          <option key={id} value={id}>
                            {PLATFORMS[id].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`${r.key}-handle`} className="text-xs text-muted-foreground">
                        Handle or link
                      </label>
                      <Input
                        id={`${r.key}-handle`}
                        value={r.handle}
                        maxLength={200}
                        placeholder={p.placeholder}
                        onChange={(e) => set(r.key, { handle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`${r.key}-aud`} className="text-xs text-muted-foreground">
                        {p.audience}
                      </label>
                      <Input
                        id={`${r.key}-aud`}
                        inputMode="numeric"
                        value={r.audience}
                        placeholder="e.g. 120000"
                        onChange={(e) =>
                          set(r.key, { audience: e.target.value.replace(/[^\d,]/g, "") })
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => set(r.key, { primary: true })}
                      aria-pressed={r.primary}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        r.primary
                          ? "border-primary/50 bg-primary/12 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Star
                        className={cn("size-3.5", r.primary && "fill-current text-primary")}
                        aria-hidden
                      />
                      {r.primary ? "Main channel" : "Make main channel"}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = value.filter((x) => x.key !== r.key);
                        if (r.primary && next[0]) next[0] = { ...next[0], primary: true };
                        onChange(next);
                      }}
                      aria-label={`Remove channel ${n}${r.handle ? ` (${r.handle})` : ""}`}
                    >
                      <Trash2 aria-hidden /> Remove
                    </Button>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No channels yet. Add the place where most of your audience is.
        </p>
      )}
      {value.length < MAX ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...value,
              {
                key: draftKey(),
                platform: value.length ? "twitch" : "youtube",
                handle: "",
                audience: "",
                primary: value.length === 0,
              },
            ])
          }
        >
          <Plus aria-hidden /> Add channel
        </Button>
      ) : null}
    </div>
  );
}
