/**
 * AdminSidebar — Navegación vertical premium para el panel admin de SuperMenu.
 * Design: dark sidebar con grupos colapsables, iconos + labels, item activo destacado en amber.
 * Mobile: drawer deslizable desde la izquierda.
 */

import React, { useState } from 'react';
import {
  ClipboardList, Clock, Users, UtensilsCrossed, Tag, Sliders,
  BarChart3, TrendingUp, QrCode, Settings, Palette, Scissors,
  ChevronDown, ChevronRight, X, Menu as MenuIcon, Eye, LogOut, ExternalLink,
  Truck, LayoutGrid, UserCheck, Megaphone,
} from 'lucide-react';
import type { PlanTier } from '@/lib/plans';
import { hasCapability } from '@/lib/plans';

export type TabKey =
  | 'orders' | 'history' | 'staff'
  | 'menu' | 'categories' | 'modifiers'
  | 'analytics' | 'performance' | 'qr' | 'closing'
  | 'settings' | 'theme'
  | 'delivery'    // Delivery OS add-on
  | 'tables'      // Mesas del restaurante
  | 'customers'   // Módulo de clientes
  | 'promotions'; // Motor de promociones

interface NavItem {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'OPERACIÓN',
    items: [
      { key: 'orders',  label: 'Pedidos',   icon: <ClipboardList size={16} /> },
      { key: 'history', label: 'Historial', icon: <Clock size={16} /> },
      { key: 'staff',   label: 'Equipo',    icon: <Users size={16} /> },
      { key: 'tables',  label: 'Mesas',     icon: <LayoutGrid size={16} /> },
    ],
  },
  {
    label: 'CATÁLOGO',
    items: [
      { key: 'menu',       label: 'Menú',         icon: <UtensilsCrossed size={16} /> },
      { key: 'categories', label: 'Categorías',   icon: <Tag size={16} /> },
      { key: 'modifiers',  label: 'Modificadores',icon: <Sliders size={16} /> },
    ],
  },
  {
    label: 'NEGOCIO',
    items: [
      { key: 'analytics',   label: 'Analítica',    icon: <BarChart3 size={16} /> },
      { key: 'performance', label: 'Rendimiento',  icon: <TrendingUp size={16} /> },
      { key: 'customers',   label: 'Clientes',     icon: <UserCheck size={16} /> },
      { key: 'promotions',  label: 'Promociones',  icon: <Megaphone size={16} /> },
      { key: 'qr',          label: 'QR',           icon: <QrCode size={16} /> },
      { key: 'closing',     label: 'Corte / Cierre', icon: <Scissors size={16} /> },
    ],
  },
  {
    label: 'SISTEMA',
    items: [
      { key: 'settings', label: 'Configuración', icon: <Settings size={16} /> },
      { key: 'theme',    label: 'Tema',          icon: <Palette size={16} /> },
    ],
  },
  {
    label: 'DELIVERY OS',
    items: [
      { key: 'delivery', label: 'Delivery', icon: <Truck size={16} /> },
    ],
  },
];

interface AdminSidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  tenantName: string;
  tenantSlug: string;
  isOpen: boolean;
  isOpen_mobile: boolean;
  onToggleMobile: () => void;
  onLogout: () => void;
  /** @deprecated Usar planTier + hasDeliveryOs en código nuevo */
  planFeatures: { kds: boolean; analytics: boolean };
  /** Nuevo: tier del plan para usar hasCapability() */
  planTier?: PlanTier;
  /** Nuevo: si el tenant tiene el add-on Delivery OS activo */
  hasDeliveryOs?: boolean;
}

export function AdminSidebar({
  activeTab,
  onTabChange,
  tenantName,
  tenantSlug,
  isOpen_mobile,
  onToggleMobile,
  onLogout,
  planFeatures,
  planTier,
  hasDeliveryOs,
}: AdminSidebarProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const isTabVisible = (key: TabKey): boolean => {
    const tier = planTier ?? 'premium'; // fallback seguro
    const deliveryOs = hasDeliveryOs ?? false;
    // Usar nuevo sistema de capabilities si planTier está disponible
    if (key === 'orders')     return hasCapability(tier, 'orders_panel', deliveryOs);
    if (key === 'staff')      return hasCapability(tier, 'staff_panel', deliveryOs);
    if (key === 'modifiers')  return hasCapability(tier, 'modifiers', deliveryOs);
    if (key === 'analytics')  return hasCapability(tier, 'analytics_basic', deliveryOs);
    if (key === 'performance')return hasCapability(tier, 'team_performance', deliveryOs);
    if (key === 'closing')    return hasCapability(tier, 'smart_closing', deliveryOs);
    if (key === 'delivery')   return hasCapability(tier, 'delivery_dispatch', deliveryOs);
    return true;
  };

  const handleTabClick = (key: TabKey) => {
    onTabChange(key);
    // Cerrar drawer en mobile
    if (isOpen_mobile) onToggleMobile();
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="px-5 py-5 border-b border-white/8 flex items-center gap-3 flex-shrink-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)', boxShadow: '0 4px 14px rgba(245,158,11,0.4)' }}
        >
          <UtensilsCrossed size={17} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-white leading-tight truncate">{tenantName}</p>
          <p className="text-[10px] text-slate-500 font-mono">/{tenantSlug}</p>
        </div>
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1 scrollbar-hide">
        {NAV_GROUPS.map(group => {
          const visibleItems = group.items.filter(item => isTabVisible(item.key));
          if (visibleItems.length === 0) return null;
          const isCollapsed = collapsedGroups.has(group.label);

          return (
            <div key={group.label} className="mb-1">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-2 py-1.5 mb-1 group"
              >
                <span className="text-[10px] font-black tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">
                  {group.label}
                </span>
                {isCollapsed
                  ? <ChevronRight size={11} className="text-slate-600" />
                  : <ChevronDown size={11} className="text-slate-600" />
                }
              </button>

              {/* Group items */}
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {visibleItems.map(item => {
                    const isActive = activeTab === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleTabClick(item.key)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
                        style={isActive ? {
                          background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(249,115,22,0.12))',
                          color: '#F59E0B',
                          border: '1px solid rgba(245,158,11,0.3)',
                          boxShadow: '0 2px 10px rgba(245,158,11,0.15)',
                        } : {
                          color: '#94A3B8',
                          border: '1px solid transparent',
                        }}
                        onMouseEnter={e => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.color = '#E2E8F0';
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.05)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.color = '#94A3B8';
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <span style={{ color: isActive ? '#F59E0B' : '#64748B' }}>{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                        {isActive && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer actions */}
      <div className="px-3 py-4 border-t border-white/8 space-y-1 flex-shrink-0">
        <a
          href={`/${tenantSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ color: '#94A3B8', border: '1px solid transparent' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = '#E2E8F0';
            (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.05)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = '#94A3B8';
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          }}
        >
          <Eye size={16} className="text-slate-500" />
          <span>Ver menú</span>
          <ExternalLink size={11} className="ml-auto text-slate-600" />
        </a>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ color: '#94A3B8', border: '1px solid transparent' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = '#F87171';
            (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.08)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = '#94A3B8';
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          }}
        >
          <LogOut size={16} className="text-slate-500" />
          <span>Salir</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar (fixed, always visible) ── */}
      <aside
        className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-56 z-40 border-r"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 97%, #000)',
          borderColor: 'rgba(255,255,255,0.07)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.4)',
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile: hamburger button ── */}
      <button
        onClick={onToggleMobile}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-xl flex items-center justify-center transition-all"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          color: 'var(--text-secondary)',
        }}
      >
        {isOpen_mobile ? <X size={18} /> : <MenuIcon size={18} />}
      </button>

      {/* ── Mobile: overlay ── */}
      {isOpen_mobile && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={onToggleMobile}
        />
      )}

      {/* ── Mobile: drawer ── */}
      <aside
        className="lg:hidden fixed left-0 top-0 h-screen w-64 z-50 border-r flex flex-col transition-transform duration-300"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 97%, #000)',
          borderColor: 'rgba(255,255,255,0.07)',
          boxShadow: '4px 0 32px rgba(0,0,0,0.6)',
          transform: isOpen_mobile ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
