import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BriefcaseBusiness, ExternalLink, Megaphone } from "lucide-react";

import { FileTile } from "@/components/hub/app/file-tile";
import { ProductThumb } from "@/components/hub/app/product-card";
import { TriggerBlock } from "@/components/hub/app/qr-download";
import { CopyButton, EmptyState, Page, PageHeader, Panel, Pill } from "@/components/hub/app/ui";
import { useWorkspace, type WsExperience, type WsProduct } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLATERAL_KINDS,
  SKUS,
  shortDate,
  stageIndex,
  stageOf,
  triggerUrl,
  type CollateralKind,
  type HubFile,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/launch-kit")({
  head: () => ({ meta: [{ title: "Launch kit · Creator Hub | MEDIALIFE" }] }),
  component: LaunchKit,
});

type Template = { id: string; label: string; limit?: number; text: string };

function templates(p: WsProduct, e: WsExperience | undefined): Template[] {
  const live = p.stage === "live";
  const shop = p.commerce.shopUrl || "[shop link]";
  const reward = e?.reward
    ? e.reward.charAt(0).toLowerCase() + e.reward.slice(1)
    : "a secret experience";
  const how =
    p.trigger.method === "qr"
      ? "Scan it"
      : p.trigger.method === "nfc"
        ? "Tap your phone on it"
        : "Scan or tap it";
  const howLower = how.charAt(0).toLowerCase() + how.slice(1);
  return live
    ? [
        {
          id: "youtube",
          label: "YouTube community post",
          text: `The ${p.name} is here!\n\nIt's not just merch: ${howLower} with your phone and it unlocks ${reward}. No app needed, it opens right in your browser.\n\nGet yours: ${shop}`,
        },
        {
          id: "x",
          label: "X post",
          limit: 280,
          text: `${p.name} is live 👀\n\n${how} to unlock ${reward}. No app needed.\n\n${shop}`,
        },
        {
          id: "discord",
          label: "Discord announcement",
          text: `@everyone New merch drop: **${p.name}**\n\nEvery one is activated. ${how} with your phone to unlock ${reward}. Works right in the browser.\n\nShop: ${shop}`,
        },
        {
          id: "pinned",
          label: "Pinned comment",
          text: `📌 The ${p.name} is out now! ${how} to unlock ${reward}. ${shop}`,
        },
      ]
    : [
        {
          id: "youtube",
          label: "YouTube community post",
          text: `Something's coming: the ${p.name}.\n\nIt's activated merch: ${howLower} with your phone and it unlocks ${reward}. No app needed.\n\nDrops ${p.eta ? shortDate(p.eta) : "soon"}. Stay tuned.`,
        },
        {
          id: "x",
          label: "X post",
          limit: 280,
          text: `New merch soon: the ${p.name}. ${how} to unlock ${reward} 👀\n\nDrops ${p.eta ? shortDate(p.eta) : "soon"}.`,
        },
        {
          id: "discord",
          label: "Discord announcement",
          text: `@everyone Sneak peek: **${p.name}** is on its way.\n\nIt's activated: ${howLower} with your phone to unlock ${reward}. Shop link coming on launch day.`,
        },
        {
          id: "pinned",
          label: "Pinned comment",
          text: `📌 The ${p.name} drops ${p.eta ? shortDate(p.eta) : "soon"}. ${how} to unlock ${reward}.`,
        },
      ];
}

function LaunchKit() {
  const ws = useWorkspace();
  const products = [...ws.products].sort(
    (a, b) =>
      (a.stage === "live" ? 0 : 1) - (b.stage === "live" ? 0 : 1) ||
      stageIndex(b.stage) - stageIndex(a.stage),
  );

  return (
    <Page>
      <PageHeader
        title="Launch kit"
        description="Everything to promote a drop: links, QR codes, promo files and posts you can copy."
      />

      {products.length > 1 ? (
        <nav aria-label="Products" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {products.map((p) => (
              <li key={p.id}>
                <a
                  href={`#kit-${p.id}`}
                  className="flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-sm hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ProductThumb product={p} className="size-7 rounded-full" />
                  {p.name}
                  {p.stage === "live" ? (
                    <span className="size-1.5 rounded-full bg-emerald-400" aria-label="(live)" />
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {products.length ? (
        <div className="mt-8 space-y-10">
          {products.map((p) => (
            <ProductKit
              key={p.id}
              product={p}
              origin={ws.origin}
              experience={ws.experiences.find((e) => e.id === p.experienceId)}
              files={ws.files.filter(
                (f) =>
                  f.productId === p.id &&
                  (f.kind === "collateral" || f.kind === "mockup") &&
                  f.complete,
              )}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BriefcaseBusiness}
          title="Your launch kit fills up as products get close to launch"
          className="mt-8"
        >
          Activation links, QR codes, mockups and ready-to-post announcements appear here for each
          product.
        </EmptyState>
      )}
    </Page>
  );
}

function ProductKit({
  product: p,
  origin,
  experience,
  files,
}: {
  product: WsProduct;
  origin: string;
  experience: WsExperience | undefined;
  files: HubFile[];
}) {
  const live = p.stage === "live";
  const groups = (Object.keys(COLLATERAL_KINDS) as CollateralKind[])
    .map((k) => ({
      id: k,
      label: COLLATERAL_KINDS[k],
      files: files.filter((f) => (f.kind === "mockup" ? "mockup" : f.category) === k),
    }))
    .filter((g) => g.files.length);
  const known = new Set(Object.keys(COLLATERAL_KINDS));
  const rest = files.filter((f) => f.kind !== "mockup" && !known.has(f.category));
  if (rest.length) groups.push({ id: "other", label: COLLATERAL_KINDS.other, files: rest });

  return (
    <section id={`kit-${p.id}`} aria-labelledby={`kit-${p.id}-title`} className="scroll-mt-24">
      <div className="mb-4 flex items-center gap-3">
        <ProductThumb product={p} className="size-12" />
        <div className="min-w-0 flex-1">
          <h2 id={`kit-${p.id}-title`} className="truncate text-lg font-medium">
            <Link
              to="/creator-hub/products/$productId"
              params={{ productId: p.id }}
              className="hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {p.name}
            </Link>
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {SKUS[p.sku].short}
            {p.campaign ? ` · ${p.campaign}` : ""}
          </p>
        </div>
        <Pill tone={live ? "live" : "primary"}>{live ? "On sale" : stageOf(p.stage).name}</Pill>
      </div>

      <div className="grid grid-cols-1 gap-4 @5xl/inset:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="@container p-5">
          <h3 className="mb-4 text-sm font-medium">Activation link & QR</h3>
          <TriggerBlock
            url={triggerUrl(origin, p.trigger.code)}
            name={p.name}
            method={p.trigger.method}
            placement={p.trigger.placement}
            compact
          />
          <div className="mt-5 border-t border-border pt-4">
            <div className="text-xs text-muted-foreground">Shop link</div>
            {p.commerce.shopUrl ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <a
                  href={p.commerce.shopUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 hover:underline"
                >
                  {p.commerce.shopUrl.replace(/^https?:\/\//, "")}
                </a>
                <CopyButton value={p.commerce.shopUrl} label="Copy" toastText="Shop link copied" />
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={p.commerce.shopUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open the shop page for ${p.name}`}
                  >
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Shop link arrives at launch.</p>
            )}
          </div>
        </Panel>

        <Announcements product={p} experience={experience} />
      </div>

      <div className="mt-4">
        {groups.length ? (
          <>
            <h3 className="mb-2 text-sm text-muted-foreground">Promo files</h3>
            <ul className="grid grid-cols-2 gap-3 @3xl/inset:grid-cols-3 @5xl/inset:grid-cols-5">
              {groups.flatMap((g) =>
                g.files.map((f) => <FileTile key={f.id} file={f} label={g.label} />),
              )}
            </ul>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Posters, social posts and mockups for this product arrive before launch.
          </p>
        )}
      </div>
    </section>
  );
}

function Announcements({
  product,
  experience,
}: {
  product: WsProduct;
  experience: WsExperience | undefined;
}) {
  const list = templates(product, experience);
  const [active, setActive] = useState(list[0].id);
  const t = list.find((x) => x.id === active) ?? list[0];
  const base = `ann-${product.id}`;

  return (
    <Panel className="flex flex-col p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Megaphone className="size-4 text-primary" aria-hidden /> Announcement posts
      </h3>
      <div role="tablist" aria-label="Where you're posting" className="flex flex-wrap gap-1.5">
        {list.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`${base}-tab-${x.id}`}
            aria-selected={x.id === active}
            aria-controls={`${base}-panel`}
            onClick={() => setActive(x.id)}
            className={cn(
              "h-8 shrink-0 rounded-full border px-3 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              x.id === active
                ? "border-primary/50 bg-primary/12 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${t.id}`}
        className="mt-3 flex flex-1 flex-col"
      >
        <label htmlFor={`${base}-text`} className="sr-only">
          {t.label} text
        </label>
        <Textarea
          id={`${base}-text`}
          readOnly
          value={t.text}
          rows={7}
          className="flex-1 resize-none text-sm leading-relaxed"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span
            className={cn(
              "text-xs tabular-nums",
              t.limit && t.text.length > t.limit ? "text-red-300" : "text-muted-foreground",
            )}
          >
            {t.text.length}
            {t.limit ? ` / ${t.limit}` : ""} characters
          </span>
          <CopyButton
            value={t.text}
            label="Copy post"
            variant="default"
            toastText={`${t.label} copied`}
          />
        </div>
        {!product.commerce.shopUrl ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Shop link arrives at launch. Posts update with it automatically.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
