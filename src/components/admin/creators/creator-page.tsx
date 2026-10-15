import { Link } from "@tanstack/react-router";
import {
  Activity,
  FileText,
  FolderOpen,
  Lock,
  Package,
  Receipt,
  Sparkles,
  UserX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

import { AdminTab, AdminTabs, EmptyState, Panel, TabCount, type AdminTabDef } from "../kit";
import { ActivityTab, InternalTab } from "./activity-internal";
import { ApplicationTab } from "./application-tab";
import { CreatorHeader } from "./creator-header";
import { ExperiencesTab } from "./experiences-tab";
import { FilesTab } from "./files-tab";
import { MoneyTab } from "./money-tab";
import { ProductsTab } from "./products-tab";
import type { CreatorDetail } from "./types";

export const DETAIL_TABS = [
  "application",
  "products",
  "experiences",
  "files",
  "orders",
  "activity",
  "internal",
] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

export function defaultTab(d: CreatorDetail): DetailTab {
  return d.creator.status === "approved" || d.creator.status === "paused" || d.products.length
    ? "products"
    : "application";
}

export function CreatorPage({
  data,
  tab,
  productId,
  onTab,
  onProduct,
}: {
  data: CreatorDetail;
  tab: DetailTab;
  productId: string | undefined;
  onTab: (t: DetailTab) => void;
  onProduct: (id: string | undefined) => void;
}) {
  const waiting = data.products.filter(
    (p) => p.stage !== "live" && p.waitingOn === "creator",
  ).length;
  const submitted = data.creator.status === "submitted";
  const tabs: AdminTabDef<DetailTab>[] = [
    {
      id: "application",
      label: "Application",
      icon: FileText,
      badge: submitted ? (
        <span className="size-2 rounded-full bg-sky-400 shadow-[0_0_8px_var(--color-sky-400)]">
          <span className="sr-only">(to review)</span>
        </span>
      ) : null,
    },
    {
      id: "products",
      label: "Products",
      icon: Package,
      badge: <TabCount n={data.products.length} alert={waiting > 0 ? "amber" : undefined} />,
    },
    {
      id: "experiences",
      label: "Experiences",
      icon: Sparkles,
      badge: <TabCount n={data.experiences.length} />,
    },
    { id: "files", label: "Files", icon: FolderOpen, badge: <TabCount n={data.files.length} /> },
    {
      id: "orders",
      label: "Orders & payouts",
      icon: Receipt,
      badge: <TabCount n={data.orders.length} />,
    },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "internal", label: "Internal", icon: Lock },
  ];

  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <CreatorHeader data={data} />
      <div className="px-4 py-5 sm:px-6 lg:px-8">
        <AdminTabs label="Creator sections" tabs={tabs} value={tab} onChange={onTab}>
          <AdminTab value="application">
            <ApplicationTab data={data} />
          </AdminTab>
          <AdminTab value="products">
            <ProductsTab data={data} productId={productId} onProduct={onProduct} />
          </AdminTab>
          <AdminTab value="experiences">
            <ExperiencesTab data={data} />
          </AdminTab>
          <AdminTab value="files">
            <FilesTab data={data} />
          </AdminTab>
          <AdminTab value="orders">
            <MoneyTab data={data} />
          </AdminTab>
          <AdminTab value="activity">
            <ActivityTab data={data} onProduct={(id) => onProduct(id)} />
          </AdminTab>
          <AdminTab value="internal">
            <InternalTab data={data} />
          </AdminTab>
        </AdminTabs>
      </div>
    </>
  );
}

export function CreatorSkeleton() {
  return (
    <div className="space-y-5 px-4 pt-4 pb-6 sm:px-6 sm:pt-6 lg:px-8">
      <Panel className="h-60 animate-pulse rounded-3xl" />
      <Panel className="h-12 animate-pulse" />
      <Panel className="h-96 animate-pulse" />
    </div>
  );
}

export function CreatorNotFound() {
  return (
    <div className="mx-auto mt-10 max-w-md px-4">
      <EmptyState
        icon={UserX}
        tone="slate"
        title="Creator not found"
        action={
          <Button asChild>
            <Link to="/admin/creators">All creators</Link>
          </Button>
        }
      >
        They may have been removed, or the link is wrong.
      </EmptyState>
    </div>
  );
}
