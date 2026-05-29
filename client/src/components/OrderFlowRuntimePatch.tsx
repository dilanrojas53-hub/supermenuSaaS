import { useEffect, useState } from 'react';
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

function findOrdersRoot(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3'))
    .find(el => normalizeText(el.textContent).includes('pedidos en vivo'));
  if (!heading) return null;

  let node: HTMLElement | null = heading.parentElement;
  for (let i = 0; i < 8 && node; i += 1) {
    const text = normalizeText(node.textContent);
    if (
      text.includes('sin pedidos en este estado') ||
      (text.includes('en prep.') && text.includes('listos')) ||
      text.includes('para llevar')
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return heading.parentElement?.parentElement || null;
}

function getButtonLabel(button: HTMLElement) {
  return normalizeText(button.textContent).replace(/\s+/g, '');
}

function hideRootButton(root: HTMLElement, label: string) {
  const wanted = normalizeText(label).replace(/\s+/g, '');
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
  buttons.forEach(button => {
    const text = getButtonLabel(button);
    const isStatusButton = text === wanted || text.startsWith(wanted);
    if (!isStatusButton) return;
    button.dataset.flowPatchHidden = 'true';
    button.style.display = 'none';
  });
}

function restoreRootButtons(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-flow-patch-hidden="true"]').forEach(el => {
    el.style.display = '';
    delete el.dataset.flowPatchHidden;
  });

  root.querySelectorAll<HTMLElement>('[data-flow-patchGrid="true"]').forEach(el => {
    el.style.gridTemplateColumns = '';
    delete el.dataset.flowPatchGrid;
  });
}

function fitVisibleStatusGrid(root: HTMLElement) {
  const statusLabels = ['nuevos', 'enprep.', 'listos', 'cobro'];
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .filter(button => {
      const text = getButtonLabel(button);
      return statusLabels.some(label => text.startsWith(label));
    });

  if (buttons.length === 0) return;
  const parent = buttons[0].parentElement as HTMLElement | null;
  if (!parent) return;

  const visibleCount = buttons.filter(button => button.style.display !== 'none').length || 1;
  parent.dataset.flowPatchGrid = 'true';
  parent.style.gridTemplateColumns = `repeat(${visibleCount}, minmax(0, 1fr))`;
}

function clickSafeFallback(root: HTMLElement, config: FlowConfig) {
  const hiddenActive = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-flow-patch-hidden="true"]'))
    .some(button => button.getAttribute('aria-selected') === 'true' || String(button.className).includes('border-current'));

  if (!hiddenActive) return;

  const fallbackLabels = [
    config.prepStep ? 'enprep.' : null,
    'listos',
    config.billingStep ? 'cobro' : null,
  ].filter(Boolean) as string[];

  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
  for (const label of fallbackLabels) {
    const button = buttons.find(b => getButtonLabel(b).startsWith(label) && b.style.display !== 'none');
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
 * Compatibility layer for legacy hardcoded order-flow cards.
 * Important: this version is intentionally scoped to the order panel only and
 * uses a light interval instead of a MutationObserver, because the old observer
 * caused mobile drawer freezes when the admin hamburger menu opened.
 */
export default function OrderFlowRuntimePatch({ scope }: { scope: 'admin' | 'staff' }) {
  const [config, setConfig] = useState<FlowConfig>(DEFAULT_FLOW);

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
      const root = findOrdersRoot();
      if (!root) return;

      restoreRootButtons(root);

      if (!config.newStep) hideRootButton(root, 'Nuevos');
      if (!config.prepStep) hideRootButton(root, 'En prep.');
      if (!config.billingStep) {
        hideRootButton(root, 'Cobro');
        hideRootButton(root, 'Por cobrar');
        hideRootButton(root, 'Cobrados');
      }

      fitVisibleStatusGrid(root);
      clickSafeFallback(root, config);
    }

    applyVisibility();
    const interval = window.setInterval(applyVisibility, 700);
    return () => {
      window.clearInterval(interval);
      const root = findOrdersRoot();
      if (root) restoreRootButtons(root);
    };
  }, [config]);

  useEffect(() => {
    autoAdvanceOrders(config);
    const interval = window.setInterval(() => autoAdvanceOrders(config), 12000);
    return () => window.clearInterval(interval);
  }, [config]);

  return null;
}
