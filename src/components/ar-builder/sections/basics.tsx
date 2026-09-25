import { useState } from "react";
import { Eye, EyeOff, Info, Lock, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FIXTURE_DEFAULTS, cleanSlugInput, fieldId, isValidSlug } from "@/lib/ar/projects";

import { ImagePicker } from "../asset-pickers";
import { useEditor, useField } from "../editor-context";
import { FieldShell, Group, Segmented, TextField, inputClass } from "../fields";

// Overview, Activation, Call to action and Access: the simple, form-only sections.

function Note({
  children,
  icon = <Info aria-hidden />,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-border bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SlugField({ onRename }: { onRename: (to: string) => Promise<string | null> }) {
  const { slug, locked } = useEditor();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(slug);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = fieldId(["slug"]);
  const valid = isValidSlug(value);

  async function save() {
    if (!valid || value === slug) {
      setEditing(false);
      setValue(slug);
      return;
    }
    setBusy(true);
    const err = await onRename(value);
    setBusy(false);
    if (err) setError(err);
    else setEditing(false);
  }

  return (
    <FieldShell
      id={id}
      label="Link"
      error={
        editing
          ? (error ?? (value && !valid ? "Lowercase letters, numbers and dashes" : null))
          : null
      }
      hint={
        locked
          ? "Fixed once published, so links you've shared keep working."
          : "You can change this until you publish."
      }
    >
      {editing ? (
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="mono pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
              /x/
            </span>
            <Input
              id={id}
              value={value}
              autoFocus
              spellCheck={false}
              aria-invalid={!valid || !!error}
              onChange={(e) => {
                setError(null);
                setValue(cleanSlugInput(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") {
                  setEditing(false);
                  setValue(slug);
                }
              }}
              className={`${inputClass} mono pl-9 text-xs`}
            />
          </div>
          <Button size="sm" className="h-9" onClick={save} disabled={busy || !valid}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : (
        <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background/30 pr-1 pl-3">
          {locked ? <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
          <span id={id} className="mono min-w-0 flex-1 truncate text-xs text-muted-foreground">
            medialife.ai/x/<span className="text-foreground">{slug}</span>
          </span>
          {!locked ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setValue(slug);
                setEditing(true);
              }}
            >
              <Pencil className="size-3" aria-hidden /> Change
            </Button>
          ) : null}
        </div>
      )}
    </FieldShell>
  );
}

export function OverviewSection({
  onRename,
}: {
  onRename: (to: string) => Promise<string | null>;
}) {
  return (
    <>
      <Group
        title="Endcap"
        description="For the team: the name shows in this builder, not to clients."
      >
        <TextField
          path={["name"]}
          label="Name"
          placeholder="EVADE × Walmart Q4 pitch"
          maxLength={80}
        />
        <TextField
          path={["client"]}
          label="Prepared for"
          optional
          maxLength={80}
          placeholder="Optional, e.g. Roblox"
          hint={'Shows "Prepared for …" on the endcap. A client link\'s name takes priority.'}
        />
        <SlugField onRename={onRename} />
      </Group>
      <Group
        title="Brand"
        description="The lockup in the top-left corner, and the lettering on the fixture."
      >
        <TextField
          path={["brand", "lockup"]}
          label="Lockup"
          placeholder="MEDIALIFE® × ROBLOX"
          maxLength={40}
        />
        <TextField
          path={["brand", "sub"]}
          label="Line under the lockup"
          placeholder="Walmart endcap · AR-01"
          maxLength={80}
        />
        <TextField
          path={["brand", "headerText"]}
          label="Header letters"
          optional
          showCount
          maxLength={24}
          placeholder={FIXTURE_DEFAULTS.headerText}
          hint={`Lit letters across the top of the fixture, for themes without header art. Leave empty to keep the fixture's own letters, which read ${FIXTURE_DEFAULTS.headerText}.`}
        />
        <TextField
          path={["brand", "tagline"]}
          label="Plinth line"
          optional
          showCount
          maxLength={40}
          placeholder={FIXTURE_DEFAULTS.tagline}
          hint={`The lit line along the base of the fixture. Leave empty to keep the fixture's own: ${FIXTURE_DEFAULTS.tagline}`}
        />
        <TextField
          path={["brand", "retailer"]}
          label="Retailer"
          placeholder="Walmart"
          maxLength={30}
          hint={'Used in copy such as "In stock at this Walmart".'}
        />
      </Group>
      <Group title="Loading screen" description="What visitors see while the endcap loads.">
        <TextField
          path={["brand", "splashTitle"]}
          label="Title"
          placeholder="Activated Retail"
          maxLength={40}
        />
        <TextField
          path={["brand", "splashSub"]}
          label="Subtitle"
          placeholder="An interactive Walmart endcap"
          maxLength={120}
        />
      </Group>
    </>
  );
}

const ACTIVATION = [
  { value: "game", label: "Mini-game" },
  { value: "link", label: "Open a link" },
  { value: "none", label: "None" },
] as const;

export function ActivationSection() {
  const type = useField<"game" | "link" | "none">(["activation", "type"]);
  return (
    <>
      <Group
        title="Activation demo"
        description="What happens in the phone mock when a visitor taps a product that can activate."
      >
        <Segmented
          id={type.id}
          label="Experience"
          value={type.value}
          onChange={(v) => type.set(v)}
          options={ACTIVATION.map((o) => ({ ...o }))}
        />
        <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
          {type.value === "game"
            ? "A built-in 12-second catch game, then the reward."
            : type.value === "link"
              ? "Opens your live experience in a new tab (like the EVADE game), then shows the reward."
              : "No phone demo. Products still show their unlock details."}
        </p>
        {type.value === "link" ? (
          <TextField
            path={["activation", "url"]}
            label="Link"
            type="url"
            optional
            placeholder="https://www.roblox.com/games/…"
          />
        ) : null}
        {type.value !== "none" ? (
          <>
            <TextField
              path={["activation", "buttonLabel"]}
              label="Button label"
              placeholder="Play the drop"
              maxLength={40}
            />
            <ImagePicker
              path={["activation", "splash"]}
              label="Splash image"
              hint="Fills the phone screen before the experience starts. The hero screen art is used when empty."
            />
            <TextField
              path={["activation", "rewardPrefix"]}
              label="Reward code prefix"
              placeholder="AR01"
              maxLength={6}
              transform={(v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "")}
              hint="2–6 letters or digits. EVD makes codes like EVD-7Q4X-R2."
            />
          </>
        ) : null}
      </Group>
      <Group title="QR code" description="On the right tower and the hero screen.">
        <TextField
          path={["activation", "qrUrl"]}
          label="QR code link"
          type="url"
          optional
          placeholder="https://…"
          hint="Leave empty for a decorative code. With a link, the code really scans."
        />
      </Group>
    </>
  );
}

export function CtaSection() {
  const mode = useField<"lead" | "url">(["cta", "mode"]);
  return (
    <Group title="Call to action" description="The main button in the endcap's menu bar.">
      <TextField
        path={["cta", "label"]}
        label="Button label"
        placeholder="Book a call"
        maxLength={40}
      />
      <Segmented
        id={mode.id}
        label="When clicked"
        value={mode.value ?? "lead"}
        onChange={(v) => mode.set(v)}
        options={[
          { value: "lead", label: "Contact form" },
          { value: "url", label: "Open a link" },
        ]}
      />
      {mode.value === "url" ? (
        <TextField
          path={["cta", "url"]}
          label="Link"
          type="url"
          optional
          placeholder="https://calendly.com/…"
        />
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          A short form (name, email, company, message). Submissions arrive as Netlify form
          “activated-retail-lead”.
        </p>
      )}
    </Group>
  );
}

export function AccessSection() {
  const f = useField<string | undefined>(["access", "password"]);
  const [show, setShow] = useState(false);
  const { draft } = useEditor();
  return (
    <Group title="Password" description="Ask visitors for a password before the endcap opens.">
      <FieldShell
        id={f.id}
        label="Password"
        error={f.error}
        hint="Letters and numbers; case and spaces don't matter. Leave empty for no password."
      >
        <div className="relative">
          <Input
            id={f.id}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={f.value ?? ""}
            maxLength={60}
            placeholder="No password"
            onChange={(e) => f.set(e.target.value ? e.target.value : undefined)}
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            {show ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </FieldShell>
      <Note>
        This is a light gate that keeps casual visitors out. It isn't security: the page itself
        stays public. Client links set to skip the password open straight in. Changes apply when you
        publish.
      </Note>
      {draft.access.passwordHash && !draft.access.password ? (
        <Note icon={<Lock aria-hidden />}>
          The live version still has a password until you publish.
        </Note>
      ) : null}
    </Group>
  );
}

export { Note };
