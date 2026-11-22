// Every tunable of the lip sync engine, in one typed object (the admin panel can expose these; see docs/LIPSYNC.md).
// Times are in milliseconds, levels in dB, weights 0..1.

export interface LipSyncConfig {
  // ---- analysis
  /** AnalyserNode FFT size. 1024 at 48 kHz = 21 ms window: enough resolution for F1/F2, low latency. */
  fftSize: 512 | 1024 | 2048;
  /** Upper edge of the band used for vowels and consonant cues (Hz). 3400 keeps it phone-safe. */
  bandTopHz: number;

  // ---- speech gate (noise floor tracking with hysteresis)
  /** Speech starts when the level is this many dB above the tracked noise floor. */
  gateOpenDb: number;
  /** ...and stops when it falls below floor + this (must be < gateOpenDb). */
  gateCloseDb: number;
  /** Keep the gate open this long after the level drops (bridges short stops inside words). */
  gateHoldMs: number;
  /** Lowest floor the tracker may assume (dBFS). Digital silence sits far below this. */
  floorMinDb: number;
  /** How fast the floor rises toward a louder background (dB per second). It falls instantly. */
  floorRiseDbPerSec: number;

  // ---- loudness -> openness
  /** Loudness window: the recent peak (decaying 4 dB/s) is fully open, this many dB below it is closed (auto gain). */
  dynamicRangeDb: number;
  /** Curve on the 0..1 loudness (<1 opens the mouth earlier on quiet syllables). */
  loudnessGamma: number;
  /** Overall mouth size multiplier (applied to every viseme). */
  intensity: number;

  // ---- vowels (LPC formants F1/F2 -> soft nearest-prototype classification in log-formant space)
  /** How sharply the vowel classifier commits to one vowel (higher = crisper, lower = more blended). */
  vowelSharpness: number;
  /**
   * Seconds of speech over which the speaker's average formants are learned. The difference from a typical female
   * voice (capped at +-15%) shifts the vowel map, so deeper or brighter voices still land on the right vowels.
   */
  speakerAdaptSec: number;

  // ---- consonant cues
  /** Weight of fricatives (S, SH, F) detected from the high-band tilt. 0 disables. */
  fricativeGain: number;
  /** Weight of closures (P, B, M): a sharp level dip inside speech closes the lips. 0 disables. */
  closureGain: number;
  /** A dip of this many dB below the recent syllable peak counts as a closure. */
  closureDipDb: number;
  /** Weight of plosive bursts (T, D, K) on fast onsets. */
  burstGain: number;

  // ---- motion
  /** Time to reach a new mouth shape (ms). Critically damped, so no overshoot or jitter. */
  attackMs: number;
  /** Time to relax out of a shape (ms). A bit slower than attack reads as natural coarticulation. */
  releaseMs: number;
  /** Time for the jaw / loudness envelope (ms). */
  jawMs: number;
  /** Cap on any single viseme. */
  maxViseme: number;
  /** Cap on the sum of all visemes (shapes blend instead of stacking). */
  maxTotal: number;
}

export const DEFAULT_LIPSYNC_CONFIG: LipSyncConfig = {
  fftSize: 1024,
  bandTopHz: 3400,

  gateOpenDb: 9,
  gateCloseDb: 5,
  gateHoldMs: 140,
  floorMinDb: -75,
  floorRiseDbPerSec: 2.5,

  dynamicRangeDb: 26,
  loudnessGamma: 0.8,
  intensity: 1,

  vowelSharpness: 1,
  speakerAdaptSec: 6,

  fricativeGain: 0.8,
  closureGain: 0.9,
  closureDipDb: 10,
  burstGain: 0.5,

  attackMs: 55,
  releaseMs: 95,
  jawMs: 60,
  maxViseme: 1,
  maxTotal: 1,
};

/** Slider ranges for a tuning UI (lab page, admin). */
export const LIPSYNC_CONFIG_RANGES: Record<Exclude<keyof LipSyncConfig, 'fftSize'>, [number, number, number]> = {
  bandTopHz: [2400, 8000, 100],
  gateOpenDb: [3, 24, 0.5],
  gateCloseDb: [1, 20, 0.5],
  gateHoldMs: [0, 400, 10],
  floorMinDb: [-100, -40, 1],
  floorRiseDbPerSec: [0.5, 10, 0.5],
  dynamicRangeDb: [10, 45, 1],
  loudnessGamma: [0.4, 1.6, 0.05],
  intensity: [0.3, 1.5, 0.05],
  vowelSharpness: [0.3, 3, 0.1],
  speakerAdaptSec: [1, 20, 0.5],
  fricativeGain: [0, 1.5, 0.05],
  closureGain: [0, 1.5, 0.05],
  closureDipDb: [3, 24, 0.5],
  burstGain: [0, 1.5, 0.05],
  attackMs: [15, 200, 5],
  releaseMs: [20, 300, 5],
  jawMs: [15, 200, 5],
  maxViseme: [0.3, 1, 0.05],
  maxTotal: [0.5, 1.5, 0.05],
};
