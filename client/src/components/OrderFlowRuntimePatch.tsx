import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface FlowConfig {
  tenantId: string | null;
  dineIn: boolean;
  takeout: boolean;
  delivery: boolean;
  newStep: boolean;
  prepStep: boolean;
  billingStep: boolean;
}

const DEFAULT_FLOW: FlowConfig = {
  tenantId: null,
  dineIn: true,
  takeout: true,
  delivery: true,
  newStep: true,
  prepStep: true,
  billingStep: true,
};

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getSlugFromPath(scope: 'admin' | 'staff') {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const marker = scope === 'admin' ? 'admin' : 'staff';
  const idx = parts.indexOf(marker);
  return idx >= 0 ? parts[idx + 1] : undefined;
}

function closestControl(el: HTMLElement): HTMLElement {
  const interactive = el.closest('button,[role="button"]') as HTMLElement | null;
  if (interactive) return interactive;

  let node: HTMLElement | null = el;
  for (let i = 0; i < 6 && node?.parentElement; i += 1) {
    const className = String(node.className || '');
    const rect = node.getBoundingClientRect();
    if ((className.includes('rounded') || className.includes('border')) && rect.height >= 28 && rect.width >= 48) {
      return node;
    }
    node = node.parentElement;
  }
  return el;
}

function hideControl(el: HTMLElement) {
  const target = closestControl(el);
  if (!target.dataset.flowPatchHidden) {
    target.dataset.flowPatchPreviousDisplay = target.style.display || '';
  }
  target.dataset.flowPatchHidden = 'true';
  target.style.display = 'none';
}

function restoreHiddenControls(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-flow-patch-hidden="true"]').forEach(el => {
    el.style.display = el.dataset.flowPatchPreviousDisplay || '';
    delete el.dataset.flowPatchHidden;
    delete el.dataset.flowPatchPreviousDisplay;
  });
}

function hideSmallControlsByLabel(label: string) {
  const wanted = normalizeText(label);
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('button, div, span, h2, p'));

  nodes.forEach(node => {
    const text = normalizeText(node.textContent);
    if (!text) return;

    const exact = text === wanted;
    const compactCard = text.startsWith(wanted) && text.length <= wanted.length + 18;
    const countCard = text.includes(wanted) && /^.*\b0\b.*$/.test(text) && text.length <= wanted.length + 30;

    if (exact || compactCard || countCard) {
      hideControl(node);
    }
  });
}

function clickFallbackTab(config: FlowConfig) {
  const currentHidden = document.querySelector<HTMLElement>('[data-flow-patch-hidden="true"][aria-selected="true"], [data-flow-patch-hidden="true"].active');
  if (!currentHidden) return;

  const candidates = ['Activos', 'En prep.', 'Listos', 'Para llevar'];
  for (const label of candidates) {
    if (label === 'En prep.' && !config.prepStep) continue;
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => normalizeText(b.textContent) === normalizeText(label) && b.offsetParent !== null);
    if (button) {
      button.click();
      return;
    }
  }
}

async function autoAdvanceOrders(config: FlowConfig) {
  if (!config.tenantId) return;

  const now = new Date().toISOString();

  if (!config.newStep) {
    const nextStatus = config.prepStep ? 'en_cocina' : 'listo';
    const payload: Record<string, any> = {
      status: nextStatus,
      accepted_at: now,
      updated_at: now,
    };
    if (nextStatus === 'listo') payload.ready_at = now;

    await supabase
      .from('orders')
      .update(payload)
      .eq('tenant_id', config.tenantId)
      .eq('status', 'pendiente');
  }

  if (!config.prepStep) {
    await supabase
      .from('orders')
      .update({ status: 'listo', ready_at: now, updated_at: now })
      .eq('tenant_id', config.tenantId)
      .eq('status', 'en_cocina');
  }
}

/**
 * Small compatibility layer while the large admin/staff dashboards still contain
 * hardcoded legacy status cards. It respects the order flow switches saved in
 * restaurant_landing_settings.section_visibility and hides inactive steps from
 * the internal operation screens without changing the main dashboard files.
 */
export default function OrderFlowRuntimePatch({ scope }: { scope: 'admin' | 'staff' }) {
  const [config, setConfig] = useState<FlowConfig>(DEFAULT_FLOW);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    let mounted = true;
    const slug = getSlugFromPath(scope);
    if (!slug) return;

    async function loadConfig() {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (!tenant?.id || !mounted) return;

      const [{ data: delivery }, { data: landing }] = await Promise.all([
        supabase
          .from('delivery_settings')
          .select('dine_in_orders_enabled, takeout_orders_enabled, delivery_orders_enabled')
          .eq('tenant_id', tenant.id)
          .maybeSingle(),
        supabase
          .from('restaurant_landing_settings')
          .select('section_visibility')
          .eq('tenant_id', tenant.id)
          .maybeSingle(),
      ]);

      const sectionVisibility = (landing?.section_visibility || {}) as Record<string, boolean>;
      setConfig({
        tenantId: tenant.id,
        dineIn: delivery?.dine_in_orders_enabled ?? true,
        takeout: delivery?.takeout_orders_enabled ?? true,
        delivery: delivery?.delivery_orders_enabled ?? true,
        newStep: sectionVisibility.order_flow_new ?? true,
        prepStep: sectionVisibility.order_flow_prep ?? true,
        billingStep: sectionVisibility.order_flow_billing ?? true,
      });
    }

    loadConfig();
    const interval = window.setInterval(loadConfig, 15000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [scope]);

  useEffect(() => {
    function applyVisibility() {
      restoreHiddenControls();

      const bodyText = normalizeText(document.body.textContent);
      const isOrdersScreen = scope === 'staff' || bodyText.includes('pedidos en vivo');
      if (!isOrdersScreen) return;

      if (!config.newStep) hideSmallControlsByLabel('Nuevos');
      if (!config.prepStep) hideSmallControlsByLabel('En prep.');
      if (!config.billingStep) {
        hideSmallControlsByLabel('Cobro');
        hideSmallControlsByLabel('Por Cobrar');
        hideSmallControlsByLabel('Cobrados');
      }
      if (!config.dineIn) {
        hideSmallControlsByLabel('Mesas');
        hideSmallControlsByLabel('Mesa');
      }
      if (!config.delivery) hideSmallControlsByLabel('Delivery');

      clickFallbackTab(config);
    }

    applyVisibility();
    observerRef.current?.disconnect();
    observerRef.current = new MutationObserver(() => applyVisibility());
    observerRef.current.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      restoreHiddenControls();
    };
  }, [config, scope]);

  useEffect(() => {
    autoAdvanceOrders(config);
    const interval = window.setInterval(() => autoAdvanceOrders(config), 12000);
    return () => window.clearInterval(interval);
  }, [config]);

  return null;
}
