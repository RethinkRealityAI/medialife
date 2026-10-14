/**
 * MEDIALIFE's proof: real activations on video, from the portfolio
 * (portfolio.medialife.ai) and medialife.ai, plus five short GIFs made for
 * email. Every partner sees these in Collateral.
 *
 * Hosted clips live in public/partner-kit/medialife/videos/ (web MP4 with a
 * poster). YouTube-only pieces play from YouTube; their posters are cropped
 * from the YouTube thumbnail, since every one is shot vertically.
 */

export type VideoCategory = "standee" | "product" | "fans" | "creators";

export const VIDEO_CATEGORIES: Record<VideoCategory, { title: string; blurb: string }> = {
  standee: {
    title: "Standees & installations",
    blurb: "Characters stepping off standees and buildings, at conventions and in the street.",
  },
  product: {
    title: "Product activations",
    blurb: "Shirts, stickers, cards and print that come alive when a fan taps or scans them.",
  },
  fans: {
    title: "Fan reactions",
    blurb: "Real fans at real events, seeing it for the first time.",
  },
  creators: {
    title: "Creator collabs",
    blurb: "Creators with millions of followers sharing activated merch with their audience.",
  },
};

export type KitVideo = {
  id: string;
  category: VideoCategory;
  title: string;
  /** One line on what happens. */
  what: string;
  /** e.g. "T-shirt · NFC". */
  tag: string;
  poster: string;
  /** A hosted MP4 (downloadable), or a YouTube id (plays from YouTube). */
  src?: string;
  youtube?: string;
  /** "0:08". */
  duration: string;
  /** Has sound worth turning on. */
  sound?: boolean;
};

const V = "/partner-kit/medialife/videos";
const hosted = (name: string) => ({ src: `${V}/${name}.mp4`, poster: `${V}/${name}.webp` });
const yt = (id: string, poster: string) => ({ youtube: id, poster: `${V}/${poster}.webp` });

export const MEDIALIFE_VIDEOS: KitVideo[] = [
  // Fan reactions first: the strongest opener.
  {
    id: "fans-sakamoto-recap",
    category: "fans",
    title: "Sakamoto Days: fans didn't just see it",
    what: "Netflix's Platinum Pinnacle Award-winning campaign. Activated print, retail and standees at Anime Expo, SDCC and Anime NYC.",
    tag: "Netflix · Recap",
    duration: "1:50",
    sound: true,
    ...hosted("fans-sakamoto-recap"),
  },
  {
    id: "fans-merch-apparel",
    category: "fans",
    title: "Fans meet activated merch and apparel",
    what: "Convention-goers tap shirts and prints and react as the art comes alive, with a giveaway built in.",
    tag: "Convention · Apparel",
    duration: "1:31",
    sound: true,
    ...hosted("fans-merch-apparel"),
  },
  {
    id: "standee-sakamoto",
    category: "standee",
    title: "Mr. Sakamoto steps off the standee",
    what: "Scan the standee and the character transforms in a puff of smoke, right there in the room.",
    tag: "Standee · QR",
    duration: "0:05",
    ...hosted("standee-sakamoto"),
  },
  {
    id: "building-sakamoto",
    category: "standee",
    title: "A building takeover at Comic-Con",
    what: "Location-based AR: Sakamoto Days paints itself across a San Diego building.",
    tag: "Location-based · AR",
    duration: "0:08",
    ...hosted("building-sakamoto"),
  },
  {
    id: "yt-tshirt-initial-d",
    category: "product",
    title: "Initial D storyboard tee",
    what: "Tap the shirt and the storyboard plays out on the phone.",
    tag: "T-shirt · NFC",
    duration: "Short",
    ...yt("C2176gcsBGg", "yt-tshirt-initial-d"),
  },
  {
    id: "yt-shirt-sukeban",
    category: "product",
    title: "Sukeban AR shirt at Anime NYC",
    what: "The back print comes to life on a fan's phone, mid-convention.",
    tag: "T-shirt · NFC",
    duration: "Short",
    ...yt("NY_yiFwgyd0", "yt-shirt-sukeban"),
  },
  {
    id: "sticker-trading-cards",
    category: "product",
    title: "Trading-card stickers",
    what: "Scan a sticker and the player animates off the card.",
    tag: "Sticker · QR",
    duration: "0:10",
    ...hosted("sticker-trading-cards"),
  },
  {
    id: "card-brooklyn-nets",
    category: "product",
    title: "Brooklyn Nets card",
    what: "A printed card turns into an animated moment.",
    tag: "Card · QR",
    duration: "0:07",
    ...hosted("card-brooklyn-nets"),
  },
  {
    id: "figures-bookshelf",
    category: "product",
    title: "Gamified figures on the shelf",
    what: "3D characters appear on a real bookshelf; drag to move them.",
    tag: "Gamified · NFC",
    duration: "0:08",
    ...hosted("figures-bookshelf"),
  },
  {
    id: "yt-sticker-chatbot",
    category: "product",
    title: "A sticker you can talk to",
    what: "Tap the sticker to chat with an AI-powered character.",
    tag: "Gamified sticker · NFC",
    duration: "Short",
    ...yt("hIMHmCg3fRQ", "yt-sticker-chatbot"),
  },
  {
    id: "yt-postcard-dandadan",
    category: "product",
    title: "DanDaDan postcard with a shop link",
    what: "The postcard animates, then sends the fan straight to pre-order.",
    tag: "Postcard · QR/NFC",
    duration: "Short",
    ...yt("Xj0fI-zAhsU", "yt-postcard-dandadan"),
  },
  {
    id: "yt-comic-dc",
    category: "product",
    title: "DC Comics page in 2D and 3D",
    what: "A comic page pops into 3D AR.",
    tag: "Poster · NFC + QR",
    duration: "Short",
    ...yt("84BdnPI6zcM", "yt-comic-dc"),
  },
  {
    id: "yt-cover-terminator",
    category: "product",
    title: "Netflix Terminator magazine cover",
    what: "Scan the cover for an animated preview.",
    tag: "Magazine · QR",
    duration: "Short",
    ...yt("rts-q6t3598", "yt-cover-terminator"),
  },
  {
    id: "yt-poster-tokyo",
    category: "product",
    title: "Tokyo AR poster",
    what: "A street poster that opens an AR experience when scanned.",
    tag: "Poster · QR",
    duration: "Short",
    ...yt("JWnrFleweqw", "yt-poster-tokyo"),
  },
  {
    id: "creator-logan-chitwood",
    category: "creators",
    title: "Logan Chitwood at Anime NYC",
    what: "TikTok creator (7M followers) with activated apparel.",
    tag: "TikTok · 7M",
    duration: "0:08",
    sound: true,
    ...hosted("creator-logan-chitwood"),
  },
  {
    id: "creator-fikshun",
    category: "creators",
    title: "Fik-Shun",
    what: "TikTok creator (5.8M followers) sharing activated content with their audience.",
    tag: "TikTok · 5.8M",
    duration: "0:08",
    sound: true,
    ...hosted("creator-fikshun"),
  },
  {
    id: "creator-anime-community",
    category: "creators",
    title: "Anime fan community",
    what: "Relatable activated content and merch that reached over 100k anime fans.",
    tag: "Community · 100k+",
    duration: "0:06",
    ...hosted("creator-anime-community"),
  },
];

/** Headline results from the portfolio, shown beside the videos. */
export const PROOF_STATS = [
  { v: "90%", l: "interaction rate" },
  { v: "2+ min", l: "average engagement" },
  { v: "50%", l: "of experiences shared" },
  { v: "680+", l: "interactions per retail unit" },
];

export const PORTFOLIO_URL = "https://portfolio.medialife.ai/";

export type KitGif = {
  id: string;
  title: string;
  /** Alt text for the email. */
  alt: string;
  src: string;
  /** "1.3 MB". */
  size: string;
  /** The video it's cut from. */
  from: string;
};

const G = "/partner-kit/medialife/gifs";

/** Short, small loops for email: 270px wide, about 4 seconds, under 2 MB. */
export const MEDIALIFE_GIFS: KitGif[] = [
  {
    id: "gif-standee-transformation",
    title: "The standee transformation",
    alt: "A character steps off a standee in AR",
    src: `${G}/standee-transformation.gif`,
    size: "1.3 MB",
    from: "standee-sakamoto",
  },
  {
    id: "gif-fans-react-merch",
    title: "Fans react to activated merch",
    alt: "Fans at a convention reacting to activated merch on their phones",
    src: `${G}/fans-react-merch.gif`,
    size: "1.7 MB",
    from: "fans-merch-apparel",
  },
  {
    id: "gif-fans-experienced-it",
    title: "“Fans didn't just see it…”",
    alt: "A fan laughing at an activated Sakamoto Days experience",
    src: `${G}/fans-experienced-it.gif`,
    size: "1.2 MB",
    from: "fans-sakamoto-recap",
  },
  {
    id: "gif-sticker-trading-cards",
    title: "Stickers that come alive",
    alt: "Trading-card stickers animating on a phone",
    src: `${G}/sticker-trading-cards.gif`,
    size: "1.4 MB",
    from: "sticker-trading-cards",
  },
  {
    id: "gif-creator-logan-chitwood",
    title: "Creator collab at Anime NYC",
    alt: "Creator Logan Chitwood showing activated apparel at Anime NYC",
    src: `${G}/creator-logan-chitwood.gif`,
    size: "1.5 MB",
    from: "creator-logan-chitwood",
  },
];

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const videoShareUrl = (v: KitVideo, origin: string) =>
  v.youtube ? youtubeUrl(v.youtube) : `${origin}${v.src}`;

/** An email-ready snippet: the GIF, linked to wherever the reader should go. */
export function gifEmailHtml(gif: KitGif, origin: string, href: string) {
  return `<a href="${href}" target="_blank"><img src="${origin}${gif.src}" width="270" alt="${gif.alt}" style="display:block;border:0;border-radius:12px;max-width:100%;height:auto"></a>`;
}
