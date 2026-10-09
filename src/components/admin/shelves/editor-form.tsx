import { useEffect, useId, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";

import { FieldShell, Group, Hint, Segmented, inputClass } from "@/components/ar-builder/fields";
import type { LibraryRequest } from "@/components/ar-builder/editor-context";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { assetUrl } from "@/lib/ar/projects";
import {
  ACTIVATION_KINDS,
  BACKDROPS,
  DEFAULT_SHELF,
  PRODUCT_TYPES,
  SHELF_FINISHES,
  type ActivationKind,
  type ProductType,
  type ShelfConfig,
  type ShelfProduct,
} from "@/lib/shelf/config";
import { checkInviteFn } from "@/lib/shelf/shelves.functions";
import { cleanShelfSlugInput, isValidShelfSlug, THEME_PRESETS } from "@/lib/shelf/shelves";
import { cn } from "@/lib/utils";

import { ColorInput, ImageInput, PriceInput, SwitchRow, TextInput } from "./fields";
import { shelfFieldId, type ShelfSectionId } from "./sections";
import { dollars } from "./shared";

// The shelf editor's settings: Creator, Theme, Products, Pitch. Every field
// edits the draft through `update`; validation messages come keyed by path
// ("creator.name", "products.2.name"), straight from shelfConfigSchema.

const PRODUCT_LABEL: Record<ProductType, string> = {
  tee: "Tee",
  hoodie: "Hoodie",
  longsleeve: "Long-sleeve",
  cap: "Cap",
  keychain: "Acrylic charm set",
  sticker: "Sticker pack",
  plush: "Plush",
  deskmat: "Desk mat",
};

/** Apparel carries a small chest mark on the front and a big back panel. */
const APPAREL: ReadonlySet<ProductType> = new Set(["tee", "hoodie", "longsleeve"]);

const ACTIVATION_LABEL: Record<ActivationKind, string> = {
  ar: "AR experience",
  model: "3D model",
  video: "Video",
  game: "Mini-game",
  unlock: "Unlock a reward",
};

const FINISH_LABEL: Record<(typeof SHELF_FINISHES)[number], string> = {
  walnut: "Walnut",
  black: "Black",
  white: "White",
  maple: "Maple",
};

const BACKDROP_LABEL: Record<(typeof BACKDROPS)[number], string> = {
  midnight: "Midnight",
  sunset: "Sunset",
  arcade: "Arcade",
  snow: "Snow",
};

const NEON_SWATCHES = ["#ff37ae", "#8fd8ff", "#19affe", "#7cff4f", "#ffd166", "#ff8a3d", "#b45cff"];
/** The activated lineup's washed tones (shop.medialife.ai): washed black, washed navy,
 *  charcoal, vintage grey, bone, deep red. */
const PRODUCT_SWATCHES = ["#1c1c1f", "#1d2433", "#2e2f33", "#6b6d70", "#e9e4d8", "#5a1416"];

export interface ShelfFormProps {
  draft: ShelfConfig;
  update: (fn: (d: ShelfConfig) => void) => void;
  issues: Map<string, string>;
  section: ShelfSectionId;
  openLibrary: (req: LibraryRequest) => void;
  /** product id to open (after a "Fix" jump) */
  openProduct: string | null;
  setOpenProduct: (id: string | null) => void;
  sharing: ReactNode;
}

export function ShelfForm(props: ShelfFormProps) {
  const { section } = props;
  return (
    <div className="pb-24">
      {section === "creator" ? <CreatorSection {...props} /> : null}
      {section === "theme" ? <ThemeSection {...props} /> : null}
      {section === "products" ? <ProductsSection {...props} /> : null}
      {section === "pitch" ? <PitchSection {...props} /> : null}
    </div>
  );
}

const fid = shelfFieldId;

function pickImage(
  openLibrary: ShelfFormProps["openLibrary"],
  title: string,
  current: string | null,
  set: (ref: string) => void,
) {
  const currentId = current?.startsWith("/api/ar/asset/") ? current.slice(14) : null;
  openLibrary({
    accept: "image",
    title,
    currentId,
    onPick: (a) => set(assetUrl(a.id)),
  });
}

// ---------------------------------------------------------------------------

function CreatorSection({ draft, update, issues, openLibrary }: ShelfFormProps) {
  const c = draft.creator;
  return (
    <>
      <Group
        title="The neon sign"
        description="The creator's name glows above the shelf. Keep it short: it's set big."
      >
        <TextInput
          id={fid("creator.name")}
          label="Name on the sign"
          value={c.name}
          maxLength={28}
          counter
          placeholder="PixelPine"
          error={issues.get("creator.name")}
          onChange={(v) => update((d) => void (d.creator.name = v))}
        />
        <TextInput
          id={fid("creator.handle")}
          label="Handle"
          optional
          value={c.handle}
          maxLength={40}
          placeholder="@pixelpine"
          hint="Shown under the sign."
          error={issues.get("creator.handle")}
          onChange={(v) => update((d) => void (d.creator.handle = v))}
        />
      </Group>
      <Group
        title="Logo"
        description="Printed on every product (unless a product has its own print). A transparent PNG or WebP works best. Without one, a wordmark is made from the name."
      >
        <ImageInput
          id={fid("creator.logo")}
          label="Creator logo"
          value={c.logo}
          empty="Upload or choose a logo"
          clearLabel="Use the wordmark instead"
          onChoose={() =>
            pickImage(openLibrary, "Choose the creator's logo", c.logo, (ref) =>
              update((d) => void (d.creator.logo = ref)),
            )
          }
          onClear={() => update((d) => void (d.creator.logo = null))}
        />
        {c.logo ? null : (
          <Hint>
            Pull the logo from the creator's channel art or merch store. A logo makes the shelf feel
            made for them, which is the whole point of the pitch.
          </Hint>
        )}
      </Group>
    </>
  );
}

// ---------------------------------------------------------------------------

function ThemeSection({ draft, update }: ShelfFormProps) {
  const t = draft.theme;
  const activePreset = THEME_PRESETS.find(
    (p) =>
      p.neon === t.neon.toLowerCase() &&
      p.accent === t.accent.toLowerCase() &&
      p.backdrop === t.backdrop &&
      p.shelf === t.shelf,
  )?.id;
  return (
    <>
      <Group title="Presets" description="A starting point. Fine-tune the colours below.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEME_PRESETS.map((p) => {
            const on = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  update((d) => {
                    d.theme.neon = p.neon;
                    d.theme.accent = p.accent;
                    d.theme.backdrop = p.backdrop;
                    d.theme.shelf = p.shelf;
                  })
                }
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg border p-2.5 text-left text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-11",
                  on ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
                )}
              >
                <span
                  aria-hidden
                  className="relative size-7 shrink-0 rounded-md"
                  style={{
                    background: `linear-gradient(135deg, ${p.neon}, ${p.accent})`,
                    boxShadow: `0 0 12px -3px ${p.neon}`,
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                {on ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </Group>
      <Group title="Colours">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorInput
            id={fid("theme.neon")}
            label="Neon"
            value={t.neon}
            hint="The sign and the shelf's light strips."
            swatches={NEON_SWATCHES}
            onChange={(v) => update((d) => void (d.theme.neon = v))}
          />
          <ColorInput
            id={fid("theme.accent")}
            label="Accent"
            value={t.accent}
            hint="Buttons, highlights, the cart."
            onChange={(v) => update((d) => void (d.theme.accent = v))}
          />
        </div>
      </Group>
      <Group title="Set">
        <Segmented
          label="Shelf finish"
          value={t.shelf}
          options={SHELF_FINISHES.map((v) => ({ value: v, label: FINISH_LABEL[v] }))}
          onChange={(v) => update((d) => void (d.theme.shelf = v))}
        />
        <Segmented
          label="Backdrop"
          value={t.backdrop}
          options={BACKDROPS.map((v) => ({ value: v, label: BACKDROP_LABEL[v] }))}
          onChange={(v) => update((d) => void (d.theme.backdrop = v))}
        />
      </Group>
    </>
  );
}

// ---------------------------------------------------------------------------

function newProductId(type: ProductType, products: ShelfProduct[]): string {
  const ids = new Set(products.map((p) => p.id));
  if (!ids.has(type)) return type;
  for (let n = 2; ; n++) if (!ids.has(`${type}-${n}`)) return `${type}-${n}`;
}

function ProductsSection(props: ShelfFormProps) {
  const { draft, update, issues, openProduct, setOpenProduct } = props;
  const products = draft.products;
  const enabled = products.filter((p) => p.enabled).length;
  const [addType, setAddType] = useState<ProductType>("tee");

  function move(i: number, d: -1 | 1) {
    update((c) => {
      const j = i + d;
      if (j < 0 || j >= c.products.length) return;
      [c.products[i], c.products[j]] = [c.products[j], c.products[i]];
    });
  }

  return (
    <>
      <Group
        title="On the shelf"
        description={`${enabled} of ${products.length} showing, left to right, top to bottom. Turn a product off to hide it without losing its settings.`}
      >
        {enabled === 0 ? (
          <p className="text-xs text-destructive" role="alert">
            Turn on at least one product before publishing.
          </p>
        ) : null}
        <ul className="space-y-2">
          {products.map((p, i) => (
            <ProductRow
              key={p.id}
              index={i}
              count={products.length}
              product={p}
              open={openProduct === p.id}
              onOpenChange={(o) => setOpenProduct(o ? p.id : null)}
              onMove={(d) => move(i, d)}
              onRemove={() =>
                update((c) => {
                  c.products.splice(i, 1);
                })
              }
              hasIssue={[...issues.keys()].some((k) => k.startsWith(`products.${i}.`))}
              {...props}
            />
          ))}
        </ul>
        {products.length < 12 ? (
          <div className="flex items-center gap-2 pt-1">
            <Select value={addType} onValueChange={(v) => setAddType(v as ProductType)}>
              <SelectTrigger className="h-9 w-40 bg-background/60 text-xs pointer-coarse:h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {PRODUCT_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 pointer-coarse:h-11"
              onClick={() => {
                const template =
                  DEFAULT_SHELF.products.find((p) => p.type === addType) ??
                  DEFAULT_SHELF.products[0];
                const id = newProductId(addType, products);
                update((c) => {
                  c.products.push({ ...structuredClone(template), id, type: addType });
                });
                setOpenProduct(id);
              }}
            >
              <Plus aria-hidden /> Add product
            </Button>
          </div>
        ) : null}
      </Group>
    </>
  );
}

function ProductRow({
  index: i,
  count,
  product: p,
  open,
  onOpenChange,
  onMove,
  onRemove,
  hasIssue,
  update,
  issues,
  openLibrary,
}: ShelfFormProps & {
  index: number;
  count: number;
  product: ShelfProduct;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  hasIssue: boolean;
}) {
  const set = (fn: (q: ShelfProduct) => void) => update((d) => fn(d.products[i]));
  const path = (k: string) => `products.${i}.${k}`;
  const toggleId = useId();
  return (
    <li
      className={cn(
        "rounded-lg border bg-background/30 transition-colors",
        hasIssue ? "border-destructive/60" : open ? "border-primary/40" : "border-border",
      )}
    >
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center gap-2 p-2 pl-3">
          <Switch
            id={toggleId}
            checked={p.enabled}
            onCheckedChange={(v) => set((q) => void (q.enabled = v))}
            aria-label={`Show ${p.name} on the shelf`}
          />
          <span
            aria-hidden
            className="size-4 shrink-0 rounded-full border border-white/20"
            style={{ background: p.color }}
          />
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
                !p.enabled && "opacity-50",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name || "Untitled"}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {PRODUCT_LABEL[p.type]} · {dollars(p.price)} ·{" "}
                  {ACTIVATION_LABEL[p.activation.kind]}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 pointer-coarse:size-11"
              disabled={i === 0}
              onClick={() => onMove(-1)}
              aria-label={`Move ${p.name} up`}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 pointer-coarse:size-11"
              disabled={i === count - 1}
              onClick={() => onMove(1)}
              aria-label={`Move ${p.name} down`}
            >
              <ArrowDown aria-hidden />
            </Button>
          </div>
        </div>
        <CollapsibleContent>
          <div className="space-y-4 border-t border-border p-3 pt-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <TextInput
                id={fid(path("name"))}
                label="Name"
                value={p.name}
                maxLength={60}
                error={issues.get(path("name"))}
                onChange={(v) => set((q) => void (q.name = v))}
              />
              <FieldShell id={fid(path("type"))} label="Type">
                <Select
                  value={p.type}
                  onValueChange={(v) => set((q) => void (q.type = v as ProductType))}
                >
                  <SelectTrigger
                    id={fid(path("type"))}
                    className="h-9 bg-background/60 pointer-coarse:h-11"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {PRODUCT_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <PriceInput
                id={fid(path("price"))}
                cents={p.price}
                onChange={(v) => set((q) => void (q.price = v))}
              />
              <ColorInput
                id={fid(path("color"))}
                label="Colour"
                value={p.color}
                swatches={PRODUCT_SWATCHES}
                onChange={(v) => set((q) => void (q.color = v))}
              />
            </div>
            {APPAREL.has(p.type) ? (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Front: small chest mark. Back: the big art panel — our lineup's signature.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ImageInput
                    id={fid(path("print"))}
                    label="Front print"
                    value={p.print}
                    empty="Creator's logo (default)"
                    clearLabel="Use the creator's logo"
                    onChoose={() =>
                      pickImage(openLibrary, `Chest mark for ${p.name}`, p.print, (ref) =>
                        set((q) => void (q.print = ref)),
                      )
                    }
                    onClear={() => set((q) => void (q.print = null))}
                  />
                  <ImageInput
                    id={fid(path("backPrint"))}
                    label="Back print"
                    value={p.backPrint}
                    empty="Logo on a framed panel (default)"
                    clearLabel="Use the logo panel"
                    onChoose={() =>
                      pickImage(openLibrary, `Back panel art for ${p.name}`, p.backPrint, (ref) =>
                        set((q) => void (q.backPrint = ref)),
                      )
                    }
                    onClear={() => set((q) => void (q.backPrint = null))}
                  />
                </div>
              </div>
            ) : (
              <ImageInput
                id={fid(path("print"))}
                label="Print"
                value={p.print}
                empty="Use the creator's logo (default)"
                clearLabel="Use the creator's logo"
                hint="Optional artwork for this product only. Leave empty to print the logo."
                onChoose={() =>
                  pickImage(openLibrary, `Artwork for ${p.name}`, p.print, (ref) =>
                    set((q) => void (q.print = ref)),
                  )
                }
                onClear={() => set((q) => void (q.print = null))}
              />
            )}
            <TextInput
              id={fid(path("blurb"))}
              label="Blurb"
              value={p.blurb}
              maxLength={240}
              multiline
              rows={2}
              error={issues.get(path("blurb"))}
              onChange={(v) => set((q) => void (q.blurb = v))}
            />
            <div className="space-y-4 rounded-lg border border-border bg-white/[0.02] p-3">
              <p className="mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                When a fan scans it
              </p>
              <Segmented
                label="Activation"
                value={p.activation.kind}
                options={ACTIVATION_KINDS.map((k) => ({
                  value: k,
                  label: ACTIVATION_LABEL[k].replace("Unlock a reward", "Reward"),
                }))}
                onChange={(v) => set((q) => void (q.activation.kind = v))}
              />
              <TextInput
                id={fid(path("activation.title"))}
                label="Title"
                value={p.activation.title}
                maxLength={60}
                error={issues.get(path("activation.title"))}
                onChange={(v) => set((q) => void (q.activation.title = v))}
              />
              <TextInput
                id={fid(path("activation.description"))}
                label="What happens"
                value={p.activation.description}
                maxLength={240}
                multiline
                rows={2}
                error={issues.get(path("activation.description"))}
                onChange={(v) => set((q) => void (q.activation.description = v))}
              />
              <TextInput
                id={fid(path("activation.reward"))}
                label="Reward"
                optional
                value={p.activation.reward}
                maxLength={120}
                error={issues.get(path("activation.reward"))}
                onChange={(v) => set((q) => void (q.activation.reward = v))}
              />
            </div>
            {count > 1 ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={onRemove}
                >
                  <Trash2 aria-hidden /> Remove product
                </Button>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function InviteStatus({ code }: { code: string }) {
  const c = useDebounced(code.trim().toLowerCase(), 500);
  const q = useQuery({
    queryKey: ["admin", "shelves", "invite", c],
    queryFn: () => checkInviteFn({ data: { code: c } }),
    enabled: /^[a-z0-9-]{2,40}$/.test(c),
    staleTime: 60_000,
  });
  if (!c) return null;
  if (q.isFetching || c !== code.trim().toLowerCase())
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden /> Checking the code…
      </span>
    );
  if (!q.data || q.data.exists === null) return null;
  return q.data.exists ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
      <Check className="size-3" aria-hidden />
      Creator Hub invite{q.data.agency ? ` from ${q.data.agency}` : ""}
    </span>
  ) : (
    <span className="text-xs text-amber-300">
      No Creator Hub invite with this code. The shelf still works, but applications won't be tagged.
      Create it in the Creator Hub admin first.
    </span>
  );
}

function PitchSection({ draft, update, issues, sharing }: ShelfFormProps) {
  const p = draft.pitch;
  return (
    <>
      <Group
        title="The intro card"
        description="What the creator reads first. Leave “Prepared for” empty when a personal link (?c=) will say who it's for."
      >
        <TextInput
          id={fid("pitch.preparedFor")}
          label="Prepared for"
          optional
          value={p.preparedFor}
          maxLength={60}
          placeholder="PixelPine"
          error={issues.get("pitch.preparedFor")}
          onChange={(v) => update((d) => void (d.pitch.preparedFor = v))}
        />
        <TextInput
          id={fid("pitch.presentedBy")}
          label="Presented by"
          optional
          value={p.presentedBy}
          maxLength={60}
          placeholder="Snowday Media × MEDIALIFE"
          hint="Text only, e.g. Snowday Media × MEDIALIFE — never a partner's logo. Empty shows MEDIALIFE only."
          error={issues.get("pitch.presentedBy")}
          onChange={(v) => update((d) => void (d.pitch.presentedBy = v))}
        />
      </Group>
      <Group
        title="Creator Hub"
        description="When the creator applies from the shelf, the invite code tags them to the agency that sent it."
      >
        <FieldShell
          id={fid("pitch.inviteCode")}
          label={
            <>
              Invite code <span className="font-normal text-muted-foreground">(optional)</span>
            </>
          }
          error={issues.get("pitch.inviteCode")}
        >
          <Input
            id={fid("pitch.inviteCode")}
            value={p.inviteCode}
            maxLength={40}
            spellCheck={false}
            placeholder="snowday"
            aria-invalid={!!issues.get("pitch.inviteCode")}
            className={cn(inputClass, "mono text-xs")}
            onChange={(e) =>
              update(
                (d) =>
                  void (d.pitch.inviteCode = e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                    .slice(0, 40)),
              )
            }
          />
          <div className="mt-1.5 min-h-4">
            <InviteStatus code={p.inviteCode} />
          </div>
        </FieldShell>
      </Group>
      <Group title="Earnings estimator" description="An illustrative calculator on the shelf.">
        <SwitchRow
          id={fid("pitch.showEstimator")}
          label="Show the estimator"
          checked={p.showEstimator}
          onChange={(v) => update((d) => void (d.pitch.showEstimator = v))}
        />
        {p.showEstimator ? (
          <AudienceInput
            value={p.audience}
            onChange={(v) => update((d) => void (d.pitch.audience = v))}
          />
        ) : null}
      </Group>
      {sharing}
    </>
  );
}

function AudienceInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const id = fid("pitch.audience");
  const [text, setText] = useState(value.toLocaleString("en-US"));
  useEffect(() => {
    setText((t) =>
      Number(t.replace(/[^0-9]/g, "")) === value ? t : value.toLocaleString("en-US"),
    );
  }, [value]);
  return (
    <FieldShell
      id={id}
      label="Starting audience"
      hint="Followers across platforms. The estimator starts here; the creator can change it."
    >
      <Input
        id={id}
        inputMode="numeric"
        value={text}
        className={cn(inputClass, "tabular-nums")}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
          setText(digits ? Number(digits).toLocaleString("en-US") : "");
          onChange(Math.min(1_000_000_000, Number(digits || 0)));
        }}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[25_000, 100_000, 250_000, 1_000_000, 5_000_000].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-9",
              value === n
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}K`}
          </button>
        ))}
      </div>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Link & label (rendered at the end of the Pitch section by the editor)
// ---------------------------------------------------------------------------

export function SlugInput({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  return (
    <div className="relative">
      <span className="mono pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
        /shelf/
      </span>
      <Input
        id="shelf-slug"
        value={value}
        disabled={disabled}
        spellCheck={false}
        aria-invalid={!!error || (!!value && !isValidShelfSlug(value))}
        onChange={(e) => onChange(cleanShelfSlugInput(e.target.value))}
        className={cn(inputClass, "mono pl-[60px] text-xs")}
      />
    </div>
  );
}
