import { useEffect, useRef } from "react";
import {
  Box,
  FileText,
  LayoutGrid,
  Lock,
  MousePointerClick,
  Palette,
  Route as RouteIcon,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

import type { Project } from "@/lib/ar/project";
import { SECTIONS, sectionForPath, type Issue, type SectionId } from "@/lib/ar/projects";
import { cn } from "@/lib/utils";

import { useEditor } from "./editor-context";
import { AccessSection, ActivationSection, CtaSection, OverviewSection } from "./sections/basics";
import { ShelvesSection } from "./sections/shelves";
import { ThemesSection } from "./sections/themes";
import { ArSection, TourSection } from "./sections/tour-ar";

// The editor's left column: a rail of sections and the scrollable form.

const ICONS: Record<SectionId, LucideIcon> = {
  overview: FileText,
  themes: Palette,
  shelves: LayoutGrid,
  activation: Smartphone,
  tour: RouteIcon,
  cta: MousePointerClick,
  access: Lock,
  ar: Box,
};
const SHORT: Partial<Record<SectionId, string>> = { cta: "CTA", activation: "Activate" };

export function SettingsPanel({
  issues,
  published,
  onRename,
}: {
  issues: Issue[];
  published: Project | null;
  onRename: (to: string) => Promise<string | null>;
}) {
  const { section, setSection } = useEditor();
  const scroller = useRef<HTMLDivElement>(null);
  const counts = new Map<SectionId, number>();
  for (const i of issues)
    counts.set(sectionForPath(i.path), (counts.get(sectionForPath(i.path)) ?? 0) + 1);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [section]);

  return (
    <div className="flex h-full min-h-0 border-r border-border bg-background">
      <nav
        aria-label="Endcap settings"
        className="flex w-[74px] shrink-0 flex-col gap-0.5 border-r border-border p-1.5"
      >
        {SECTIONS.map((s) => {
          const Icon = ICONS[s.id];
          const n = counts.get(s.id) ?? 0;
          const on = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              aria-current={on ? "page" : undefined}
              aria-label={n ? `${s.label}, ${n} to fix` : s.label}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-md px-0.5 py-2 text-[10px] leading-tight font-medium transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
                on
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", on && "text-primary")} aria-hidden />
              <span className="w-full truncate text-center">{SHORT[s.id] ?? s.label}</span>
              {n ? (
                <span
                  aria-hidden
                  className="absolute top-1 right-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] leading-4 text-destructive-foreground tabular-nums"
                >
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div
        ref={scroller}
        className="min-w-0 flex-1 overflow-y-auto overscroll-contain"
        data-settings-scroll
      >
        <h2 className="sr-only">{SECTIONS.find((s) => s.id === section)?.label}</h2>
        {section === "overview" ? <OverviewSection onRename={onRename} /> : null}
        {section === "themes" ? <ThemesSection /> : null}
        {section === "shelves" ? <ShelvesSection /> : null}
        {section === "activation" ? <ActivationSection /> : null}
        {section === "tour" ? <TourSection /> : null}
        {section === "cta" ? <CtaSection /> : null}
        {section === "access" ? <AccessSection /> : null}
        {section === "ar" ? <ArSection published={published} /> : null}
      </div>
    </div>
  );
}
