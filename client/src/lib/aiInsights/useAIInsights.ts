/**
 * useAIInsights
 * Hook principal para consumir el sistema de AI Business Insights.
 *
 * Características:
 * - Toggle on/off persistido en localStorage por restaurante
 * - Caché por período (TTL variable)
 * - Regeneración manual
 * - Manejo de errores con fallback
 * - No bloquea el dashboard si la IA falla
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AIInsightDigest, AIInsightState, InsightPeriod } from './types';
import { generateAIInsightDigest, readCache, invalidateCache } from './analyticsAIDigest';
import type { RawAnalyticsData } from './aiSafeContextBuilder';
import { buildAISafeContext } from './aiSafeContextBuilder';

// ─── Clave del toggle en localStorage ─────────────────────────────────────
function toggleKey(restaurantSlug: string): string {
  return `supermenu_ai_insights_enabled_${restaurantSlug}`;
}

function readToggle(restaurantSlug: string): boolean {
  try {
    const v = localStorage.getItem(toggleKey(restaurantSlug));
    return v === null ? true : v === 'true'; // default: habilitado
  } catch {
    return true;
  }
}

function writeToggle(restaurantSlug: string, enabled: boolean): void {
  try {
    localStorage.setItem(toggleKey(restaurantSlug), String(enabled));
  } catch { /* noop */ }
}

// ─── Hook ─────────────────────────────────────────────────────────────────
export function useAIInsights(
  rawData: RawAnalyticsData | null,
  restaurantSlug: string,
  period: InsightPeriod
) {
  const [enabled, setEnabledState] = useState<boolean>(() => readToggle(restaurantSlug));
  const [state, setState] = useState<AIInsightState>({
    status: 'idle',
    digest: null,
    error: null,
    lastFetchedPeriod: null,
  });

  // Ref para evitar race conditions
  const abortRef = useRef<AbortController | null>(null);
  const lastPeriodRef = useRef<InsightPeriod | null>(null);

  // ── Toggle ──────────────────────────────────────────────────────────────
  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    writeToggle(restaurantSlug, value);
    if (!value) {
      setState({ status: 'disabled', digest: null, error: null, lastFetchedPeriod: null });
    }
  }, [restaurantSlug]);

  // ── Fetch insight ────────────────────────────────────────────────────────
  const fetchInsight = useCallback(async (forceRefresh = false) => {
    if (!enabled) {
      setState(s => ({ ...s, status: 'disabled' }));
      return;
    }
    if (!rawData) return;

    // Cancelar fetch anterior si existe
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    // Verificar caché primero (sin mostrar loading si hay caché válida)
    if (!forceRefresh) {
      const cached = readCache(restaurantSlug, period);
      if (cached) {
        setState({
          status: 'success',
          digest: cached,
          error: null,
          lastFetchedPeriod: period,
        });
        return;
      }
    }

    setState(s => ({ ...s, status: 'loading', error: null }));

    try {
      const ctx = buildAISafeContext(rawData);
      const digest = await generateAIInsightDigest(ctx, restaurantSlug, forceRefresh);

      // Verificar que no fue cancelado
      if (abortRef.current?.signal.aborted) return;

      setState({
        status: digest.hasEnoughData ? 'success' : 'insufficient_data',
        digest,
        error: null,
        lastFetchedPeriod: period,
      });
    } catch (err: unknown) {
      if (abortRef.current?.signal.aborted) return;

      const message = err instanceof Error ? err.message : 'Error desconocido';
      setState(s => ({
        ...s,
        status: 'error',
        error: message,
      }));
    }
  }, [enabled, rawData, restaurantSlug, period]);

  // ── Auto-fetch cuando cambia el período o los datos ─────────────────────
  useEffect(() => {
    if (!enabled || !rawData) return;

    // Solo re-fetch si cambió el período
    if (lastPeriodRef.current === period && state.status === 'success') return;
    lastPeriodRef.current = period;

    fetchInsight(false);
  }, [period, enabled, rawData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ── Refresh manual ───────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    invalidateCache(restaurantSlug, period);
    lastPeriodRef.current = null;
    fetchInsight(true);
  }, [fetchInsight, restaurantSlug, period]);

  return {
    enabled,
    setEnabled,
    state,
    refresh,
    isLoading: state.status === 'loading',
    isDisabled: state.status === 'disabled' || !enabled,
    hasDigest: state.status === 'success' && state.digest !== null,
  };
}
