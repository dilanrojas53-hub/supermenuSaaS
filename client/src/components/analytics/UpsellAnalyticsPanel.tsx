/**
 * UpsellAnalyticsPanel — Panel de métricas del motor de upsell
 *
 * Muestra:
 * - KPIs globales: attach rate, revenue atribuido, pares activos
 * - Top 5 pares por attach rate
 * - Top 5 pares por revenue
 * - Distribución por superficie (add_to_cart / checkout)
 * - Botón para disparar compute-upsell-pairs
 * - Botón para disparar analyze-product en todos los items
 */
import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Zap, DollarSign, RefreshCw, BarChart3, Loader2, ChevronUp, ChevronDown, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/types';
import type { Tenant } from '@/lib/types';

interface UpsellPairRow {
  trigger_item_id: string;
  suggested_item_id: string;
  score: number;
  pitch: string;
  times_shown: number;
  times_accepted: number;
  times_rejected: number;
  attach_rate: number;
  revenue_attributed: number;
  is_active: boolean;
  is_manual_override: boolean;
  last_computed_at: string;
  trigger_name?: string;
  suggested_name?: string;
}

interface UpsellKPIs {
  totalPairs: number;
  activePairs: number;
  totalShown: number;
  totalAccepted: number;
  globalAttachRate: number;
  totalRevenue: number;
  avgScore: number;
  pairsWithHistory: number;
}

interface SurfaceStats {
  surface: string;
  shown: number;
  accepted: number;
  attach_rate: number;
}

interface UpsellAnalyticsPanelProps {
  tenant: Tenant;
}

export default function UpsellAnalyticsPanel({ tenant }: UpsellAnalyticsPanelProps) {
  const [pairs, setPairs] = useState<UpsellPairRow[]>([]);
  const [kpis, setKpis] = useState<UpsellKPIs | null>(null);
  const [surfaceStats, setSurfaceStats] = useState<SurfaceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [sortBy, setSortBy] = useState<'attach_rate' | 'revenue' | 'score'>('attach_rate');
  const [expanded, setExpanded] = useState(true);
  const [computeMsg, setComputeMsg] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Cargar pares
      const { data: pairsData } = await supabase
        .from('upsell_pairs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('attach_rate', { ascending: false });

      if (!pairsData?.length) {
        setPairs([]);
        setKpis({ totalPairs: 0, activePairs: 0, totalShown: 0, totalAccepted: 0, globalAttachRate: 0, totalRevenue: 0, avgScore: 0, pairsWithHistory: 0 });
        setLoading(false);
        return;
      }

      // Cargar nombres de items
      const allItemIds = new Set<string>();
      pairsData.forEach(p => { allItemIds.add(p.trigger_item_id); allItemIds.add(p.suggested_item_id); });

      const { data: itemsData } = await supabase
        .from('menu_items')
        .select('id, name')
        .in('id', Array.from(allItemIds));

      const nameMap = new Map((itemsData || []).map(i => [i.id, i.name]));

      const enrichedPairs: UpsellPairRow[] = pairsData.map(p => ({
        ...p,
        trigger_name: nameMap.get(p.trigger_item_id) || p.trigger_item_id.slice(0, 8),
        suggested_name: nameMap.get(p.suggested_item_id) || p.suggested_item_id.slice(0, 8),
      }));

      setPairs(enrichedPairs);

      // Calcular KPIs
      const active = enrichedPairs.filter(p => p.is_active);
      const totalShown = enrichedPairs.reduce((s, p) => s + (p.times_shown || 0), 0);
      const totalAccepted = enrichedPairs.reduce((s, p) => s + (p.times_accepted || 0), 0);
      const totalRevenue = enrichedPairs.reduce((s, p) => s + (p.revenue_attributed || 0), 0);
      const avgScore = enrichedPairs.length > 0
        ? enrichedPairs.reduce((s, p) => s + (p.score || 0), 0) / enrichedPairs.length
        : 0;
      const pairsWithHistory = enrichedPairs.filter(p => (p.times_shown || 0) > 0).length;

      setKpis({
        totalPairs: enrichedPairs.length,
        activePairs: active.length,
        totalShown,
        totalAccepted,
        globalAttachRate: totalShown > 0 ? totalAccepted / totalShown : 0,
        totalRevenue,
        avgScore,
        pairsWithHistory,
      });

      // Cargar surface stats desde upsell_events
      const { data: eventsData } = await supabase
        .from('upsell_events')
        .select('surface, event_type')
        .eq('tenant_id', tenant.id)
        .in('event_type', ['recommendation_shown', 'recommendation_accepted']);

      if (eventsData?.length) {
        const surfaceMap = new Map<string, { shown: number; accepted: number }>();
        eventsData.forEach(e => {
          if (!surfaceMap.has(e.surface)) surfaceMap.set(e.surface, { shown: 0, accepted: 0 });
          const s = surfaceMap.get(e.surface)!;
          if (e.event_type === 'recommendation_shown') s.shown++;
          if (e.event_type === 'recommendation_accepted') s.accepted++;
        });
        const stats: SurfaceStats[] = Array.from(surfaceMap.entries()).map(([surface, s]) => ({
          surface,
          shown: s.shown,
          accepted: s.accepted,
          attach_rate: s.shown > 0 ? s.accepted / s.shown : 0,
        }));
        setSurfaceStats(stats);
      }

    } catch (err) {
      console.error('[UpsellAnalyticsPanel] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [tenant.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleComputePairs = async () => {
    setComputing(true);
    setComputeMsg('');
    try {
      const res = await fetch('/api/compute-upsell-pairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenant.id, recompute_all: true }),
      });
      const data = await res.json();
      setComputeMsg(`✓ ${data.pairs_computed || 0} pares calculados para ${data.processed_triggers || 0} productos`);
      await loadData();
    } catch (err: any) {
      setComputeMsg(`Error: ${err.message}`);
    } finally {
      setComputing(false);
    }
  };

  const handleAnalyzeAll = async () => {
    setAnalyzing(true);
    setComputeMsg('');
    try {
      // Cargar todos los items del tenant
      const { data: items } = await supabase
        .from('menu_items')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('is_available', true)
        .limit(30);

      if (!items?.length) {
        setComputeMsg('No hay productos disponibles');
        return;
      }

      let analyzed = 0;
      for (const item of items) {
        await fetch('/api/analyze-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: item.id, tenant_id: tenant.id }),
        }).catch(() => {});
        analyzed++;
        // Small delay to avoid overwhelming the API
        await new Promise(r => setTimeout(r, 200));
      }
      setComputeMsg(`✓ ${analyzed} productos analizados con IA`);
    } catch (err: any) {
      setComputeMsg(`Error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const sortedPairs = [...pairs].sort((a, b) => {
    if (sortBy === 'attach_rate') return (b.attach_rate || 0) - (a.attach_rate || 0);
    if (sortBy === 'revenue') return (b.revenue_attributed || 0) - (a.revenue_attributed || 0);
    return (b.score || 0) - (a.score || 0);
  }).slice(0, 8);

  const surfaceLabel = (s: string) => s === 'add_to_cart' ? 'Al agregar' : s === 'checkout' ? 'Checkout' : s === 'cart' ? 'Carrito' : s;

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer"
        style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
            <Zap size={16} style={{ color: '#F59E0B' }} />
          </div>
          <div>
            <div className="font-semibold text-white text-sm">Motor de Upsell</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {kpis ? `${kpis.activePairs} pares activos · ${(kpis.globalAttachRate * 100).toFixed(1)}% attach rate` : 'Cargando...'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); loadData(); }}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            title="Recargar"
          >
            <RefreshCw size={13} style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
          {expanded ? <ChevronUp size={16} style={{ color: 'rgba(255,255,255,0.4)' }} /> : <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />}
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin" style={{ color: '#F59E0B' }} />
              <span className="ml-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Cargando métricas...</span>
            </div>
          ) : (
            <>
              {/* KPIs */}
              {kpis && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Attach Rate', value: `${(kpis.globalAttachRate * 100).toFixed(1)}%`, icon: TrendingUp, color: '#10B981' },
                    { label: 'Revenue Atribuido', value: formatPrice(kpis.totalRevenue), icon: DollarSign, color: '#F59E0B' },
                    { label: 'Pares Activos', value: kpis.activePairs.toString(), icon: Zap, color: '#6366F1' },
                    { label: 'Veces Mostrado', value: kpis.totalShown.toLocaleString(), icon: BarChart3, color: '#EC4899' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={13} style={{ color }} />
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                      </div>
                      <div className="text-lg font-bold text-white">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Acciones */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleComputePairs}
                  disabled={computing}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{ background: computing ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.2)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.3)' }}
                >
                  {computing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Recalcular pares
                </button>
                <button
                  onClick={handleAnalyzeAll}
                  disabled={analyzing}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{ background: analyzing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' }}
                >
                  {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  Analizar productos con IA
                </button>
              </div>

              {computeMsg && (
                <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }}>
                  {computeMsg}
                </div>
              )}

              {/* Tabla de pares */}
              {pairs.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>Top pares</span>
                    <div className="flex gap-1">
                      {(['attach_rate', 'revenue', 'score'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => setSortBy(s)}
                          className="px-2 py-1 rounded text-xs transition-colors"
                          style={{
                            background: sortBy === s ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                            color: sortBy === s ? '#F59E0B' : 'rgba(255,255,255,0.4)',
                          }}
                        >
                          {s === 'attach_rate' ? 'Attach' : s === 'revenue' ? 'Revenue' : 'Score'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {sortedPairs.map((pair, i) => (
                      <div
                        key={`${pair.trigger_item_id}:${pair.suggested_item_id}`}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <span className="text-xs w-4 text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white truncate">
                            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{pair.trigger_name}</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)' }}> → </span>
                            <span style={{ color: '#F59E0B' }}>{pair.suggested_name}</span>
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {pair.times_shown || 0} mostrado · {pair.times_accepted || 0} aceptado
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold" style={{ color: '#10B981' }}>
                            {((pair.attach_rate || 0) * 100).toFixed(0)}%
                          </div>
                          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            score {Math.round(pair.score || 0)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Zap size={24} style={{ color: 'rgba(255,255,255,0.15)', margin: '0 auto 8px' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Sin pares calculados aún</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    Haz clic en "Recalcular pares" para generar recomendaciones
                  </p>
                </div>
              )}

              {/* Surface stats */}
              {surfaceStats.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>Por superficie</div>
                  <div className="grid grid-cols-3 gap-2">
                    {surfaceStats.map(s => (
                      <div key={s.surface} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{surfaceLabel(s.surface)}</div>
                        <div className="text-sm font-bold text-white">{(s.attach_rate * 100).toFixed(1)}%</div>
                        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.shown} mostrado</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
