import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { Panel } from "../kit";
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
  const tabs: Array<{ id: DetailTab; label: string; count?: number; alert?: boolean }> = [
    { id: "application", label: "Application", alert: data.creator.status === "submitted" },
    { id: "products", label: "Products", count: data.products.length, alert: waiting > 0 },
    { id: "experiences", label: "Experiences", count: data.experiences.length },
    { id: "files", label: "Files", count: data.files.length },
    { id: "orders", label: "Orders & payouts", count: data.orders.length },
    { id: "activity", label: "Activity" },
    { id: "internal", label: "Internal" },
  ];

  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <CreatorHeader data={data} />
      <Tabs
        value={tab}
        onValueChange={(v) => onTab(v as DetailTab)}
        className="px-4 py-4 sm:px-6 lg:px-8"
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="bg-white/[0.04]">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5 px-2.5">
                {t.label}
                {t.count !== undefined ? (
                  <span className="mono text-[10px] tabular-nums opacity-60">{t.count}</span>
                ) : null}
                {t.alert ? (
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      t.id === "application" ? "bg-sky-400" : "bg-amber-300",
                    )}
                  />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="application" className="mt-4">
          <ApplicationTab data={data} />
        </TabsContent>
        <TabsContent value="products" className="mt-4">
          <ProductsTab data={data} productId={productId} onProduct={onProduct} />
        </TabsContent>
        <TabsContent value="experiences" className="mt-4">
          <ExperiencesTab data={data} />
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <FilesTab data={data} />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <MoneyTab data={data} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab
            data={data}
            onProduct={(id) => {
              onProduct(id);
            }}
          />
        </TabsContent>
        <TabsContent value="internal" className="mt-4">
          <InternalTab data={data} />
        </TabsContent>
      </Tabs>
    </>
  );
}

export function CreatorSkeleton() {
  return (
    <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-9 w-64 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-5 w-96 max-w-full animate-pulse rounded bg-white/[0.04]" />
      <div className="h-9 w-[32rem] max-w-full animate-pulse rounded bg-white/[0.04]" />
      <Panel className="h-96 animate-pulse" />
    </div>
  );
}

export function CreatorNotFound() {
  return (
    <Panel className="mx-4 mt-10 max-w-md p-6 text-center sm:mx-auto">
      <h2 className="text-base font-medium">Creator not found</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        They may have been removed, or the link is wrong.
      </p>
      <Button asChild className="mt-4">
        <Link to="/admin/creators">All creators</Link>
      </Button>
    </Panel>
  );
}
