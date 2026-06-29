import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { jsPDF } from 'jspdf';

interface FlowConfig {
  tenantId: string | null;
  dineIn: boolean;
  takeout: boolean;
  delivery: boolean;
  newStep: boolean;
  prepStep: boolean;
  billingStep: boolean;
}

interface ExportTenant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
}

interface ExportCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  is_drink?: boolean | null;
}

interface ExportMenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean | null;
  is_featured: boolean | null;
  badge: string | null;
  sort_order: number | null;
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
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getSlugFromPath(scope: 'admin' | 'staff') {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const marker = scope === 'admin' ? 'admin' : 'staff';
  const idx = parts.indexOf(marker);
  return idx >= 0 ? parts[idx + 1] : undefined;
}

function cacheKey(scope: 'admin' | 'staff', slug?: string) {
  return slug ? `smartmenu:order-flow:${scope}:${slug}` : null;
}

function getInitialFlow(scope: 'admin' | 'staff'): FlowConfig {
  const slug = getSlugFromPath(scope);
  const key = cacheKey(scope, slug);

  if (key) {
    try {
      const cached = window.localStorage.getItem(key);
      if (cached) return { ...DEFAULT_FLOW, ...(JSON.parse(cached) as Partial<FlowConfig>) };
    } catch {
      // Ignore cache parsing issues and fall back safely.
    }
  }

  if (slug === 'la-tacopedia') {
    return {
      ...DEFAULT_FLOW,
      dineIn: false,
      takeout: true,
      delivery: false,
      newStep: false,
      prepStep: true,
      billingStep: true,
    };
  }

  return DEFAULT_FLOW;
}

function findOrdersRoot(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3'))
    .find(el => normalizeText(el.textContent).includes('pedidos en vivo'));
  if (!heading) return null;

  let node: HTMLElement | null = heading.parentElement;
  for (let i = 0; i < 10 && node; i += 1) {
    const text = normalizeText(node.textContent);
    if (
      text.includes('sin pedidos en este estado') ||
      text.includes('en prep.') ||
      text.includes('listos') ||
      text.includes('para llevar') ||
      text.includes('comer aquí') ||
      text.includes('delivery')
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

function setRootButtonHidden(root: HTMLElement, label: string, hidden: boolean) {
  const wanted = normalizeText(label).replace(/\s+/g, '');
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
  buttons.forEach(button => {
    const text = getButtonLabel(button);
    const isTarget = text === wanted || text.startsWith(wanted);
    if (!isTarget) return;

    if (hidden) {
      button.dataset.flowPatchHidden = 'true';
      button.style.display = 'none';
    } else if (button.dataset.flowPatchHidden === 'true') {
      button.style.display = '';
      delete button.dataset.flowPatchHidden;
    }
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

function fitVisibleButtonGrids(root: HTMLElement) {
  const groupedLabels = [
    ['comeraquí', 'delivery', 'parallevar'],
    ['nuevos', 'enprep.', 'listos', 'cobro'],
  ];

  groupedLabels.forEach(labels => {
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .filter(button => {
        const text = getButtonLabel(button);
        return labels.some(label => text.startsWith(label));
      });

    if (buttons.length === 0) return;
    const parent = buttons[0].parentElement as HTMLElement | null;
    if (!parent) return;

    const visibleCount = buttons.filter(button => button.style.display !== 'none').length || 1;
    parent.dataset.flowPatchGrid = 'true';
    parent.style.gridTemplateColumns = `repeat(${visibleCount}, minmax(0, 1fr))`;
  });
}

function clickSafeFallback(root: HTMLElement, config: FlowConfig) {
  const hiddenActive = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-flow-patch-hidden="true"]'))
    .some(button => button.getAttribute('aria-selected') === 'true' || String(button.className).includes('border-current'));

  if (!hiddenActive) return;

  const fallbackLabels = [
    config.takeout ? 'parallevar' : null,
    config.dineIn ? 'comeraquí' : null,
    config.delivery ? 'delivery' : null,
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

function applyVisibilityNow(config: FlowConfig) {
  const root = findOrdersRoot();
  if (!root) return;

  setRootButtonHidden(root, 'Comer Aquí', !config.dineIn);
  setRootButtonHidden(root, 'Mesa', !config.dineIn);
  setRootButtonHidden(root, 'Delivery', !config.delivery);
  setRootButtonHidden(root, 'Para llevar', !config.takeout);
  setRootButtonHidden(root, 'Nuevos', !config.newStep);
  setRootButtonHidden(root, 'En prep.', !config.prepStep);
  setRootButtonHidden(root, 'Cobro', !config.billingStep);
  setRootButtonHidden(root, 'Por cobrar', !config.billingStep);
  setRootButtonHidden(root, 'Cobrados', !config.billingStep);

  fitVisibleButtonGrids(root);
  clickSafeFallback(root, config);
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

function showRuntimeToast(message: string, tone: 'success' | 'error' | 'info' = 'info') {
  const existing = document.querySelector('[data-smartmenu-runtime-toast="true"]');
  existing?.remove();

  const toast = document.createElement('div');
  toast.dataset.smartmenuRuntimeToast = 'true';
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.left = '50%';
  toast.style.bottom = '24px';
  toast.style.transform = 'translateX(-50%)';
  toast.style.zIndex = '2147483647';
  toast.style.maxWidth = 'calc(100vw - 32px)';
  toast.style.padding = '12px 16px';
  toast.style.borderRadius = '14px';
  toast.style.fontSize = '13px';
  toast.style.fontWeight = '800';
  toast.style.boxShadow = '0 18px 50px rgba(0,0,0,0.35)';
  toast.style.border = '1px solid rgba(255,255,255,0.14)';
  toast.style.color = '#fff';
  toast.style.background = tone === 'success'
    ? 'linear-gradient(135deg, #059669, #10b981)'
    : tone === 'error'
      ? 'linear-gradient(135deg, #dc2626, #ef4444)'
      : 'linear-gradient(135deg, #0f172a, #1e293b)';
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), tone === 'error' ? 5200 : 2600);
}

function findOrderNumberFromButton(button: HTMLButtonElement): number | null {
  let node: HTMLElement | null = button;
  for (let depth = 0; depth < 9 && node; depth += 1) {
    const text = node.textContent || '';
    const match = text.match(/#\s*(\d{1,8})/);
    if (match) return Number(match[1]);
    node = node.parentElement;
  }
  return null;
}

function nextStatusFromButton(button: HTMLButtonElement): 'en_cocina' | 'listo' | 'entregado' | null {
  const label = getButtonLabel(button);
  if (label.includes('acocina')) return 'en_cocina';
  if (label.includes('entregado')) return 'entregado';
  // Do not match the status tab "Listos"; findOrderNumberFromButton guards real order cards.
  if (label.includes('listo') && !label.includes('listos')) return 'listo';
  return null;
}

function clickRefreshButton(root: HTMLElement | null) {
  const scope = root || document.body;
  const refreshIcon = scope.querySelector('svg.lucide-refresh-cw');
  const refreshButton = refreshIcon?.closest('button') as HTMLButtonElement | null;
  refreshButton?.click();
}

async function safelyAdvanceOrderStatus(config: FlowConfig, orderNumber: number, newStatus: 'en_cocina' | 'listo' | 'entregado') {
  if (!config.tenantId) throw new Error('No se pudo identificar el restaurante. Recarga el panel e intenta de nuevo.');

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    status: newStatus,
    updated_at: now,
    has_new_items: false,
  };
  if (newStatus === 'en_cocina') updateData.accepted_at = now;
  if (newStatus === 'listo') updateData.ready_at = now;
  if (newStatus === 'entregado') updateData.completed_at = now;

  const { data, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('tenant_id', config.tenantId)
    .eq('order_number', orderNumber)
    .neq('status', 'cancelado')
    .select('id, order_number, status')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`No se encontró el pedido #${orderNumber} o no se pudo actualizar.`);
  if ((data as any).status !== newStatus) throw new Error(`El pedido #${orderNumber} no quedó en el estado esperado.`);

  return data;
}

function installOrderStatusSafetyPatch(config: FlowConfig) {
  const onClick = async (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest('button') as HTMLButtonElement | null;
    if (!button || button.dataset.smartmenuStatusPatchBusy === 'true') return;

    const newStatus = nextStatusFromButton(button);
    if (!newStatus) return;

    const orderNumber = findOrderNumberFromButton(button);
    if (!orderNumber) return;

    // The runtime patch takes over only for real order cards. This prevents false success
    // messages when Supabase rejects or ignores an update.
    event.preventDefault();
    event.stopPropagation();
    (event as any).stopImmediatePropagation?.();

    const originalText = button.textContent || '';
    button.dataset.smartmenuStatusPatchBusy = 'true';
    button.disabled = true;
    button.style.opacity = '0.65';
    button.textContent = 'Actualizando…';

    try {
      await safelyAdvanceOrderStatus(config, orderNumber, newStatus);
      const labels: Record<string, string> = { en_cocina: 'En cocina', listo: 'Listo', entregado: 'Entregado' };
      showRuntimeToast(`✅ Pedido #${orderNumber} → ${labels[newStatus]}`, 'success');
      clickRefreshButton(findOrdersRoot());
      window.setTimeout(() => clickRefreshButton(findOrdersRoot()), 450);
    } catch (err: any) {
      button.disabled = false;
      button.style.opacity = '';
      button.textContent = originalText;
      showRuntimeToast(`No se pudo actualizar #${orderNumber}: ${err?.message || String(err)}`, 'error');
    } finally {
      window.setTimeout(() => {
        button.dataset.smartmenuStatusPatchBusy = 'false';
      }, 700);
    }
  };

  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

async function loadImageDataUrl(source: string): Promise<string | null> {
  if (!source.trim()) return null;
  try {
    if (source.startsWith('data:image/')) return source;
    const response = await fetch(source, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function safeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'menu';
}

function priceText(price: number) {
  return `₡${Number(price || 0).toLocaleString('es-CR', { maximumFractionDigits: 0 })}`;
}

function drawWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  lines.forEach((line, index) => doc.text(line, x, y + index * lineHeight));
  return y + Math.max(lines.length, 1) * lineHeight;
}

async function exportMenuPdfFromAdmin(slug: string, customLogoSource: string | null) {
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, slug, name, description, logo_url')
    .eq('slug', slug)
    .maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant) throw new Error('No se encontró el restaurante para exportar.');

  const tenantData = tenant as ExportTenant;
  const [{ data: categories, error: categoriesError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, description, sort_order, is_active, is_drink')
      .eq('tenant_id', tenantData.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('menu_items')
      .select('id, category_id, name, description, price, is_available, is_featured, badge, sort_order')
      .eq('tenant_id', tenantData.id)
      .eq('is_available', true)
      .order('sort_order', { ascending: true }),
  ]);

  if (categoriesError) throw categoriesError;
  if (itemsError) throw itemsError;

  const logoData = await loadImageDataUrl(customLogoSource || tenantData.logo_url || '');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const primary = '#073F25';
  const gold = '#C9A44E';
  const ink = '#1F2933';
  const soft = '#6B7280';

  doc.setFillColor(primary);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setTextColor('#F8F3E8');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SMARTMENU · MENÚ DIGITAL EXPORTADO', margin, 70);
  doc.setDrawColor(gold);
  doc.setLineWidth(1);
  doc.line(margin, 88, pageWidth - margin, 88);

  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', pageWidth / 2 - 74, 126, 148, 148, undefined, 'FAST');
    } catch {
      try { doc.addImage(logoData, 'PNG', pageWidth / 2 - 74, 126, 148, 148, undefined, 'FAST'); } catch { /* ignore logo errors */ }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.text(tenantData.name, pageWidth / 2, 320, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const description = tenantData.description || 'Menú exportado desde el panel administrativo.';
  const wrapped = doc.splitTextToSize(description, pageWidth - margin * 2) as string[];
  doc.text(wrapped, pageWidth / 2, 348, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor('#D9CFA8');
  doc.text(`Generado: ${new Date().toLocaleString('es-CR')}`, pageWidth / 2, 420, { align: 'center' });
  doc.text('Datos: Supabase · Código: GitHub · Hosting: Vercel', pageWidth / 2, 438, { align: 'center' });

  const allCategories = (categories || []) as ExportCategory[];
  const allItems = (items || []) as ExportMenuItem[];
  const byCategory = new Map<string, ExportMenuItem[]>();
  allItems.forEach(item => {
    const list = byCategory.get(item.category_id) || [];
    list.push(item);
    byCategory.set(item.category_id, list);
  });

  let y = margin;
  const startContentPage = () => {
    doc.addPage();
    doc.setFillColor('#FFFFFF');
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setTextColor(primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SmartMenu', margin, 34);
    doc.setFontSize(9);
    doc.setTextColor(soft);
    doc.text(tenantData.name, pageWidth - margin, 34, { align: 'right' });
    doc.setDrawColor('#E5E7EB');
    doc.line(margin, 44, pageWidth - margin, 44);
    y = 72;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 58) startContentPage();
  };

  startContentPage();

  allCategories.forEach(category => {
    const categoryItems = (byCategory.get(category.id) || []).sort((a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'es')
    );
    if (categoryItems.length === 0) return;

    ensureSpace(64);
    doc.setFillColor(primary);
    doc.roundedRect(margin, y - 18, pageWidth - margin * 2, 28, 8, 8, 'F');
    doc.setTextColor('#FFFFFF');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(category.name, margin + 14, y);
    y += 28;

    if (category.description) {
      doc.setTextColor(soft);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      y = drawWrappedText(doc, category.description, margin + 2, y, pageWidth - margin * 2 - 4, 11) + 7;
    }

    categoryItems.forEach(item => {
      const descLines = item.description ? (doc.splitTextToSize(item.description, pageWidth - margin * 2 - 105) as string[]) : [];
      const blockHeight = 26 + descLines.length * 10 + 10;
      ensureSpace(blockHeight);

      doc.setDrawColor('#E5E7EB');
      doc.line(margin, y - 8, pageWidth - margin, y - 8);
      doc.setTextColor(ink);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      const nameLines = doc.splitTextToSize(item.name, pageWidth - margin * 2 - 108) as string[];
      doc.text(nameLines, margin, y);
      doc.setTextColor(primary);
      doc.setFontSize(10.5);
      doc.text(priceText(Number(item.price)), pageWidth - margin, y, { align: 'right' });
      y += Math.max(nameLines.length, 1) * 12;

      if (item.badge || item.is_featured) {
        doc.setTextColor(gold);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(item.badge ? item.badge.replace(/_/g, ' ').toUpperCase() : 'DESTACADO', margin, y + 1);
        y += 10;
      }

      if (descLines.length) {
        doc.setTextColor(soft);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.7);
        doc.text(descLines, margin, y);
        y += descLines.length * 10;
      }
      y += 14;
    });

    y += 6;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 2; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9CA3AF');
    doc.text(`SmartMenu · ${tenantData.name}`, margin, pageHeight - 28);
    doc.text(`Página ${page - 1} de ${pageCount - 1}`, pageWidth - margin, pageHeight - 28, { align: 'right' });
  }

  doc.save(`${safeFileName(tenantData.name)}_smartmenu_menu.pdf`);
  return { count: allItems.length, categories: allCategories.length };
}

function MenuPdfExportRuntime({ slug }: { slug?: string }) {
  const [open, setOpen] = useState(false);
  const [logoSource, setLogoSource] = useState('');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!slug) return null;

  const handleFile = async (file?: File) => {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setLogoSource(dataUrl);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportMenuPdfFromAdmin(slug, logoSource.trim() || null);
      showRuntimeToast(`PDF exportado: ${result.count} productos`, 'success');
      setOpen(false);
    } catch (err: any) {
      showRuntimeToast(`No se pudo exportar el PDF: ${err?.message || String(err)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 2147483000 }}>
      {open && (
        <div style={{ width: 320, maxWidth: 'calc(100vw - 32px)', marginBottom: 10, padding: 16, borderRadius: 18, background: 'rgba(15,23,42,0.98)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900 }}>Exportar menú PDF</p>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94a3b8' }}>Usa el logo guardado o agrega uno solo para este PDF.</p>
            </div>
            <button onClick={() => setOpen(false)} style={{ border: 0, borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', width: 30, height: 30, cursor: 'pointer' }}>×</button>
          </div>

          <label style={{ display: 'block', fontSize: 11, color: '#cbd5e1', marginBottom: 6 }}>Logo por URL, opcional</label>
          <input
            value={logoSource.startsWith('data:image/') ? 'Logo cargado desde archivo' : logoSource}
            onChange={event => setLogoSource(event.target.value)}
            disabled={logoSource.startsWith('data:image/')}
            placeholder="https://.../logo.png"
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', fontSize: 12, outline: 'none' }}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', padding: '10px 8px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Subir logo</button>
            <button onClick={() => setLogoSource('')} style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', padding: '10px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Limpiar</button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={event => handleFile(event.target.files?.[0])} />

          <button onClick={handleExport} disabled={exporting} style={{ width: '100%', marginTop: 12, border: 0, borderRadius: 14, background: exporting ? '#64748b' : 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', padding: '12px 14px', fontSize: 13, fontWeight: 900, cursor: exporting ? 'wait' : 'pointer' }}>
            {exporting ? 'Generando PDF…' : 'Descargar PDF'}
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen(value => !value)}
        style={{ border: 0, borderRadius: 999, background: 'linear-gradient(135deg, #073F25, #10b981)', color: '#fff', padding: '12px 16px', fontSize: 13, fontWeight: 900, boxShadow: '0 18px 50px rgba(0,0,0,0.35)', cursor: 'pointer' }}
      >
        Exportar PDF
      </button>
    </div>
  );
}

const TACOPEDIA_PREPAINT_CSS = `
  /* La Tacopedia only uses takeout and has the Nuevos step disabled.
     These selectors remove the legacy hardcoded first-paint tabs before React effects run. */
  div.grid.grid-cols-4.gap-1.mb-2 > button:first-child {
    display: none !important;
  }
  div.grid.grid-cols-4.gap-1.mb-2 {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
  div[class*="p-0.5"][class*="rounded-lg"][class*="border"]:has(+ div.grid.grid-cols-4.gap-1.mb-2) > button:not(:last-child) {
    display: none !important;
  }
  div[class*="p-0.5"][class*="rounded-lg"][class*="border"]:has(+ div.grid.grid-cols-4.gap-1.mb-2) {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
  }
`;

export default function OrderFlowRuntimePatch({ scope }: { scope: 'admin' | 'staff' }) {
  const [config, setConfig] = useState<FlowConfig>(() => getInitialFlow(scope));
  const slug = getSlugFromPath(scope);
  const isTacopedia = slug === 'la-tacopedia';

  useEffect(() => {
    let mounted = true;
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
      const nextConfig: FlowConfig = {
        tenantId: tenant.id,
        dineIn: delivery?.dine_in_orders_enabled ?? true,
        takeout: delivery?.takeout_orders_enabled ?? true,
        delivery: delivery?.delivery_orders_enabled ?? true,
        newStep: sectionVisibility.order_flow_new ?? true,
        prepStep: sectionVisibility.order_flow_prep ?? true,
        billingStep: sectionVisibility.order_flow_billing ?? true,
      };

      setConfig(nextConfig);
      const key = cacheKey(scope, slug);
      if (key) {
        try {
          window.localStorage.setItem(key, JSON.stringify(nextConfig));
        } catch {
          // Local storage may be unavailable in private/embedded browser modes.
        }
      }
    }

    loadConfig();
    const interval = window.setInterval(loadConfig, 15000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [scope, slug]);

  useLayoutEffect(() => {
    applyVisibilityNow(config);

    const raf = window.requestAnimationFrame(() => applyVisibilityNow(config));
    const timeout = window.setTimeout(() => applyVisibilityNow(config), 80);
    const interval = window.setInterval(() => applyVisibilityNow(config), 900);
    const observer = new MutationObserver(() => applyVisibilityNow(config));
    observer.observe(document.body, { childList: true, subtree: true });
    const stopObserver = window.setTimeout(() => observer.disconnect(), 4000);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.clearTimeout(stopObserver);
      window.clearInterval(interval);
      observer.disconnect();
      const root = findOrdersRoot();
      if (root) restoreRootButtons(root);
    };
  }, [config]);

  useEffect(() => {
    autoAdvanceOrders(config);
    const interval = window.setInterval(() => autoAdvanceOrders(config), 12000);
    return () => window.clearInterval(interval);
  }, [config]);

  useEffect(() => installOrderStatusSafetyPatch(config), [config]);

  return (
    <>
      {isTacopedia ? <style data-order-flow-prepaint>{TACOPEDIA_PREPAINT_CSS}</style> : null}
      {scope === 'admin' ? <MenuPdfExportRuntime slug={slug} /> : null}
    </>
  );
}
