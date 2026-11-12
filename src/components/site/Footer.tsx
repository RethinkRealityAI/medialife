import { Link } from "@tanstack/react-router";
import { SHOP_URL } from "./Nav";
import { Lockup } from "./Logo";

/**
 * Site footer (2026-11 redesign): the mark and one line on the left, three
 * short link columns on the right, nothing else. Every page already ends on a
 * call to action (CtaBand), so the footer doesn't repeat one.
 */
export function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-background">
      <div className="mx-auto w-full max-w-[1280px] px-5 py-16 sm:px-8 lg:px-16 lg:py-20">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <Link to="/" className="inline-flex items-center gap-2" aria-label="MEDIALIFE home">
              <span className="relative h-6 w-6 shrink-0" aria-hidden>
                <span
                  className="absolute inset-0 rounded-full opacity-70 blur-sm"
                  style={{ background: "var(--gradient-logo)" }}
                />
                <span className="absolute inset-1 rounded-full border border-primary" />
                <span
                  className="absolute inset-2 rounded-full"
                  style={{ background: "var(--gradient-logo)" }}
                />
              </span>
              <Lockup className="h-[28px] w-auto" />
            </Link>
            <p className="mt-6 max-w-sm text-sm text-muted-foreground">
              The immersive AI studio for entertainment and gaming IP. App-free experiences on the
              products and media fans love, with real-time analytics built in.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3 md:col-span-7">
            <FCol
              title="Explore"
              items={[
                ["Activated Merch", "/activated-merch/"],
                ["EVADE × Bobo", "/evade/"],
                ["Where is Bobo?", "/evade/where-is-bobo/"],
                ["Live Now", "/live"],
                ["Case Studies", "/case-studies"],
                ["Shop", SHOP_URL],
              ]}
            />
            <FCol
              title="Studio"
              items={[
                ["What we build", "/#capabilities"],
                ["Technology", "/technology"],
                ["Retail Program", "/activated-retail"],
                ["Creator Hub", "/creator-hub"],
                ["Fan Reactions", "/fan-reactions"],
              ]}
            />
            <FCol
              title="Company"
              items={[
                ["Contact", "/contact"],
                ["AR research", "/insights"],
                ["Brand guidelines", "/brand"],
              ]}
            />
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:flex-row md:items-center">
          <div>© {new Date().getFullYear()} MEDIALIFE.AI · All rights reserved</div>
          <a href="mailto:hello@medialife.ai" className="transition-colors hover:text-primary">
            hello@medialife.ai
          </a>
        </div>
      </div>
    </footer>
  );
}

function FCol({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div>
      <h2 className="mb-4 mono text-[10px] font-normal uppercase tracking-[0.25em] text-muted-foreground">
        {title}
      </h2>
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
                  className="text-white/80 transition-colors hover:text-primary"
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
                <Link to={to} className="text-white/80 transition-colors hover:text-primary">
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
