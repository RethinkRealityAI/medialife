import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageBody, PageHeader, Tag, lift, surface } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { adminCreateClient, adminListClients } from "@/lib/client/admin.functions";
import { cn } from "@/lib/utils";

// /admin/clients: every client hub (EVADE first). Each is a private space for
// the client's own team with their own sign-ins.

export const Route = createFileRoute("/admin/clients/")({
  loader: () => adminListClients(),
  head: () => ({ meta: [{ title: "Client hubs | MEDIALIFE" }] }),
  component: Clients,
});

function Clients() {
  const d = Route.useLoaderData();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <PageHeader
        icon={Building2}
        tone="sky"
        eyebrow="Programs"
        title="Client hubs"
        description="A private hub for each IP client's own team: their UGC creators and videos, updates, merch, videos and files from the Media Library, and their experiences. Each person gets their own sign-in from an invitation. Nobody shares the admin password."
      />
      <PageBody>
        {d.clients.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.clients.map((c) => (
              <li key={c.id}>
                <Link
                  to="/admin/clients/$clientId"
                  params={{ clientId: c.id }}
                  className={cn(surface, lift, "flex items-center gap-4 p-4")}
                >
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-xl text-xs font-black"
                    style={{ background: c.brand.accent, color: c.brand.ink }}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{c.name}</span>
                      {c.status === "paused" ? (
                        <Tag tone="amber">Paused</Tag>
                      ) : (
                        <Tag tone="mint">Live</Tag>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {c.members} {c.members === 1 ? "person" : "people"} · {c.posts}{" "}
                      {c.posts === 1 ? "update" : "updates"}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Building2} title="No client hubs yet" />
        )}

        <form
          className={cn(surface, "flex flex-wrap items-end gap-3 p-4")}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || busy) return;
            setBusy(true);
            const r = await adminCreateClient({ data: { name } });
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            await navigate({ to: "/admin/clients/$clientId", params: { clientId: r.id } });
          }}
        >
          <label className="grid min-w-[220px] flex-1 gap-1.5 text-xs font-medium text-muted-foreground">
            New client hub
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client name"
              maxLength={80}
            />
          </label>
          <Button type="submit" disabled={busy || !name.trim()}>
            <Plus className="size-4" aria-hidden /> Create
          </Button>
        </form>
      </PageBody>
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </>
  );
}
