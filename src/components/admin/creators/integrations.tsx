import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";

import { CopyButton, Panel, PanelTitle } from "../kit";
import { useOrigin } from "../links/util";
import type { CreatorsList } from "./types";

function Env({ children }: { children: ReactNode }) {
  return (
    <code className="mono rounded border border-border bg-white/[0.04] px-1 py-px text-[11px] text-foreground">
      {children}
    </code>
  );
}

function Endpoint({ url }: { url: string }) {
  return (
    <span className="mt-1 flex min-w-0 items-center gap-1">
      <span className="mono min-w-0 truncate text-[11px] text-foreground/90" title={url}>
        {url}
      </span>
      <CopyButton
        text={url}
        label="Copy URL"
        toastText="URL copied"
        className="size-6 [&_svg]:size-3.5"
      />
    </span>
  );
}

function Row({ ok, name, children }: { ok: boolean; name: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3 sm:px-5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
      ) : (
        <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-medium">{name}</span>
          <span className={ok ? "text-xs text-emerald-300" : "text-xs text-muted-foreground"}>
            {ok ? "Connected" : "Not set up"}
          </span>
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

/** Which integrations this deploy has, and the one line it takes to set each up. */
export function IntegrationsPanel({ data }: { data: CreatorsList }) {
  const origin = useOrigin() || "https://medialife.ai";
  return (
    <Panel>
      <PanelTitle
        className="p-4 sm:p-5"
        title="Integrations"
        sub="Set in the site's environment variables. Redeploy after changing them."
      />
      <ul className="divide-y divide-border border-t border-border">
        <Row ok={data.mailConfigured} name="Email (Resend)">
          Status changes, proofs, messages and payouts are emailed to creators. Set{" "}
          <Env>RESEND_API_KEY</Env> and <Env>HUB_EMAIL_FROM</Env>. <Env>HUB_TEAM_EMAIL</Env> gets an
          email for each new application.
        </Row>
        <Row ok={data.shopifyConfigured} name="Shopify order webhook">
          Set <Env>SHOPIFY_WEBHOOK_SECRET</Env>, then in Shopify add JSON webhooks for{" "}
          <Env>orders/paid</Env>, <Env>orders/updated</Env> and <Env>orders/cancelled</Env> to:
          <Endpoint url={`${origin}/api/hub/webhooks/shopify`} />
        </Row>
        <Row ok={data.ingestConfigured} name="Order ingest API">
          For other stores: <Env>POST</Env> orders with <Env>Authorization: Bearer</Env> and the{" "}
          <Env>HUB_INGEST_KEY</Env> value to:
          <Endpoint url={`${origin}/api/hub/orders`} />
        </Row>
        <Row ok={data.discordConfigured} name="Discord sign-in">
          Set <Env>DISCORD_CLIENT_ID</Env> and <Env>DISCORD_CLIENT_SECRET</Env>, with this redirect
          in the Discord app:
          <Endpoint url={`${origin}/api/hub/auth/discord/callback`} />
        </Row>
      </ul>
    </Panel>
  );
}
