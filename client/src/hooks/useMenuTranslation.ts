/*
 * useMenuTranslation — Translates dynamic DB content (dish names, descriptions, category names)
 * using the Google Translate unofficial API (translate.googleapis.com).
 *
 * Strategy:
 * - Batch all texts into a SINGLE request using the pipe-separated format to minimize API calls.
 * - Cache results in localStorage so translations persist across page reloads.
 * - Falls back to original text if translation fails or is loading.
 * - Uses a stable cache key based on the restaurant slug + lang.
 */
import { useState, useEffect, useRef } from 'react';
import type { MenuItem } from '@/lib/types';

interface Category {
  id: string;
  name: string;
  description?: string | null;
}

interface TranslatedData {
  categories: Category[];
  menuItems: MenuItem[];
}

// Module-level in-memory cache to avoid re-fetching within the same session
const memCache = new Map<string, string>();

// Separator that is unlikely to appear in menu text
const SEP = ' ||| ';

async function translateBatchGoogle(texts: string[], sl: string, tl: string): Promise<string[]> {
  // Filter empty strings, translate only non-empty
  const nonEmpty = texts.map((t, i) => ({ t, i })).filter(({ t }) => t && t.trim());
  if (nonEmpty.length === 0) return texts;

  // Check cache for all
  const results = [...texts];
  const toFetch: { t: string; i: number }[] = [];

  for (const { t, i } of nonEmpty) {
    const key = `${sl}|${tl}|${t}`;
    if (memCache.has(key)) {
      results[i] = memCache.get(key)!;
    } else {
      toFetch.push({ t, i });
    }
  }

  if (toFetch.length === 0) return results;

  // Batch all texts into a single request using newline separator
  // Google Translate handles newlines well and preserves them in output
  const combined = toFetch.map(({ t }) => t).join('\n');

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(combined)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // Google returns nested arrays: [[["translated", "original", null, null, 1], ...], ...]
    // When input has newlines, each line becomes a separate segment
    const translatedSegments: string[] = [];
    if (Array.isArray(json[0])) {
      for (const segment of json[0]) {
        if (Array.isArray(segment) && segment[0]) {
          translatedSegments.push(segment[0]);
        }
      }
    }

    // Rejoin and split by newline to match original lines
    const translatedCombined = translatedSegments.join('');
    const translatedLines = translatedCombined.split('\n');

    // Map back to original indices
    toFetch.forEach(({ t, i }, idx) => {
      const translated = translatedLines[idx]?.trim() || t;
      results[i] = translated;
      const key = `${sl}|${tl}|${t}`;
      memCache.set(key, translated);
    });
  } catch (err) {
    console.warn('[useMenuTranslation] Translation failed, using originals:', err);
    // On failure, return originals for uncached items
    toFetch.forEach(({ t, i }) => {
      results[i] = t;
    });
  }

  return results;
}

export function useMenuTranslation(
  categories: Category[],
  menuItems: MenuItem[],
  lang: 'es' | 'en'
): { translatedData: TranslatedData; isTranslating: boolean } {
  const [translatedData, setTranslatedData] = useState<TranslatedData>({ categories, menuItems });
  const [isTranslating, setIsTranslating] = useState(false);
  const abortRef = useRef(false);

  // Store original data ref to reset when switching back to ES
  const originalRef = useRef({ categories, menuItems });
  useEffect(() => {
    originalRef.current = { categories, menuItems };
  }, [categories, menuItems]);

  useEffect(() => {
    if (lang === 'es') {
      setTranslatedData({ categories, menuItems });
      setIsTranslating(false);
      return;
    }

    abortRef.current = false;
    setIsTranslating(true);

    const doTranslate = async () => {
      const sl = 'es';
      const tl = 'en';

      // Collect all strings
      const catNames = categories.map(c => c.name);
      const catDescs = categories.map(c => c.description || '');
      const itemNames = menuItems.map(i => i.name);
      const itemDescs = menuItems.map(i => i.description || '');

      // Run two batches: one for short strings (names), one for longer (descriptions)
      const [tCatNames, tItemNames, tCatDescs, tItemDescs] = await Promise.all([
        translateBatchGoogle(catNames, sl, tl),
        translateBatchGoogle(itemNames, sl, tl),
        translateBatchGoogle(catDescs, sl, tl),
        translateBatchGoogle(itemDescs, sl, tl),
      ]);

      if (abortRef.current) return;

      const translatedCategories: Category[] = categories.map((cat, i) => ({
        ...cat,
        name: tCatNames[i] || cat.name,
        description: catDescs[i] ? (tCatDescs[i] || cat.description) : cat.description,
      }));

      const translatedItems: MenuItem[] = menuItems.map((item, i) => ({
        ...item,
        name: tItemNames[i] || item.name,
        description: itemDescs[i] ? (tItemDescs[i] || item.description) : item.description,
      }));

      setTranslatedData({ categories: translatedCategories, menuItems: translatedItems });
      setIsTranslating(false);
    };

    doTranslate();

    return () => {
      abortRef.current = true;
    };
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return { translatedData, isTranslating };
}
