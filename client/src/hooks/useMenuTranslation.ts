/*
 * useMenuTranslation — Translates ALL dynamic DB content:
 *   - Tenant: name, description, address
 *   - Categories: name, description
 *   - Menu items: name, description
 *
 * Uses Google Translate unofficial API (translate.googleapis.com).
 * No CORS issues. No API key required.
 * Results cached in module-level Map to avoid re-fetching within the same session.
 */
import { useState, useEffect, useRef } from 'react';
import type { MenuItem, Category } from '@/lib/types';

interface TenantInfo {
  name: string;
  description?: string | null;
  address?: string | null;
}

interface TranslatedTenant {
  name: string;
  description?: string | null;
  address?: string | null;
}

interface TranslatedData {
  tenant: TranslatedTenant;
  categories: Category[];
  menuItems: MenuItem[];
}

// Module-level in-memory cache: key = "sl|tl|text", value = translated string
const memCache = new Map<string, string>();

async function translateBatchGoogle(texts: string[], sl: string, tl: string): Promise<string[]> {
  const results = [...texts];
  const toFetch: { t: string; i: number }[] = [];

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (!t || !t.trim()) continue;
    const key = `${sl}|${tl}|${t}`;
    if (memCache.has(key)) {
      results[i] = memCache.get(key)!;
    } else {
      toFetch.push({ t, i });
    }
  }

  if (toFetch.length === 0) return results;

  // Join with newline — Google preserves line breaks in output
  const combined = toFetch.map(({ t }) => t).join('\n');

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(combined)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // Flatten all translated segments
    const segments: string[] = [];
    if (Array.isArray(json[0])) {
      for (const seg of json[0]) {
        if (Array.isArray(seg) && seg[0]) segments.push(seg[0]);
      }
    }

    // Rejoin and split by newline to recover individual lines
    const joined = segments.join('');
    const lines = joined.split('\n');

    toFetch.forEach(({ t, i }, idx) => {
      const translated = (lines[idx] || '').trim() || t;
      results[i] = translated;
      memCache.set(`${sl}|${tl}|${t}`, translated);
    });
  } catch (err) {
    console.warn('[useMenuTranslation] Translation failed, using originals:', err);
    // Keep originals for failed items
    toFetch.forEach(({ t, i }) => { results[i] = t; });
  }

  return results;
}

export function useMenuTranslation(
  tenant: TenantInfo,
  categories: Category[],
  menuItems: MenuItem[],
  lang: 'es' | 'en'
): { translatedData: TranslatedData; isTranslating: boolean } {
  const [translatedData, setTranslatedData] = useState<TranslatedData>({
    tenant: { name: tenant.name, description: tenant.description, address: tenant.address },
    categories,
    menuItems,
  });
  const [isTranslating, setIsTranslating] = useState(false);
  const abortRef = useRef(false);

  useEffect(() => {
    if (lang === 'es') {
      setTranslatedData({
        tenant: { name: tenant.name, description: tenant.description, address: tenant.address },
        categories,
        menuItems,
      });
      setIsTranslating(false);
      return;
    }

    abortRef.current = false;
    setIsTranslating(true);

    const doTranslate = async () => {
      const sl = 'es';
      const tl = 'en';

      // Tenant fields
      const tenantTexts = [
        tenant.name,
        tenant.description || '',
        tenant.address || '',
      ];

      // Category fields
      const catNames = categories.map(c => c.name);
      const catDescs = categories.map(c => c.description || '');

      // Item fields
      const itemNames = menuItems.map(i => i.name);
      const itemDescs = menuItems.map(i => i.description || '');

      // Translate all in parallel
      const [tTenant, tCatNames, tCatDescs, tItemNames, tItemDescs] = await Promise.all([
        translateBatchGoogle(tenantTexts, sl, tl),
        translateBatchGoogle(catNames, sl, tl),
        translateBatchGoogle(catDescs, sl, tl),
        translateBatchGoogle(itemNames, sl, tl),
        translateBatchGoogle(itemDescs, sl, tl),
      ]);

      if (abortRef.current) return;

      const translatedTenant: TranslatedTenant = {
        name: tTenant[0] || tenant.name,
        description: tenant.description ? (tTenant[1] || tenant.description) : tenant.description,
        address: tenant.address ? (tTenant[2] || tenant.address) : tenant.address,
      };

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

      setTranslatedData({
        tenant: translatedTenant,
        categories: translatedCategories,
        menuItems: translatedItems,
      });
      setIsTranslating(false);
    };

    doTranslate();

    return () => { abortRef.current = true; };
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return { translatedData, isTranslating };
}
