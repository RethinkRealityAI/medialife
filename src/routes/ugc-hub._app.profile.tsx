import { useId, useState, type ReactNode } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  AtSign,
  ExternalLink,
  Loader2,
  LogOut,
  MapPin,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

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
import { Card, Notice, Page, PageHead } from "@/components/ugc/creator/kit";
import { UgcPageSkeleton, UgcRouteError } from "@/components/ugc/creator/states";
import { dayDate } from "@/components/ugc/shared/format";
import { btnDanger, btnGhost, btnGold, field, textarea } from "@/components/ugc/shared/look";
import { UgcPlatformIcon } from "@/components/ugc/shared/platform-icon";
import { signOutUgc } from "@/lib/ugc/auth.functions";
import {
  getUgcProfile,
  requestUgcDataDeletion,
  updateUgcProfile,
} from "@/lib/ugc/creator.functions";
import {
  UGC,
  UGC_PLATFORMS,
  UGC_PLATFORM_LABELS,
  UGC_ROUTES,
  ugcHandleUrl,
  type ShippingAddress,
  type UgcPlatform,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ugc-hub/_app/profile")({
  loader: () => getUgcProfile(),
  head: () => ({ meta: [{ title: "Profile · EVADE UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <UgcPageSkeleton />,
  errorComponent: UgcRouteError,
  component: ProfilePage,
});

type Profile = ReturnType<typeof Route.useLoaderData>;

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function save(data: Parameters<typeof updateUgcProfile>[0]["data"], ok = "Saved") {
    setBusy(true);
    try {
      const r = await updateUgcProfile({ data });
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
      toast.success(ok);
      await router.invalidate();
      return true;
    } catch {
      toast.error("Couldn't save. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, save };
}

function ProfilePage() {
  const p = Route.useLoaderData();
  return (
    <Page>
      <PageHead kicker="Profile" title="Your details">
        Keep these current so your package reaches you and we can credit your posts.
      </PageHead>
      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-4">
          <DetailsForm p={p} />
          <HandlesForm p={p} />
        </div>
        <div className="grid gap-4">
          <AddressForm p={p} />
          <DataCard p={p} />
          <button
            type="button"
            className={cn(btnGhost, "justify-self-start")}
            onClick={async () => {
              try {
                await signOutUgc();
              } finally {
                window.location.assign(UGC_ROUTES.signIn);
              }
            }}
          >
            <LogOut aria-hidden /> Sign out
          </button>
        </div>
      </div>
    </Page>
  );
}

function FormCard({
  id,
  icon: Icon,
  title,
  description,
  children,
  onSubmit,
  dirty,
  busy,
}: {
  id: string;
  icon: typeof UserRound;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onSubmit?: () => void;
  dirty?: boolean;
  busy?: boolean;
}) {
  return (
    <Card as="section" labelledBy={`${id}-title`} className="p-5 sm:p-6">
      <h2
        id={`${id}-title`}
        className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]"
      >
        <Icon className="size-[18px] text-[#3fe6e0]" aria-hidden />
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      <form
        className="mt-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        {children}
        {onSubmit ? (
          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className={dirty ? btnGold : btnGhost} disabled={!dirty || busy}>
              {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
              Save
            </button>
            {dirty ? <span className="text-xs text-muted-foreground">Unsaved changes</span> : null}
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  className,
  ...rest
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  hint?: ReactNode;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(field, rest.readOnly && "text-muted-foreground")}
        {...rest}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function DetailsForm({ p }: { p: Profile }) {
  const { busy, save } = useSave();
  const init = {
    creatorName: p.creator.creatorName,
    name: p.creator.name,
    country: p.creator.country,
    phone: p.phone,
  };
  const [v, setV] = useState(init);
  const dirty = (Object.keys(init) as (keyof typeof init)[]).some((k) => v[k] !== init[k]);
  return (
    <FormCard
      id="details"
      icon={UserRound}
      title="You"
      dirty={dirty}
      busy={busy}
      onSubmit={() => void save(v)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Creator name"
          value={v.creatorName}
          maxLength={80}
          onChange={(x) => setV({ ...v, creatorName: x })}
          autoComplete="nickname"
        />
        <Field
          label="Your name"
          value={v.name}
          maxLength={120}
          onChange={(x) => setV({ ...v, name: x })}
          autoComplete="name"
        />
        <Field
          label="Email"
          value={p.creator.email}
          readOnly
          type="email"
          hint={
            <>
              To change it, email{" "}
              <a className="underline underline-offset-4" href={`mailto:${UGC.supportEmail}`}>
                {UGC.supportEmail}
              </a>
              .
            </>
          }
        />
        <Field
          label="Phone"
          value={v.phone}
          maxLength={40}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          onChange={(x) => setV({ ...v, phone: x })}
          hint="Only for the courier."
        />
        <Field
          label="Country"
          value={v.country}
          maxLength={80}
          autoComplete="country-name"
          onChange={(x) => setV({ ...v, country: x })}
          className="sm:col-span-2"
        />
      </div>
    </FormCard>
  );
}

function HandlesForm({ p }: { p: Profile }) {
  const { busy, save } = useSave();
  const init = Object.fromEntries(
    UGC_PLATFORMS.map((k) => [k, p.creator.handles[k] ?? ""]),
  ) as Record<UgcPlatform, string>;
  const [v, setV] = useState(init);
  const dirty = UGC_PLATFORMS.some((k) => v[k] !== init[k]);
  return (
    <FormCard
      id="handles"
      icon={AtSign}
      title="Your handles"
      description="Where you post. Leave any you don't use empty."
      dirty={dirty}
      busy={busy}
      onSubmit={() => void save({ handles: v }, "Handles saved")}
    >
      <ul className="space-y-3">
        {UGC_PLATFORMS.map((k) => {
          const url = ugcHandleUrl(k, v[k]);
          const fid = `handle-${k}`;
          return (
            <li key={k}>
              <label htmlFor={fid} className="sr-only">
                {UGC_PLATFORM_LABELS[k]}
              </label>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex w-28 items-center gap-2 pl-3.5 text-sm text-muted-foreground">
                    <UgcPlatformIcon platform={k} />
                    {UGC_PLATFORM_LABELS[k]}
                  </span>
                  <input
                    id={fid}
                    value={v[k]}
                    maxLength={200}
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={
                      k === "discord" ? "username" : k === "youtube" ? "@channel" : "@handle"
                    }
                    onChange={(e) => setV({ ...v, [k]: e.target.value })}
                    className={cn(field, "pl-[7.5rem]")}
                  />
                </div>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
                    aria-label={`Open ${UGC_PLATFORM_LABELS[k]} profile`}
                  >
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                ) : (
                  <span className="size-11 shrink-0" aria-hidden />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </FormCard>
  );
}

const EMPTY: ShippingAddress = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

function AddressForm({ p }: { p: Profile }) {
  const { busy, save } = useSave();
  const init = p.address ?? { ...EMPTY, name: p.creator.name, country: p.creator.country };
  const [v, setV] = useState<ShippingAddress>(init);
  const dirty = (Object.keys(EMPTY) as (keyof ShippingAddress)[]).some((k) => v[k] !== init[k]);
  const set = (k: keyof ShippingAddress) => (x: string) => setV({ ...v, [k]: x });
  return (
    <FormCard
      id="address"
      icon={MapPin}
      title="Shipping address"
      description="Only used to send your package. We delete it 90 days after delivery."
      dirty={dirty}
      busy={busy}
      onSubmit={() => {
        if (!v.line1.trim() || !v.city.trim() || !v.postalCode.trim())
          return toast.error("Add at least the street, city and postcode.");
        void save({ address: v }, "Address saved");
      }}
    >
      {p.addressPurged ? (
        <Notice className="mb-4" tone="info" icon={ShieldCheck}>
          Your package was delivered, so we deleted your address. Add it again only if we ask.
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          className="sm:col-span-2"
          label="Full name"
          value={v.name}
          onChange={set("name")}
          autoComplete="shipping name"
          maxLength={120}
        />
        <Field
          className="sm:col-span-2"
          label="Street address"
          value={v.line1}
          onChange={set("line1")}
          autoComplete="shipping address-line1"
          maxLength={200}
        />
        <Field
          className="sm:col-span-2"
          label="Apartment, suite (optional)"
          value={v.line2}
          onChange={set("line2")}
          autoComplete="shipping address-line2"
          maxLength={200}
        />
        <Field
          label="City"
          value={v.city}
          onChange={set("city")}
          autoComplete="shipping address-level2"
          maxLength={120}
        />
        <Field
          label="State / region"
          value={v.region}
          onChange={set("region")}
          autoComplete="shipping address-level1"
          maxLength={120}
        />
        <Field
          label="Postcode / ZIP"
          value={v.postalCode}
          onChange={set("postalCode")}
          autoComplete="shipping postal-code"
          maxLength={30}
        />
        <Field
          label="Country"
          value={v.country}
          onChange={set("country")}
          autoComplete="shipping country-name"
          maxLength={80}
        />
      </div>
    </FormCard>
  );
}

function DataCard({ p }: { p: Profile }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const req = p.creator.deletionRequest;

  async function send(cancel: boolean) {
    setBusy(true);
    try {
      const r = await requestUgcDataDeletion({ data: { note, cancel } });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(cancel ? "Request withdrawn" : "Request sent. We'll confirm by email.");
        setOpen(false);
        await router.invalidate();
      }
    } catch {
      toast.error("Couldn't send. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormCard
      id="data"
      icon={ShieldCheck}
      title="Your data"
      description="Ask us to delete your account, uploads and details."
    >
      {req ? (
        <Notice
          tone="warn"
          title={`Deletion requested ${dayDate(req.at)}`}
          action={
            <button
              type="button"
              className={btnGhost}
              onClick={() => void send(true)}
              disabled={busy}
            >
              Withdraw request
            </button>
          }
        >
          The team will confirm by email once it's done.
        </Notice>
      ) : (
        <button type="button" className={cn(btnDanger, "-ml-4")} onClick={() => setOpen(true)}>
          <Trash2 aria-hidden /> Request data deletion
        </button>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="rounded-3xl border-white/10 bg-[#0b1318]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your data?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll remove your account, uploads, handles and address, and confirm by email. Content
              that's already posted stays on your own channels.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label htmlFor={id} className="text-sm font-medium">
            Anything we should know?{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id={id}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={textarea}
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-full">Keep my data</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-full bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void send(false);
              }}
            >
              {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
              Send request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormCard>
  );
}
