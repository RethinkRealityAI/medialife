import { createFileRoute, Link } from "@tanstack/react-router";
import { TECH_STACKS } from "@/lib/tech-stacks";

export const Route = createFileRoute("/technology")({
  head: () => ({
    meta: [
      { title: "Technology — MediaLife.AI AR Stack" },
      {
        name: "description",
        content:
          "The MediaLife.AI augmented reality stack: WebAR runtime, computer vision tracking, real-time analytics, and global CDN delivery.",
      },
      { property: "og:title", content: "Technology — MediaLife.AI AR Stack" },
      {
        property: "og:description",
        content:
          "App-free WebAR, computer vision tracking, and a real-time analytics layer powering global AR deployments.",
      },
    ],
  }),
  component: Technology,
});

const LAYERS = [
  {
    n: "01",
    t: "Capture Layer",
    d: "Computer vision and image-target recognition trained on brand IP. Markerless tracking, SLAM, plane detection — all running on-device.",
    tech: ["WebAssembly CV", "Marker / Markerless", "SLAM", "Face & Body"],
  },
  {
    n: "02",
    t: "Runtime Layer",
    d: "No app, no download. A WebGL/WebGPU runtime delivered through any QR or NFC tap, optimized for sub-3-second time-to-AR.",
    tech: ["WebGL 2 / WebGPU", "8th Wall + Proprietary", "PWA", "Native bridges"],
  },
  {
    n: "03",
    t: "Storytelling Layer",
    d: "A componentized scene graph where IP holders compose persistent, evolving narrative arcs across SKUs and venues.",
    tech: ["Scene graph", "USDZ / glTF", "Spatial audio", "Real-time shaders"],
  },
  {
    n: "04",
    t: "Distribution Layer",
    d: "Global edge CDN with regional asset optimization for sub-second AR loads across Asia, Europe, and the Americas.",
    tech: ["Edge CDN", "Adaptive streaming", "Cache-first PWA", "Geo-routing"],
  },
  {
    n: "05",
    t: "Intelligence Layer",
    d: "Per-SKU, per-venue, per-interaction telemetry feeding real-time dashboards used by brand teams during live activations.",
    tech: ["Event pipeline", "Real-time OLAP", "Cohort analytics", "ROI attribution"],
  },
];

function Technology() {
  return (
    <>
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="relative mx-auto max-w-[1400px] px-6 pt-24 pb-28">
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            / Technology
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-medium tracking-tight text-balance leading-[0.95]">
            Five layers. <span className="ember-text">One AR fabric.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            A vertically-integrated AR media stack — from camera ingestion to brand-side analytics —
            engineered for app-free, sub-3-second time-to-experience at planetary scale.
          </p>

          <div className="mt-16 grid grid-cols-3 md:grid-cols-6 gap-px bg-border border border-border">
            {[
              ["<3s", "time-to-AR"],
              ["0", "app installs"],
              ["120s", "avg. dwell"],
              ["90%", "interaction rate"],
              ["5", "continents live"],
              ["99.97%", "edge uptime"],
            ].map(([v, l]) => (
              <div key={l} className="bg-background p-5">
                <div className="text-2xl md:text-3xl font-medium ember-text">{v}</div>
                <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground mt-2">
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STACK */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-24">
          <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-8">
            / The Stack
          </div>

          <div className="space-y-px bg-border border border-border">
            {LAYERS.map((l) => (
              <div
                key={l.n}
                className="bg-background grid md:grid-cols-12 gap-6 p-8 hover:bg-secondary transition group"
              >
                <div className="md:col-span-1 mono text-sm text-primary">[{l.n}]</div>
                <div className="md:col-span-3">
                  <h3 className="text-2xl font-medium">{l.t}</h3>
                </div>
                <div className="md:col-span-5 text-muted-foreground">{l.d}</div>
                <div className="md:col-span-3 flex flex-wrap gap-2">
                  {l.tech.map((t) => (
                    <span
                      key={t}
                      className="mono text-[10px] uppercase tracking-widest border border-border px-2 py-1 group-hover:border-primary/40 transition"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TECH STACK GRID */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-24">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                / The Toolkit
              </div>
              <h2 className="mt-4 text-4xl md:text-5xl font-medium tracking-tight text-balance">
                Six <span className="ember-text">technology stacks</span>. One agency.
              </h2>
              <p className="mt-4 max-w-xl text-muted-foreground">
                Each layer is independently deployable, fully measurable, and built to integrate
                with the others. Click any stack for the full technical brief.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
            {TECH_STACKS.map((s) => (
              <Link
                key={s.slug}
                to="/technology/$slug"
                params={{ slug: s.slug }}
                className="group bg-background p-8 hover:bg-secondary transition relative overflow-hidden"
              >
                <div
                  className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition"
                  style={{ background: "var(--gradient-ember)" }}
                />
                <div className="flex items-start justify-between">
                  <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    /{s.num} · {s.category}
                  </div>
                  <div className="h-7 w-7 border border-border rounded-full grid place-items-center text-xs group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition">
                    →
                  </div>
                </div>
                <h3 className="mt-8 text-2xl font-medium group-hover:ember-text transition">
                  {s.name}
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">{s.tagline}</p>
                <div className="mt-6 flex flex-wrap gap-1.5">
                  {s.partners.slice(0, 4).map((p) => (
                    <span
                      key={p}
                      className="mono text-[9px] uppercase tracking-widest border border-border px-2 py-1 text-muted-foreground group-hover:border-primary/40 transition"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* DIAGRAM */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1400px] px-6 py-24">
          <div className="grid md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-5">
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                / Architecture
              </div>
              <h2 className="mt-6 text-4xl md:text-5xl font-medium tracking-tight text-balance">
                Built for the <span className="ember-text">edge</span>, measured at the millisecond.
              </h2>
              <p className="mt-6 text-muted-foreground">
                Every scan, tap, share, and replay flows through a real-time telemetry pipeline.
                Brand and IP partners see results as they happen — on the floor of the activation.
              </p>
            </div>
            <div className="md:col-span-7">
              <div className="relative aspect-square w-full border border-border bg-background grid-bg-sm overflow-hidden scan-line">
                {/* Nodes diagram */}
                <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full">
                  <defs>
                    <radialGradient id="g1" cx="50%" cy="50%">
                      <stop offset="0%" stopColor="oklch(0.78 0.16 200)" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="oklch(0.78 0.16 200)" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <circle cx="200" cy="200" r="120" fill="url(#g1)" />
                  {[0, 60, 120, 180, 240, 300].map((a) => {
                    const r = (a * Math.PI) / 180;
                    const x = 200 + Math.cos(r) * 140;
                    const y = 200 + Math.sin(r) * 140;
                    return (
                      <g key={a}>
                        <line
                          x1="200"
                          y1="200"
                          x2={x}
                          y2={y}
                          stroke="oklch(0.72 0.20 35)"
                          strokeOpacity="0.5"
                          strokeDasharray="2 4"
                        />
                        <circle cx={x} cy={y} r="6" fill="oklch(0.72 0.20 35)" />
                      </g>
                    );
                  })}
                  <circle
                    cx="200"
                    cy="200"
                    r="14"
                    fill="oklch(0.08 0.005 240)"
                    stroke="oklch(0.78 0.16 200)"
                    strokeWidth="2"
                  />
                  <text
                    x="200"
                    y="380"
                    textAnchor="middle"
                    fontSize="10"
                    fill="oklch(0.62 0.01 240)"
                    fontFamily="JetBrains Mono"
                  >
                    EDGE NODE CLUSTER · GLOBAL
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-24 grid md:grid-cols-2 gap-10 items-center">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-balance">
            Ready to deploy AR for your IP?
          </h2>
          <div className="flex gap-3 md:justify-end">
            <Link
              to="/contact"
              className="bg-primary text-primary-foreground px-6 py-3 mono text-xs uppercase tracking-[0.2em] hover:bg-accent hover:text-accent-foreground transition"
            >
              Talk to engineering →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
