/**
 * useFavorites — hook global para favoritos de platillos
 * Persiste en customer_favorites en Supabase.
 * Expone: isFavorite(itemId), toggleFavorite(item), favoriteIds (Set)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { MenuItem } from '@/lib/types';

interface UseFavoritesOptions {
  customerId: string | null | undefined;
  tenantId: string;
}

export function useFavorites({ customerId, tenantId }: UseFavoritesOptions) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  // Map itemId → row id (para poder hacer delete)
  const rowIdMap = useRef<Map<string, string>>(new Map());

  // Cargar favoritos del cliente cuando esté autenticado
  useEffect(() => {
    if (!customerId || !tenantId) {
      setFavoriteIds(new Set());
      rowIdMap.current.clear();
      return;
    }
    setLoading(true);
    supabase
      .from('customer_favorites')
      .select('id, item_id')
      .eq('customer_id', customerId)
      .eq('tenant_id', tenantId)
      .then(({ data }) => {
        const ids = new Set<string>();
        rowIdMap.current.clear();
        (data || []).forEach((row: { id: string; item_id: string }) => {
          ids.add(row.item_id);
          rowIdMap.current.set(row.item_id, row.id);
        });
        setFavoriteIds(ids);
        setLoading(false);
      });
  }, [customerId, tenantId]);

  const isFavorite = useCallback((itemId: string) => favoriteIds.has(itemId), [favoriteIds]);

  const toggleFavorite = useCallback(async (item: MenuItem) => {
    if (!customerId) return; // no autenticado — silencioso

    const itemId = item.id;
    const wasLiked = favoriteIds.has(itemId);

    // Optimistic update
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (wasLiked) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

    if (wasLiked) {
      // DELETE
      const rowId = rowIdMap.current.get(itemId);
      if (rowId) {
        const { error } = await supabase
          .from('customer_favorites')
          .delete()
          .eq('id', rowId);
        if (error) {
          console.error('[useFavorites] delete error:', error);
          // Revert optimistic
          setFavoriteIds(prev => { const n = new Set(prev); n.add(itemId); return n; });
        } else {
          rowIdMap.current.delete(itemId);
        }
      }
    } else {
      // INSERT
      const { data, error } = await supabase
        .from('customer_favorites')
        .insert({
          customer_id: customerId,
          tenant_id: tenantId,
          item_id: itemId,
          item_name: item.name,
          item_price: item.price,
          item_image_url: item.image_url || null,
        })
        .select('id')
        .single();
      if (error) {
        console.error('[useFavorites] insert error:', error);
        // Revert optimistic
        setFavoriteIds(prev => { const n = new Set(prev); n.delete(itemId); return n; });
      } else if (data) {
        rowIdMap.current.set(itemId, data.id);
      }
    }
  }, [customerId, tenantId, favoriteIds]);

  return { favoriteIds, isFavorite, toggleFavorite, loading };
}
