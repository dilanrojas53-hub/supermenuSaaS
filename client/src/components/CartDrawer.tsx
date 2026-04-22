/*
 * CartDrawer v8: AI Upsell + Static Fallback + Cuenta Abierta.
 * Flow: 1. Cart  2. Customer info (skipped in Cuenta Abierta)  3. [AI Upsell]  4. Select payment  5. SINPE  6. Confirmation
 * Cuenta Abierta: Detects open_tab_order in localStorage → UPDATE existing order instead of INSERT.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Trash2, MessageCircle, Copy, Check, Loader2, Camera, ArrowLeft, ShoppingBag, Banknote, CreditCard, Smartphone, AlertCircle, RefreshCw, MapPin, Clock, Bike, UtensilsCrossed, Package, GlassWater, Wine, ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { buildWhatsAppUrl } from '@/lib/phone';
import { shouldShowPaymentUI, getDefaultPaymentMethodForChannel } from '@/lib/paymentGating';
import { getDeliveryFeeForDistance, getAvailablePaymentMethods, canAcceptOrdersNow, type DeliveryConfig } from '@/lib/deliveryConfig';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/imageUtils';
import type { OrderChannel } from '@/lib/paymentGating';

// V11.0: Placeholder icon para items del carrito sin imagen
const CART_DRINK_KEYWORDS = ['bebida', 'drink', 'jugo', 'agua', 'refresco', 'smoothie', 'café', 'coffee', 'té', 'tea'];
const CART_WINE_KEYWORDS = ['vino', 'wine', 'licor', 'cóctel', 'cocktail', 'cerveza', 'beer', 'destilado'];
const getCartPlaceholderIcon = (itemName: string): React.ReactNode => {
  const lower = itemName.toLowerCase();
  if (CART_WINE_KEYWORDS.some(k => lower.includes(k))) {
    return <Wine size={20} style={{ color: 'var(--menu-accent)', opacity: 0.4 }} />;
  }
  if (CART_DRINK_KEYWORDS.some(k => lower.includes(k))) {
    return <GlassWater size={20} style={{ color: 'var(--menu-accent)', opacity: 0.4 }} />;
  }
  return <UtensilsCrossed size={20} style={{ color: 'var(--menu-accent)', opacity: 0.4 }} />;
};

import { type AISuggestedItem } from './AIUpsellModal';
import OrderTypeSelector from './OrderTypeSelector';
import DeliveryCheckout, { type DeliveryCheckoutData } from './DeliveryCheckout';
import type { ThemeSettings, Tenant, MenuItem, Category } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';
import { supabase } from '@/lib/supabase';
import { initOrderLogistics } from '@/lib/DeliveryCommitEngine';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
  /** All menu items — used to find static upsell fallback candidates */
  allMenuItems?: MenuItem[];
  /** All categories — used for smart cross-selling by category type */
  allCategories?: Category[];
  /** Promo pre-aplicada desde la pantalla de Promos */
  pendingPromo?: { id: string; name: string; type: string; value: number } | null;
}

type PaymentMethod = 'sinpe' | 'efectivo' | 'tarjeta' | 'pos_externo';
type Step = 'cart' | 'order_type' | 'delivery_address' | 'customer_info' | 'upsell' | 'select_payment' | 'payment' | 'confirmation';
type DeliveryType = 'dine_in' | 'takeout' | 'delivery';

// ─── V11.0 MOTOR DE MARIDAJE: Clasificación de categorías por nombre exacto + keywords (module-level) ───
// Categorías de bebidas (disparan sugerencias de comida/postre)
const DRINK_CATEGORY_NAMES = [
  'Bebidas', 'Cafetería', 'Cócteles', 'Licores y Destilados', 'Té y Bebidas Naturales',
  'Bebidas Frías', 'Bebidas Calientes', 'Jugos', 'Smoothies', 'Cervezas', 'Vinos',
];
// Categorías de comida (disparan sugerencias de bebida/postre)
const FOOD_CATEGORY_NAMES = [
  'Entradas', 'Platos Principales', 'Hamburguesas', 'Acompañamientos', 'Tablas para Compartir',
  'Pizzas', 'Pastas', 'Tacos', 'Sushi', 'Ensaladas', 'Wraps', 'Bowls', 'Sandwiches',
  'Pollo', 'Carnes', 'Mariscos', 'Vegetariano', 'Vegano',
];
// Categorías de postres (complementan tanto bebidas como comida)
const DESSERT_CATEGORY_NAMES = [
  'Postres', 'Dulces', 'Helados', 'Pasteles', 'Tortas',
];
// Keywords de fallback (si el nombre exacto no coincide)
const DRINK_KEYWORDS = ['bebida', 'drink', 'refresco', 'jugo', 'licor', 'vino', 'cerveza', 'cóctel', 'cocktail', 'café', 'coffee', 'té', 'tea', 'agua', 'water', 'smoothie', 'milkshake'];
const FOOD_KEYWORDS = ['hamburguesa', 'burger', 'plato', 'entrada', 'principal', 'sándwich', 'sandwich', 'pizza', 'pasta', 'taco', 'burritos', 'sushi', 'ramen', 'pollo', 'chicken', 'carne', 'meat', 'pescado', 'fish', 'mariscos', 'seafood', 'vegano', 'vegan', 'vegetariano', 'vegetarian', 'bowl', 'wrap', 'casado', 'gallo', 'arroz', 'rice'];
const DESSERT_KEYWORDS = ['postre', 'dessert', 'dulce', 'sweet', 'helado', 'ice cream', 'pastel', 'cake', 'torta', 'pie', 'brownie', 'chocolate', 'flan', 'cheesecake'];
const SIDE_KEYWORDS = ['acompañamiento', 'side', 'guarnición', 'garnish', 'papas', 'fries', 'nachos', 'sopa', 'soup', 'tabla', 'share', 'compartir'];

/**
 * classifyCategoryName — V11.0 Maridaje
 * Primero intenta coincidencia exacta (case-insensitive) con las listas de nombres.
 * Si no hay coincidencia, usa keywords como fallback.
 */
const classifyCategoryName = (catName: string): 'drink' | 'food' | 'dessert' | 'side' | 'other' => {
  const lower = catName.toLowerCase().trim();
  // 1º: Coincidencia exacta por nombre de categoría
  if (DRINK_CATEGORY_NAMES.some(n => n.toLowerCase() === lower)) return 'drink';
  if (FOOD_CATEGORY_NAMES.some(n => n.toLowerCase() === lower)) return 'food';
  if (DESSERT_CATEGORY_NAMES.some(n => n.toLowerCase() === lower)) return 'dessert';
  // 2º: Fallback por keywords
  if (DRINK_KEYWORDS.some(k => lower.includes(k))) return 'drink';
  if (DESSERT_KEYWORDS.some(k => lower.includes(k))) return 'dessert';
  if (SIDE_KEYWORDS.some(k => lower.includes(k))) return 'side';
  if (FOOD_KEYWORDS.some(k => lower.includes(k))) return 'food';
  return 'other';
};

// Shape of the open_tab_order stored in localStorage by OrderStatusPage
interface OpenTabOrder {
  orderId: string;
  orderNumber: number;
  tenantId: string;
  customerName: string;
  customerPhone: string;
  customerTable: string;
  existingItems: any[];
  existingTotal: number;
  existingUpsellRevenue: number;
  existingAiUpsellRevenue: number;
}

export default function CartDrawer({ isOpen, onClose, theme, tenant, allMenuItems = [], allCategories = [], pendingPromo }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, clearCart, totalPrice, addItemAdvanced } = useCart();
  const { t, lang } = useI18n();
  const { profile: customerProfile, refreshTenantStats } = useCustomerProfile();
  const [, navigate] = useLocation();
  const [sinpeCopied, setSinpeCopied] = useState(false);
  const [step, setStep] = useState<Step>('cart');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerTable, setCustomerTable] = useState('');
  const [availableTables, setAvailableTables] = useState<{ id: string; table_number: string; label: string | null; is_occupied: boolean; category: string | null }[]>([]);
  const [openTableGroup, setOpenTableGroup] = useState<string | null>(null); // acordeón de categoría de mesas
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const receiptCameraInputRef = useRef<HTMLInputElement>(null);

  // ─── PROMOCIONES Y CUPONES (declarados aquí para que estén disponibles en los useEffects) ───
  interface AppliedPromo { id: string; name: string; type: string; value: number; discountAmount: number; }
  interface AppliedCoupon { id: string; code: string; discount_type: string; discount_value: number; discountAmount: number; }
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Fix 2: autocompletar nombre y teléfono desde perfil autenticado cuando se abre el drawer
  useEffect(() => {
    if (isOpen && customerProfile) {
      if (customerProfile.name && !customerName) setCustomerName(customerProfile.name);
      if (customerProfile.phone && !customerPhone) setCustomerPhone(customerProfile.phone);
    }
  }, [isOpen, customerProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aplicar promo pendiente cuando se abre el carrito (inline calc para evitar hoisting)
  useEffect(() => {
    if (isOpen && pendingPromo && pendingPromo.id) {
      const discAmt = pendingPromo.type === 'percentage'
        ? Math.round(totalPrice * pendingPromo.value / 100)
        : Math.min(pendingPromo.value, totalPrice);
      setAppliedPromo({ ...pendingPromo, discountAmount: discAmt });
    }
  }, [isOpen, pendingPromo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── DELIVERY / LOGISTICA ───
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('dine_in');
  const [scheduledDate, setScheduledDate] = useState<'today' | 'tomorrow'>('today');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [deliveryPhone, setDeliveryPhone] = useState<string>('');

  // ─── GPS / GEOLOCALIZACIÓN ───
  type LocationMode = 'manual' | 'gps';
  const [locationMode, setLocationMode] = useState<LocationMode>('manual');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  // ─── FASE 1: DELIVERY CHECKOUT DATA ───
  const [deliveryCheckoutData, setDeliveryCheckoutData] = useState<DeliveryCheckoutData | null>(null);

  // ─── DELIVERY CONFIG (pricing + payment methods + kitchen switch) ───
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null);
  // Legacy alias for backward compat
  const deliveryPricing = deliveryConfig ? {
    delivery_fee: deliveryConfig.delivery_fee,
    base_km: deliveryConfig.base_km,
    fee_variability_msg: deliveryConfig.fee_variability_msg,
    fee_presets: deliveryConfig.fee_presets,
  } : null;

  useEffect(() => {
    supabase
      .from('delivery_settings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDeliveryConfig(data as DeliveryConfig);
      });
  }, [tenant.id]);

  // Tarifa estimada: usa rangos escalonados si existen, si no tarifa base
  const estimatedDeliveryFee = React.useMemo(() => {
    if (!deliveryConfig || deliveryType !== 'delivery') return 0;
    const distKm = deliveryCheckoutData?.distanceKm ?? 0;
    const result = getDeliveryFeeForDistance(distKm, deliveryConfig);
    if (result.mode === 'manual' || result.mode === 'out_of_range') return 0;
    return result.fee ?? 0;
  }, [deliveryConfig, deliveryCheckoutData, deliveryType]);

  // ¿El costo está por confirmar?
  const deliveryFeeIsPending = React.useMemo(() => {
    if (!deliveryConfig || deliveryType !== 'delivery') return false;
    const distKm = deliveryCheckoutData?.distanceKm ?? 0;
    const result = getDeliveryFeeForDistance(distKm, deliveryConfig);
    return result.mode === 'manual';
  }, [deliveryConfig, deliveryCheckoutData, deliveryType]);

  // Métodos de pago disponibles para delivery (filtrados por config del admin)
  const availableDeliveryPaymentMethods = React.useMemo(() => {
    if (deliveryType !== 'delivery' || !deliveryConfig) return ['sinpe', 'efectivo', 'tarjeta'] as Array<'sinpe' | 'efectivo' | 'tarjeta'>;
    return getAvailablePaymentMethods(deliveryConfig);
  }, [deliveryConfig, deliveryType]);

  // Auto-selección: si solo hay un método activo, seleccionarlo automáticamente
  React.useEffect(() => {
    if (deliveryType === 'delivery' && availableDeliveryPaymentMethods.length === 1 && !paymentMethod) {
      setPaymentMethod(availableDeliveryPaymentMethods[0] as PaymentMethod);
    }
  }, [availableDeliveryPaymentMethods, deliveryType, paymentMethod]);

  // Bloqueo de checkout: ningún método activo para delivery
  const noPaymentMethodsAvailable = deliveryType === 'delivery' && deliveryConfig !== null && availableDeliveryPaymentMethods.length === 0;

  // ¿El restaurante acepta pedidos ahora?
  const ordersAccepted = React.useMemo(() => {
    if (!deliveryConfig) return true;
    const channel = deliveryType === 'delivery' ? 'delivery' : deliveryType === 'takeout' ? 'takeout' : 'dine_in';
    return canAcceptOrdersNow(deliveryConfig, channel);
  }, [deliveryConfig, deliveryType]);

  const handleRequestGPS = () => {
    if (!navigator.geolocation) {
      setGpsError(lang === 'es'
        ? '⚠️ Tu navegador no soporta geolocalización. Por favor escribe tu dirección manualmente.'
        : '⚠️ Your browser does not support geolocation. Please type your address manually.');
      setLocationMode('manual');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    setGpsCoords(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setGpsCoords({ lat: latitude, lon: longitude });
        setGpsLoading(false);
        setGpsError('');
      },
      (err) => {
        setGpsLoading(false);
        setGpsCoords(null);
        const msg = err.code === 1
          ? (lang === 'es'
              ? '⚠️ No pudimos obtener tu ubicación. Por favor escribe tu dirección manualmente.'
              : '⚠️ Could not get your location. Please type your address manually.')
          : (lang === 'es'
              ? '⚠️ Error al obtener ubicación. Por favor escribe tu dirección manualmente.'
              : '⚠️ Error getting location. Please type your address manually.');
        setGpsError(msg);
        setLocationMode('manual');
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // Construir delivery_address final concatenando señas + GPS
  const buildDeliveryAddress = (): string => {
    const notes = deliveryNotes.trim();
    if (locationMode === 'gps' && gpsCoords) {
      const gpsLink = `https://maps.google.com/?q=${gpsCoords.lat},${gpsCoords.lon}`;
      return notes
        ? `Señas: ${notes} | GPS: ${gpsLink}`
        : `GPS: ${gpsLink}`;
    }
    // Modo manual: usar deliveryAddress directamente
    const addr = deliveryAddress.trim();
    return notes ? `${addr} | Señas: ${notes}` : addr;
  };

  // ─── CUENTA ABIERTA (Open Tab) ───
  const [openTab, setOpenTab] = useState<OpenTabOrder | null>(null);

  // ─── FUNCIONES DE DESCUENTO ───
  const calcPromoDiscount = (type: string, value: number, subtotal: number): number => {
    if (type === 'percentage') return Math.round(subtotal * value / 100);
    if (type === 'fixed') return Math.min(value, subtotal);
    return 0;
  };

  const applyPromoToCart = (promo: { id: string; name: string; type: string; value: number }) => {
    const discAmt = calcPromoDiscount(promo.type, promo.value, totalPrice);
    setAppliedPromo({ ...promo, discountAmount: discAmt });
  };

  const applyCouponCode = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('code', code)
      .eq('is_active', true)
      .or(`valid_until.is.null,valid_until.gte.${now}`)
      .maybeSingle();
    setCouponLoading(false);
    if (error || !data) { setCouponError(lang === 'es' ? 'Cupón no válido o expirado' : 'Invalid or expired coupon'); return; }
    if (data.max_uses && data.used_count >= data.max_uses) { setCouponError(lang === 'es' ? 'Este cupón ya alcanzó su límite de usos' : 'Coupon usage limit reached'); return; }
    const discAmt = data.discount_type === 'percentage'
      ? Math.round(totalPrice * data.discount_value / 100)
      : Math.min(data.discount_value, totalPrice);
    setAppliedCoupon({ id: data.id, code: data.code, discount_type: data.discount_type, discount_value: data.discount_value, discountAmount: discAmt });
    setCouponInput('');
  };

  const discountAmount = React.useMemo(() => {
    let d = 0;
    if (appliedPromo) d += appliedPromo.discountAmount;
    if (appliedCoupon) d += appliedCoupon.discountAmount;
    return Math.min(d, totalPrice);
  }, [appliedPromo, appliedCoupon, totalPrice]);

  const finalTotal = Math.max(0, totalPrice - discountAmount);

  // Detect open tab order from localStorage when drawer opens
  useEffect(() => {
    if (isOpen) {
      try {
        const raw = localStorage.getItem('open_tab_order');
        if (raw) {
          const parsed = JSON.parse(raw) as OpenTabOrder;
          // Only use if it belongs to this tenant
          if (parsed.tenantId === tenant.id) {
            setOpenTab(parsed);
            // Pre-fill customer info from existing order
            setCustomerName(parsed.customerName);
            setCustomerPhone(parsed.customerPhone);
            setCustomerTable(parsed.customerTable);
          }
        }
      } catch { /* ignore parse errors */ }
    }
  }, [isOpen, tenant.id]);

  // Cargar mesas configuradas cuando el drawer se abre
  useEffect(() => {
    if (isOpen && tenant.id) {
      supabase
        .from('restaurant_tables')
        .select('id, table_number, label, is_occupied, category')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('table_number', { ascending: true })
        .then(({ data }) => setAvailableTables(data || []));
    }
  }, [isOpen, tenant.id]);

  // Upsell step state — shared by all order types (dine_in, takeout, delivery)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestedItems, setAiSuggestedItems] = useState<AISuggestedItem[]>([]);
  // Track which upsell items the user added in the current session
  const [upsellAddedIds, setUpsellAddedIds] = useState<Set<string>>(new Set());

  const handleCopySinpe = useCallback(() => {
    if (tenant.sinpe_number) {
      navigator.clipboard.writeText(tenant.sinpe_number.replace(/-/g, '')).catch(() => {});
      setSinpeCopied(true);
      setTimeout(() => setSinpeCopied(false), 2000);
    }
  }, [tenant.sinpe_number]);

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // ─── CROSS-SELLING INTELIGENTE POR CATEGORÍAS ───
  // Las constantes KEYWORDS están definidas a nivel de módulo para evitar re-creación en cada render.
  const getCategoryType = useCallback((categoryId: string): 'drink' | 'food' | 'dessert' | 'side' | 'other' => {
    const cat = allCategories.find(c => c.id === categoryId);
    if (!cat) return 'other';
    return classifyCategoryName(cat.name);
  }, [allCategories]);

  /**
   * getSmartCrossSellCandidates — V11.0 Motor de Maridaje
   *
   * Regla de Opuestos (JAMAS recomienda del mismo grupo):
   * - Si el disparador está en drinkCategories → recomendar SOLO de foodCategories o Postres
   * - Si el disparador está en foodCategories → recomendar SOLO de drinkCategories o Postres
   * Anti-Repetición: excluye cualquier producto que ya esté en el carrito.
   *
   * NO modifica el carrito ni escribe en Supabase.
   */
  const getSmartCrossSellCandidates = useCallback((allItems: MenuItem[], maxCount = 3): MenuItem[] => {
    // Anti-repetición: IDs ya en el carrito
    const cartItemIds = new Set(items.map(ci => ci.menuItem.id));

    // Clasificar cada item del carrito
    const cartTypes = items.map(ci => getCategoryType(ci.menuItem.category_id));
    const hasFood = cartTypes.some(t => t === 'food' || t === 'side');
    const hasDrink = cartTypes.some(t => t === 'drink');
    const hasDessert = cartTypes.some(t => t === 'dessert');

    // Regla de Opuestos: determinar qué tipos sugerir
    const typesToSuggest = new Set<string>();

    if (hasDrink && !hasFood) {
      // Carrito con bebidas → sugerir comida y postres (JAMAS otra bebida)
      typesToSuggest.add('food');
      typesToSuggest.add('side');
      if (!hasDessert) typesToSuggest.add('dessert');
    } else if (hasFood && !hasDrink) {
      // Carrito con comida → sugerir bebidas y postres (JAMAS otra comida)
      typesToSuggest.add('drink');
      if (!hasDessert) typesToSuggest.add('dessert');
    } else if (hasFood && hasDrink) {
      // Carrito mixto → sugerir postres si no los tiene
      if (!hasDessert) typesToSuggest.add('dessert');
    } else {
      // Carrito vacío o sin clasificar → sugerir bebida + acompañamiento
      typesToSuggest.add('drink');
      typesToSuggest.add('side');
    }

    // Filtrar candidatos: disponibles, no en carrito, del tipo correcto
    const candidates = allItems.filter(item => {
      if (!item.is_available) return false;
      if (cartItemIds.has(item.id)) return false; // Anti-repetición
      const type = getCategoryType(item.category_id);
      return typesToSuggest.has(type);
    });

    // Priorizar: mas_pedido > chef_recomienda > nuevo > resto
    const priority = (item: MenuItem): number => {
      if (item.badge === 'mas_pedido') return 0;
      if (item.badge === 'chef_recomienda') return 1;
      if (item.badge === 'nuevo') return 2;
      return 3;
    };
    candidates.sort((a, b) => priority(a) - priority(b));

    console.log(
      '%c[V11.0 Maridaje] Tipos en carrito:', 'color: #F59E0B; font-weight: bold;',
      { hasFood, hasDrink, hasDessert },
      '| Sugiriendo:', Array.from(typesToSuggest),
      '| Candidatos:', candidates.slice(0, maxCount).map(i => i.name)
    );

    return candidates.slice(0, maxCount);
  }, [items, getCategoryType]);

  // Helper: find the best static upsell candidate from cart items
  const getStaticUpsellCandidate = useCallback((allMenuItems: MenuItem[]): { item: MenuItem; text: string | null } | null => {
    for (const ci of items) {
      if (ci.menuItem.upsell_item_id) {
        const target = allMenuItems.find(m => m.id === ci.menuItem.upsell_item_id);
        if (target && target.is_available) {
          return { item: target, text: ci.menuItem.upsell_text || null };
        }
      }
    }
    return null;
  }, [items]);

  // ─── UPSELL STEP: load suggestions into state, then navigate to step 'upsell' ───
  // This replaces the external AIUpsellModal approach. The upsell is now a native
  // drawer step so it never overlaps with the customer_info step.
  const loadUpsellAndNavigate = useCallback(async (menuItemsArg?: MenuItem[]) => {
    const eligibleItems = items.filter(ci => !ci.prevent_checkout_upsell && !ci.isUpsell);
    const usableMenuItems = (menuItemsArg && menuItemsArg.length > 0) ? menuItemsArg : allMenuItems;

    // If all items already went through upsell in ProductDetailModal, skip the step
    if (eligibleItems.length === 0) {
      setStep('upsell'); // still show the step but it will be empty → auto-advance below
      return;
    }

    // Navigate to upsell step immediately with loading state
    setAiLoading(true);
    setAiSuggestedItems([]);
    setStep('upsell');

    const goToStaticFallback = () => {
      setAiLoading(false);
      // 1º: Cross-sell inteligente por categorías
      if (usableMenuItems.length > 0 && allCategories.length > 0) {
        const crossSellItems = getSmartCrossSellCandidates(usableMenuItems, 3);
        if (crossSellItems.length > 0) {
          const crossSellSuggestions: AISuggestedItem[] = crossSellItems.map(item => ({
            trigger_item_id: eligibleItems.reduce((best, cur) => cur.menuItem.price > best.menuItem.price ? cur : best, eligibleItems[0])?.menuItem.id || null,
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            image_url: item.image_url,
            trigger_item_name: undefined,
            pitch: lang === 'es' ? 'Complementa perfectamente tu pedido' : 'Perfectly complements your order',
          }));
          setAiSuggestedItems(crossSellSuggestions);
          return;
        }
      }
      // 2º: Fallback estático (upsell_item_id en el platillo)
      const candidate = usableMenuItems.length > 0 ? getStaticUpsellCandidate(usableMenuItems) : null;
      if (candidate) {
        // Adapt static candidate to AISuggestedItem shape
        const staticSuggestion: AISuggestedItem = {
          id: candidate.item.id,
          name: candidate.item.name,
          description: candidate.item.description,
          price: candidate.item.price,
          image_url: candidate.item.image_url,
          pitch: candidate.text || (lang === 'es' ? 'Complementa tu pedido' : 'Complements your order'),
        };
        setAiSuggestedItems([staticSuggestion]);
      }
      // If no candidates at all, step shows empty state with a "Continuar" button
    };

    try {
      const cartPayload = eligibleItems.map(ci => ({
        id: ci.menuItem.id,
        name: ci.menuItem.name,
        price: ci.menuItem.price,
      }));
      const triggerItem = cartPayload.reduce(
        (best, cur) => cur.price > best.price ? cur : best,
        cartPayload[0]
      );
      const response = await fetch('/api/upsell-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_item_id: triggerItem.id,
          tenant_id: tenant.id,
          cart: cartPayload,
          surface: 'checkout',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.recommendations?.length > 0) {
          const suggestions: AISuggestedItem[] = data.recommendations.map((s: any) => ({
            trigger_item_id: triggerItem.id,
            trigger_item_name: triggerItem.name,
            id: s.id,
            name: s.name,
            description: s.description,
            price: s.price,
            image_url: s.image_url,
            pitch: s.pitch || (lang === 'es' ? 'Complementa tu pedido' : 'Complements your order'),
          }));
          setAiSuggestedItems(suggestions);
          suggestions.forEach(s => {
            fetch('/api/track-upsell-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenant_id: tenant.id,
                trigger_item_id: triggerItem.id,
                trigger_item_name: triggerItem.name,
                suggested_item_id: s.id,
                suggested_item_name: s.name,
                suggested_item_price: s.price,
                event_type: 'recommendation_shown',
                surface: 'checkout',
                source: data.source || 'fallback',
                cart_item_count: cartPayload.length,
              }),
            }).catch(() => {});
          });
        } else {
          goToStaticFallback();
        }
      } else {
        goToStaticFallback();
      }
    } catch (_err) {
      goToStaticFallback();
    } finally {
      setAiLoading(false);
    }
  }, [items, allMenuItems, allCategories, lang, tenant, getSmartCrossSellCandidates, getStaticUpsellCandidate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep these as thin wrappers so existing call sites don't need to change
  const handleProceedToPayment = useCallback((menuItemsArg?: MenuItem[]) => {
    return loadUpsellAndNavigate(menuItemsArg);
  }, [loadUpsellAndNavigate]);

  // Upsell step: "Continuar" button handler
  const handleUpsellContinue = useCallback(() => {
    const _showPaymentUILocal = shouldShowPaymentUI(deliveryType as OrderChannel);
    if (_showPaymentUILocal) {
      setStep('select_payment');
    } else {
      // dine_in / takeout: submit directly
      const defaultMethod = getDefaultPaymentMethodForChannel(deliveryType as OrderChannel) as PaymentMethod;
      handleSubmitOrderWithMethod(defaultMethod);
    }
  }, [deliveryType]); // eslint-disable-line react-hooks/exhaustive-deps

  // V17.2: SINPE ya no va a un step separado. Todos los métodos se confirman desde select_payment.
  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    setErrorMsg('');
    // V17.2: No más step 'payment' para SINPE — el comprobante se sube después en OrderStatus
  };

  // Validación centralizada: nombre/teléfono solo obligatorio para delivery
  const isDelivery = deliveryType === 'delivery';
  const requiresCustomerData = isDelivery;

  // Submit order: INSERT new or UPDATE existing (Cuenta Abierta)
  const handleSubmitOrderWithMethod = async (method: PaymentMethod) => {
    // Para delivery: nombre obligatorio. Para dine_in/takeout: puede enviarse sin nombre.
    if (requiresCustomerData && !customerName.trim() && !openTab) return;
    setUploading(true);
    setErrorMsg('');

    try {
      let receiptUrl = '';

      if (receiptFile && method === 'sinpe') {
        const ext = receiptFile.name.split('.').pop() || 'jpg';
        const fileName = `${tenant.slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, receiptFile, { cacheControl: '3600', upsert: false });

        if (uploadError) {
          console.error('[SINPE Upload] Error:', uploadError);
          toast.error(
            lang === 'es'
              ? 'Error al subir el comprobante. Intenta de nuevo.'
              : 'Error uploading receipt. Please try again.',
            { duration: 6000 }
          );
          setUploading(false);
          return;
        }

        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
        receiptUrl = urlData.publicUrl;
        console.log('[SINPE Upload] Success:', receiptUrl);
      }

      // V11.0 Telemetría Local: Limpieza del payload antes de Supabase.
      // Los campos trigger_item_id y upsell_accepted_at son metadata temporal en memoria.
      // Se excluyen explícitamente con destructuring — NUNCA llegan a la tabla orders.
      const newOrderItems = items.map(i => {
        // Destructuring explícito: extraer y descartar campos de telemetría local
        const {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          trigger_item_id: _tid,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          upsell_accepted_at: _uat,
          ...cleanCartItem
        } = i;
        return {
          id: cleanCartItem.menuItem.id,
          name: cleanCartItem.menuItem.name,
          price: cleanCartItem.menuItem.price,
          quantity: cleanCartItem.quantity,
          isUpsell: cleanCartItem.isUpsell || false,
          upsell_source: cleanCartItem.upsell_source || null,
          // V22.0: Modifier Groups
          selectedModifiers: cleanCartItem.selectedModifiers || [],
          modifiersTotal: cleanCartItem.modifiersTotal || 0,
        };
      });

      // Calculate upsell revenue for NEW items only
      const newUpsellRevenue = items
        .filter(i => i.isUpsell)
        .reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);
      const newAiUpsellRevenue = items
        .filter(i => i.upsell_source === 'ai')
        .reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);

      // ─── CUENTA ABIERTA: UPDATE existing order ───
      if (openTab) {
        const mergedItems = [...openTab.existingItems, ...newOrderItems];
        const mergedTotal = openTab.existingTotal + totalPrice;
        const mergedUpsellRevenue = (openTab.existingUpsellRevenue || 0) + newUpsellRevenue;
        const mergedAiUpsellRevenue = (openTab.existingAiUpsellRevenue || 0) + newAiUpsellRevenue;

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            items: mergedItems,
            subtotal: mergedTotal,
            total: mergedTotal,
            upsell_revenue: mergedUpsellRevenue,
            ai_upsell_revenue: mergedAiUpsellRevenue,
            upsell_accepted: mergedUpsellRevenue > 0,
            has_new_items: true,
            notes: notes.trim() ? `${openTab.customerName}: ${notes.trim()}` : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', openTab.orderId);

        if (updateError) {
          console.error('Update order error:', updateError);
          setErrorMsg(lang === 'es'
            ? `Error al actualizar el pedido: ${updateError.message}`
            : `Error updating order: ${updateError.message}`);
          return;
        }

        // Success — clean up and navigate to order status
        toast.success(lang === 'es' ? '¡Nuevos platillos agregados a tu pedido!' : 'New items added to your order!');
        localStorage.removeItem('open_tab_order');
        clearCart();
        setOpenTab(null);
        setStep('cart');
        onClose();
        navigate(`/order-status/${openTab.orderId}`);
        return;
      }

      // ─── NORMAL: INSERT new order ───
      // V17.2: SINPE sin comprobante inmediato → status 'pendiente', payment_status 'pending'
      const statusMap: Record<PaymentMethod, string> = {
        sinpe: 'pendiente',
        efectivo: 'pendiente',
        tarjeta: 'pendiente',
        pos_externo: 'pendiente', // dine-in/takeout: cobro externo, pedido entra directo a cocina
      };

      // ─── SNAPSHOT de descuentos al momento del insert (fuente de verdad) ───
      const snapshotSubtotal = totalPrice;
      const snapshotPromoDiscount = appliedPromo?.discountAmount ?? 0;
      const snapshotCouponDiscount = appliedCoupon?.discountAmount ?? 0;
      const snapshotDiscountAmount = snapshotPromoDiscount + snapshotCouponDiscount;
      const snapshotFinalTotal = Math.max(0, snapshotSubtotal - snapshotDiscountAmount);
      const snapshotPromoLabel = appliedPromo?.name ?? null;
      const snapshotPromoType = appliedPromo?.type ?? null;
      const snapshotCouponCode = appliedCoupon?.code ?? null;
      const snapshotPromotionId = appliedPromo?.id ?? null;

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenant.id,
          customer_name: customerName.trim() || '',
          customer_phone: customerPhone.trim() || '',
          customer_table: customerTable.trim() || '',
          items: newOrderItems,
          subtotal: snapshotSubtotal,
          total: snapshotFinalTotal,
          discount_amount: snapshotDiscountAmount,
          coupon_code: snapshotCouponCode,
          promotion_id: snapshotPromotionId,
          promo_label: snapshotPromoLabel,
          promo_type: snapshotPromoType,
          status: statusMap[method],
          payment_method: method,
          payment_status: 'pending',
          sinpe_receipt_url: '',  // V17.2: se sube después en OrderStatus
          notes: notes.trim() || '',
          upsell_revenue: newUpsellRevenue ?? 0,
          ai_upsell_revenue: newAiUpsellRevenue ?? 0,
          upsell_accepted: newUpsellRevenue > 0,
          delivery_type: deliveryType || 'dine_in',
          scheduled_date: (deliveryType === 'takeout' || deliveryType === 'delivery') ? (scheduledDate || 'today') : '',
          // V4.0 ASAP: si es "Hoy", enviar 'ASAP' para evitar campo vacío en BD
          scheduled_time: (deliveryType === 'takeout' || deliveryType === 'delivery')
            ? (scheduledDate === 'today' ? 'ASAP' : (scheduledTime || 'ASAP'))
            : '',
          delivery_address: deliveryType === 'delivery'
            ? (deliveryCheckoutData?.addressLine
                ? (deliveryCheckoutData.referenceNotes
                    ? `${deliveryCheckoutData.addressLine} | Señas: ${deliveryCheckoutData.referenceNotes}`
                    : deliveryCheckoutData.addressLine)
                : (buildDeliveryAddress() || ''))
            : '',
          delivery_phone: deliveryType === 'delivery'
            ? (deliveryCheckoutData?.customerPhone || deliveryPhone.trim() || '')
            : '',
          // Fase 1: Coordenadas reales y datos de cobertura
          delivery_lat: deliveryType === 'delivery' ? (deliveryCheckoutData?.lat ?? null) : null,
          delivery_lon: deliveryType === 'delivery' ? (deliveryCheckoutData?.lon ?? null) : null,
          delivery_formatted_address: deliveryType === 'delivery' ? (deliveryCheckoutData?.formattedAddress ?? null) : null,
          delivery_distance_km: deliveryType === 'delivery' ? (deliveryCheckoutData?.distanceKm ?? null) : null,
          delivery_eta_minutes: deliveryType === 'delivery' ? (deliveryCheckoutData?.etaMinutes ?? null) : null,
          delivery_destination_id: deliveryType === 'delivery' ? (deliveryCheckoutData?.destinationId ?? null) : null,
          // SINPE: pago no verificado hasta que el admin revise el comprobante
          payment_verified: method !== 'sinpe', // pos_externo = true (cobro externo, no requiere verificación)
          // Sesión de mesa: null al crear; el admin asigna sesión activa al primer pedido de la mesa
          session_id: null,
          table_archived: false,
          customer_profile_id: customerProfile?.id ?? null,
        })
        .select('id, order_number')
        .single();

      if (orderError) {
        console.error('Order error:', orderError);
        setErrorMsg(lang === 'es'
          ? `Error al procesar el pedido: ${orderError.message}`
          : `Error processing order: ${orderError.message}`);
        return;
      }

      if (orderData) {
        setOrderNumber(orderData.order_number);
        setOrderId(orderData.id);

        // Marcar mesa como ocupada si el cliente seleccionó una mesa
        if (deliveryType === 'dine_in' && customerTable.trim()) {
          const selectedTable = availableTables.find(
            t => t.table_number === customerTable.trim() || `Mesa ${t.table_number}` === customerTable.trim()
          );
          if (selectedTable) {
            supabase
              .from('restaurant_tables')
              .update({ is_occupied: true, current_order_id: orderData.id, occupied_at: new Date().toISOString() })
              .eq('id', selectedTable.id)
              .then(() => console.info(`[Tables] Mesa ${selectedTable.table_number} marcada como ocupada`));
          }
        }

        // F7: Motor de orquestación — inicializar logistic_status para pedidos delivery
        // SINPE: NO inicializar logística hasta que el admin valide el pago.
        // El pedido queda en status='pendiente' hasta la validación manual.
        if (deliveryType === 'delivery' && tenant?.id && method !== 'sinpe') {
          initOrderLogistics(orderData.id, tenant.id)
            .then(({ logisticStatus, availability }) => {
              console.info(
                `[DeliveryCommitEngine] Pedido #${orderData.order_number} → logistic_status: ${logisticStatus}`,
                availability.reason
              );
              if (logisticStatus === 'waitlist') {
                toast.warning(
                  `Tu pedido está en lista de espera. ${availability.reason}`,
                  { duration: 6000 }
                );
              }
            })
            .catch(err => console.error('[DeliveryCommitEngine] initOrderLogistics error:', err));
        }

        setStep('confirmation');
        // Fidelización: otorgar puntos POR TENANT (aislados por restaurante)
        if (customerProfile?.id && orderData?.id && tenant?.id) {
          const pointsEarned = Math.floor(snapshotFinalTotal / 100); // 1 punto por cada ₡100 (sobre total con descuento)
          try {
            // 1. Leer stats actuales de este tenant específico
            const { data: stats, error: statsReadError } = await supabase
              .from('tenant_customer_stats')
              .select('points, total_spent, total_orders')
              .eq('customer_id', customerProfile.id)
              .eq('tenant_id', tenant.id)
              .maybeSingle();

            if (statsReadError) {
              console.error('[Puntos] Error leyendo tenant_customer_stats:', statsReadError.message);
            } else {
              const currentPoints = stats?.points || 0;
              const newPoints = currentPoints + pointsEarned;
              const newLevel = newPoints >= 3000 ? 'vip' : newPoints >= 1500 ? 'gold' : newPoints >= 500 ? 'silver' : 'bronze';

              // 2. Upsert con await — crea o actualiza el registro para este (customer, tenant)
              const { error: upsertError } = await supabase
                .from('tenant_customer_stats')
                .upsert({
                  customer_id: customerProfile.id,
                  tenant_id: tenant.id,
                  points: newPoints,
                  level: newLevel,
                  total_spent: (stats?.total_spent || 0) + snapshotFinalTotal,
                  total_orders: (stats?.total_orders || 0) + 1,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'customer_id,tenant_id' });

              if (upsertError) {
                console.error('[Puntos] Error en upsert tenant_customer_stats:', upsertError.message);
              } else {
                console.info(`[Puntos] +${pointsEarned} pts → total ${newPoints} pts (nivel: ${newLevel}) para customer ${customerProfile.id} en tenant ${tenant.id}`);
                // 3. Refrescar tenantStats en el contexto para que el perfil muestre los puntos actualizados
                await refreshTenantStats();
              }
            }

            // 4. Registrar la transacción de puntos con await y manejo de error
            const { error: rewardInsertError } = await supabase
              .from('customer_rewards')
              .insert({
                customer_id: customerProfile.id,
                tenant_id: tenant.id,
                type: 'earned',
                amount: pointsEarned,
                description: `Pedido #${orderData.order_number}`,
                order_id: orderData.id,
              });

            if (rewardInsertError) {
              console.error('[Puntos] Error insertando customer_rewards:', rewardInsertError.message);
            } else {
              console.info(`[Puntos] Transacción registrada: earned ${pointsEarned} pts, pedido #${orderData.order_number}`);
            }
          } catch (loyaltyErr) {
            // No fallar el pedido por error de fidelización
            console.error('[Puntos] Error inesperado en fidelización:', loyaltyErr);
          }
        }
      }
    } catch (err: unknown) {
      console.error('Unexpected error:', err);
      setErrorMsg(lang === 'es'
        ? 'Ocurrió un error inesperado. Por favor intenta de nuevo.'
        : 'An unexpected error occurred. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!paymentMethod) return;
    await handleSubmitOrderWithMethod(paymentMethod);
  };

  // PAYMENT GATING: dine-in/takeout — navigate to upsell step, then submit directly.
  // Thin wrapper over loadUpsellAndNavigate so existing call sites don't need to change.
  const handleProceedDirect = useCallback((allMenuItemsArg?: MenuItem[]) => {
    return loadUpsellAndNavigate(allMenuItemsArg);
  }, [loadUpsellAndNavigate]);

  const paymentMethodLabel = (method: PaymentMethod | null): string => {
    if (!method) return '';
    const labels: Record<PaymentMethod, Record<string, string>> = {
      sinpe: { es: 'SINPE Móvil', en: 'SINPE Mobile' },
      efectivo: { es: 'Efectivo', en: 'Cash' },
      tarjeta: { es: 'Tarjeta', en: 'Card' },
      pos_externo: { es: 'POS Externo', en: 'External POS' },
    };
    return labels[method]?.[lang] || labels[method]?.es || '';
  };

  const handleWhatsApp = useCallback(() => {
    if (items.length === 0) return;

    let message = `*${t('confirm.order_number')} #${orderNumber || '---'} — ${tenant.name}*\n\n`;
    if (customerName) message += `${t('checkout.name')}: ${customerName}\n`;
    if (customerPhone) message += `${t('checkout.phone')}: ${customerPhone}\n`;
    if (customerTable) message += `${t('checkout.table')}: ${customerTable}\n`;
    message += `\n`;

    items.forEach(item => {
      message += `• ${item.quantity}x ${item.menuItem.name} — ${formatPrice(item.menuItem.price * item.quantity)}\n`;
    });
    if (discountAmount > 0) {
      message += `\n🏷️ Subtotal: ${formatPrice(totalPrice)}\n`;
      if (appliedPromo) message += `🎁 Promo: ${appliedPromo.name}${appliedPromo.discountAmount > 0 ? ` (-${formatPrice(appliedPromo.discountAmount)})` : ''}\n`;
      if (appliedCoupon) message += `🎟️ Cupón: ${appliedCoupon.code} (-${formatPrice(appliedCoupon.discountAmount)})\n`;
      message += `💰 *${t('cart.total')}: ${formatPrice(finalTotal)}*\n`;
    } else {
      message += `\n💰 *${t('cart.total')}: ${formatPrice(totalPrice)}*\n`;
    }
    message += `💳 ${paymentMethodLabel(paymentMethod)}`;
    if (notes) message += `\n📝 ${lang === 'es' ? 'Notas' : 'Notes'}: ${notes}`;
    if (paymentMethod === 'sinpe') {
      const receiptLabel = lang === 'es'
        ? (receiptFile ? 'adjunto' : 'pendiente')
        : (receiptFile ? 'attached' : 'pending');
      message += `\n\n✅ ${lang === 'es' ? 'Comprobante' : 'Receipt'} ${receiptLabel}.`;
    }

    const whatsappUrl = buildWhatsAppUrl(tenant.whatsapp_number, message) || `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }, [items, tenant, totalPrice, orderNumber, customerName, customerPhone, customerTable, notes, receiptFile, t, lang, paymentMethod]);

  const handleFinish = () => {
    // For new orders, save active_order to localStorage and navigate to tracking
    const finishedOrderId = orderId;
    const finishedOrderNumber = orderNumber;
    clearCart();
    setStep('cart');
    setPaymentMethod(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerTable('');
    setNotes('');
    setReceiptFile(null);
    setReceiptPreview('');
    setOrderNumber(null);
    setOrderId(null);
    setErrorMsg('');
    setOpenTab(null);
    localStorage.removeItem('open_tab_order');
    onClose();
    // Navigate to order tracking if we have an order ID
    if (finishedOrderId) {
      // Save active order for FAB
      localStorage.setItem('active_order', JSON.stringify({
        orderId: finishedOrderId,
        orderNumber: finishedOrderNumber,
        tenantSlug: localStorage.getItem('last_tenant_slug') || '',
        status: 'pendiente',
      }));
      navigate(`/order-status/${finishedOrderId}`);
    }
  };

  // Para delivery: requiere nombre. Para dine_in/takeout: siempre puede continuar.
  const canProceedToPayment = !requiresCustomerData || customerName.trim().length > 0;

  const handleBack = () => {
    setErrorMsg('');
    if (step === 'order_type') setStep('cart');
    else if (step === 'delivery_address') setStep('order_type');
    else if (step === 'customer_info') setStep(deliveryType === 'delivery' ? 'delivery_address' : 'order_type');
    else if (step === 'upsell') setStep('customer_info');
    else if (step === 'select_payment') { setStep('upsell'); setPaymentMethod(null); }
    else if (step === 'payment') setStep('select_payment');
  };

  // Step titles
  const stepTitles: Record<Step, string> = {
    cart: t('cart.title'),
    order_type: lang === 'es' ? '¿Cómo querés tu pedido?' : 'How would you like your order?',
    delivery_address: lang === 'es' ? 'Dirección de entrega' : 'Delivery address',
    customer_info: t('checkout.customer_info'),
    upsell: lang === 'es' ? 'Sugerencias personalizadas' : 'Personalized suggestions',
    select_payment: lang === 'es' ? '¿Cómo deseas pagar?' : 'How would you like to pay?',
    payment: t('payment.title'),
    confirmation: t('confirm.title'),
  };

  // PAYMENT GATING: dine-in/takeout saltan select_payment y van directo a confirmation
  const _showPaymentUI = shouldShowPaymentUI(deliveryType as OrderChannel);
  const stepOrder: Step[] = deliveryType === 'delivery'
    ? ['order_type', 'delivery_address', 'customer_info', 'upsell', 'select_payment', 'payment', 'confirmation']
    : _showPaymentUI
      ? ['order_type', 'customer_info', 'upsell', 'select_payment', 'payment', 'confirmation']
      : ['order_type', 'customer_info', 'upsell', 'confirmation'];
  const currentStepIdx = stepOrder.indexOf(step);

  // Payment method config — all options
  const allPaymentOptions: { method: PaymentMethod; icon: React.ReactNode; label: string; desc: string; color: string; bg: string }[] = [
    {
      method: 'sinpe',
      icon: <Smartphone size={28} style={{ color: '#6C63FF' }} />,
      label: 'SINPE Móvil',
      desc: lang === 'es' ? 'Pago instantáneo desde tu celular' : 'Instant payment from your phone',
      color: '#6C63FF',
      bg: '#6C63FF15',
    },
    {
      method: 'efectivo',
      icon: <Banknote size={28} style={{ color: '#38A169' }} />,
      label: lang === 'es' ? 'Efectivo' : 'Cash',
      desc: lang === 'es' ? 'Paga al recibir tu pedido' : 'Pay when you receive your order',
      color: '#38A169',
      bg: '#38A16915',
    },
    {
      method: 'tarjeta',
      icon: <CreditCard size={28} style={{ color: '#E53935' }} />,
      label: lang === 'es' ? 'Tarjeta' : 'Card',
      desc: lang === 'es' ? 'Débito o crédito al entregar' : 'Debit or credit on delivery',
      color: '#E53935',
      bg: '#E5393515',
    },
  ];
  // Filter by admin config: delivery y takeout respetan la config; dine-in muestra todos
  const paymentOptions = (deliveryType === 'delivery' || deliveryType === 'takeout') && deliveryConfig
    ? allPaymentOptions.filter(opt => availableDeliveryPaymentMethods.includes(opt.method as any))
    : allPaymentOptions;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed left-0 right-0 z-[150] rounded-t-3xl flex flex-col"
            style={{
              bottom: '64px',
              maxHeight: 'calc(92vh - 64px)',
              backgroundColor: 'var(--bg-surface)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: `${theme.text_color}10` }}>
              <div className="flex items-center gap-3">
                {step !== 'cart' && step !== 'order_type' && step !== 'confirmation' && (
                  <button
                    onClick={handleBack}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-80"
                    style={{ backgroundColor: `${theme.text_color}08` }}
                  >
                    <ArrowLeft size={16} style={{ color: theme.text_color }} />
                  </button>
                )}
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
                >
                  {stepTitles[step]}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {step === 'cart' && items.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs px-3 py-1.5 rounded-full opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: theme.text_color, border: `1px solid ${theme.text_color}20` }}
                  >
                    {lang === 'es' ? 'Vaciar' : 'Clear'}
                  </button>
                )}
                <button
                  onClick={step === 'confirmation' ? handleFinish : onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-80"
                  style={{ backgroundColor: `${theme.text_color}08` }}
                >
                  <X size={16} style={{ color: theme.text_color }} />
                </button>
              </div>
            </div>

            {/* Step indicator */}
            {step !== 'cart' && step !== 'order_type' && (
              <div className="flex items-center gap-1.5 px-5 py-3">
                {stepOrder.map((s, idx) => {
                  const isActive = idx === currentStepIdx;
                  const isDone = idx < currentStepIdx;
                  // Skip 'payment' step indicator if not SINPE
                  if (s === 'payment' && paymentMethod !== 'sinpe' && !isActive) return null;
                  return (
                    <div
                      key={s}
                      className="h-1.5 rounded-full flex-1 transition-all"
                      style={{
                        backgroundColor: isDone || isActive ? theme.primary_color : `${theme.text_color}15`,
                        opacity: isActive ? 1 : isDone ? 0.6 : 0.3,
                      }}
                    />
                  );
                })}
              </div>
            )}

            {/* ─── STEP: CART ─── */}
            {step === 'cart' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                      <ShoppingBag size={48} style={{ color: `${theme.text_color}30` }} />
                      <p className="text-center opacity-40" style={{ color: theme.text_color }}>
                        {t('cart.empty')}
                      </p>
                    </div>
                  ) : (
                    items.map(ci => (
                      <motion.div
                        key={ci.cartItemId}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center gap-3 rounded-2xl p-3"
                        style={{ backgroundColor: `${theme.text_color}04`, border: `1px solid ${theme.text_color}08` }}
                      >
                        {ci.menuItem.image_url ? (
                          <img
                            src={getOptimizedImageUrl(ci.menuItem.image_url, IMAGE_SIZES.cart.width, IMAGE_SIZES.cart.quality, IMAGE_SIZES.cart.height)}
                            alt={ci.menuItem.name}
                            className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          /* V11.0 Placeholder inteligente en el carrito */
                          <div
                            className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center"
                            style={{
                              backgroundColor: `${theme.text_color}06`,
                              border: `1px solid ${theme.text_color}08`,
                            }}
                          >
                            {getCartPlaceholderIcon(ci.menuItem.name)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: theme.text_color }}>
                            {ci.menuItem.name}
                          </p>
                          {/* V22.0: Show selected modifiers */}
                          {ci.selectedModifiers && ci.selectedModifiers.length > 0 && (
                            <div className="mt-0.5 space-y-0.5">
                              {ci.selectedModifiers.map((mod, idx) => (
                                <p key={idx} className="text-xs" style={{ color: `${theme.text_color}70` }}>
                                  <span>+ {mod.option_name}</span>
                                  {((mod as any).price_delta ?? (mod as any).price_adjustment ?? 0) > 0 && (
                                    <span className="ml-1" style={{ color: theme.primary_color }}>+{formatPrice((mod as any).price_delta ?? (mod as any).price_adjustment ?? 0)}</span>
                                  )}
                                </p>
                              ))}
                            </div>
                          )}
                          <p className="text-sm font-bold mt-0.5" style={{ color: theme.primary_color }}>
                            {formatPrice((ci.menuItem.price + (ci.modifiersTotal ?? 0)) * ci.quantity)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(ci.cartItemId, ci.quantity - 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-80"
                            style={{ backgroundColor: `${theme.text_color}08` }}
                          >
                            {ci.quantity === 1 ? (
                              <Trash2 size={13} style={{ color: '#ef4444' }} />
                            ) : (
                              <Minus size={13} style={{ color: theme.text_color }} />
                            )}
                          </button>
                          <span className="text-sm font-bold w-5 text-center" style={{ color: theme.text_color }}>
                            {ci.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(ci.cartItemId, ci.quantity + 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-80"
                            style={{ backgroundColor: theme.primary_color }}
                          >
                            <Plus size={13} style={{ color: 'var(--menu-accent-contrast)' }} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                {items.length > 0 && (
                  <div className="p-5 border-t space-y-3 flex-shrink-0" style={{ borderColor: `${theme.text_color}10` }}>
                    {/* Subtotal */}
                    <div className="flex justify-between items-center">
                      <span className="text-sm" style={{ color: `${theme.text_color}80` }}>
                        Subtotal
                      </span>
                      <span className="text-sm font-semibold" style={{ color: theme.text_color }}>
                        {formatPrice(totalPrice)}
                      </span>
                    </div>
                    {/* Promo aplicada */}
                    {appliedPromo && (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${theme.primary_color}20`, color: theme.primary_color }}>
                            {appliedPromo.type === 'bogo' ? '🎁' : appliedPromo.type === 'free_item' ? '🎁' : '🏷️'} {appliedPromo.name}
                          </span>
                          <button onClick={() => setAppliedPromo(null)} className="text-xs opacity-50 hover:opacity-100">✕</button>
                        </div>
                        {appliedPromo.discountAmount > 0
                          ? <span className="text-sm font-semibold text-green-400">-{formatPrice(appliedPromo.discountAmount)}</span>
                          : <span className="text-xs font-semibold text-green-400">✓ Aplicada</span>
                        }
                      </div>
                    )}
                    {/* Cupón aplicado */}
                    {appliedCoupon && (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold font-mono" style={{ backgroundColor: `${theme.primary_color}20`, color: theme.primary_color }}>🎟️ {appliedCoupon.code}</span>
                          <button onClick={() => setAppliedCoupon(null)} className="text-xs opacity-50 hover:opacity-100">✕</button>
                        </div>
                        <span className="text-sm font-semibold text-green-400">-{formatPrice(appliedCoupon.discountAmount)}</span>
                      </div>
                    )}
                    {/* Campo para ingresar cupón */}
                    {!appliedCoupon && (
                      <div className="space-y-1">
                        <div className="flex gap-2">
                          <input
                            value={couponInput}
                            onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                            onKeyDown={e => e.key === 'Enter' && applyCouponCode()}
                            placeholder={lang === 'es' ? 'Código de cupón' : 'Coupon code'}
                            className="flex-1 px-3 py-2 rounded-xl text-sm bg-transparent outline-none"
                            style={{ border: `1px solid ${theme.text_color}20`, color: theme.text_color }}
                          />
                          <button
                            onClick={applyCouponCode}
                            disabled={couponLoading || !couponInput.trim()}
                            className="px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                            style={{ backgroundColor: theme.primary_color, color: 'var(--menu-accent-contrast)' }}
                          >
                            {couponLoading ? '...' : (lang === 'es' ? 'Aplicar' : 'Apply')}
                          </button>
                        </div>
                        {couponError && <p className="text-xs text-red-400 px-1">{couponError}</p>}
                      </div>
                    )}
                    {/* Tarifa de delivery estimada */}
                    {deliveryType === 'delivery' && deliveryPricing && (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: `${theme.text_color}80` }}>
                            🚴 Envío estimado
                            {deliveryCheckoutData?.distanceKm ? ` (${deliveryCheckoutData.distanceKm.toFixed(1)} km)` : ''}
                          </span>
                          <span className="text-sm font-semibold" style={{ color: deliveryFeeIsPending ? '#F59E0B' : theme.primary_color }}>
                            {deliveryFeeIsPending
                              ? 'Por confirmar'
                              : estimatedDeliveryFee > 0 ? formatPrice(estimatedDeliveryFee) : 'Gratis'}
                          </span>
                        </div>
                        {deliveryPricing.fee_variability_msg && (
                          <p className="text-[11px] px-2 py-1 rounded-lg" style={{ backgroundColor: `${theme.primary_color}12`, color: `${theme.text_color}70` }}>
                            ⚠️ {deliveryPricing.fee_variability_msg}
                          </p>
                        )}
                      </div>
                    )}
                    {/* Descuento total */}
                    {discountAmount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-green-400">{lang === 'es' ? 'Descuento total' : 'Total discount'}</span>
                        <span className="text-sm font-bold text-green-400">-{formatPrice(discountAmount)}</span>
                      </div>
                    )}
                    {/* Total final */}
                    <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                      <span className="text-base font-semibold" style={{ color: theme.text_color }}>
                        {t('cart.total')}
                      </span>
                      <div className="text-right">
                        {discountAmount > 0 && (
                          <div className="text-xs line-through opacity-40" style={{ color: theme.text_color }}>{formatPrice(totalPrice + (deliveryType === 'delivery' ? estimatedDeliveryFee : 0))}</div>
                        )}
                        <span className="text-xl font-bold" style={{ color: theme.primary_color }}>
                          {formatPrice(finalTotal + (deliveryType === 'delivery' ? estimatedDeliveryFee : 0))}
                        </span>
                      </div>
                    </div>
                    {openTab && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2" style={{ backgroundColor: '#F59E0B15', border: '1px solid #F59E0B30' }}>
                        <RefreshCw size={14} className="text-amber-500" />
                        <span className="text-xs font-semibold text-amber-500">
                          Cuenta Abierta — Pedido #{openTab.orderNumber}
                        </span>
                      </div>
                    )}
                    {/* Kitchen closed banner */}
                    {deliveryConfig && !deliveryConfig.orders_enabled && (
                      <div
                        className="flex items-start gap-2 px-3 py-3 rounded-xl text-sm"
                        style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
                      >
                        <span className="text-lg">🔒</span>
                        <div>
                          <p className="font-bold text-red-400 text-xs mb-0.5">No aceptamos pedidos en este momento</p>
                          <p className="text-xs" style={{ color: `${theme.text_color}80` }}>
                            {deliveryConfig.closed_message || 'Por el momento no estamos recibiendo pedidos desde el menú.'}
                          </p>
                          {tenant.whatsapp_number && (
                            <a
                              href={`https://wa.me/${tenant.whatsapp_number.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-green-400"
                            >
                              📱 Contactar por WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    <motion.button
                      onClick={() => {
                        if (deliveryConfig && !deliveryConfig.orders_enabled) return;
                        openTab ? handleProceedToPayment(allMenuItems) : setStep('order_type');
                      }}
                      whileTap={{ scale: 0.97 }}
                      disabled={!!(deliveryConfig && !deliveryConfig.orders_enabled)}
                      className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: openTab ? '#F59E0B' : theme.primary_color,
                        boxShadow: openTab ? '0 4px 16px rgba(245,158,11,0.3)' : `0 4px 16px ${theme.primary_color}40`,
                        color: openTab ? '#000' : 'var(--menu-accent-contrast)',
                      }}
                    >
                      <ShoppingBag size={20} />
                      {openTab
                        ? (lang === 'es' ? 'Agregar a mi pedido' : 'Add to my order')
                        : t('cart.checkout')
                      }
                    </motion.button>
                  </div>
                )}
              </>
            )}

            {/* ─── STEP: ORDER TYPE SELECTOR ─── */}
            {step === 'order_type' && (
              <OrderTypeSelector
                theme={theme}
                lang={lang}
                deliveryEnabled={true}
                onSelect={(type) => {
                  const dt = type === 'takeaway' ? 'takeout' : type as DeliveryType;
                  setDeliveryType(dt);
                  if (dt === 'delivery') {
                    setStep('delivery_address');
                  } else {
                    setStep('customer_info');
                  }
                }}
              />
            )}

            {/* ─── STEP: DELIVERY ADDRESS (Fase 1) ─── */}
            {step === 'delivery_address' && (
              <DeliveryCheckout
                theme={theme}
                tenant={tenant}
                lang={lang}
                prefilledPhone={customerPhone}
                onComplete={(data) => {
                  setDeliveryCheckoutData(data);
                  // Pre-fill delivery phone from checkout data
                  setDeliveryPhone(data.customerPhone);
                  setStep('customer_info');
                }}
                onCancel={() => {
                  setDeliveryType('dine_in');
                  setStep('order_type');
                }}
              />
            )}

            {/* ─── STEP: CUSTOMER INFO + DELIVERY TYPE ─── */}
            {step === 'customer_info' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                  {/* ── Scheduled Date + Time (Takeout or Delivery) ── — hidden since only dine_in is active */}
                  {(deliveryType === 'takeout' || deliveryType === 'delivery') && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold mb-2 block" style={{ color: `${theme.text_color}80` }}>
                          {lang === 'es' ? '¿Cuándo?' : 'When?'}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['today', 'tomorrow'] as const).map(d => (
                            <button
                              key={d}
                              onClick={() => setScheduledDate(d)}
                              className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                              style={{
                                backgroundColor: scheduledDate === d ? `${theme.primary_color}20` : `${theme.text_color}06`,
                                border: `2px solid ${scheduledDate === d ? theme.primary_color : `${theme.text_color}10`}`,
                                color: scheduledDate === d ? theme.primary_color : `${theme.text_color}60`,
                              }}
                            >
                              {d === 'today' ? (lang === 'es' ? 'Hoy' : 'Today') : (lang === 'es' ? 'Mañana' : 'Tomorrow')}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* FASE 1 V4.0: ASAP logic — solo mostrar hora si es "Mañana" */}
                      {scheduledDate === 'today' ? (
                        <div
                          className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                          style={{
                            backgroundColor: `${theme.primary_color}12`,
                            border: `1.5px solid ${theme.primary_color}30`,
                          }}
                        >
          <span className="text-base">🛵</span>
          <p className="text-sm font-semibold" style={{ color: theme.primary_color }}>
            {lang === 'es' ? 'Entrega lo más pronto posible (Aprox. 30–45 min)' : 'Delivery as soon as possible (Approx. 30–45 min)'}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                            <Clock size={11} className="inline mr-1" />
                            {lang === 'es' ? 'Hora de entrega' : 'Delivery time'}
                          </label>
                          <input
                            type="time"
                            value={scheduledTime}
                            onChange={e => setScheduledTime(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                            style={{
                              backgroundColor: `${theme.text_color}06`,
                              border: `1.5px solid ${scheduledTime ? theme.primary_color : `${theme.text_color}15`}`,
                              color: theme.text_color,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Delivery Address + Phone (Delivery only) ── */}
                  {deliveryType === 'delivery' && (
                    <div className="space-y-3">
                      {/* Selector: ¿A dónde enviamos? */}
                      <div>
                        <label className="text-xs font-semibold mb-2 block" style={{ color: `${theme.text_color}80` }}>
                          <MapPin size={11} className="inline mr-1" />
                          {lang === 'es' ? '¿A dónde enviamos?' : 'Where do we deliver?'}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => { setLocationMode('gps'); handleRequestGPS(); }}
                            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                            style={{
                              backgroundColor: locationMode === 'gps' ? `${theme.primary_color}20` : `${theme.text_color}06`,
                              border: `1.5px solid ${locationMode === 'gps' ? theme.primary_color : `${theme.text_color}15`}`,
                              color: locationMode === 'gps' ? theme.primary_color : `${theme.text_color}70`,
                            }}
                          >
                            {gpsLoading ? <Loader2 size={13} className="animate-spin" /> : <span>📍</span>}
                            <span>{lang === 'es' ? 'Mi ubicación actual' : 'My current location'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => { setLocationMode('manual'); setGpsCoords(null); setGpsError(''); }}
                            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                            style={{
                              backgroundColor: locationMode === 'manual' ? `${theme.primary_color}20` : `${theme.text_color}06`,
                              border: `1.5px solid ${locationMode === 'manual' ? theme.primary_color : `${theme.text_color}15`}`,
                              color: locationMode === 'manual' ? theme.primary_color : `${theme.text_color}70`,
                            }}
                          >
                            <span>📝</span>
                            <span>{lang === 'es' ? 'Otra dirección' : 'Other address'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Error de GPS */}
                      {gpsError && (
                        <div
                          className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-medium"
                          style={{ backgroundColor: '#EF444415', border: '1.5px solid #EF444440', color: '#EF4444' }}
                        >
                          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                          <span>{gpsError}</span>
                        </div>
                      )}

                      {/* Confirmación GPS */}
                      {locationMode === 'gps' && gpsCoords && !gpsError && (
                        <div
                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold"
                          style={{ backgroundColor: `${theme.primary_color}15`, border: `1.5px solid ${theme.primary_color}40`, color: theme.primary_color }}
                        >
                          <MapPin size={13} className="flex-shrink-0" />
                          <span>{lang === 'es' ? `📍 Ubicación capturada (${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lon.toFixed(4)})` : `📍 Location captured (${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lon.toFixed(4)})`}</span>
                        </div>
                      )}

                      {/* Dirección manual (solo si modo manual) */}
                      {locationMode === 'manual' && (
                        <div>
                          <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                            {lang === 'es' ? 'Dirección' : 'Address'}
                          </label>
                          <textarea
                            value={deliveryAddress}
                            onChange={e => setDeliveryAddress(e.target.value)}
                            placeholder={lang === 'es' ? 'Ej: 100m norte del parque, casa azul...' : 'E.g.: 100m north of the park, blue house...'}
                            rows={2}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all"
                            style={{
                              backgroundColor: `${theme.text_color}06`,
                              border: `1.5px solid ${deliveryAddress ? theme.primary_color : `${theme.text_color}15`}`,
                              color: theme.text_color,
                            }}
                          />
                        </div>
                      )}

                      {/* Señas adicionales (siempre visible en modo delivery) */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                          {lang === 'es' ? 'Señas adicionales (color de casa, número, referencia)' : 'Additional notes (house color, number, landmark)'}
                        </label>
                        <input
                          type="text"
                          value={deliveryNotes}
                          onChange={e => setDeliveryNotes(e.target.value)}
                          placeholder={lang === 'es' ? 'Ej: Casa amarilla, portón negro...' : 'E.g.: Yellow house, black gate...'}
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                          style={{
                            backgroundColor: `${theme.text_color}06`,
                            border: `1.5px solid ${deliveryNotes ? theme.primary_color : `${theme.text_color}15`}`,
                            color: theme.text_color,
                          }}
                        />
                      </div>

                      {/* WhatsApp */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                          {lang === 'es' ? 'WhatsApp para coordinar entrega' : 'WhatsApp for delivery coordination'}
                        </label>
                        <input
                          type="tel"
                          value={deliveryPhone}
                          onChange={e => setDeliveryPhone(e.target.value)}
                          placeholder="8888-8888"
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                          style={{
                            backgroundColor: `${theme.text_color}06`,
                            border: `1.5px solid ${deliveryPhone ? theme.primary_color : `${theme.text_color}15`}`,
                            color: theme.text_color,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── Campos para dine_in / takeout: solo mesa + notas ── */}
                  {!requiresCustomerData ? (
                    <div className="space-y-5">

                      {/* Usuario logueado: info no editable */}
                      {customerProfile && (
                        <div
                          className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                          style={{ backgroundColor: `${theme.primary_color}12`, border: `1.5px solid ${theme.primary_color}25` }}
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                            style={{ backgroundColor: theme.primary_color, color: 'var(--menu-accent-contrast)' }}
                          >
                            {(customerProfile.name || '?')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: theme.text_color }}>
                              {customerProfile.name || (lang === 'es' ? 'Cliente' : 'Customer')}
                            </p>
                            {customerProfile.phone && (
                              <p className="text-xs truncate" style={{ color: `${theme.text_color}60` }}>
                                {customerProfile.phone}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${theme.primary_color}20`, color: theme.primary_color }}>
                            {lang === 'es' ? 'Sesión activa' : 'Logged in'}
                          </span>
                        </div>
                      )}

                      {/* Selección de mesa — solo dine_in */}
                      {deliveryType === 'dine_in' && (
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{ color: `${theme.text_color}55` }}>
                            {lang === 'es' ? '¿Dónde estás sentado?' : 'Where are you seated?'}
                          </label>
                          {availableTables.length > 0 ? (() => {
                            const categoryOrder = ['mesa_grande', 'mesa_pequeña', 'taburete', null];
                            const categoryLabel: Record<string, string> = {
                              mesa_grande: lang === 'es' ? 'Mesa grande' : 'Large table',
                              'mesa_pequeña': lang === 'es' ? 'Mesa pequeña' : 'Small table',
                              taburete: lang === 'es' ? 'Taburete' : 'Bar stool',
                            };
                            // Prefijo legible por categoría
                            const categoryPrefix: Record<string, string> = {
                              mesa_grande: lang === 'es' ? 'Mesa grande' : 'Large table',
                              'mesa_pequeña': lang === 'es' ? 'Mesa pequeña' : 'Small table',
                              taburete: lang === 'es' ? 'Taburete' : 'Bar stool',
                            };
                            const groups = categoryOrder
                              .map(cat => ({
                                cat,
                                tables: availableTables.filter(t => (t.category ?? null) === cat),
                              }))
                              .filter(g => g.tables.length > 0);
                            const hasMultipleGroups = groups.length > 1;
                            return (
                              <div className="space-y-2">
                                {groups.map(({ cat, tables }) => {
                                  const groupKey = cat ?? 'other';
                                  const groupName = cat ? (categoryLabel[cat] ?? cat) : (lang === 'es' ? 'Otros espacios' : 'Other spaces');
                                  const prefix = cat ? (categoryPrefix[cat] ?? '') : '';
                                  // Si solo hay un grupo, mostrarlo directo sin acordeón
                                  const isOpen = !hasMultipleGroups || openTableGroup === groupKey;
                                  // Detectar si alguna mesa de este grupo está seleccionada
                                  const selectedInGroup = tables.find(t => t.table_number === customerTable);
                                  return (
                                    <div key={groupKey} className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${theme.text_color}12` }}>
                                      {/* Header del acordeón */}
                                      {hasMultipleGroups && (
                                        <button
                                          type="button"
                                          onClick={() => setOpenTableGroup(isOpen ? null : groupKey)}
                                          className="w-full flex items-center justify-between px-4 py-3 transition-all"
                                          style={{
                                            backgroundColor: selectedInGroup
                                              ? `${theme.primary_color}18`
                                              : `${theme.text_color}05`,
                                          }}
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold" style={{ color: theme.text_color }}>
                                              {groupName}
                                            </span>
                                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${theme.text_color}10`, color: `${theme.text_color}70` }}>
                                              {tables.length}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {selectedInGroup && (
                                              <span className="text-xs font-bold" style={{ color: theme.primary_color }}>
                                                {prefix} {selectedInGroup.table_number}
                                              </span>
                                            )}
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                              style={{ color: `${theme.text_color}50`, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                              <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                          </div>
                                        </button>
                                      )}
                                      {/* Grid de mesas */}
                                      {isOpen && (
                                        <div className="p-3 grid grid-cols-3 gap-2" style={{ backgroundColor: `${theme.text_color}03` }}>
                                          {tables.map(tbl => {
                                            const isSelected = customerTable === tbl.table_number;
                                            const displayLabel = `${prefix} ${tbl.table_number}`.trim();
                                            return (
                                              <button
                                                key={tbl.id}
                                                type="button"
                                                disabled={tbl.is_occupied}
                                                onClick={() => setCustomerTable(isSelected ? '' : tbl.table_number)}
                                                className="relative px-2 py-3 rounded-xl text-xs font-semibold transition-all flex flex-col items-center justify-center gap-0.5 text-center leading-tight"
                                                style={{
                                                  backgroundColor: tbl.is_occupied
                                                    ? `${theme.text_color}04`
                                                    : isSelected
                                                      ? theme.primary_color
                                                      : `${theme.text_color}08`,
                                                  border: `1.5px solid ${
                                                    tbl.is_occupied
                                                      ? `${theme.text_color}08`
                                                      : isSelected
                                                        ? theme.primary_color
                                                        : `${theme.text_color}10`
                                                  }`,
                                                  color: tbl.is_occupied
                                                    ? `${theme.text_color}25`
                                                    : isSelected
                                                      ? 'var(--menu-accent-contrast)'
                                                      : theme.text_color,
                                                  cursor: tbl.is_occupied ? 'not-allowed' : 'pointer',
                                                  boxShadow: isSelected ? `0 3px 10px ${theme.primary_color}40` : 'none',
                                                }}
                                              >
                                                <span className="leading-tight">{displayLabel}</span>
                                                {tbl.is_occupied && (
                                                  <span className="text-[9px]" style={{ color: `${theme.text_color}30` }}>
                                                    {lang === 'es' ? 'ocupada' : 'busy'}
                                                  </span>
                                                )}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })() : (
                            <input
                              type="text"
                              value={customerTable}
                              onChange={e => setCustomerTable(e.target.value)}
                              placeholder={lang === 'es' ? 'Ej: Mesa 5, Barra' : 'E.g.: Table 5, Bar'}
                              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                              style={{
                                backgroundColor: `${theme.text_color}06`,
                                border: `1.5px solid ${theme.text_color}15`,
                                color: theme.text_color,
                              }}
                            />
                          )}
                        </div>
                      )}

                      {/* Notas */}
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: `${theme.text_color}55` }}>
                          {lang === 'es' ? 'Notas del pedido' : 'Order notes'}
                        </label>
                        <textarea
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          placeholder={lang === 'es' ? 'Alergias, preferencias, instrucciones especiales...' : 'Allergies, preferences, special instructions...'}
                          rows={3}
                          className="w-full px-4 py-3 rounded-2xl text-sm outline-none resize-none transition-all"
                          style={{
                            backgroundColor: `${theme.text_color}06`,
                            border: `1.5px solid ${notes ? theme.primary_color : `${theme.text_color}12`}`,
                            color: theme.text_color,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    /* ── Campos para delivery: nombre + teléfono + notas ── */
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                          {t('checkout.name')}
                          <span style={{ color: theme.primary_color }}> *</span>
                        </label>
                        {customerProfile ? (
                          <div
                            className="w-full px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                            style={{ backgroundColor: `${theme.text_color}06`, border: `1.5px solid ${theme.text_color}10`, color: theme.text_color }}
                          >
                            <span className="flex-1">{customerProfile.name}</span>
                            <span className="text-[10px]" style={{ color: `${theme.text_color}40` }}>{lang === 'es' ? 'del perfil' : 'from profile'}</span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            placeholder={lang === 'es' ? 'Tu nombre completo' : 'Your full name'}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                            style={{
                              backgroundColor: `${theme.text_color}06`,
                              border: `1.5px solid ${customerName ? theme.primary_color : `${theme.text_color}15`}`,
                              color: theme.text_color,
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                          {t('checkout.phone')}
                          <span style={{ color: theme.primary_color }}> *</span>
                        </label>
                        {customerProfile?.phone ? (
                          <div
                            className="w-full px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                            style={{ backgroundColor: `${theme.text_color}06`, border: `1.5px solid ${theme.text_color}10`, color: theme.text_color }}
                          >
                            <span className="flex-1">{customerProfile.phone}</span>
                            <span className="text-[10px]" style={{ color: `${theme.text_color}40` }}>{lang === 'es' ? 'del perfil' : 'from profile'}</span>
                          </div>
                        ) : (
                          <input
                            type="tel"
                            value={customerPhone}
                            onChange={e => setCustomerPhone(e.target.value)}
                            placeholder="8888-8888"
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                            style={{
                              backgroundColor: `${theme.text_color}06`,
                              border: `1.5px solid ${customerPhone ? theme.primary_color : `${theme.text_color}15`}`,
                              color: theme.text_color,
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                          {t('checkout.notes')}
                        </label>
                        <textarea
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          placeholder={lang === 'es' ? 'Alergias, preferencias, instrucciones especiales...' : 'Allergies, preferences, special instructions...'}
                          rows={2}
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all"
                          style={{
                            backgroundColor: `${theme.text_color}06`,
                            border: `1.5px solid ${theme.text_color}15`,
                            color: theme.text_color,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                  <motion.button
                    onClick={() => _showPaymentUI ? handleProceedToPayment(allMenuItems) : handleProceedDirect(allMenuItems)}
                    disabled={!canProceedToPayment || uploading}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: theme.primary_color,
                      boxShadow: canProceedToPayment ? `0 4px 16px ${theme.primary_color}40` : 'none',
                      color: 'var(--menu-accent-contrast)',
                    }}
                  >
                    {uploading ? (
                      <><Loader2 size={20} className="animate-spin" />{lang === 'es' ? 'Enviando...' : 'Sending...'}</>
                    ) : _showPaymentUI
                      ? (lang === 'es' ? 'Continuar al pago' : 'Continue to payment')
                      : (lang === 'es' ? 'Enviar pedido' : 'Send order')
                    }
                  </motion.button>
                </div>
              </>
            )}

            {/* ─── STEP: UPSELL ─── */}
            {step === 'upsell' && (
              <>
                <div className="flex-1 overflow-y-auto">
                  {/* Header */}
                  <div className="px-5 pt-3 pb-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <span style={{ color: theme.primary_color, fontSize: 20 }}>✨</span>
                      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: theme.primary_color }}>
                        {lang === 'es' ? 'Sugerencias personalizadas' : 'Personalized suggestions'}
                      </p>
                    </div>
                    <h2 className="text-xl font-bold" style={{ color: theme.text_color }}>
                      {lang === 'es' ? 'Completa tu experiencia' : 'Complete your experience'}
                    </h2>
                  </div>

                  {/* Loading state */}
                  {aiLoading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div
                        className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: `${theme.primary_color}40`, borderTopColor: theme.primary_color }}
                      />
                      <p className="text-sm opacity-50" style={{ color: theme.text_color }}>
                        {lang === 'es' ? 'Buscando sugerencias...' : 'Finding suggestions...'}
                      </p>
                    </div>
                  )}

                  {/* Suggestions list */}
                  {!aiLoading && aiSuggestedItems.length > 0 && (
                    <div className="px-4 space-y-3 pb-4">
                      {aiSuggestedItems.map(item => {
                        const isAdded = upsellAddedIds.has(item.id);
                        const imgUrl = item.image_url
                          ? (item.image_url.startsWith('http') ? item.image_url : `https://yrpqlzjlkxmhfnqxhhmm.supabase.co/storage/v1/object/public/menu-images/${item.image_url}`)
                          : null;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-2xl p-3"
                            style={{
                              backgroundColor: `${theme.text_color}06`,
                              border: `1px solid ${isAdded ? theme.primary_color : `${theme.text_color}10`}`,
                            }}
                          >
                            {/* Image */}
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={item.name}
                                className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                              />
                            ) : (
                              <div
                                className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center"
                                style={{ backgroundColor: `${theme.primary_color}15` }}
                              >
                                <span style={{ color: theme.primary_color, fontSize: 24 }}>🍽️</span>
                              </div>
                            )}
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              {item.trigger_item_name && (
                                <p className="text-xs mb-0.5" style={{ color: `${theme.text_color}50` }}>
                                  {lang === 'es' ? 'Para tu' : 'For your'}{' '}
                                  <span className="font-semibold" style={{ color: theme.primary_color }}>{item.trigger_item_name}</span>
                                </p>
                              )}
                              <p className="font-bold text-sm leading-tight" style={{ color: theme.text_color }}>{item.name}</p>
                              {item.pitch && (
                                <p className="text-xs opacity-60 mt-0.5 leading-snug" style={{ color: theme.text_color }}>&#34;{item.pitch}&#34;</p>
                              )}
                              <p className="text-sm font-bold mt-1" style={{ color: theme.primary_color }}>+{formatPrice(item.price)}</p>
                            </div>
                            {/* Add button */}
                            <motion.button
                              onClick={() => {
                                if (isAdded) return;
                                const menuItem: MenuItem = {
                                  id: item.id,
                                  tenant_id: '',
                                  category_id: '',
                                  name: item.name,
                                  description: item.description,
                                  price: item.price,
                                  image_url: item.image_url,
                                  is_available: true,
                                  is_featured: false,
                                  badge: null,
                                  upsell_item_id: null,
                                  upsell_text: null,
                                  sort_order: 0,
                                  created_at: '',
                                  updated_at: '',
                                };
                                addItemAdvanced(menuItem, {
                                  isUpsell: true,
                                  upsellSource: 'ai',
                                  triggerItemId: item.trigger_item_id || null,
                                  upsellAcceptedAt: new Date().toISOString(),
                                });
                                setUpsellAddedIds(prev => new Set(Array.from(prev).concat(item.id)));
                              }}
                              whileTap={{ scale: 0.88 }}
                              disabled={isAdded}
                              className="flex items-center gap-1 px-3 py-2 rounded-full text-xs font-bold flex-shrink-0 transition-all"
                              style={{
                                backgroundColor: isAdded ? theme.primary_color : `${theme.primary_color}12`,
                                color: isAdded ? 'var(--menu-accent-contrast)' : theme.primary_color,
                              }}
                            >
                              {isAdded ? (
                                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1">
                                  <Check size={14} />
                                  {lang === 'es' ? 'Agregado' : 'Added'}
                                </motion.span>
                              ) : (
                                <><Plus size={14} />{lang === 'es' ? 'Agregar' : 'Add'}</>
                              )}
                            </motion.button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Empty state */}
                  {!aiLoading && aiSuggestedItems.length === 0 && (
                    <div className="py-8 text-center px-5">
                      <p className="text-sm opacity-40" style={{ color: theme.text_color }}>
                        {lang === 'es' ? 'Sin sugerencias adicionales' : 'No additional suggestions'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Sticky footer */}
                <div className="p-5 border-t flex-shrink-0" style={{ borderColor: `${theme.text_color}10` }}>
                  {upsellAddedIds.size > 0 && (
                    <p className="text-xs text-center mb-2 font-semibold" style={{ color: theme.primary_color }}>
                      {upsellAddedIds.size} {lang === 'es'
                        ? `item${upsellAddedIds.size > 1 ? 's' : ''} agregado${upsellAddedIds.size > 1 ? 's' : ''}`
                        : `item${upsellAddedIds.size > 1 ? 's' : ''} added`}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setUpsellAddedIds(new Set()); handleUpsellContinue(); }}
                      className="flex-1 py-3.5 rounded-full text-sm font-semibold transition-all active:scale-[0.98]"
                      style={{ border: `1.5px solid ${theme.text_color}20`, color: `${theme.text_color}70` }}
                    >
                      {lang === 'es' ? 'No, gracias' : 'No, thanks'}
                    </button>
                    <motion.button
                      onClick={() => { setUpsellAddedIds(new Set()); handleUpsellContinue(); }}
                      whileTap={{ scale: 0.95 }}
                      className="flex-[1.5] py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                      style={{
                        backgroundColor: upsellAddedIds.size > 0 ? theme.primary_color : `${theme.primary_color}15`,
                        color: upsellAddedIds.size > 0 ? 'var(--menu-accent-contrast)' : theme.primary_color,
                        boxShadow: upsellAddedIds.size > 0 ? `0 4px 16px ${theme.primary_color}35` : 'none',
                      }}
                    >
                      {lang === 'es' ? 'Continuar al pago' : 'Continue to payment'}
                      <ChevronRight size={16} />
                    </motion.button>
                  </div>
                </div>
              </>
            )}

            {/* ─── STEP: SELECT PAYMENT METHOD ─── */}
            {step === 'select_payment' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Order total summary */}
                  <div
                    className="rounded-2xl p-4 space-y-2"
                    style={{ backgroundColor: `${theme.primary_color}08`, border: `1px solid ${theme.primary_color}15` }}
                  >
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm" style={{ color: `${theme.text_color}70` }}>
                        <span>Subtotal</span>
                        <span>{formatPrice(totalPrice)}</span>
                      </div>
                    )}
                    {appliedPromo && (
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1">
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${theme.primary_color}20`, color: theme.primary_color }}>
                            🎁 {appliedPromo.name}
                          </span>
                        </span>
                        <span className="font-semibold text-green-400">
                          {appliedPromo.discountAmount > 0 ? `-${formatPrice(appliedPromo.discountAmount)}` : '✓ Aplicada'}
                        </span>
                      </div>
                    )}
                    {appliedCoupon && (
                      <div className="flex justify-between text-sm">
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#818CF8' }}>
                          🎟️ {appliedCoupon.code}
                        </span>
                        <span className="font-semibold text-green-400">-{formatPrice(appliedCoupon.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1" style={{ borderTop: discountAmount > 0 ? `1px solid ${theme.primary_color}20` : 'none', paddingTop: discountAmount > 0 ? '8px' : '0' }}>
                      <span className="text-sm font-semibold" style={{ color: theme.text_color }}>
                        {t('cart.total')}
                      </span>
                      <div className="flex items-center gap-2">
                        {discountAmount > 0 && (
                          <span className="text-sm line-through" style={{ color: `${theme.text_color}50` }}>{formatPrice(totalPrice + (deliveryType === 'delivery' ? estimatedDeliveryFee : 0))}</span>
                        )}
                        <span className="text-2xl font-bold" style={{ color: theme.primary_color }}>
                          {formatPrice(finalTotal + (deliveryType === 'delivery' ? estimatedDeliveryFee : 0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Nota de pago diferido: solo para dine-in */}
                  {deliveryType === 'dine_in' && (
                    <div
                      className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold"
                      style={{ backgroundColor: `${theme.primary_color}12`, border: `1px solid ${theme.primary_color}25`, color: theme.text_color }}
                    >

                      <span style={{ opacity: 0.85 }}>
                        {lang === 'es'
                          ? 'Nota: El pago se realiza al finalizar tu comida.'
                          : 'Note: Payment is made at the end of your meal.'}
                      </span>
                    </div>
                  )}

                  {/* Bloqueo: ningún método activo para delivery */}
                  {noPaymentMethodsAvailable ? (
                    <div
                      className="flex items-start gap-3 px-4 py-4 rounded-2xl"
                      style={{ backgroundColor: '#EF444415', border: '1px solid #EF444440' }}
                    >
                      <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold" style={{ color: '#EF4444' }}>
                          {lang === 'es' ? 'Pagos no disponibles' : 'Payments unavailable'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: theme.text_color, opacity: 0.7 }}>
                          {lang === 'es'
                            ? 'El restaurante no tiene métodos de pago activos para delivery. Contáctanos para más información.'
                            : 'The restaurant has no active payment methods for delivery. Contact us for more information.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-center opacity-60" style={{ color: theme.text_color }}>
                      {lang === 'es' ? 'Selecciona tu método de pago' : 'Select your payment method'}
                    </p>
                  )}

                  {/* BUG 1 FIX: Payment method buttons with visual selection state */}
                  <div className="space-y-3">
                    {paymentOptions.map(opt => {
                      const isSelected = paymentMethod === opt.method;
                      return (
                        <motion.button
                          key={opt.method}
                          onClick={() => handleSelectPaymentMethod(opt.method)}
                          whileTap={{ scale: 0.97 }}
                          disabled={uploading}
                          className="w-full p-5 rounded-2xl flex items-center gap-4 transition-all"
                          style={{
                            backgroundColor: isSelected ? `${opt.color}18` : `${theme.primary_color}06`,
                            border: `2px solid ${isSelected ? opt.color : `${theme.primary_color}20`}`,
                            boxShadow: isSelected ? `0 0 0 1px ${opt.color}30` : 'none',
                          }}
                        >
                          <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: opt.bg }}
                          >
                            {opt.icon}
                          </div>
                          <div className="text-left flex-1">
                            <p className="text-base font-bold" style={{ color: isSelected ? opt.color : theme.text_color }}>
                              {opt.label}
                            </p>
                            <p className="text-xs opacity-60 mt-0.5" style={{ color: theme.text_color }}>
                              {opt.desc}
                            </p>
                          </div>
                          {/* Checkmark when selected */}
                          {isSelected && (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: opt.color }}
                            >
                              <Check size={14} className="text-foreground" />
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Nota informativa SINPE: el pedido queda en espera hasta verificación */}
                  {paymentMethod === 'sinpe' && (
                    <div
                      className="flex items-start gap-2 px-4 py-3 rounded-2xl text-xs"
                      style={{ backgroundColor: '#8B5CF615', border: '1px solid #8B5CF640', color: theme.text_color }}
                    >
                      <span className="text-base flex-shrink-0">⏳</span>
                      <span style={{ opacity: 0.85 }}>
                        {lang === 'es'
                          ? 'Tu pedido quedará en espera hasta que el restaurante verifique tu pago SINPE. Podrás subir el comprobante desde el estado del pedido.'
                          : 'Your order will be on hold until the restaurant verifies your SINPE payment. You can upload the receipt from the order status page.'}
                      </span>
                    </div>
                  )}

                  {/* Error message */}
                  {errorMsg && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{errorMsg}</p>
                    </div>
                  )}
                </div>

                {/* Confirm button: solo si hay método seleccionado Y hay métodos activos */}
                {paymentMethod && !noPaymentMethodsAvailable && (
                  <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                    <motion.button
                      onClick={handleSubmitOrder}
                      disabled={uploading}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      style={{
                        backgroundColor: theme.primary_color,
                        color: 'var(--menu-accent-contrast)',
                        boxShadow: `0 4px 16px ${theme.primary_color}40`,
                      }}
                    >
                      {uploading ? (
                        <>
                          <Loader2 size={20} className="animate-spin" />
                          {t('payment.processing')}
                        </>
                      ) : (
                        <>
                        <ShoppingBag size={20} />
                        {lang === 'es' ? 'Confirmar Pedido' : 'Confirm Order'}
                        </>
                      )}
                    </motion.button>
                  </div>
                )}
              </>
            )}

            {/* ─── STEP: PAYMENT (SINPE details) ─── */}
            {step === 'payment' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Order summary */}
                  <div className="rounded-2xl p-4 space-y-1" style={{ backgroundColor: `${theme.primary_color}06`, border: `1px solid ${theme.primary_color}12` }}>
                    {items.map(ci => (
                      <div key={ci.menuItem.id} className="flex justify-between text-sm py-1" style={{ color: theme.text_color }}>
                        <span className="opacity-70">{ci.quantity}x {ci.menuItem.name}</span>
                        <span className="font-semibold">{formatPrice(ci.menuItem.price * ci.quantity)}</span>
                      </div>
                    ))}
                    {discountAmount > 0 && (
                      <>
                        <div className="flex justify-between text-sm pt-2 mt-2 border-t" style={{ borderColor: `${theme.text_color}10`, color: `${theme.text_color}70` }}>
                          <span>Subtotal</span>
                          <span>{formatPrice(totalPrice)}</span>
                        </div>
                        {appliedPromo && (
                          <div className="flex justify-between text-sm">
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${theme.primary_color}20`, color: theme.primary_color }}>🎁 {appliedPromo.name}</span>
                            <span className="font-semibold text-green-400">{appliedPromo.discountAmount > 0 ? `-${formatPrice(appliedPromo.discountAmount)}` : '✓'}</span>
                          </div>
                        )}
                        {appliedCoupon && (
                          <div className="flex justify-between text-sm">
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#818CF8' }}>🎟️ {appliedCoupon.code}</span>
                            <span className="font-semibold text-green-400">-{formatPrice(appliedCoupon.discountAmount)}</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex justify-between pt-3 mt-2 border-t text-lg font-bold" style={{ borderColor: `${theme.text_color}10`, color: theme.primary_color }}>
                      <span>{t('cart.total')}</span>
                      <div className="flex items-center gap-2">
                        {discountAmount > 0 && (
                          <span className="text-sm line-through font-normal" style={{ color: `${theme.text_color}50` }}>{formatPrice(totalPrice)}</span>
                        )}
                        <span>{formatPrice(finalTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {/* SINPE Info */}
                  {tenant.sinpe_number && (
                    <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: `${theme.text_color}04`, border: `1px solid ${theme.text_color}10` }}>
                      <h3 className="text-sm font-bold" style={{ color: theme.text_color }}>
                        💳 {t('payment.send_to')}
                      </h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-2xl font-bold tracking-wide" style={{ color: theme.primary_color }}>
                            {tenant.sinpe_number}
                          </p>
                          {tenant.sinpe_owner && (
                            <p className="text-xs opacity-60 mt-1" style={{ color: theme.text_color }}>
                              {t('payment.owner')} {tenant.sinpe_owner}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={handleCopySinpe}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                          style={{
                            backgroundColor: sinpeCopied ? '#38A16920' : `${theme.primary_color}12`,
                            color: sinpeCopied ? '#38A169' : theme.primary_color,
                          }}
                        >
                          {sinpeCopied ? <Check size={14} /> : <Copy size={14} />}
                          {sinpeCopied ? t('payment.copied') : t('payment.copy')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Receipt upload */}
                  <div className="rounded-2xl p-4" style={{ backgroundColor: `${theme.text_color}04`, border: `1px solid ${theme.text_color}10` }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: theme.text_color }}>
                      📸 {t('payment.receipt')}
                    </h3>
                    <p className="text-xs opacity-60 mb-3" style={{ color: theme.text_color }}>
                      {t('payment.receipt_desc')}
                    </p>

                    {receiptPreview ? (
                      <div className="relative">
                        <img src={receiptPreview} alt="Comprobante" className="w-full h-40 object-cover rounded-xl" />
                        <button
                          onClick={() => { setReceiptFile(null); setReceiptPreview(''); }}
                          className="absolute top-2 right-2 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center"
                        >
                          <X size={14} className="text-foreground" />
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {/* Botón cámara */}
                        <button
                          onClick={() => receiptCameraInputRef.current?.click()}
                          className="py-5 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all hover:opacity-80"
                          style={{ borderColor: `${theme.primary_color}30`, color: theme.primary_color }}
                        >
                          <Camera size={22} />
                          <span className="text-xs font-semibold">{lang === 'es' ? 'Tomar foto' : 'Take photo'}</span>
                        </button>
                        {/* Botón galería */}
                        <button
                          onClick={() => receiptInputRef.current?.click()}
                          className="py-5 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all hover:opacity-80"
                          style={{ borderColor: `${theme.primary_color}30`, color: theme.primary_color }}
                        >
                          <span className="text-2xl">🖼️</span>
                          <span className="text-xs font-semibold">{lang === 'es' ? 'Desde galería' : 'From gallery'}</span>
                        </button>
                      </div>
                    )}
                    {/* Input galería (sin capture) */}
                    <input
                      ref={receiptInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleReceiptSelect}
                      className="hidden"
                    />
                    {/* Input cámara (con capture) */}
                    <input
                      ref={receiptCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleReceiptSelect}
                      className="hidden"
                    />
                  </div>

                  {/* Error message */}
                  {errorMsg && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{errorMsg}</p>
                    </div>
                  )}
                </div>

                <div className="p-5 border-t space-y-3" style={{ borderColor: `${theme.text_color}10` }}>
                  <motion.button
                    onClick={handleSubmitOrder}
                    disabled={uploading}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{
                      backgroundColor: receiptFile ? '#25D366' : theme.primary_color,
                      color: '#fff',
                      boxShadow: receiptFile ? '0 4px 16px rgba(37, 211, 102, 0.3)' : `0 4px 16px ${theme.primary_color}40`,
                    }}
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        {t('payment.processing')}
                      </>
                    ) : receiptFile ? (
                      <>
                        <Check size={20} />
                        {lang === 'es' ? 'Confirmar con comprobante' : 'Confirm with receipt'}
                      </>
                    ) : (
                      <>
                        <ShoppingBag size={20} />
                        {lang === 'es' ? 'Ya hice el SINPE → Confirmar' : 'SINPE sent → Confirm'}
                      </>
                    )}
                  </motion.button>
                  {!receiptFile && (
                    <p className="text-center text-xs opacity-50" style={{ color: theme.text_color }}>
                      {lang === 'es'
                        ? 'Puedes subir el comprobante ahora o desde \"Ver estado de mi pedido\" después.'
                        : 'You can upload the receipt now or from \"Track my order\" later.'}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ─── STEP: CONFIRMATION ─── */}
            {step === 'confirmation' && (
              <>
                <div className="flex-1 overflow-y-auto p-5">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center py-6"
                  >
                    <div className="text-6xl mb-4">🎉</div>
                    <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "'Lora', serif", color: theme.text_color }}>
                      {t('confirm.order_number')} #{orderNumber}
                    </h3>
                    <p className="text-sm opacity-60 mb-4" style={{ color: theme.text_color }}>
                      {lang === 'es' ? 'Tu pedido fue registrado exitosamente' : 'Your order was registered successfully'}
                    </p>

                    {/* ── Mensaje contextual por tipo de pedido ── */}
                    {deliveryType === 'takeout' && (
                      <div
                        className="flex items-start gap-2 px-4 py-3 rounded-2xl text-xs mb-4 text-left"
                        style={{ backgroundColor: '#10B98115', border: '1px solid #10B98140', color: theme.text_color }}
                      >
                        <span className="text-base flex-shrink-0">🏪</span>
                        <span style={{ opacity: 0.9 }}>
                          {lang === 'es'
                            ? 'Tu pedido estará listo para retiro en el local. Te avisaremos cuando esté preparado.'
                            : 'Your order will be ready for pickup at the restaurant. We will notify you when it is ready.'}
                        </span>
                      </div>
                    )}
                    {deliveryType === 'delivery' && paymentMethod === 'sinpe' && (
                      <div
                        className="flex items-start gap-2 px-4 py-3 rounded-2xl text-xs mb-4 text-left"
                        style={{ backgroundColor: '#8B5CF615', border: '1px solid #8B5CF640', color: theme.text_color }}
                      >
                        <span className="text-base flex-shrink-0">⏳</span>
                        <span style={{ opacity: 0.9 }}>
                          {lang === 'es'
                            ? 'Tu pedido está en espera. Sube tu comprobante de SINPE desde \"Ver estado de mi pedido\" para que el restaurante lo verifique.'
                            : 'Your order is on hold. Upload your SINPE receipt from \"Track my order\" so the restaurant can verify it.'}
                        </span>
                      </div>
                    )}

                    {/* Order summary */}
                    <div className="rounded-2xl p-4 text-left mb-4 space-y-1" style={{ backgroundColor: `${theme.text_color}04`, border: `1px solid ${theme.text_color}10` }}>
                      {items.map(ci => (
                        <div key={ci.menuItem.id} className="flex justify-between text-sm py-1" style={{ color: theme.text_color }}>
                          <span className="opacity-70">{ci.quantity}x {ci.menuItem.name}</span>
                          <span className="font-semibold">{formatPrice(ci.menuItem.price * ci.quantity)}</span>
                        </div>
                      ))}
                      {discountAmount > 0 && (
                        <>
                          <div className="flex justify-between text-sm pt-2 mt-1 border-t" style={{ borderColor: `${theme.text_color}10`, color: `${theme.text_color}70` }}>
                            <span>Subtotal</span>
                            <span>{formatPrice(totalPrice)}</span>
                          </div>
                          {appliedPromo && (
                            <div className="flex justify-between text-sm">
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${theme.primary_color}20`, color: theme.primary_color }}>🎁 {appliedPromo.name}</span>
                              <span className="font-semibold text-green-400">{appliedPromo.discountAmount > 0 ? `-${formatPrice(appliedPromo.discountAmount)}` : '✓ Aplicada'}</span>
                            </div>
                          )}
                          {appliedCoupon && (
                            <div className="flex justify-between text-sm">
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#818CF8' }}>🎟️ {appliedCoupon.code}</span>
                              <span className="font-semibold text-green-400">-{formatPrice(appliedCoupon.discountAmount)}</span>
                            </div>
                          )}
                        </>
                      )}
                      <div className="flex justify-between pt-3 mt-2 border-t font-bold" style={{ borderColor: `${theme.text_color}10`, color: theme.primary_color }}>
                        <span>{t('cart.total')}</span>
                        <div className="flex items-center gap-2">
                          {discountAmount > 0 && (
                            <span className="text-sm line-through font-normal" style={{ color: `${theme.text_color}50` }}>{formatPrice(totalPrice)}</span>
                          )}
                          <span>{formatPrice(finalTotal)}</span>
                        </div>
                      </div>
                      {paymentMethod && (
                        <div className="flex justify-between pt-2 text-sm" style={{ color: `${theme.text_color}70` }}>
                          <span>{lang === 'es' ? 'Método de pago' : 'Payment method'}</span>
                          <span className="font-semibold">{paymentMethodLabel(paymentMethod)}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>

                <div className="p-5 border-t space-y-3" style={{ borderColor: `${theme.text_color}10` }}>
                  {tenant.whatsapp_number && (
                    <motion.button
                      onClick={handleWhatsApp}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 text-foreground transition-all"
                      style={{
                        backgroundColor: '#25D366',
                        boxShadow: '0 4px 16px rgba(37, 211, 102, 0.3)',
                      }}
                    >
                      <MessageCircle size={20} />
                      {t('confirm.whatsapp')}
                    </motion.button>
                  )}
                  <motion.button
                    onClick={handleFinish}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
                    style={{
                      backgroundColor: '#F59E0B',
                      color: '#000',
                      boxShadow: '0 4px 16px rgba(245,158,11,0.3)',
                    }}
                  >
                    <ShoppingBag size={20} />
                    {lang === 'es' ? 'Ver estado de mi pedido' : 'Track my order'}
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}

    </AnimatePresence>
  );
}
