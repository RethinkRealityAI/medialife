import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { DemoOption } from "@/lib/ar/analytics.server";
import type { ArLink } from "@/lib/ar/events";
import { createLink } from "@/lib/ar/links.functions";
import { cn } from "@/lib/utils";

import { CopyButton, Panel, PanelTitle } from "../kit";
import { QrCode } from "../qr";
import { UrlText } from "./url-text";
import { CODE_RE, emailText, randomSuffix, shareUrl, suggestCode, useOrigin } from "./util";

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The demo picker: the two sent demos, then published builder endcaps. */
export function DemoSelect({
  id,
  value,
  onChange,
  demos,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  demos: DemoOption[];
}) {
  const builtin = demos.filter((d) => !d.builder);
  const endcaps = demos.filter((d) => d.builder);
  const unknown = value && !demos.some((d) => d.id === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Choose a demo" />
      </SelectTrigger>
      <SelectContent>
        {builtin.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.label}
          </SelectItem>
        ))}
        {endcaps.length ? (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">Builder endcaps</SelectLabel>
              {endcaps.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.short}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        ) : null}
        {unknown ? (
          <SelectItem value={value}>
            {value.startsWith("x:") ? `${value.slice(2)} (not published)` : value}
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}

export function CreateLink({
  demos,
  links,
  initialDemo,
  onCreated,
}: {
  demos: DemoOption[];
  links: ArLink[];
  initialDemo: string | undefined;
  onCreated: (link: ArLink) => void;
}) {
  const uid = useId();
  const origin = useOrigin();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [demo, setDemo] = useState(initialDemo ?? "roblox");
  const [suffix, setSuffix] = useState("");
  const [code, setCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<ArLink | null>(null);

  // random bits only on the client, so server and browser render the same markup
  useEffect(() => setSuffix(randomSuffix()), []);
  useEffect(() => {
    if (initialDemo) setDemo(initialDemo);
  }, [initialDemo]);

  const effectiveCode = codeEdited ? code : name.trim() && suffix ? suggestCode(name, suffix) : "";
  const taken = useMemo(() => new Set(links.map((l) => l.code)), [links]);
  const codeError = !effectiveCode
    ? touched
      ? "Add a code"
      : null
    : !CODE_RE.test(effectiveCode)
      ? "Use 2–40 lowercase letters, numbers, - or _"
      : taken.has(effectiveCode)
        ? "That code is already used by another link"
        : null;
  const nameError = touched && !name.trim() ? "Add who this link is for" : null;
  const demoOption = demos.find((d) => d.id === demo);

  const mutation = useMutation({
    mutationFn: () =>
      createLink({
        data: {
          name: name.trim(),
          demo,
          code: effectiveCode,
          unlock,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        setServerError(
          r.error === "taken"
            ? "That code is already used by another link"
            : "That demo no longer exists. Pick another.",
        );
        return;
      }
      setCreated(r.link);
      onCreated(r.link);
      void qc.invalidateQueries({ queryKey: ["ar-links"] });
      toast.success(`Link created for ${r.link.name}`);
    },
    onError: () => setServerError("Couldn't create the link. Try again."),
  });

  function reset() {
    setName("");
    setCode("");
    setCodeEdited(false);
    setUnlock(false);
    setNote("");
    setTouched(false);
    setServerError(null);
    setSuffix(randomSuffix());
    setCreated(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!name.trim() || codeError || !effectiveCode || !demo) return;
    mutation.mutate();
  }

  if (created) {
    const url = shareUrl(origin, created);
    const d = demos.find((x) => x.id === created.demo);
    const password = !created.unlock ? d?.password : null;
    return (
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <Check className="size-4" aria-hidden />
              Link ready
            </div>
            <h2 className="mt-1 text-lg font-medium tracking-tight">{created.name}</h2>
            <p className="text-sm text-muted-foreground">{d?.label ?? created.demo}</p>

            <div className="mt-4 flex items-center gap-1 rounded-md border border-border bg-background/60 py-1 pr-1 pl-3">
              <UrlText url={url} className="flex-1" />
              <CopyButton text={url} label="Copy link" toastText="Link copied" />
            </div>
            {password ? (
              <div className="mt-2 flex items-center gap-1 rounded-md border border-border bg-background/60 py-1 pr-1 pl-3 text-xs">
                <span className="text-muted-foreground">Password:</span>
                <span className="mono ml-1 flex-1">{password}</span>
                <CopyButton text={password} label="Copy password" toastText="Password copied" />
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {created.unlock ? "Opens without a password." : "No password needed."}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton
                text={emailText(url, created, d)}
                label={password ? "Copy link and password" : "Copy link"}
                toastText="Ready to paste into an email"
                showLabel
                className="border border-border"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              >
                <Plus aria-hidden />
                Create another
              </Button>
            </div>
          </div>
          <QrCode
            value={url}
            className="size-32 shrink-0 rounded-md"
            title={`QR code for ${created.name}`}
          />
        </div>
      </Panel>
    );
  }

  const preview = effectiveCode && origin ? shareUrl(origin, { demo, code: effectiveCode }) : null;

  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle
        title="New client link"
        sub="The demo greets them by name and every visit shows up under their name in Analytics."
      />
      <form onSubmit={submit} noValidate className="mt-5 grid gap-4 @3xl/inset:grid-cols-2">
        <Field label="Client or contact" htmlFor={`${uid}-name`} error={nameError}>
          <Input
            id={`${uid}-name`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setServerError(null);
            }}
            placeholder="e.g. Toei Animation"
            maxLength={80}
            autoFocus={!!initialDemo}
            autoComplete="off"
            aria-invalid={!!nameError}
            aria-describedby={nameError ? `${uid}-name-error` : undefined}
          />
        </Field>
        <Field label="Demo" htmlFor={`${uid}-demo`}>
          <DemoSelect id={`${uid}-demo`} value={demo} onChange={setDemo} demos={demos} />
        </Field>
        <Field
          label="Link code"
          htmlFor={`${uid}-code`}
          error={codeError}
          hint={
            codeEdited
              ? "Lowercase letters, numbers, - and _."
              : "Suggested from the name. You can change it."
          }
        >
          <div className="flex gap-1.5">
            <Input
              id={`${uid}-code`}
              value={effectiveCode}
              onChange={(e) => {
                setCodeEdited(true);
                setCode(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                setServerError(null);
              }}
              placeholder="toei-animation-x7k2"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              className="mono text-xs"
              aria-invalid={!!codeError}
              aria-describedby={codeError ? `${uid}-code-error` : `${uid}-code-hint`}
            />
            {codeEdited ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setCodeEdited(false);
                  setCode("");
                }}
                title="Use the suggested code"
                aria-label="Use the suggested code"
                className="shrink-0 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              >
                <RotateCcw aria-hidden />
              </Button>
            ) : null}
          </div>
        </Field>
        <div className="min-w-0">
          <span className="text-sm font-medium">Password</span>
          <label
            htmlFor={`${uid}-unlock`}
            className="mt-1.5 flex h-9 cursor-pointer items-center justify-between gap-3 rounded-md border border-input px-3"
          >
            <span className="text-sm">Skip the password for this link</span>
            <Switch
              id={`${uid}-unlock`}
              checked={unlock}
              onCheckedChange={setUnlock}
              className="data-[state=unchecked]:bg-white/15"
            />
          </label>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {unlock
              ? "They go straight in."
              : demoOption?.password
                ? `They'll need the password: ${demoOption.password}`
                : "They'll need the demo's password."}
          </p>
        </div>
        <Field
          label="Note (optional)"
          htmlFor={`${uid}-note`}
          hint="Only visible here, e.g. who sent it and when."
          className="@3xl/inset:col-span-2"
        >
          <Textarea
            id={`${uid}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            className="min-h-0 resize-y"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 @3xl/inset:col-span-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Plus aria-hidden />
            )}
            Create link
          </Button>
          {preview ? (
            <span className="mono min-w-0 truncate text-xs text-muted-foreground">{preview}</span>
          ) : null}
          {serverError ? (
            <p role="alert" className="w-full text-sm text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}
