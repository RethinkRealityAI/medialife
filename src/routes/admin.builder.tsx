import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";

// /admin/builder: the endcap builder. Children: the project list
// (admin.builder.index.tsx) and the editor (admin.builder.$slug.tsx).

export const Route = createFileRoute("/admin/builder")({
  component: BuilderLayout,
});

function BuilderLayout() {
  return (
    <>
      <Outlet />
      <Toaster theme="dark" position="bottom-right" closeButton />
    </>
  );
}
