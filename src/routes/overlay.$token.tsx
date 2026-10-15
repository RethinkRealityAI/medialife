import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { LiveOverlay } from "@/components/hub/overlay/live-overlay";

// /overlay/<token>: the Live Drop browser source a creator adds to OBS,
// Streamlabs or TikTok LIVE Studio. Transparent, so the streaming app
// composites it over the game; ?bg=1 draws a stand-in stream behind it for
// previewing in a normal browser, ?scale=0.5…2 resizes the cards.
//
// The token in the URL is the credential (OBS has no cookies); the feed it
// reads is src/routes/api.hub.overlay.$token.ts. The root layout renders this
// path without site chrome and the server marks it noindex.

type Search = { bg?: 1; scale?: number };

export const Route = createFileRoute("/overlay/$token")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const scale = Number(s.scale);
    return {
      bg: s.bg === 1 || s.bg === "1" || s.bg === true ? 1 : undefined,
      scale: Number.isFinite(scale) && scale > 0 ? Math.min(2, Math.max(0.5, scale)) : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Live Drop overlay | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
    links: [
      // Colour flags and emoji everywhere: Windows' own emoji font has no
      // flags, and most streaming PCs are Windows. unicode-range subsetting
      // means only the glyphs on screen are downloaded.
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap",
      },
    ],
  }),
  component: OverlayPage,
});

/** Transparent page: the global stylesheet paints html/body dark. */
const TRANSPARENT_CSS =
  "html,body{background:transparent!important;background-color:transparent!important;overflow:hidden}";
const BACKDROP_CSS = "html,body{background:#05060f;overflow:hidden}";

function OverlayPage() {
  const { token } = Route.useParams();
  const { bg, scale } = Route.useSearch();

  useEffect(() => {
    if (bg) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = [html.style.background, body.style.background];
    html.style.background = "transparent";
    body.style.background = "transparent";
    return () => {
      html.style.background = prev[0];
      body.style.background = prev[1];
    };
  }, [bg]);

  return (
    <>
      <style>{bg ? BACKDROP_CSS : TRANSPARENT_CSS}</style>
      <main style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
        <h1
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
          }}
        >
          MEDIALIFE Live Drop overlay
        </h1>
        <LiveOverlay token={token} scale={scale ?? 1} backdrop={!!bg} />
      </main>
    </>
  );
}
