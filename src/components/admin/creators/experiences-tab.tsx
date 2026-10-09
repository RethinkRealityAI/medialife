import { useEffect, useId, useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminSaveExperience } from "@/lib/hub/admin.functions";
import {
  EXPERIENCE_KINDS,
  EXPERIENCE_STATUS,
  isImage,
  type Experience,
  type ExperienceKind,
  type ExperienceStatus,
} from "@/lib/hub/model";
import { IMAGE_ACCEPT } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

import { Panel } from "../kit";
import { FileThumb, UploadButton } from "./files-kit";
import type { CreatorDetail } from "./types";
import { Ago, CheckRow, Field, Pill, ghostBtn, outlineBtn, useRun } from "./ui";

export function ExperiencesTab({ data }: { data: CreatorDetail }) {
  const [editing, setEditing] = useState<Experience | "new" | null>(null);
  const byId = new Map(data.files.map((f) => [f.id, f]));
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-medium tracking-tight">
            Experiences ({data.experiences.length})
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What a fan opens when they scan or tap the merch. Attach one to a product in its
            details.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          New experience
        </Button>
      </div>
      {!data.experiences.length ? (
        <div className="border-t border-border px-4 py-12 text-center">
          <Sparkles className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">No experiences yet.</p>
          {data.creator.interests.experienceIdeas ? (
            <p className="mx-auto mt-2 max-w-lg text-sm">
              <span className="text-muted-foreground">Their idea: </span>“
              {data.creator.interests.experienceIdeas}”
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {data.experiences.map((e) => {
            const img = e.imageFileId ? byId.get(e.imageFileId) : undefined;
            const used = data.products.filter((p) => p.experienceId === e.id);
            const st = EXPERIENCE_STATUS[e.status];
            return (
              <li key={e.id} className="flex flex-wrap items-start gap-4 px-4 py-4 sm:px-5">
                {img ? (
                  <FileThumb file={img} className="size-16 shrink-0" />
                ) : (
                  <div className="grid size-16 shrink-0 place-items-center rounded-md border border-border bg-white/[0.03] text-muted-foreground">
                    <Sparkles className="size-5" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{e.name}</span>
                    <Pill tone={st.tone}>
                      {e.status === "review" ? "In creator review" : st.label}
                    </Pill>
                    <span className="text-xs text-muted-foreground">
                      {EXPERIENCE_KINDS[e.kind]}
                    </span>
                  </div>
                  {e.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>
                  ) : null}
                  {e.reward ? (
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">Fans get: </span>
                      {e.reward}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                      >
                        Live URL <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">No live URL</span>
                    )}
                    {e.previewUrl ? (
                      <a
                        href={e.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                      >
                        Preview <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                    <span className="text-muted-foreground">
                      {used.length
                        ? `On ${used.map((p) => p.name).join(", ")}`
                        : "Not on a product yet"}
                    </span>
                    <Ago ts={e.updatedAt} prefix="Updated " className="text-muted-foreground" />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={outlineBtn}
                  onClick={() => setEditing(e)}
                >
                  <Pencil aria-hidden />
                  Edit
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ExperienceDialog
        data={data}
        experience={editing === "new" ? null : editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </Panel>
  );
}

const NONE = "__none";

function ExperienceDialog({
  data,
  experience,
  open,
  onOpenChange,
}: {
  data: CreatorDetail;
  experience: Experience | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const uid = useId();
  const { pending, run } = useRun();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ExperienceKind>("ar");
  const [status, setStatus] = useState<ExperienceStatus>("concept");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("");
  const [url, setUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageFileId, setImageFileId] = useState(NONE);
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(experience?.name ?? "");
    setKind(experience?.kind ?? "ar");
    setStatus(experience?.status ?? "concept");
    setDescription(experience?.description ?? "");
    setReward(experience?.reward ?? "");
    setUrl(experience?.url ?? "");
    setPreviewUrl(experience?.previewUrl ?? "");
    setImageFileId(experience?.imageFileId ?? NONE);
    setNotify(true);
    setError(null);
  }, [open, experience]);

  const images = data.files.filter((f) => isImage(f.mime) && f.kind !== "artwork");
  const img = data.files.find((f) => f.id === imageFileId);
  const announces = status !== experience?.status && (status === "review" || status === "live");
  const urlOk = (s: string) => !s.trim() || /^https?:\/\/\S+$/i.test(s.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{experience ? `Edit ${experience.name}` : "New experience"}</DialogTitle>
          <DialogDescription>
            The creator sees this in their hub, with the preview link while it's in review.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return setError("Give it a name");
            if (!urlOk(url) || !urlOk(previewUrl))
              return setError("Links must be full URLs starting with https://");
            setError(null);
            const r = await run(
              "save",
              () =>
                adminSaveExperience({
                  data: {
                    creatorId: data.creator.id,
                    ...(experience ? { id: experience.id } : {}),
                    name: name.trim(),
                    kind,
                    status,
                    description: description.trim(),
                    reward: reward.trim(),
                    url: url.trim(),
                    previewUrl: previewUrl.trim(),
                    imageFileId: imageFileId === NONE ? null : imageFileId,
                    notify: announces && notify,
                  },
                }),
              experience ? "Experience saved" : `Created ${name.trim()}`,
            );
            if (r) onOpenChange(false);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
            <Field label="Name" htmlFor={`${uid}-name`}>
              <Input
                id={`${uid}-name`}
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Kind" htmlFor={`${uid}-kind`}>
              <Select value={kind} onValueChange={(v) => setKind(v as ExperienceKind)}>
                <SelectTrigger id={`${uid}-kind`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXPERIENCE_KINDS) as ExperienceKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {EXPERIENCE_KINDS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status" htmlFor={`${uid}-status`}>
              <Select value={status} onValueChange={(v) => setStatus(v as ExperienceStatus)}>
                <SelectTrigger id={`${uid}-status`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXPERIENCE_STATUS) as ExperienceStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {k === "review" ? "Creator review" : EXPERIENCE_STATUS[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor={`${uid}-desc`} optional>
            <Textarea
              id={`${uid}-desc`}
              rows={3}
              className="min-h-0"
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field
            label="What fans get"
            htmlFor={`${uid}-reward`}
            optional
            hint="The reward for scanning, in a line."
          >
            <Input
              id={`${uid}-reward`}
              value={reward}
              maxLength={300}
              onChange={(e) => setReward(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Live URL"
              htmlFor={`${uid}-url`}
              optional
              hint="Where the activation link sends fans."
            >
              <Input
                id={`${uid}-url`}
                type="url"
                value={url}
                maxLength={1000}
                placeholder="https://…"
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Field
              label="Preview URL"
              htmlFor={`${uid}-prev`}
              optional
              hint="For the creator to try it first."
            >
              <Input
                id={`${uid}-prev`}
                type="url"
                value={previewUrl}
                maxLength={1000}
                placeholder="https://…"
                onChange={(e) => setPreviewUrl(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Image" htmlFor={`${uid}-img`} optional>
            <div className="flex flex-wrap items-center gap-2">
              {img ? <FileThumb file={img} className="size-9 shrink-0" /> : null}
              <Select value={imageFileId} onValueChange={setImageFileId}>
                <SelectTrigger id={`${uid}-img`} className="w-auto min-w-48 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {images.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <UploadButton
                creatorId={data.creator.id}
                kind="mockup"
                category="mockup"
                accept={IMAGE_ACCEPT}
                label="Upload"
                onUploaded={(f) => setImageFileId(f.id)}
              />
            </div>
          </Field>
          {announces ? (
            <div className={cn("rounded-md border border-border bg-white/[0.02] px-3 py-2.5")}>
              <CheckRow
                id={`${uid}-notify`}
                checked={notify}
                onChange={setNotify}
                hint={
                  status === "review"
                    ? "Asks them to open the preview and give feedback."
                    : "Tells them every scan now opens it."
                }
              >
                Email the creator that it's {status === "review" ? "ready to try" : "live"}
              </CheckRow>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="ghost"
              className={ghostBtn}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!!pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {experience ? "Save" : "Create experience"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
