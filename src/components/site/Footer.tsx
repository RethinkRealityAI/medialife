import { Link } from "@tanstack/react-router";
import { SHOP_URL } from "./Nav";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background relative overflow-hidden">
      <div className="grid-bg absolute inset-0 opacity-40" />
      <div className="relative mx-auto max-w-[1400px] px-6 py-20">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-balance">
              Augmented reality, <span className="ember-text">deployed</span>.
            </h2>
            <p className="mt-6 text-muted-foreground max-w-md">
              Turnkey AR media infrastructure for global brands, live events, retail and print.
            </p>
            <Link
              to="/contact"
              className="mt-8 inline-flex items-center gap-3 mono text-xs uppercase tracking-[0.2em] border border-primary text-primary px-5 py-3 hover:bg-primary hover:text-primary-foreground transition"
            >
              Start a Deployment <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="md:col-span-7 grid grid-cols-2 md:grid-cols-3 gap-8 text-sm">
            <FCol
              title="Platform"
              items={[
                ["Technology", "/technology"],
                ["Insights", "/insights"],
                ["Fan Reactions", "/fan-reactions"],
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
                ["Retail", "/technology"],
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
        {items.map(([label, to]) =>
          to.startsWith("http") ? (
            <li key={label}>
              <a
                href={to}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                {label}{" "}
                <span aria-hidden className="opacity-60 text-[10px]">
                  ↗
                </span>
              </a>
            </li>
          ) : (
            <li key={label}>
              <Link to={to} className="hover:text-primary transition-colors">
                {label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
