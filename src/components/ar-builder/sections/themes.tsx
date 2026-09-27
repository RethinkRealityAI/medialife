import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Star, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FIXTURE_DEFAULTS, assetUrl, isRobloxBrand, newTheme } from "@/lib/ar/projects";
import { cn } from "@/lib/utils";

import { ImagePicker } from "../asset-pickers";
import { useEditor, useField } from "../editor-context";
import { ColorField, Group, Hint, HintAction, Segmented, SelectField, TextField } from "../fields";
import { EndcapSchematic, type PanelId } from "../schematic";

/** What one key art covers: every panel but the header. */
const KEYART_PANELS: PanelId[] = ["towerL", "towerR", "wall", "screen", "totem"];

// Themes: the property / campaign switch. Each theme has LED colours and either
// one key-art image (composed onto every panel) or an image per panel.

const PANEL_FIELDS: { key: Exclude<PanelId, "header">; label: string; hint: string }[] = [
  { key: "towerL", label: "Left tower", hint: "Tall portrait, about 1 : 4." },
  { key: "towerR", label: "Right tower", hint: "Tall portrait; the QR code sits on top." },
  { key: "wall", label: "Video wall", hint: "Wide, about 3 : 1, behind the hero screen." },
  { key: "screen", label: "Hero screen", hint: "16 : 10, in the middle of the wall." },
  { key: "totem", label: "Totem", hint: "Freestanding, portrait." },
];

export function ThemesSection() {
  const { draft, update, themeIndex, setThemeIndex, engine } = useEditor();
  const [confirm, setConfirm] = useState<number | null>(null);
  const themes = draft.themes;
  const i = Math.min(themeIndex, themes.length - 1);
  const t = themes[i];

  const choose = (n: number) => {
    setThemeIndex(n);
    engine.goto({ theme: themes[n].id });
  };

  const add = () => {
    if (themes.length >= 4) return;
    const theme = newTheme(
      `Theme ${themes.length + 1}`,
      themes.map((x) => x.id),
    );
    update((d) => {
      d.themes.push(theme);
    });
    setThemeIndex(themes.length);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= themes.length) return;
    update((d) => {
      const [x] = d.themes.splice(from, 1);
      d.themes.splice(to, 0, x);
    });
    setThemeIndex(to);
  };

  const remove = (n: number) => {
    const gone = themes[n].id;
    update((d) => {
      d.themes.splice(n, 1);
      if (d.defaultTheme === gone) d.defaultTheme = d.themes[0].id;
      // tour steps that switched to it now keep the current theme
      for (const s of d.tour) if (s.theme === gone) delete s.theme;
    });
    setThemeIndex(Math.max(0, n - 1));
  };

  return (
    <>
      <Group
        title="Themes"
        description="Visitors switch between these on the property switch. Up to four."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-8 pointer-coarse:h-11"
            onClick={add}
            disabled={themes.length >= 4}
          >
            <Plus aria-hidden /> Add
          </Button>
        }
      >
        <div role="group" aria-label="Themes" className="flex flex-wrap gap-1.5">
          {themes.map((th, n) => (
            <button
              key={th.id + n}
              type="button"
              aria-pressed={n === i}
              onClick={() => choose(n)}
              className={cn(
                "inline-flex h-8 max-w-full items-center pointer-coarse:h-11 pointer-coarse:px-4 gap-2 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
                n === i
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: `linear-gradient(135deg, ${th.led}, ${th.led2})` }}
              />
              <span className="truncate">{th.name || "Untitled"}</span>
              {draft.defaultTheme === th.id ? (
                <Star
                  className="size-3 shrink-0 fill-current text-amber-300"
                  aria-label="default"
                />
              ) : null}
            </button>
          ))}
        </div>
        <SelectField
          path={["defaultTheme"]}
          label="Opens with"
          options={themes.map((th) => ({ value: th.id, label: th.name || th.id }))}
          hint="Also the theme the AR files are made from."
        />
      </Group>

      {t ? (
        <ThemeEditor
          key={t.id + i}
          index={i}
          count={themes.length}
          onMove={(d) => move(i, i + d)}
          onRemove={() => setConfirm(i)}
        />
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove “{confirm !== null ? themes[confirm]?.name : ""}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its colours and graphics choices go with it. Uploaded images stay in the library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pointer-coarse:[&_:is(button,a)]:h-11">
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirm !== null && remove(confirm)}
            >
              Remove theme
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ThemeEditor({
  index: i,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const { draft, jumpTo, openLibrary, setAt } = useEditor();
  const t = draft.themes[i];
  const mode = useField<"keyart" | "panels">(["themes", i, "graphics", "mode"]);
  const [hover, setHover] = useState<PanelId | null>(null);
  const [more, setMore] = useState(
    !!(t.bay || t.spill || t.markers?.product || t.markers?.activation),
  );
  const base = ["themes", i] as const;

  return (
    <>
      <Group
        title={t.name || "Untitled theme"}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 pointer-coarse:size-11"
              onClick={() => onMove(-1)}
              disabled={i === 0}
              aria-label="Move theme left"
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 pointer-coarse:size-11"
              onClick={() => onMove(1)}
              disabled={i === count - 1}
              aria-label="Move theme right"
            >
              <ChevronRight aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive pointer-coarse:size-11"
              onClick={onRemove}
              disabled={count <= 1}
              aria-label="Remove theme"
              title={count <= 1 ? "An endcap needs at least one theme" : "Remove theme"}
            >
              <Trash2 aria-hidden />
            </Button>
          </>
        }
      >
        <TextField
          path={[...base, "name"]}
          label="Name on the switch"
          placeholder="EVADE"
          maxLength={40}
        />
        <div className="grid grid-cols-2 gap-3">
          <ColorField path={[...base, "led"]} label="LED colour" />
          <ColorField path={[...base, "led2"]} label="Second LED colour" />
        </div>
        <Collapsible open={more} onOpenChange={setMore}>
          <CollapsibleTrigger className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none">
            <ChevronDown
              className={cn("size-3.5 transition-transform", more && "rotate-180")}
              aria-hidden
            />
            More colours
          </CollapsibleTrigger>
          <CollapsibleContent className="grid grid-cols-2 gap-3 pt-3">
            <ColorField path={[...base, "bay"]} label="Shelf glow" optional fallback={t.led} />
            <ColorField path={[...base, "spill"]} label="Floor light" optional fallback={t.led} />
            <ColorField
              path={[...base, "markers", "product"]}
              label="Product markers"
              optional
              fallback={t.led}
            />
            <ColorField
              path={[...base, "markers", "activation"]}
              label="Activation marker"
              optional
              fallback={t.led2}
            />
          </CollapsibleContent>
        </Collapsible>
      </Group>

      <Group title="Graphics" description="Artwork on the fixture's panels for this theme.">
        <Segmented
          id={mode.id}
          label="Artwork"
          value={mode.value}
          onChange={(v) => mode.set(v)}
          options={[
            { value: "keyart", label: "One key art" },
            { value: "panels", label: "Image per panel" },
          ]}
        />
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <EndcapSchematic
            highlight={hover ? [hover] : mode.value === "keyart" ? KEYART_PANELS : null}
          />
        </div>
        <ImagePicker
          path={[...base, "graphics", "keyArt"]}
          label="Key art"
          hint={
            mode.value === "keyart"
              ? "One wide image, cropped onto every panel. 3000 px or wider works best."
              : "Used for any panel below that has no image."
          }
        />
        {/* header art is used in both modes; key art never covers the header */}
        <ImagePicker
          compact
          path={[...base, "graphics", "header"]}
          label="Header"
          hint="Lightbox art across the top, about 7 : 1. Without it the header shows lit letters."
          onFocusSlot={(on) => setHover(on ? "header" : null)}
        />
        {!t.graphics.header && !draft.brand.headerText && !isRobloxBrand(draft) ? (
          <Hint
            actions={
              <>
                <HintAction onClick={() => jumpTo(["brand", "headerText"])}>
                  Add header letters
                </HintAction>
                <HintAction
                  onClick={() =>
                    openLibrary({
                      accept: "image",
                      title: "Choose an image: header",
                      onPick: (a) =>
                        setAt(
                          [...base, "graphics", "header"],
                          a.mobile
                            ? { src: assetUrl(a.id), mobile: assetUrl(a.mobile) }
                            : assetUrl(a.id),
                        ),
                    })
                  }
                >
                  Choose header art
                </HintAction>
              </>
            }
          >
            The header will read {FIXTURE_DEFAULTS.headerText}. Add header art or header letters.
          </Hint>
        ) : null}
        {mode.value === "panels"
          ? PANEL_FIELDS.map((p) => (
              <ImagePicker
                key={p.key}
                compact
                path={[...base, "graphics", p.key]}
                label={p.label}
                hint={p.hint}
                onFocusSlot={(on) => setHover(on ? p.key : null)}
              />
            ))
          : null}
      </Group>

      <Group title="Copy" description="Used in the phone mock and product sheets.">
        <TextField
          path={[...base, "game"]}
          label="Game or property name"
          optional
          placeholder="EVADE"
          maxLength={40}
        />
        <TextField
          path={[...base, "site"]}
          label="Site label"
          optional
          placeholder="EVADE.MEDIALIFE.AI"
          maxLength={60}
          hint="The address shown at the top of the phone mock."
        />
      </Group>
    </>
  );
}
