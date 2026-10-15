/** Create or edit a partner: name, links, colours, which collateral set, notes. */
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminSavePartner } from "@/lib/hub/admin-partners.functions";
import { PARTNER_KITS } from "@/lib/hub/collateral";
import { slugifyPartner, type Partner } from "@/lib/hub/partners";

import { Field, useRun } from "../creators/ui";

const DEFAULT_BRAND = { primary: "#405d96", accent: "#96c8ec", ink: "#21254a" };

export function PartnerForm({
  partner,
  preset,
  onSaved,
}: {
  partner: Partner | null;
  /** Starting values for a new partner. */
  preset?: Partial<Pick<Partner, "id" | "name" | "website" | "discordUrl" | "brand" | "kit">>;
  onSaved?: (p: Partner) => void;
}) {
  const uid = useId();
  const { run, busy } = useRun();
  const [f, setF] = useState({
    id: partner?.id ?? preset?.id ?? "",
    name: partner?.name ?? preset?.name ?? "",
    website: partner?.website ?? preset?.website ?? "",
    discordUrl: partner?.discordUrl ?? preset?.discordUrl ?? "",
    brand: partner?.brand ?? (preset?.brand ? { ...preset.brand } : DEFAULT_BRAND),
    kit: partner?.kit ?? preset?.kit ?? "base",
    notes: partner?.notes ?? "",
    status: partner?.status ?? ("active" as const),
  });
  const [idTouched, setIdTouched] = useState(!!partner || !!preset?.id);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(
          "save",
          () =>
            adminSavePartner({
              data: { ...f, id: f.id || slugifyPartner(f.name), create: !partner },
            }),
          partner ? "Partner saved" : "Partner created",
        );
        if (r && "partner" in r && r.partner) onSaved?.(r.partner);
      }}
    >
      <Field label="Name" htmlFor={`${uid}-name`}>
        <Input
          id={`${uid}-name`}
          value={f.name}
          required
          maxLength={80}
          onChange={(e) => {
            set("name", e.target.value);
            if (!idTouched) set("id", slugifyPartner(e.target.value));
          }}
        />
      </Field>
      <Field
        label="Id"
        htmlFor={`${uid}-id`}
        hint={
          partner
            ? "Can't change: links use it."
            : "Used in links: medialife.ai/with/<id>. Matches the agency on old invite links."
        }
      >
        <Input
          id={`${uid}-id`}
          value={f.id}
          disabled={!!partner}
          maxLength={40}
          onChange={(e) => {
            setIdTouched(true);
            set("id", e.target.value.toLowerCase());
          }}
        />
      </Field>
      <Field label="Website" htmlFor={`${uid}-web`} optional>
        <Input
          id={`${uid}-web`}
          type="url"
          value={f.website}
          onChange={(e) => set("website", e.target.value)}
          placeholder="https://"
        />
      </Field>
      <Field label="Discord invite" htmlFor={`${uid}-discord`} optional>
        <Input
          id={`${uid}-discord`}
          type="url"
          value={f.discordUrl}
          onChange={(e) => set("discordUrl", e.target.value)}
          placeholder="https://discord.gg/…"
        />
      </Field>
      <Field
        label="Colours"
        hint="Accent is the Partner Hub highlight and button colour; keep it light enough for dark text."
      >
        <div className="flex flex-wrap gap-3">
          {(["accent", "primary", "ink"] as const).map((k) => (
            <label
              key={k}
              className="flex items-center gap-2 text-xs capitalize text-muted-foreground"
            >
              <input
                type="color"
                value={f.brand[k]}
                onChange={(e) => set("brand", { ...f.brand, [k]: e.target.value })}
                className="size-8 cursor-pointer rounded border border-border bg-transparent"
                aria-label={`${k} colour`}
              />
              {k}
            </label>
          ))}
        </div>
      </Field>
      <Field
        label="Collateral set"
        htmlFor={`${uid}-kit`}
        hint="The co-branded graphics they get, on top of the MEDIALIFE kit."
      >
        <select
          id={`${uid}-kit`}
          value={f.kit}
          onChange={(e) => set("kit", e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {Object.entries(PARTNER_KITS).map(([id, k]) => (
            <option key={id} value={id}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Internal notes"
        htmlFor={`${uid}-notes`}
        optional
        className="sm:col-span-2"
        hint="Only the MEDIALIFE team sees these."
      >
        <Textarea
          id={`${uid}-notes`}
          value={f.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          maxLength={4000}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        {partner ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.status === "paused"}
              onChange={(e) => set("status", e.target.checked ? "paused" : "active")}
            />
            Paused (the team can't sign in to the Partner Hub)
          </label>
        ) : null}
        <Button type="submit" disabled={busy} className="ml-auto">
          {partner ? "Save" : "Create partner"}
        </Button>
      </div>
    </form>
  );
}
