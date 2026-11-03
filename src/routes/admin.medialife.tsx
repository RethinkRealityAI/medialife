import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CircleUser,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Mail,
  PanelTop,
  Sparkles,
  Wand2,
} from "lucide-react";
import { z } from "zod";

import {
  AdminTab,
  AdminTabs,
  PageBody,
  PageHeader,
  Panel,
  TabCount,
  Tag,
  type AdminTabDef,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The MEDIALIFE brand kit: profile pictures, social banners, animated logos and
// static logo files, all built by scripts/brand/build-brand-kit.py into
// public/brand/kit/. To change an asset, change the script and re-run it.

const KIT = "/brand/kit";

const TABS = ["profile", "banners", "animated", "logos", "email"] as const;
type TabId = (typeof TABS)[number];

export const Route = createFileRoute("/admin/medialife")({
  validateSearch: z.object({ tab: z.enum(TABS).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "MEDIALIFE brand kit | MEDIALIFE" }] }),
  component: BrandKit,
});

type Format = { label: string; file: string; hint?: string };
type Asset = {
  title: string;
  /** What it's for, in one line. */
  use: string;
  size: string;
  preview: string;
  /** Preview shape: square crops to a circle, like the platforms do. */
  shape: "circle" | "wide" | "logo";
  /** Dark-on-light previews for black logo files. */
  light?: boolean;
  formats: Format[];
  note?: string;
};

const PROFILE: Asset[] = [
  {
    title: "MEDIALIFE in the ring",
    use: "Discord, Slack, LinkedIn, X, TikTok, Instagram, YouTube",
    size: "1080 × 1080",
    preview: `${KIT}/avatar-medialife.gif`,
    shape: "circle",
    formats: [
      {
        label: "PNG",
        file: "avatar-medialife.png",
        hint: "Square; the platform crops it to a circle",
      },
      { label: "GIF", file: "avatar-medialife.gif", hint: "Animated, for Discord" },
      { label: "MP4", file: "avatar-medialife.mp4", hint: "Animated, for video intros" },
      { label: "Round PNG", file: "avatar-medialife-circle.png", hint: "Already cut to a circle" },
    ],
    note: "The name gets too small to read below about 64px, so use the orb for Gmail and Google.",
  },
  {
    title: "The orb",
    use: "Gmail and Google account, favicons, anywhere it shows tiny",
    size: "1080 × 1080",
    preview: `${KIT}/avatar-mark.gif`,
    shape: "circle",
    formats: [
      { label: "PNG", file: "avatar-mark.png" },
      { label: "GIF", file: "avatar-mark.gif", hint: "Animated, for Discord" },
      { label: "MP4", file: "avatar-mark.mp4" },
      { label: "Round PNG", file: "avatar-mark-circle.png" },
    ],
  },
];

const BANNERS: Asset[] = [
  {
    title: "LinkedIn profile",
    use: "Your personal LinkedIn background",
    size: "1584 × 396",
    preview: `${KIT}/banner-linkedin.png`,
    shape: "wide",
    formats: [{ label: "PNG", file: "banner-linkedin.png" }],
    note: "Copy sits right of centre so your photo doesn't cover it.",
  },
  {
    title: "LinkedIn company page",
    use: "The MEDIALIFE page cover",
    size: "1128 × 191",
    preview: `${KIT}/banner-linkedin-page.png`,
    shape: "wide",
    formats: [{ label: "PNG", file: "banner-linkedin-page.png" }],
  },
  {
    title: "X (Twitter) header",
    use: "Header image",
    size: "1500 × 500",
    preview: `${KIT}/banner-x.png`,
    shape: "wide",
    formats: [{ label: "PNG", file: "banner-x.png" }],
  },
  {
    title: "YouTube channel art",
    use: "Banner; everything sits in the area every device shows",
    size: "2560 × 1440",
    preview: `${KIT}/banner-youtube.png`,
    shape: "wide",
    formats: [{ label: "PNG", file: "banner-youtube.png" }],
  },
  {
    title: "Facebook cover",
    use: "Page or profile cover",
    size: "1640 × 624",
    preview: `${KIT}/banner-facebook.png`,
    shape: "wide",
    formats: [{ label: "PNG", file: "banner-facebook.png" }],
  },
  {
    title: "Discord server banner",
    use: "Server banner (animated needs boost level 3)",
    size: "960 × 540",
    preview: `${KIT}/banner-discord.gif`,
    shape: "wide",
    formats: [
      { label: "GIF", file: "banner-discord.gif" },
      { label: "PNG", file: "banner-discord.png" },
    ],
  },
  {
    title: "Discord profile banner",
    use: "Your profile banner (needs Nitro)",
    size: "680 × 240",
    preview: `${KIT}/banner-discord-profile.gif`,
    shape: "wide",
    formats: [
      { label: "GIF", file: "banner-discord-profile.gif" },
      { label: "PNG", file: "banner-discord-profile.png" },
    ],
  },
];

const ANIMATED: Asset[] = [
  {
    title: "MEDIALIFE",
    use: "Our own surfaces: decks, video, site, socials",
    size: "1215 × 320",
    preview: `${KIT}/logo-medialife.gif`,
    shape: "logo",
    formats: [
      { label: "GIF", file: "logo-medialife.gif" },
      { label: "MP4", file: "logo-medialife.mp4" },
      {
        label: "Transparent WebM",
        file: "logo-medialife-transparent.webm",
        hint: "For OBS, video editors and web",
      },
    ],
  },
  {
    title: "Activated by MEDIALIFE",
    use: "Partner surfaces: merch, standees, partner posts, email",
    size: "1185 × 320",
    preview: `${KIT}/logo-activated.gif`,
    shape: "logo",
    formats: [
      { label: "GIF", file: "logo-activated.gif" },
      { label: "MP4", file: "logo-activated.mp4" },
      {
        label: "Transparent WebM",
        file: "logo-activated-transparent.webm",
        hint: "For OBS, video editors and web",
      },
      {
        label: "Email badge",
        file: "../../email/activated-by-medialife.gif",
        hint: "Small, for signatures",
      },
    ],
  },
];

const LOGOS: Asset[] = [
  {
    title: "MEDIALIFE wordmark, white",
    use: "On dark backgrounds",
    size: "PNG, transparent",
    preview: `${KIT}/static-medialife-white.png`,
    shape: "logo",
    formats: [{ label: "PNG", file: "static-medialife-white.png" }],
  },
  {
    title: "MEDIALIFE wordmark, black",
    use: "On light backgrounds",
    size: "PNG, transparent",
    preview: `${KIT}/static-medialife-black.png`,
    shape: "logo",
    light: true,
    formats: [{ label: "PNG", file: "static-medialife-black.png" }],
  },
  {
    title: "Activated by MEDIALIFE, white",
    use: "Partner surfaces, dark backgrounds",
    size: "PNG, transparent",
    preview: `${KIT}/static-activated-by-medialife-white.png`,
    shape: "logo",
    formats: [{ label: "PNG", file: "static-activated-by-medialife-white.png" }],
  },
  {
    title: "Activated by MEDIALIFE, black",
    use: "Partner surfaces, light backgrounds",
    size: "PNG, transparent",
    preview: `${KIT}/static-activated-by-medialife-black.png`,
    shape: "logo",
    light: true,
    formats: [{ label: "PNG", file: "static-activated-by-medialife-black.png" }],
  },
  {
    title: "The orb",
    use: "The mark on its own",
    size: "1024 × 1024, transparent",
    preview: `${KIT}/static-mark.png`,
    shape: "circle",
    formats: [
      { label: "PNG", file: "static-mark.png" },
      { label: "SVG", file: "../../favicon.svg", hint: "Vector, with its dark tile" },
    ],
  },
  {
    title: "Video call background",
    use: "Zoom, Google Meet, Teams",
    size: "1920 × 1080",
    preview: `${KIT}/call-background.png`,
    shape: "wide",
    formats: [{ label: "PNG", file: "call-background.png" }],
    note: "Your own view is mirrored in Zoom; everyone else sees the logo the right way round.",
  },
];

const fileUrl = (f: string) => new URL(`${KIT}/${f}`, "https://x").pathname;

function BrandKit() {
  const { tab = "profile" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tabs: AdminTabDef<TabId>[] = [
    {
      id: "profile",
      label: "Profile pictures",
      icon: CircleUser,
      badge: <TabCount n={PROFILE.length} />,
    },
    { id: "banners", label: "Banners", icon: PanelTop, badge: <TabCount n={BANNERS.length} /> },
    {
      id: "animated",
      label: "Animated logos",
      icon: Wand2,
      badge: <TabCount n={ANIMATED.length} />,
    },
    {
      id: "logos",
      label: "Logos & backgrounds",
      icon: ImageIcon,
      badge: <TabCount n={LOGOS.length} />,
    },
    { id: "email", label: "Email signature", icon: Mail },
  ];
  return (
    <>
      <PageHeader
        title="MEDIALIFE"
        icon={Sparkles}
        tone="rose"
        badge={<Tag tone="rose">Brand kit</Tag>}
        description="Profile pictures, banners and logos for every platform, built from the official artwork. Download what you need; each card says where it fits."
      />
      <PageBody>
        <AdminTabs
          tabs={tabs}
          value={tab}
          label="Brand kit"
          onChange={(t) =>
            void navigate({
              search: { tab: t === "profile" ? undefined : t },
              replace: true,
              resetScroll: false,
            })
          }
        >
          <AdminTab value="profile" className="space-y-4">
            <Intro>
              Animated pictures play on Discord (with Nitro) and anywhere that shows GIFs. Gmail,
              LinkedIn, X and Instagram only take a still image, so upload the PNG there.
            </Intro>
            <Grid assets={PROFILE} cols="sm:grid-cols-2" />
          </AdminTab>
          <AdminTab value="banners" className="space-y-4">
            <Intro>
              Each banner is cut to its platform's size, with the copy kept inside the area every
              device shows and clear of the profile picture. TikTok and Instagram have no banner, so
              use a profile picture there.
            </Intro>
            <Grid assets={BANNERS} cols="lg:grid-cols-2" />
          </AdminTab>
          <AdminTab value="animated" className="space-y-4">
            <Intro>
              Every animation starts on the finished logo, so it still looks right where it can't
              play. Use MEDIALIFE on our own surfaces and Activated by MEDIALIFE on partners'.
            </Intro>
            <Grid assets={ANIMATED} cols="lg:grid-cols-2" />
          </AdminTab>
          <AdminTab value="logos" className="space-y-4">
            <Intro>
              Transparent files for decks, documents and print previews. For print at large sizes,
              ask for the vector artwork.
            </Intro>
            <Grid assets={LOGOS} cols="sm:grid-cols-2 xl:grid-cols-3" />
          </AdminTab>
          <AdminTab value="email" className="space-y-4">
            <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <img
                src="/email/activated-by-medialife.gif"
                alt="Activated by MEDIALIFE"
                width={240}
                height={64}
                className="h-16 w-60 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Email signatures</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick your name, copy the signature and paste it into Gmail. The page walks you
                  through it.
                </p>
              </div>
              <Button asChild>
                <a href="/email/signature.html" target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden /> Open signatures
                </a>
              </Button>
            </Panel>
          </AdminTab>
        </AdminTabs>
      </PageBody>
    </>
  );
}

function Intro({ children }: { children: React.ReactNode }) {
  return <p className="max-w-3xl text-sm text-muted-foreground">{children}</p>;
}

function Grid({ assets, cols }: { assets: Asset[]; cols: string }) {
  return (
    <ul className={cn("grid grid-cols-1 items-start gap-4", cols)}>
      {assets.map((a) => (
        <li key={a.title}>
          <AssetCard asset={a} />
        </li>
      ))}
    </ul>
  );
}

function AssetCard({ asset: a }: { asset: Asset }) {
  return (
    <Panel className="flex flex-col overflow-hidden">
      <div
        className={cn(
          "grid place-items-center border-b border-white/[0.06]",
          a.light ? "bg-neutral-100" : "bg-[#0a0a12]",
          a.shape === "wide" ? "p-0" : "p-8",
        )}
      >
        <img
          src={a.preview}
          alt={`${a.title} preview`}
          loading="lazy"
          className={cn(
            a.shape === "circle" && "size-44 rounded-full sm:size-52",
            a.shape === "wide" && "w-full",
            a.shape === "logo" && "max-h-20 w-auto max-w-[85%]",
          )}
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold">{a.title}</h3>
            <p className="text-sm text-muted-foreground">{a.use}</p>
          </div>
          <Tag className="tabular-nums">{a.size}</Tag>
        </div>
        {a.note ? <p className="text-xs text-muted-foreground">{a.note}</p> : null}
        <div className="mt-auto flex flex-wrap gap-2">
          {a.formats.map((f, i) => (
            <Button key={f.file} asChild size="sm" variant={i === 0 ? "default" : "outline"}>
              <a
                href={fileUrl(f.file)}
                download
                title={f.hint}
                aria-label={`Download ${a.title} as ${f.label}`}
              >
                <Download aria-hidden /> {f.label}
              </a>
            </Button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
