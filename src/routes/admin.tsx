import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { BarChart3, Boxes, Link2, LogOut } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { adminLogout, getAdminSession } from "@/lib/ar/admin.functions";

// Internal tools for the activated-retail demos. Everything under /admin needs
// the shared admin password (AR_ADMIN_PASSWORD); the login page is
// /admin/login (src/routes/admin_.login.tsx), outside this layout.

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Activated Retail · Internal | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const s = await getAdminSession();
    if (!s.authed) {
      throw redirect({ to: "/admin/login", search: { next: location.href } });
    }
  },
  component: AdminLayout,
});

const NAV = [
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/links", label: "Client links", icon: Link2 },
  { to: "/admin/builder", label: "Endcap builder", icon: Boxes },
] as const;

function AdminLayout() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));

  async function logout() {
    await adminLogout();
    await router.navigate({ to: "/admin/login" });
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-border">
        <SidebarHeader className="border-b border-border">
          <Link
            to="/admin/analytics"
            className="flex items-center gap-2.5 px-2 py-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-md"
              style={{ background: "var(--gradient-ember)" }}
            >
              <span className="size-3 rounded-full bg-background/85" />
            </span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm leading-tight font-semibold tracking-tight">
                MEDIALIFE<sup className="text-[0.6em]">™</sup>
              </span>
              <span className="mono block truncate text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Activated retail · internal
              </span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="mono text-[10px] tracking-[0.18em] uppercase">
              Tools
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={current?.to === item.to}
                      tooltip={item.label}
                    >
                      <Link to={item.to}>
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout} tooltip="Sign out">
                <LogOut aria-hidden />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="@container/inset min-w-0">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <div className="min-w-0 flex-1">
            <span className="mono block text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Activated retail
            </span>
            <span className="block truncate text-sm font-medium">
              {current?.label ?? "Internal"}
            </span>
          </div>
        </header>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
