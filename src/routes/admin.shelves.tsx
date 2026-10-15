import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";

// /admin/shelves: Creator Merch Shelves. Children: the list and quick-link
// generator (admin.shelves.index.tsx) and the editor (admin.shelves.$slug.tsx).

export const Route = createFileRoute("/admin/shelves")({
  head: () => ({ meta: [{ title: "Merch shelves · Activated Retail | MEDIALIFE" }] }),
  component: ShelvesLayout,
});

function ShelvesLayout() {
  return (
    <>
      <Outlet />
      <Toaster theme="dark" position="bottom-right" closeButton />
    </>
  );
}
