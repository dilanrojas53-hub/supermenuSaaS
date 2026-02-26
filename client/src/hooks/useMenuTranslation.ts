/*
 * useMenuTranslation — Translates dynamic DB content (dish names, descriptions, category names)
 * using the MyMemory free translation API (no API key required).
 *
 * Strategy:
 * - Batch all unique strings into a single translation pass when lang switches to 'en'.
 * - Cache results in a module-level Map to avoid re-fetching on re-renders.
 * - Falls back to original text if translation fails or is loading.
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

// Module-level cache: key = "text|langPair", value = translated string
const translationCache = new Map<string, string>();

async function translateText(text: string, langPair: string): Promise<string> {
  if (!text || !text.trim()) return text;

  const cacheKey = `${text}|${langPair}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const json = await res.json();
    const translated = json?.responseData?.translatedText || text;
    translationCache.set(cacheKey, translated);
    return translated;
  } catch {
    return text;
  }
}

async function translateBatch(texts: string[], langPair: string): Promise<string[]> {
  // Translate in parallel but limit concurrency to avoid rate limits
  const results: string[] = [];
  const CHUNK = 5; // 5 concurrent requests at a time

  for (let i = 0; i < texts.length; i += CHUNK) {
    const chunk = texts.slice(i, i + CHUNK);
    const translated = await Promise.all(chunk.map(t => translateText(t, langPair)));
    results.push(...translated);
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

  useEffect(() => {
    // Reset to original Spanish when switching back to ES
    if (lang === 'es') {
      setTranslatedData({ categories, menuItems });
      setIsTranslating(false);
      return;
    }

    // Translate to English
    abortRef.current = false;
    setIsTranslating(true);

    const doTranslate = async () => {
      const langPair = 'es|en';

      // Collect all strings to translate
      const catNames = categories.map(c => c.name);
      const catDescs = categories.map(c => c.description || '');
      const itemNames = menuItems.map(i => i.name);
      const itemDescs = menuItems.map(i => i.description || '');

      // Translate all in parallel batches
      const [tCatNames, tCatDescs, tItemNames, tItemDescs] = await Promise.all([
        translateBatch(catNames, langPair),
        translateBatch(catDescs, langPair),
        translateBatch(itemNames, langPair),
        translateBatch(itemDescs, langPair),
      ]);

      if (abortRef.current) return;

      const translatedCategories: Category[] = categories.map((cat, i) => ({
        ...cat,
        name: tCatNames[i] || cat.name,
        description: catDescs[i] ? tCatDescs[i] || cat.description : cat.description,
      }));

      const translatedItems: MenuItem[] = menuItems.map((item, i) => ({
        ...item,
        name: tItemNames[i] || item.name,
        description: itemDescs[i] ? tItemDescs[i] || item.description : item.description,
      }));

      setTranslatedData({ categories: translatedCategories, menuItems: translatedItems });
      setIsTranslating(false);
    };

    doTranslate();

    return () => {
      abortRef.current = true;
    };
  }, [lang, categories, menuItems]);

  return { translatedData, isTranslating };
}
