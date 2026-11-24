// Deterministic keyword classifier (no network, no AI). Runs in the browser (voice trigger pipeline, admin preview)
// and in the functions (admin test-phrase, intent guard). Ported from the old src/server/classifier.ts.
// Owner: server-voice. Checks: `npx tsx scripts/check-classifier.ts`.

import type { IntentMatchingEngine, LocalClassifier } from './config';

/** Lower-case, letters and digits only. */
export function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

/** Accepts anything, returns trimmed non-empty strings. */
export function sanitizeKeywords(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) return [];
  return keywords.map((kw) => String(kw).trim()).filter(Boolean);
}

/** Old server behaviour for `englishOnlyTranscripts`: drop non-ASCII characters, collapse whitespace. */
export function sanitizeEnglishText(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function addMorphVariants(base: string, variants: Set<string>, enabled: boolean): void {
  if (!enabled || !base || base.length < 3) return;
  const isVowel = (ch: string) => 'aeiou'.includes(ch);
  const last = base[base.length - 1];
  const beforeLast = base[base.length - 2];
  if (last === 'y' && !isVowel(beforeLast)) {
    const stem = base.slice(0, -1);
    variants.add(`${stem}ies`);
    variants.add(`${stem}ied`);
    variants.add(`${stem}ying`);
  } else {
    variants.add(`${base}s`);
    variants.add(`${base}ed`);
    variants.add(`${base}ing`);
  }
  if (last === 'e' && base.length > 3) {
    const stem = base.slice(0, -1);
    variants.add(`${stem}ing`);
    variants.add(`${base}d`);
  }
  if (['s', 'x', 'z'].includes(last) || base.endsWith('ch') || base.endsWith('sh')) variants.add(`${base}es`);
}

/** Single words, bigrams and the whole phrase, each normalised. */
export function tokenizeForMatching(text: string): string[] {
  const raw = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  const tokens = new Set<string>();
  for (const word of raw) {
    const n = normalizeToken(word);
    if (n) tokens.add(n);
  }
  for (let i = 0; i < raw.length - 1; i += 1) {
    const n = normalizeToken(`${raw[i]} ${raw[i + 1]}`);
    if (n) tokens.add(n);
  }
  const full = normalizeToken(text || '');
  if (full) tokens.add(full);
  return Array.from(tokens);
}

interface Matcher {
  signature: string;
  index: Map<string, string>;
}
let matcherCache: Matcher = { signature: '', index: new Map() };

function buildMatcher(classifier: Pick<LocalClassifier, 'keywords' | 'synonyms' | 'morphologyEnabled'>): Matcher {
  const keywords = sanitizeKeywords(classifier.keywords);
  const synonyms = classifier.synonyms || {};
  const morph = !!classifier.morphologyEnabled;
  const signature = JSON.stringify({ keywords, synonyms, morph });
  if (signature === matcherCache.signature) return matcherCache;

  const index = new Map<string, string>();
  for (const keyword of keywords) {
    const root = normalizeToken(keyword);
    if (!root) continue;
    const variants = new Set<string>();
    const add = (raw: string) => {
      const n = normalizeToken(raw);
      if (!n) return;
      variants.add(n);
      addMorphVariants(n, variants, morph);
    };
    add(keyword);
    (synonyms[root] || synonyms[keyword.toLowerCase()] || []).forEach(add);
    // First keyword wins when two keywords share a variant (same as before).
    for (const v of variants) if (!index.has(v)) index.set(v, keyword);
  }
  matcherCache = { signature, index };
  return matcherCache;
}

/** Every keyword found in `text` (words, then bigrams, then the whole phrase; each keyword once). */
export function extractKeywordMatches(
  text: string,
  classifier: Pick<LocalClassifier, 'keywords' | 'synonyms' | 'morphologyEnabled'>,
): string[] {
  if (!text) return [];
  const { index } = buildMatcher(classifier);
  const matches = new Set<string>();
  for (const token of tokenizeForMatching(text)) {
    const hit = index.get(token);
    if (hit) matches.add(hit);
  }
  return Array.from(matches);
}

/** First keyword found, or null. */
export function findKeywordMatch(
  candidate: string | null | undefined,
  classifier: Pick<LocalClassifier, 'keywords' | 'synonyms' | 'morphologyEnabled'>,
): string | null {
  if (!candidate) return null;
  return extractKeywordMatches(candidate, classifier)[0] ?? null;
}

/** Admin "Test a phrase": matches plus per-token detail. */
export function testPhrase(
  text: string,
  classifier: Pick<LocalClassifier, 'keywords' | 'synonyms' | 'morphologyEnabled'>,
): { matches: string[]; tokens: string[]; details: Array<{ token: string; matchedKeyword: string | null }> } {
  const { index } = buildMatcher(classifier);
  const tokens = tokenizeForMatching(text);
  const matches = new Set<string>();
  const details = tokens.map((token) => {
    const hit = index.get(token) ?? null;
    if (hit) matches.add(hit);
    return { token, matchedKeyword: hit };
  });
  return { matches: Array.from(matches), tokens, details };
}

/** Maps an AI answer ("rainbows", "Rainbow.") back to a configured keyword, case-insensitively. */
export function canonicalKeyword(candidate: string, keywords: string[]): string | null {
  const n = normalizeToken(String(candidate));
  if (!n) return null;
  for (const k of sanitizeKeywords(keywords)) if (normalizeToken(k) === n) return k;
  // Tolerate a plural / inflection the model may return.
  return extractKeywordMatches(String(candidate), { keywords, synonyms: {}, morphologyEnabled: true })[0] ?? null;
}

export interface ResolvedIntent {
  keyword: string;
  via: 'local' | 'openai';
}

/**
 * The engine logic from the old server:
 *   local  -> keyword matches only
 *   hybrid -> local matches; only when there are none, ask the AI
 *   openai -> AI matches first, then any extra local ones (the AI may miss a second word in the sentence);
 *             if the AI returns nothing, local matches
 * `classifyWithAI` must already restrict its answer to `classifier.keywords`.
 */
export async function resolveIntents(
  text: string,
  classifier: LocalClassifier,
  engine: IntentMatchingEngine,
  classifyWithAI?: (text: string, keywords: string[]) => Promise<string[]>,
): Promise<ResolvedIntent[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const local = extractKeywordMatches(trimmed, classifier).map((keyword) => ({ keyword, via: 'local' as const }));
  if (engine === 'local' || !classifyWithAI) return local;
  if (engine === 'hybrid') {
    if (local.length) return local;
    return dedupe((await safeAI(classifyWithAI, trimmed, classifier.keywords)).map((keyword) => ({ keyword, via: 'openai' as const })));
  }
  const ai = (await safeAI(classifyWithAI, trimmed, classifier.keywords)).map((keyword) => ({ keyword, via: 'openai' as const }));
  if (!ai.length) return local;
  return dedupe([...ai, ...local]);
}

async function safeAI(fn: (t: string, k: string[]) => Promise<string[]>, text: string, keywords: string[]): Promise<string[]> {
  try {
    const out = await fn(text, keywords);
    return Array.isArray(out) ? out.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function dedupe(list: ResolvedIntent[]): ResolvedIntent[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    const k = r.keyword.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Clears the matcher cache (only needed in tests; the cache keys on the classifier contents). */
export function invalidateMatcherCache(): void {
  matcherCache = { signature: '', index: new Map() };
}
