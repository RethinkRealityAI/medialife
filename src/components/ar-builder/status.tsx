import { Pill } from "@/components/portal/kit";
import type { ProjectStatus } from "@/lib/ar/projects";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  published: "Published",
  changed: "Unpublished changes",
};

export function StatusPill({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <Pill
      tone={status === "published" ? "live" : status === "changed" ? "watch" : "muted"}
      className={className}
    >
      {STATUS_LABEL[status]}
    </Pill>
  );
}
