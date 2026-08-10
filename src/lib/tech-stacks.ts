export type TechStack = {
  slug: string;
  num: string;
  name: string;
  tagline: string;
  category: string;
  summary: string;
  hero: string;
  accent: string;
  glyph: string;
  capabilities: { t: string; d: string }[];
  specs: { k: string; v: string }[];
  useCases: { t: string; d: string }[];
  partners: string[];
};

export const TECH_STACKS: TechStack[] = [
  {
    slug: "webar",
    num: "01",
    name: "WebAR Runtime",
    tagline: "App-free, instant AR on any phone.",
    category: "Delivery Layer",
    summary:
      "A WebGL/WebGPU runtime — powered by 8th Wall, MindAR and a proprietary scene graph — that opens immersive AR straight from a QR scan, NFC tap, or link. No app store, no install, sub-3-second time-to-experience.",
    hero: "QR → Camera → AR scene, in under 3 seconds.",
    accent: "linear-gradient(135deg,#00d4ff,#0066ff)",
    glyph: "◉",
    capabilities: [
      {
        t: "Image Target Tracking",
        d: "Recognize printed art, packaging and merchandise as AR anchors with sub-pixel stability.",
      },
      {
        t: "Markerless World Tracking",
        d: "SLAM-based plane detection for full-room brand activations on commodity phones.",
      },
      {
        t: "Face & Body Effects",
        d: "Cosmetic try-on, fan-skin filters, and pose-driven gameplay rendered client-side.",
      },
      {
        t: "Geo-Anchored Experiences",
        d: "VPS-grade location anchors for citywide drops and venue takeovers.",
      },
    ],
    specs: [
      { k: "Runtime", v: "8th Wall + Proprietary" },
      { k: "Render", v: "WebGL 2 / WebGPU" },
      { k: "Load Target", v: "< 3.0s" },
      { k: "Compatibility", v: "iOS 13+, Android 8+" },
    ],
    useCases: [
      { t: "Print → Portal", d: "Magazines, posters and direct mail become living story portals." },
      {
        t: "Retail Shelf",
        d: "Packaging unlocks SKU-specific narratives and limited edition drops.",
      },
      {
        t: "Out-of-Home",
        d: "Billboards, murals, transit wraps activate as scannable AR canvases.",
      },
    ],
    partners: ["8th Wall", "Niantic", "MindAR", "Three.js", "A-Frame"],
  },
  {
    slug: "native-mobile-ar",
    num: "02",
    name: "ARKit & ARCore",
    tagline: "Premium native AR for flagship brand apps.",
    category: "Native Layer",
    summary:
      "When experiences demand cinematic fidelity — LiDAR-grade occlusion, depth-aware lighting, and persistent room-scale anchors — we ship native iOS (ARKit) and Android (ARCore) modules embedded directly into brand and partner apps.",
    hero: "Cinematic-grade AR with LiDAR occlusion and persistent anchors.",
    accent: "linear-gradient(135deg,#a855f7,#ec4899)",
    glyph: "◆",
    capabilities: [
      {
        t: "LiDAR Scene Reconstruction",
        d: "Centimeter-accurate occlusion and physics on iPhone Pro and iPad Pro.",
      },
      {
        t: "Depth API & People Occlusion",
        d: "Virtual characters move convincingly between fans and real-world objects.",
      },
      {
        t: "Cloud Anchors",
        d: "Shared, multi-user AR rooms persisted across sessions and devices.",
      },
      { t: "Motion Capture", d: "Full-body skeletal tracking for fan-as-character experiences." },
    ],
    specs: [
      { k: "iOS", v: "ARKit 7 / RealityKit 2" },
      { k: "Android", v: "ARCore + Sceneform Fork" },
      { k: "Engines", v: "Unity / Unreal / Native" },
      { k: "Assets", v: "USDZ · glTF · Reality Composer Pro" },
    ],
    useCases: [
      { t: "Flagship Brand Apps", d: "AR modules dropped into existing iOS/Android products." },
      { t: "In-Venue Companion", d: "Stadium and museum apps unlock spatial overlays on-site." },
      {
        t: "Hero Product Launches",
        d: "Cinematic reveals for hardware, vehicles, and collectibles.",
      },
    ],
    partners: ["Apple ARKit", "Google ARCore", "Unity", "Unreal", "Reality Composer Pro"],
  },
  {
    slug: "social-ar",
    num: "03",
    name: "Social AR Lenses",
    tagline: "Snap Lens Studio · Meta Spark · TikTok Effect House.",
    category: "Distribution Layer",
    summary:
      "We design, ship and operate brand lenses across Snapchat, Instagram, Facebook and TikTok — built for virality, equipped with measurement, and engineered to convert organic reach into owned fan data.",
    hero: "Designed for the For You page. Measured like media.",
    accent: "linear-gradient(135deg,#fbbf24,#f97316)",
    glyph: "✦",
    capabilities: [
      {
        t: "Lens Studio Effects",
        d: "Snap lenses with full ML-based segmentation, hand tracking, and SnapML.",
      },
      {
        t: "Meta Spark Effects",
        d: "Instagram/Facebook AR effects with shopping triggers and CTA cards.",
      },
      {
        t: "TikTok Effect House",
        d: "Native effects optimised for For You distribution and creator remix.",
      },
      {
        t: "Cross-Platform Pipeline",
        d: "One asset pipeline, deployed and versioned across all four platforms.",
      },
    ],
    specs: [
      { k: "Snap", v: "Lens Studio 5 / SnapML" },
      { k: "Meta", v: "Spark AR Pro" },
      { k: "TikTok", v: "Effect House" },
      { k: "Analytics", v: "Unified dashboard" },
    ],
    useCases: [
      {
        t: "Tentpole Campaign Launches",
        d: "Branded effects that ride film, music and sports release windows.",
      },
      { t: "Creator Activations", d: "Effects designed for top-tier creator amplification." },
      { t: "Always-On Brand IP", d: "Long-tail evergreen effects for sustained fan engagement." },
    ],
    partners: ["Snap Inc.", "Meta", "TikTok", "Lens Network"],
  },
  {
    slug: "ai-computer-vision",
    num: "04",
    name: "AI Computer Vision",
    tagline: "The eyes behind every experience.",
    category: "Intelligence Layer",
    summary:
      "Our computer-vision pipeline — built on TensorFlow Lite, MediaPipe and custom PyTorch models — powers brand-specific object recognition, IP-trained classifiers, face/hand/pose tracking and real-time scene understanding on commodity devices.",
    hero: "IP-trained models that see what your brand is, in real time.",
    accent: "linear-gradient(135deg,#10b981,#06b6d4)",
    glyph: "◈",
    capabilities: [
      {
        t: "Custom IP Classifiers",
        d: "Models trained on character, mascot and product libraries for instant recognition.",
      },
      {
        t: "Face / Hand / Body Mesh",
        d: "468-point facial mesh, 21-point hand mesh, full-body pose, all on-device.",
      },
      {
        t: "Scene Segmentation",
        d: "Per-pixel segmentation for sky replacement, ground swap, and brand world transformations.",
      },
      {
        t: "On-Device Inference",
        d: "WebAssembly + WebGPU inference. Zero data leaves the phone.",
      },
    ],
    specs: [
      { k: "Frameworks", v: "TensorFlow Lite · MediaPipe · ONNX" },
      { k: "Training", v: "PyTorch + custom data ops" },
      { k: "Edge", v: "WASM + WebGPU acceleration" },
      { k: "Privacy", v: "On-device, GDPR-clean" },
    ],
    useCases: [
      { t: "Mascot Recognition", d: "Point a phone at any character — get the AR story." },
      { t: "Try-On & Try-With", d: "Real-time fit for apparel, eyewear, cosmetics, accessories." },
      { t: "Gesture Gameplay", d: "Hand pose controls activate spells, drops, mini-games." },
    ],
    partners: ["Google MediaPipe", "TensorFlow", "PyTorch", "ONNX Runtime"],
  },
  {
    slug: "generative-ai",
    num: "05",
    name: "Generative AI Engagement",
    tagline: "Personalised fan moments at infinite scale.",
    category: "Intelligence Layer",
    summary:
      "We integrate frontier generative models — diffusion, voice, LLM, and multimodal — into AR activations so every fan walks away with a one-of-one artefact: a portrait, a track, a comic panel, a message from their favourite character.",
    hero: "Every fan gets a one-of-one moment. Owned by them. Branded by you.",
    accent: "linear-gradient(135deg,#ec4899,#8b5cf6)",
    glyph: "✺",
    capabilities: [
      {
        t: "Diffusion Portrait Studios",
        d: "Fan-as-character image generation with brand-safe LoRA fine-tunes.",
      },
      { t: "Voice Cloning & TTS", d: "Licensed character voices reply to fans in real time." },
      {
        t: "Conversational IP Agents",
        d: "LLM-driven character dialogue with guardrails and canon-fidelity.",
      },
      { t: "Generative Video & Music", d: "Personalised short-form video and soundtrack per fan." },
    ],
    specs: [
      { k: "Image", v: "SDXL · Flux · custom LoRAs" },
      { k: "Voice", v: "ElevenLabs · Play.ht" },
      { k: "LLMs", v: "GPT · Claude · Gemini · OSS" },
      { k: "Routing", v: "Multi-provider gateway" },
    ],
    useCases: [
      { t: "Fan-as-Hero Activations", d: "Step into the IP. Walk away as part of it." },
      { t: "Character DMs", d: "Authenticated, on-brand conversations with the IP itself." },
      { t: "Shareables-at-Scale", d: "Generated artefacts engineered for social re-share." },
    ],
    partners: ["OpenAI", "Anthropic", "Google DeepMind", "ElevenLabs", "Stability AI"],
  },
  {
    slug: "spatial-cloud",
    num: "06",
    name: "Spatial Cloud & SLAM",
    tagline: "Persistent, multiplayer AR worlds.",
    category: "World Layer",
    summary:
      "Geo-anchored VPS, room-scale persistence and shared multi-user sessions — so a brand activation lives in a venue, evolves across days, and can be returned to by every fan who experienced it.",
    hero: "Brand worlds that persist. Multiplayer. Geo-locked. Owned.",
    accent: "linear-gradient(135deg,#3b82f6,#06b6d4)",
    glyph: "⬢",
    capabilities: [
      {
        t: "Visual Positioning System",
        d: "Centimeter-accurate localisation against pre-scanned environments.",
      },
      { t: "Multi-User Sync", d: "Fans see the same dragon, the same drop, the same moment." },
      {
        t: "Persistent Anchors",
        d: "AR that stays where you left it — for days, weeks, or the run of an exhibit.",
      },
      { t: "Venue Mesh Capture", d: "Photogrammetric venue scans baked into the experience." },
    ],
    specs: [
      { k: "VPS", v: "Niantic Lightship · ARCore Geospatial" },
      { k: "Sync", v: "Realtime Colyseus / WebRTC" },
      { k: "Mapping", v: "Polycam · RealityScan · custom rigs" },
      { k: "Coverage", v: "5 continents live" },
    ],
    useCases: [
      {
        t: "Festival & Stadium Takeovers",
        d: "Venue-scale AR overlays synced across thousands of fans.",
      },
      { t: "Museum & Gallery Layers", d: "Permanent AR exhibits anchored to physical galleries." },
      { t: "City-Scale Drops", d: "Citywide AR scavenger hunts and IP launches." },
    ],
    partners: ["Niantic Lightship", "Google Geospatial", "Polycam", "Colyseus"],
  },
];

export const getStack = (slug: string) => TECH_STACKS.find((s) => s.slug === slug);
