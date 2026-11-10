import { Link } from "@tanstack/react-router";
import { SHOP_URL } from "./Nav";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-background relative overflow-hidden">
      <div className="grid-bg absolute inset-0 opacity-30" />
      <div className="relative mx-auto max-w-[1400px] px-6 py-20">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <h2 className="display text-5xl md:text-7xl">
              Fandom, <span className="text-primary">activated.</span>
            </h2>
            <p className="mt-6 text-muted-foreground max-w-md">
              Immersive products and experiences for entertainment and gaming IP: merch, print,
              retail, live events and games.
            </p>
            <Link to="/contact" className="mt-8 btn-pill btn-solid px-6 py-3.5 text-sm font-medium">
              Activate your IP <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="md:col-span-7 grid grid-cols-2 md:grid-cols-3 gap-8 text-sm">
            <FCol
              title="Platform"
              items={[
                ["Activated Merch", "/activated-merch/"],
                ["EVADE × Bobo", "/evade/"],
                ["Where is Bobo?", "/evade/where-is-bobo/"],
                ["Live Now", "/live"],
                ["Fan Reactions", "/#fan-reactions"],
                ["Production Capabilities", "/#capabilities"],
                ["Activated Retail Program", "/activated-retail"],
                ["Creator Hub", "/creator-hub"],
                ["Case Studies", "/case-studies"],
                ["Merch", SHOP_URL],
              ]}
            />
            <FCol
              title="Company"
              items={[
                ["About", "/"],
                ["Contact", "/contact"],
                ["Press", "/insights"],
              ]}
            />
            <FCol
              title="Resources"
              items={[
                ["Brand Guidelines", "/brand"],
                ["Live Events", "/technology"],
                ["Retail", "/activated-retail"],
              ]}
            />
          </div>
        </div>

        <div className="mt-20 pt-8 border-t border-border flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <div>© {new Date().getFullYear()} MediaLife.AI — All rights reserved</div>
          <div className="flex gap-6">
            <span>
              Status: <span className="text-accent">● Live</span>
            </span>
            <span>v2.0.1</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FCol({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        / {title}
      </div>
      <ul className="space-y-3">
        {items.map(([label, to]) => {
          // Three link kinds: off-site (new tab + marker), same-page anchor
          // (plain <a>, no new tab), and in-app route (<Link>).
          const external = to.startsWith("http");
          // Static pages (served from public/, e.g. /activated-merch/) aren't
          // app routes, so they get a plain link too.
          const anchor = to.startsWith("/#") || (to.length > 1 && to.endsWith("/"));
          return (
            <li key={label}>
              {external || anchor ? (
                <a
                  href={to}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="hover:text-primary transition-colors"
                >
                  {label}
                  {external && (
                    <>
                      {" "}
                      <span aria-hidden className="opacity-60 text-[10px]">
                        ↗
                      </span>
                    </>
                  )}
                </a>
              ) : (
                <Link to={to} className="hover:text-primary transition-colors">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
