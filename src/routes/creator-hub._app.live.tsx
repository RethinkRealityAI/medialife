import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Megaphone,
  MonitorPlay,
  Pin,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Target,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { CopyButton, Page, PageHeader, Panel, Pill } from "@/components/hub/app/ui";
import { ACCENTS, ACCENT_IDS } from "@/components/hub/overlay/accents";
import { OVERLAY_MSG, type OverlayFeedMessage } from "@/components/hub/overlay/live-overlay";
import {
  OverlayStage,
  OverlayView,
  type OverlayModel,
} from "@/components/hub/overlay/overlay-view";
import { StreamScene } from "@/components/hub/overlay/stream-scene";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { compact, money, timeAgo } from "@/lib/hub/model";
import {
  getLiveOverlay,
  restartLiveGoal,
  rotateLiveOverlay,
  sendTestAlert,
  updateLiveOverlay,
} from "@/lib/hub/overlay.functions";
import { cn } from "@/lib/utils";

// /creator-hub/live — the Go live studio. Configure the Live Drop overlay,
// watch it in a live preview (the real overlay, in an iframe over a stand-in
// stream), send a test alert, and copy the secret browser-source URL into OBS,
// Streamlabs or TikTok LIVE Studio.

export const Route = createFileRoute("/creator-hub/_app/live")({
  head: () => ({ meta: [{ title: "Go live · Creator Hub | MEDIALIFE" }] }),
  loader: () => getLiveOverlay(),
  component: GoLive,
});

type View = Awaited<ReturnType<typeof getLiveOverlay>>;
type Settings = View["settings"];
type Editable = Pick<
  Settings,
  | "enabled"
  | "productId"
  | "goal"
  | "headline"
  | "qrTarget"
  | "showQr"
  | "showRevenue"
  | "position"
  | "accent"
>;

const GOAL_CHIPS = [50, 100, 250, 500];

function GoLive() {
  const initial = Route.useLoaderData();
  const [view, setView] = useState<View>(initial);

  if (!view.approved) return <Locked />;
  return <Studio view={view} setView={setView} />;
}

/* ---------------------------------------------------------------------------
   The studio
   --------------------------------------------------------------------------- */

function Studio({ view, setView }: { view: View; setView: (v: View) => void }) {
  const [draft, setDraft] = useState<Settings>(view.settings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = useRef<Partial<Editable>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [stats, setStats] = useState<OverlayFeedMessage | null>(null);

  const liveProducts = view.products.filter((p) => p.stage === "live");

  /** Ask the preview to poll now, so changes show in a beat rather than 5 s. */
  const pingPreview = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: OVERLAY_MSG.poll }, window.location.origin);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const msg = e.data as OverlayFeedMessage | null;
      if (msg?.type === OVERLAY_MSG.feed) setStats(msg);
    };
    window.addEventListener("message", onMessage);
    // The preview may have posted its first feed before this page hydrated.
    pingPreview();
    return () => window.removeEventListener("message", onMessage);
  }, [pingPreview]);

  const flush = useCallback(async () => {
    timer.current = null;
    const data = pending.current;
    pending.current = {};
    if (!Object.keys(data).length) return;
    setSaveState("saving");
    try {
      const res = await updateLiveOverlay({ data });
      if (!res.ok) throw new Error(res.error);
      setView(res);
      // Only adopt the server's copy when nothing newer is waiting to save.
      if (!Object.keys(pending.current).length) setDraft(res.settings);
      setSaveState("saved");
      pingPreview();
    } catch (err) {
      setSaveState("error");
      toast.error(
        err instanceof Error && err.message && err.message !== "Failed to fetch"
          ? err.message
          : "Couldn't save. Check your connection and try again.",
      );
    }
  }, [setView, pingPreview]);

  const change = useCallback(
    (patch: Partial<Editable>, delay = 350) => {
      setDraft((d) => ({ ...d, ...patch }));
      pending.current = { ...pending.current, ...patch };
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  // Don't lose an edit made in the last few hundred ms before leaving the page.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    [flush],
  );

  return (
    <Page className="max-w-7xl lg:pt-8">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Radio className="size-4 text-accent" aria-hidden />
            Live Drop
          </span>
        }
        title={
          <>
            Turn your stream into a <span className="ember-text">merch drop</span>
          </>
        }
        description="A stream overlay that shows your merch selling as it happens: a sales goal, an alert for every order and a QR your viewers scan."
        actions={
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-full border py-2 pr-4 pl-3 text-sm transition-colors",
              draft.enabled
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                : "border-border bg-white/[0.03] text-muted-foreground",
            )}
          >
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => change({ enabled: v }, 0)}
              aria-describedby="overlay-on-hint"
            />
            <span className="font-medium">{draft.enabled ? "Overlay on" : "Overlay off"}</span>
            <span id="overlay-on-hint" className="sr-only">
              When off, the overlay shows nothing on stream.
            </span>
          </label>
        }
      />

      {liveProducts.length === 0 ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
          <p>
            None of your products is live yet. Set the overlay up now: it shows on stream as soon as
            your first product goes on sale.
          </p>
        </div>
      ) : null}

      {/* Phones: preview, settings, then the link. Desktop: settings in a sticky column. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Preview
            view={view}
            draft={draft}
            frameRef={frame}
            stats={stats}
            onRestarted={(v) => {
              setView(v);
              setDraft((d) => ({ ...d, goalStartedAt: v.settings.goalStartedAt }));
              pingPreview();
            }}
            pokePreview={pingPreview}
          />
        </div>
        <SettingsPanel
          view={view}
          draft={draft}
          saveState={saveState}
          change={change}
          className="min-w-0 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        />
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <AddToStream
            view={view}
            onRotated={(v) => {
              setView(v);
              setStats(null);
            }}
          />
        </div>
      </div>

      <Tips />
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Preview
   --------------------------------------------------------------------------- */

function StreamFrame({
  position,
  children,
  className,
}: {
  position: "bottom" | "top";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10",
        "shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),0_0_60px_-30px_var(--glow)]",
        className,
      )}
    >
      <StreamScene facecam={position === "top" ? "bottom" : "top"} />
      {children}
    </div>
  );
}

function Preview({
  view,
  draft,
  frameRef,
  stats,
  onRestarted,
  pokePreview,
}: {
  view: View;
  draft: Settings;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  stats: OverlayFeedMessage | null;
  onRestarted: (v: View) => void;
  pokePreview: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      await sendTestAlert();
      pokePreview();
      toast.success("Test alert sent", {
        description: "It plays on the preview now, and in OBS within 5 seconds.",
      });
    } catch {
      toast.error("Couldn't send the test alert. Try again.");
    } finally {
      setTesting(false);
    }
  };

  const restart = async () => {
    setRestarting(true);
    try {
      const res = await restartLiveGoal();
      onRestarted(res);
      toast.success("Goal restarted", { description: "Counting orders from now." });
    } catch {
      toast.error("Couldn't restart the goal. Try again.");
    } finally {
      setRestarting(false);
    }
  };

  return (
    <section aria-labelledby="preview-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="preview-title" className="flex items-center gap-2 text-sm font-medium">
          <MonitorPlay className="size-4 text-primary" aria-hidden />
          Live preview
        </h2>
        <p className="text-xs text-muted-foreground">Exactly what your viewers see</p>
      </div>

      <StreamFrame position={draft.position}>
        <iframe
          ref={frameRef}
          key={view.path}
          src={view.path}
          title="Your Live Drop overlay, previewed over a sample stream"
          className="absolute inset-0 size-full border-0"
          style={{ background: "transparent", colorScheme: "normal" }}
          tabIndex={-1}
          onLoad={pokePreview}
        />
        {!draft.enabled ? (
          <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]">
            <div className="rounded-full border border-white/15 bg-black/60 px-4 py-2 text-sm text-white/85">
              Overlay is off — viewers see nothing
            </div>
          </div>
        ) : null}
      </StreamFrame>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={test}
          disabled={testing || !draft.enabled}
          className="btn-pill btn-ember h-10 gap-2 px-5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Zap className="size-4" aria-hidden />
          )}
          Send test alert
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="h-10 rounded-full px-4" disabled={restarting}>
              {restarting ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RotateCcw aria-hidden />
              )}
              Restart goal
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restart the goal?</AlertDialogTitle>
              <AlertDialogDescription>
                The bar goes back to zero and counts orders from now on. Do this when you go live,
                so the goal is for this stream. Your sales and earnings aren't affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={restart}>Restart goal</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button asChild variant="ghost" className="h-10 rounded-full px-4">
          <a href={`${view.path}?bg=1`} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden />
            Pop out
          </a>
        </Button>

        <LiveStats stats={stats} draft={draft} />
      </div>
    </section>
  );
}

function LiveStats({ stats, draft }: { stats: OverlayFeedMessage | null; draft: Settings }) {
  if (!stats || stats.status !== "live") return null;
  const since = new Date(stats.goalStartedAt ?? draft.goalStartedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <p className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
      <span className="inline-flex items-center gap-1.5 text-foreground">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        {compact(stats.units ?? 0)}
        {stats.goal ? ` / ${compact(stats.goal)}` : ""} sold
      </span>
      <span suppressHydrationWarning>since {since}</span>
      {stats.revenue != null ? <span>{money(stats.revenue, stats.currency)}</span> : null}
      <span>{compact(stats.scans ?? 0)} scans</span>
      {stats.lastOrderAt ? <span>last order {timeAgo(stats.lastOrderAt)}</span> : null}
    </p>
  );
}

/* ---------------------------------------------------------------------------
   Settings
   --------------------------------------------------------------------------- */

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className="grid w-full grid-cols-2 rounded-lg border border-border p-1"
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="h-8 rounded-md px-3 text-xs data-[state=on]:bg-white/10 data-[state=on]:text-foreground data-[state=on]:text-foreground"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function SettingsPanel({
  view,
  draft,
  saveState,
  change,
  className,
}: {
  view: View;
  draft: Settings;
  saveState: "idle" | "saving" | "saved" | "error";
  change: (patch: Partial<Editable>, delay?: number) => void;
  className?: string;
}) {
  const [goalText, setGoalText] = useState(String(draft.goal));
  useEffect(() => {
    // follow the server (e.g. a chip click) unless the field holds an unsaved edit
    setGoalText((t) => (Number(t) === draft.goal ? t : String(draft.goal)));
  }, [draft.goal]);

  return (
    <Panel as="section" className={cn("p-5 sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium">Overlay settings</h2>
        <SaveState state={saveState} />
      </div>

      <div className="mt-5 space-y-5">
        <Field label="Product" htmlFor="ov-product">
          <Select
            value={draft.productId ?? "all"}
            onValueChange={(v) => change({ productId: v === "all" ? null : v }, 0)}
          >
            <SelectTrigger id="ov-product" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All live products</SelectItem>
              {view.products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.stage === "live" ? "" : " (not live yet)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Sales goal"
          htmlFor="ov-goal"
          hint={
            <>
              Units to sell. Counts orders since you last restarted the goal
              {draft.goal === 0 ? ". 0 hides the bar." : "."}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="ov-goal"
              inputMode="numeric"
              value={goalText}
              onChange={(e) => {
                const t = e.target.value.replace(/[^\d]/g, "").slice(0, 7);
                setGoalText(t);
                if (t !== "") change({ goal: Math.min(1_000_000, Number(t)) }, 700);
              }}
              onBlur={() => goalText === "" && setGoalText(String(draft.goal))}
              className="h-9 w-24 font-mono tabular-nums"
            />
            {GOAL_CHIPS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setGoalText(String(n));
                  change({ goal: n }, 0);
                }}
                aria-pressed={draft.goal === n}
                className={cn(
                  "h-9 rounded-full border px-3 font-mono text-xs tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  draft.goal === n
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-white/25 hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <Field label="QR headline" htmlFor="ov-headline">
          <Input
            id="ov-headline"
            value={draft.headline}
            maxLength={60}
            placeholder="Scan to unlock"
            onChange={(e) => change({ headline: e.target.value }, 700)}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Field label="QR opens">
            <Segmented
              label="QR opens"
              value={draft.qrTarget}
              onChange={(v) => change({ qrTarget: v }, 0)}
              options={[
                { value: "shop", label: "Shop" },
                { value: "activation", label: "Activation" },
              ]}
            />
          </Field>
          <Field label="Position">
            <Segmented
              label="Position"
              value={draft.position}
              onChange={(v) => change({ position: v }, 0)}
              options={[
                { value: "bottom", label: "Bottom" },
                { value: "top", label: "Top" },
              ]}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Colour</legend>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Colour">
            {ACCENT_IDS.map((id) => {
              const a = ACCENTS[id];
              const on = draft.accent === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => change({ accent: id }, 0)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on
                      ? "border-white/40 bg-white/[0.07] text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className="grid size-7 place-items-center rounded-full"
                    style={{
                      background: `linear-gradient(135deg, ${a.a}, ${a.b})`,
                      boxShadow: on ? `0 0 16px -2px ${a.b}` : undefined,
                    }}
                  >
                    {on ? <Check className="size-4 text-white drop-shadow" /> : null}
                  </span>
                  {a.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="divide-y divide-border rounded-lg border border-border">
          <SwitchRow
            id="ov-qr"
            label="Show the QR code"
            hint="Viewers scan it to shop or unlock."
            checked={draft.showQr}
            onChange={(v) => change({ showQr: v }, 0)}
          />
          <SwitchRow
            id="ov-rev"
            label="Show sales total"
            hint={
              draft.showRevenue ? (
                <span className="flex items-start gap-1.5 text-amber-300">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Viewers will see your sales total.
                </span>
              ) : (
                "Off by default. Units always show."
              )
            }
            checked={draft.showRevenue}
            onChange={(v) => change({ showRevenue: v }, 0)}
          />
        </div>
      </div>
    </Panel>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <div id={`${id}-hint`} className="mt-0.5 text-xs text-muted-foreground">
          {hint}
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={`${id}-hint`}
        className="mt-0.5"
      />
    </div>
  );
}

function SaveState({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      {state === "saving" ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Saving
        </span>
      ) : state === "saved" ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-300">
          <Check className="size-3.5" aria-hidden />
          Saved
        </span>
      ) : state === "error" ? (
        <span className="text-red-300">Not saved</span>
      ) : (
        "Changes save automatically"
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Add to your stream
   --------------------------------------------------------------------------- */

const APPS: Array<{ id: string; label: string; steps: ReactNode[] }> = [
  {
    id: "obs",
    label: "OBS Studio",
    steps: [
      <>
        In <b>Sources</b>, click <b>+</b> and choose <b>Browser</b>. Name it “MEDIALIFE”.
      </>,
      <>
        Paste your link into <b>URL</b>. Set <b>Width 1920</b> and <b>Height 1080</b>.
      </>,
      <>
        Tick <b>Refresh browser when scene becomes active</b>, click OK, and keep the source at the
        top of the list so it sits over your game.
      </>,
    ],
  },
  {
    id: "streamlabs",
    label: "Streamlabs",
    steps: [
      <>
        Click <b>+</b> next to <b>Sources</b>, pick <b>Browser Source</b>, then <b>Add Source</b>.
      </>,
      <>
        Paste your link into <b>URL</b>. Set <b>Width 1920</b> and <b>Height 1080</b>.
      </>,
      <>
        Tick <b>Refresh browser when scene becomes active</b>, click <b>Done</b>, and drag it to the
        top of your sources.
      </>,
    ],
  },
  {
    id: "tiktok",
    label: "TikTok LIVE Studio",
    steps: [
      <>
        Under <b>Sources</b>, click <b>Add source</b> and choose <b>Link</b>.
      </>,
      <>
        Paste your link. Set <b>Width 1920</b> and <b>Height 1080</b> for a landscape stream.
      </>,
      <>
        Streaming vertically? Use <b>Width 1080</b>, <b>Height 1920</b> and add{" "}
        <code className="rounded bg-white/10 px-1 font-mono text-[0.85em]">?scale=1.5</code> to the
        end of the link so the cards stay readable.
      </>,
    ],
  },
];

function maskUrl(url: string) {
  const i = url.lastIndexOf("/");
  const token = url.slice(i + 1);
  return `${url.slice(0, i + 1)}${"•".repeat(Math.max(8, token.length - 4))}${token.slice(-4)}`;
}

function AddToStream({ view, onRotated }: { view: View; onRotated: (v: View) => void }) {
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);

  const rotate = async () => {
    setRotating(true);
    try {
      const res = await rotateLiveOverlay();
      onRotated(res);
      setRevealed(false);
      toast.success("New link ready", {
        description: "The old one has stopped working. Paste the new one into your streaming app.",
      });
    } catch {
      toast.error("Couldn't make a new link. Try again.");
    } finally {
      setRotating(false);
    }
  };

  return (
    <Panel as="section" className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="add-title" className="text-base font-medium">
          Add to your stream
        </h2>
        <Pill tone="accent" icon={Lock}>
          Secret link
        </Pill>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div
          className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-border bg-black/30 px-3 font-mono text-xs sm:text-sm"
          aria-label={revealed ? "Overlay link" : "Overlay link (hidden)"}
        >
          <span className="truncate select-all">{revealed ? view.url : maskUrl(view.url)}</span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1 sm:flex-none"
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {revealed ? "Hide" : "Reveal"}
          </Button>
          <CopyButton
            value={view.url}
            label="Copy link"
            toastText="Overlay link copied. Paste it into your streaming app."
            variant="default"
            size="default"
            className="h-10 flex-1 sm:flex-none"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-200/90">
          <ShieldAlert className="mt-px size-4 shrink-0 text-amber-300" aria-hidden />
          Anyone with this link can show your overlay. Don't share it on stream.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="-mt-1 text-muted-foreground"
              disabled={rotating}
            >
              {rotating ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              Regenerate link
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Make a new overlay link?</AlertDialogTitle>
              <AlertDialogDescription>
                The current link stops working straight away, so the overlay disappears from any
                stream using it until you paste the new link into your streaming app. Do this if the
                link was shown on stream or shared by mistake.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={rotate}>Make a new link</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Tabs defaultValue="obs" className="mt-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          {APPS.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="text-xs sm:text-sm">
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {APPS.map((a) => (
          <TabsContent key={a.id} value={a.id} className="mt-4">
            <ol className="grid gap-3 sm:grid-cols-3">
              {a.steps.map((s, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-lg border border-border bg-white/[0.02] p-3 text-sm leading-relaxed text-muted-foreground [&_b]:font-medium [&_b]:text-foreground"
                >
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-full font-mono text-xs text-white"
                    style={{ background: "var(--gradient-ember-btn)" }}
                  >
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </TabsContent>
        ))}
      </Tabs>
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   Tips
   --------------------------------------------------------------------------- */

const TIPS = [
  {
    icon: Pin,
    title: "Pin the QR during your merch segment",
    body: "Hold the product up, point at the code and give chat ten seconds to scan.",
  },
  {
    icon: Target,
    title: "Run a goal for the stream",
    body: "Restart the goal when you go live. Chat loves pushing a bar over the line.",
  },
  {
    icon: Megaphone,
    title: "Shout out alerts live",
    body: "Read the country out when an alert pops. “Canada's in!” gets the next order.",
  },
];

function Tips() {
  return (
    <section aria-label="Tips" className="mt-8">
      <ul className="grid gap-3 sm:grid-cols-3">
        {TIPS.map((t) => (
          <li
            key={t.title}
            className="flex gap-3 rounded-xl border border-border bg-white/[0.02] p-4"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-white/[0.04]">
              <t.icon className="size-4 text-primary" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-medium">{t.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Locked: the creator isn't approved yet
   --------------------------------------------------------------------------- */

const DEMO: OverlayModel = {
  creator: "Your channel",
  product: { name: "Your activated tee", image: null },
  qrUrl: "https://medialife.ai/creator-hub",
  headline: "Scan to unlock",
  showQr: true,
  position: "bottom",
  accent: "ember",
  goal: 100,
  units: 64,
  revenue: null,
  scans: 1240,
};

function Locked() {
  return (
    <Page className="max-w-7xl lg:pt-8">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Radio className="size-4 text-accent" aria-hidden />
            Live Drop
          </span>
        }
        title={
          <>
            Turn your stream into a <span className="ember-text">merch drop</span>
          </>
        }
        description="A stream overlay that shows your merch selling as it happens: a sales goal, an alert for every order and a QR your viewers scan."
      />
      <div className="mt-6">
        <StreamFrame position="bottom">
          <OverlayStage>
            <OverlayView
              model={DEMO}
              alert={{
                key: "demo",
                kind: "order",
                flag: "🇨🇦",
                country: "Canada",
                qty: 2,
                product: "Your activated tee",
              }}
              entrance={false}
            />
          </OverlayStage>
          <div className="absolute inset-0 grid place-items-center bg-black/55 p-4 backdrop-blur-[3px]">
            <div className="max-w-md rounded-2xl border border-white/15 bg-background/80 p-6 text-center shadow-2xl backdrop-blur-xl">
              <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-white/[0.05]">
                <Lock className="size-5 text-primary" aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-medium">Go live unlocks with your first product</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Once you're approved and your first product goes on sale, you'll get your own
                overlay link for OBS, Streamlabs or TikTok LIVE Studio.
              </p>
              <Button asChild variant="outline" className="mt-5 rounded-full">
                <Link to="/creator-hub/products">See your products</Link>
              </Button>
            </div>
          </div>
        </StreamFrame>
      </div>
      <Tips />
    </Page>
  );
}
