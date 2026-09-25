import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DemoOption } from "@/lib/ar/analytics.server";
import type { ArLink } from "@/lib/ar/events";
import { updateLink } from "@/lib/ar/links.functions";
import { cn } from "@/lib/utils";

import { copyText, formatDate, formatDateTime, relativeTime } from "../format";
import { CopyButton, Panel } from "../kit";
import { QrCode } from "../qr";
import { DeleteLinkDialog, EditLinkDialog, QrDialog } from "./dialogs";
import { UrlText } from "./url-text";
import { emailText, shareUrl, useOrigin } from "./util";

type Stats = Record<string, { visits: number; opens: number; lastAt: number }>;

function VisitsCell({ s, days }: { s: Stats[string] | undefined; days: number }) {
  if (!s) return <span className="text-muted-foreground">Not opened yet</span>;
  const bounced = s.opens - s.visits;
  return (
    <div>
      <span className="tabular-nums">
        <span className="font-medium">{s.visits}</span> visit{s.visits === 1 ? "" : "s"}
      </span>
      {bounced > 0 ? (
        <span className="ml-1 text-xs text-muted-foreground tabular-nums">+{bounced} bounced</span>
      ) : null}
      <div className="text-xs text-muted-foreground" title={`Last ${days} days`}>
        last opened{" "}
        <time dateTime={new Date(s.lastAt).toISOString()} title={formatDateTime(s.lastAt)}>
          {relativeTime(s.lastAt)}
        </time>
      </div>
    </div>
  );
}

function PasswordLine({ link, demo }: { link: ArLink; demo: DemoOption | undefined }) {
  if (link.unlock)
    return <span className="text-xs text-muted-foreground">Opens without a password</span>;
  if (!demo?.password)
    return <span className="text-xs text-muted-foreground">Uses the demo's password</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">Password</span>
      <span className="mono">{demo.password}</span>
      <CopyButton
        text={demo.password}
        label="Copy password"
        toastText="Password copied"
        className="size-6 [&_svg]:size-3.5"
      />
    </span>
  );
}

function LinkActions({
  link,
  url,
  demo,
  onEdit,
  onDelete,
  onArchive,
}: {
  link: ArLink;
  url: string;
  demo: DemoOption | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const withPassword = !link.unlock && demo?.password;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          aria-label={`Actions for ${link.name}`}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onSelect={async () => {
            if (await copyText(url)) toast.success("Link copied");
          }}
        >
          <Copy aria-hidden /> Copy link
        </DropdownMenuItem>
        {withPassword ? (
          <DropdownMenuItem
            onSelect={async () => {
              if (await copyText(emailText(url, link, demo)))
                toast.success("Ready to paste into an email");
            }}
          >
            <Copy aria-hidden /> Copy link and password
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden /> Open the demo
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <RouterLink to="/admin/analytics" search={{ client: link.code, range: "90d" }}>
            <BarChart3 aria-hidden /> See their visits
          </RouterLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onArchive}>
          {link.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          {link.archived ? "Restore" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-destructive focus:bg-destructive/15 focus:text-destructive"
        >
          <Trash2 aria-hidden /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QrThumb({ link, url, onOpen }: { link: ArLink; url: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Show the QR code for ${link.name}`}
      title="Show QR code"
    >
      <QrCode value={url} className="size-10 rounded-sm" />
    </button>
  );
}

export function LinkList({
  links,
  demos,
  stats,
  statsDays,
  highlight,
}: {
  links: ArLink[];
  demos: DemoOption[];
  stats: Stats;
  statsDays: number;
  highlight: string | null;
}) {
  const origin = useOrigin();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [qrFor, setQrFor] = useState<ArLink | null>(null);
  const [editing, setEditing] = useState<ArLink | null>(null);
  const [deleting, setDeleting] = useState<ArLink | null>(null);

  const demoById = useMemo(() => new Map(demos.map((d) => [d.id, d])), [demos]);
  const demoName = (id: string) =>
    demoById.get(id)?.short ?? (id.startsWith("x:") ? `${id.slice(2)} (endcap)` : id);
  const active = links.filter((l) => !l.archived);
  const archived = links.filter((l) => l.archived);
  const q = query.trim().toLowerCase();
  const shown = (tab === "active" ? active : archived).filter(
    (l) =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.code.includes(q) ||
      (l.note ?? "").toLowerCase().includes(q),
  );

  const archive = useMutation({
    mutationFn: (v: { code: string; archived: boolean }) => updateLink({ data: v }),
    onSuccess: (r, v) => {
      if (r.ok) toast.success(v.archived ? `Archived ${r.link.name}` : `Restored ${r.link.name}`);
      void qc.invalidateQueries({ queryKey: ["ar-links"] });
    },
    onError: () => toast.error("Couldn't update the link. Try again."),
  });

  const rowProps = (l: ArLink) => ({
    link: l,
    url: shareUrl(origin, l),
    demo: demoById.get(l.demo),
    onEdit: () => setEditing(l),
    onDelete: () => setDeleting(l),
    onArchive: () => archive.mutate({ code: l.code, archived: !l.archived }),
  });

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
          <TabsList className="bg-white/[0.04]">
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        {links.length > 6 ? (
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a client"
              aria-label="Find a client"
              className="pl-8"
            />
          </div>
        ) : null}
      </div>
      {tab === "archived" ? (
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          Archived links still open the demo, but no longer greet the client by name or skip the
          password. Visits are still counted.
        </p>
      ) : null}

      {!shown.length ? (
        <p className="border-t border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {q
            ? "No links match that search."
            : tab === "active"
              ? "No client links yet. Create the first one above."
              : "Nothing archived."}
        </p>
      ) : (
        <>
          {/* wide: table */}
          <div className="hidden border-t border-border @4xl/inset:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Client links</caption>
              <thead>
                <tr className="mono border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-2.5 font-normal">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Share link
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    <span className="sr-only">QR code</span>
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Visits · {statsDays} days
                  </th>
                  <th scope="col" className="hidden px-3 py-2.5 font-normal @6xl/inset:table-cell">
                    Created
                  </th>
                  <th scope="col" className="w-12 px-3 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((l) => {
                  const url = shareUrl(origin, l);
                  return (
                    <tr
                      key={l.code}
                      className={cn(
                        "align-top transition-colors",
                        highlight === l.code && "bg-emerald-400/[0.06]",
                      )}
                    >
                      <td className="max-w-[16rem] px-5 py-3">
                        <div className="font-medium">{l.name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {demoName(l.demo)}
                        </div>
                        {l.note ? (
                          <div
                            className="mt-1 line-clamp-2 text-xs text-muted-foreground/80"
                            title={l.note}
                          >
                            {l.note}
                          </div>
                        ) : null}
                      </td>
                      <td className="max-w-[26rem] px-3 py-3">
                        <div className="flex items-center gap-1">
                          <UrlText url={url} />
                          <CopyButton text={url} label="Copy link" toastText="Link copied" />
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                          >
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${l.name}'s link`}
                              title="Open"
                            >
                              <ExternalLink aria-hidden />
                            </a>
                          </Button>
                        </div>
                        <PasswordLine link={l} demo={demoById.get(l.demo)} />
                      </td>
                      <td className="px-3 py-3">
                        <QrThumb
                          link={l}
                          url={shareUrl(origin || "https://medialife.ai", l)}
                          onOpen={() => setQrFor(l)}
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <VisitsCell s={stats[l.code]} days={statsDays} />
                      </td>
                      <td className="hidden px-3 py-3 whitespace-nowrap text-muted-foreground @6xl/inset:table-cell">
                        {formatDate(l.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <LinkActions {...rowProps(l)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* narrow: cards */}
          <ul className="divide-y divide-border border-t border-border @4xl/inset:hidden">
            {shown.map((l) => {
              const url = shareUrl(origin, l);
              return (
                <li
                  key={l.code}
                  className={cn("px-4 py-4", highlight === l.code && "bg-emerald-400/[0.06]")}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {demoName(l.demo)} · created {formatDate(l.createdAt)}
                      </div>
                    </div>
                    <QrThumb
                      link={l}
                      url={shareUrl(origin || "https://medialife.ai", l)}
                      onOpen={() => setQrFor(l)}
                    />
                    <LinkActions {...rowProps(l)} />
                  </div>
                  {l.note ? (
                    <p className="mt-1.5 text-xs text-muted-foreground/80">{l.note}</p>
                  ) : null}
                  <div className="mt-2.5 flex items-center gap-1 rounded-md border border-border py-0.5 pr-0.5 pl-2.5">
                    <UrlText url={url} className="flex-1" />
                    <CopyButton text={url} label="Copy link" toastText="Link copied" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 text-sm">
                    <PasswordLine link={l} demo={demoById.get(l.demo)} />
                    <VisitsCell s={stats[l.code]} days={statsDays} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <QrDialog
        link={qrFor}
        url={qrFor ? shareUrl(origin, qrFor) : ""}
        onOpenChange={(o) => !o && setQrFor(null)}
      />
      <EditLinkDialog
        link={editing}
        demo={editing ? demoById.get(editing.demo) : undefined}
        onOpenChange={(o) => !o && setEditing(null)}
      />
      <DeleteLinkDialog link={deleting} onOpenChange={(o) => !o && setDeleting(null)} />
    </Panel>
  );
}
