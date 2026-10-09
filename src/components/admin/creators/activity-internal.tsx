import { useEffect, useId, useState } from "react";
import {
  BadgeDollarSign,
  CheckCircle2,
  FileUp,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  ShoppingBag,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminUpdateCreator } from "@/lib/hub/admin.functions";
import type { ActivityKind } from "@/lib/hub/model";

import { Panel, PanelTitle } from "../kit";
import type { CreatorDetail } from "./types";
import { Ago, ChipsInput, Field, Pill, useRun } from "./ui";

const ICONS: Record<ActivityKind, LucideIcon> = {
  account: UserRound,
  application: CheckCircle2,
  stage: Layers,
  proof: ImageIcon,
  decision: CheckCircle2,
  file: FileUp,
  experience: Sparkles,
  order: ShoppingBag,
  payout: BadgeDollarSign,
  message: MessageSquare,
};

export function ActivityTab({
  data,
  onProduct,
}: {
  data: CreatorDetail;
  onProduct: (id: string) => void;
}) {
  const items = [...data.activity].sort((a, b) => b.at - a.at);
  const products = new Map(data.products.map((p) => [p.id, p.name]));
  return (
    <Panel>
      <PanelTitle
        className="p-4 sm:p-5"
        title="Activity"
        sub="What the creator sees in their feed, newest first."
      />
      {!items.length ? (
        <p className="border-t border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing yet.
        </p>
      ) : (
        <ol className="divide-y divide-border border-t border-border">
          {items.map((a) => {
            const Icon = ICONS[a.kind] ?? Layers;
            const pname = a.productId ? products.get(a.productId) : null;
            return (
              <li key={a.id} className="flex gap-3 px-4 py-3 sm:px-5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-border bg-white/[0.03] text-muted-foreground">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{a.title}</span>
                    {a.actionable ? (
                      <Pill tone="watch" dot={false}>
                        Creator to-do
                      </Pill>
                    ) : null}
                  </div>
                  {a.body ? (
                    <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">
                      {a.body}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <Ago ts={a.at} />
                    {pname && a.productId ? (
                      <button
                        type="button"
                        onClick={() => onProduct(a.productId!)}
                        className="text-sky-300 hover:underline"
                      >
                        {pname}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function InternalTab({ data }: { data: CreatorDetail }) {
  const uid = useId();
  const { pending, run } = useRun();
  const a = data.admin;
  const [notes, setNotes] = useState(a.internalNotes);
  const [name, setName] = useState(a.manager.name);
  const [email, setEmail] = useState(a.manager.email);
  const [discord, setDiscord] = useState(a.manager.discord);
  const [tags, setTags] = useState<string[]>(a.tags);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setNotes(a.internalNotes);
    setName(a.manager.name);
    setEmail(a.manager.email);
    setDiscord(a.manager.discord);
    setTags(a.tags);
  }, [a]);
  const dirty =
    notes !== a.internalNotes ||
    name !== a.manager.name ||
    email !== a.manager.email ||
    discord !== a.manager.discord ||
    tags.join("\n") !== a.tags.join("\n");

  return (
    <form
      className="grid items-start gap-4 @5xl/inset:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
          return setError("That email doesn't look right");
        setError(null);
        void run(
          "internal",
          () =>
            adminUpdateCreator({
              data: {
                id: data.creator.id,
                admin: {
                  internalNotes: notes.trim(),
                  manager: { name: name.trim(), email: email.trim(), discord: discord.trim() },
                  tags,
                },
              },
            }),
          "Saved",
        );
      }}
    >
      <Panel className="border-amber-400/25 p-4 sm:p-5 @5xl/inset:row-span-2">
        <div className="flex items-center gap-2 text-amber-200">
          <Lock className="size-4" aria-hidden />
          <span className="text-sm font-medium">Never shown to the creator</span>
        </div>
        <Field
          label="Internal notes"
          htmlFor={`${uid}-notes`}
          className="mt-4"
          hint="Deal terms, context from calls, anything the team should know."
        >
          <Textarea
            id={`${uid}-notes`}
            rows={12}
            maxLength={10_000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <Field label="Tags" htmlFor={`${uid}-tags`} className="mt-4" hint="Enter or comma to add.">
          <ChipsInput
            id={`${uid}-tags`}
            value={tags}
            max={20}
            onChange={setTags}
            placeholder="e.g. priority, minecraft"
            validate={(s) => (s.length > 30 ? "30 characters at most" : null)}
          />
        </Field>
      </Panel>
      <Panel className="p-4 sm:p-5">
        <PanelTitle
          title="Manager"
          sub="The MEDIALIFE person looking after them. The creator sees the name and how to reach them."
        />
        <div className="mt-3 grid gap-3">
          <Field label="Name" htmlFor={`${uid}-mname`}>
            <Input
              id={`${uid}-mname`}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor={`${uid}-memail`} error={error}>
            <Input
              id={`${uid}-memail`}
              type="email"
              value={email}
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Discord" htmlFor={`${uid}-mdisc`}>
            <Input
              id={`${uid}-mdisc`}
              value={discord}
              maxLength={60}
              onChange={(e) => setDiscord(e.target.value)}
            />
          </Field>
        </div>
      </Panel>
      <div className="flex items-center justify-end gap-3 @5xl/inset:col-start-2">
        {dirty ? <span className="text-xs text-muted-foreground">Unsaved changes</span> : null}
        <Button type="submit" disabled={!dirty || !!pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </div>
    </form>
  );
}
