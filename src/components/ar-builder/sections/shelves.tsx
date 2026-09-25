import { useState } from "react";
import { Eye, RotateCcw } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ZONES, ZONE_IDS, type ZoneId } from "@/lib/ar/project";
import { defaultZone, isRobloxBrand } from "@/lib/ar/projects";

import { ImagePicker, ModelPicker } from "../asset-pickers";
import { useEditor, useField } from "../editor-context";
import {
  ChipsField,
  ColorField,
  Group,
  Hint,
  HintAction,
  PriceField,
  Segmented,
  SliderField,
  SwitchField,
  TextField,
  inputClass,
} from "../fields";
import { EndcapSchematic } from "../schematic";

// Shelves: the seven merch zones. Every slot in a zone shows the same product,
// auto-fitted by the engine; yaw and scale fine-tune the fit.

export function ShelvesSection() {
  const { draft, zone, selectZone, issues } = useEditor();
  const [hover, setHover] = useState<ZoneId | null>(null);
  const enabled = Object.fromEntries(ZONE_IDS.map((id) => [id, draft.zones[id].enabled])) as Record<
    ZoneId,
    boolean
  >;
  const labels = Object.fromEntries(
    ZONE_IDS.map((id) => [id, draft.zones[id].product.label]),
  ) as Record<ZoneId, string>;
  const hasIssue = (id: ZoneId) => [...issues.keys()].some((k) => k.startsWith(`zones.${id}.`));
  const shown = hover ?? zone;

  return (
    <>
      <Group title="Shelves" description="Choose a spot on the endcap, then what goes there.">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <EndcapSchematic
            selected={zone}
            onSelect={(id) => selectZone(id)}
            onHover={setHover}
            enabled={enabled}
            labels={labels}
          />
          <p className="mt-2 text-center text-xs text-muted-foreground" aria-live="polite">
            <span className="text-foreground">{ZONES[shown].label}</span> · {ZONES[shown].slots}{" "}
            slots
          </p>
        </div>
        <Select value={zone} onValueChange={(v) => selectZone(v as ZoneId)}>
          <SelectTrigger aria-label="Shelf zone" className={inputClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ZONE_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                <span className="flex items-center gap-2">
                  {ZONES[id].label}
                  <span className="text-muted-foreground">
                    · {draft.zones[id].enabled ? draft.zones[id].product.label : "empty"}
                  </span>
                  {hasIssue(id) ? (
                    <span
                      className="size-1.5 rounded-full bg-destructive"
                      aria-label="needs attention"
                    />
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Group>
      <ZoneEditor key={zone} id={zone} />
    </>
  );
}

const SOURCES = [
  { value: "default", label: "Sample merch" },
  { value: "asset", label: "3D model" },
  { value: "image", label: "Cut-out" },
] as const;

function ZoneEditor({ id }: { id: ZoneId }) {
  const { draft, update, engine, layout, showPreview } = useEditor();
  const canTint = engine.capabilities.tint.includes(id);
  const canPrint = engine.capabilities.print.includes(id);
  const [confirm, setConfirm] = useState(false);
  const z = draft.zones[id];
  const base = ["zones", id] as const;
  const source = useField<"default" | "asset" | "image">([...base, "model", "source"]);

  return (
    <>
      <Group
        title={ZONES[id].label}
        description={ZONES[id].hint}
        actions={
          <>
            {layout === "tabs" ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs pointer-coarse:h-11"
                onClick={showPreview}
              >
                <Eye className="size-3.5" aria-hidden /> Show in preview
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground pointer-coarse:h-11"
              onClick={() => setConfirm(true)}
            >
              <RotateCcw className="size-3.5" aria-hidden /> Reset
            </Button>
          </>
        }
      >
        <SwitchField
          path={[...base, "enabled"]}
          label="Show products here"
          hint="Off leaves this spot empty, with no hotspot."
        />
      </Group>

      {z.enabled ? (
        <>
          <Group title="Model">
            <Segmented
              id={source.id}
              label="What sits on the shelf"
              value={source.value}
              onChange={(v) => source.set(v)}
              options={SOURCES.map((s) => ({ ...s }))}
            />
            {source.value === "default" ? (
              <>
                <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
                  The fixture's own sample product for this spot.{" "}
                  {canTint && canPrint
                    ? "Recolour it and print your artwork on it."
                    : canTint
                      ? "You can recolour it."
                      : canPrint
                        ? "You can print your artwork on it."
                        : "It can't be recoloured or printed on."}
                </p>
                {!isRobloxBrand(draft) ? (
                  <Hint
                    actions={
                      <>
                        <HintAction onClick={() => source.set("asset")}>Use a 3D model</HintAction>
                        <HintAction onClick={() => source.set("image")}>Use a cut-out</HintAction>
                      </>
                    }
                  >
                    Sample merch carries Roblox branding. Use your own 3D model or a cut-out
                    {canPrint
                      ? ", or print your artwork on it below."
                      : canTint
                        ? ", or at least recolour it below."
                        : "."}
                  </Hint>
                ) : null}
                {canTint ? (
                  <div className="grid grid-cols-2 gap-3">
                    <ColorField
                      path={[...base, "model", "tint"]}
                      label="Colour"
                      optional
                      fallback="#2a2a33"
                    />
                  </div>
                ) : null}
                {canPrint ? (
                  <ImagePicker
                    path={[...base, "model", "print"]}
                    label="Printed artwork"
                    hint={
                      id === "mousepad"
                        ? "The artwork on the rolled desk mats. Wide landscape works best."
                        : id === "figure"
                          ? "The front of the collectible box, portrait 3 : 4 (about 1528 × 2048)."
                          : "Printed on the front of the product."
                    }
                  />
                ) : null}
              </>
            ) : source.value === "asset" ? (
              <ModelPicker path={[...base, "model", "asset"]} label="3D model (.glb)" />
            ) : (
              <ImagePicker
                path={[...base, "model", "image"]}
                label="Cut-out image"
                optional={false}
                hint="A transparent PNG or WebP, shown as a flat acrylic standee."
              />
            )}
            <SliderField
              path={[...base, "model", "yaw"]}
              label="Turn"
              min={-180}
              max={180}
              step={5}
              reset={0}
              format={(v) => `${v}°`}
            />
            <SliderField
              path={[...base, "model", "scale"]}
              label="Size"
              min={0.2}
              max={3}
              step={0.05}
              reset={1}
              format={(v) => `${v.toFixed(2)}×`}
            />
          </Group>

          <Group
            title="Product"
            description="The sheet that opens when a visitor taps this product."
          >
            <TextField
              path={[...base, "product", "label"]}
              label="Name"
              placeholder="Activated Hoodie"
              maxLength={60}
            />
            <TextField
              path={[...base, "product", "category"]}
              label="Category line"
              placeholder="Activated Apparel® · pilot SKU"
              maxLength={80}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                path={[...base, "product", "sku"]}
                label="SKU"
                placeholder="AR01-HOD-BLK"
                maxLength={40}
              />
              <PriceField path={[...base, "product", "price"]} />
            </div>
            <ChipsField path={[...base, "product", "sizes"]} label="Sizes" />
            <TextField
              path={[...base, "product", "description"]}
              label="Description"
              multiline
              rows={4}
              maxLength={600}
            />
          </Group>

          <Group title="Unlock" description="The digital reward the product unlocks.">
            <TextField
              path={[...base, "product", "unlock", "title"]}
              label="Reward"
              placeholder="Matching avatar hoodie"
              maxLength={60}
            />
            <TextField
              path={[...base, "product", "unlock", "sub"]}
              label="Detail"
              placeholder="Wear it in game today"
              maxLength={120}
            />
            <ImagePicker
              path={[...base, "product", "unlock", "image"]}
              label="Reward art"
              hint="Optional. A snapshot of the 3D product is used when empty."
            />
          </Group>

          <Group title="Hotspot and activation">
            <TextField
              path={[...base, "product", "hotspot"]}
              label="Hotspot label"
              optional
              maxLength={40}
              placeholder={z.product.label || "Same as the name"}
            />
            <TextField
              path={[...base, "product", "trigger"]}
              label="How it activates"
              placeholder="NFC care label"
              maxLength={80}
            />
            <TextField
              path={[...base, "product", "channel"]}
              label="Sold through"
              placeholder="Roblox Commerce → Walmart"
              maxLength={80}
            />
            <SwitchField
              path={[...base, "product", "canActivate"]}
              label="Tap to activate"
              hint="Shows the activation button on this product and plays the activation demo."
            />
          </Group>
        </>
      ) : null}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {ZONES[id].label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Puts back the sample product and placeholder copy for this spot. Your uploaded files
              stay in the library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pointer-coarse:[&_:is(button,a)]:h-11">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                update((d) => {
                  d.zones[id] = defaultZone(id);
                })
              }
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
