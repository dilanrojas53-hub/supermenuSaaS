/*
 * i18n Context: Multi-idioma ES/EN para la interfaz pública del menú.
 * Solo traduce la interfaz dura (botones, labels, títulos).
 * El contenido dinámico (nombres de platillos, descripciones) se queda como lo escriba el dueño.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type Lang = 'es' | 'en';

interface I18nContextType {
  lang: Lang;
  toggleLang: () => void;
  t: (key: string) => string;
}

const translations: Record<string, Record<Lang, string>> = {
  // Menu page
  'menu.closed': { es: 'Este restaurante está cerrado en este momento', en: 'This restaurant is currently closed' },
  'menu.featured': { es: 'Platillo de la Semana', en: 'Dish of the Week' },
  'menu.featured_desc': { es: 'Recomendación especial del chef', en: "Chef's special recommendation" },
  'menu.add': { es: 'Agregar', en: 'Add' },
  'menu.added': { es: 'Agregado', en: 'Added' },
  'menu.unavailable': { es: 'No disponible', en: 'Unavailable' },
  'menu.search': { es: 'Buscar platillos...', en: 'Search dishes...' },

  // Cart
  'cart.title': { es: 'Tu Pedido', en: 'Your Order' },
  'cart.empty': { es: 'Tu carrito está vacío', en: 'Your cart is empty' },
  'cart.empty_desc': { es: 'Agrega platillos del menú para comenzar', en: 'Add dishes from the menu to start' },
  'cart.subtotal': { es: 'Subtotal', en: 'Subtotal' },
  'cart.total': { es: 'Total', en: 'Total' },
  'cart.proceed': { es: 'Proceder al pago', en: 'Proceed to checkout' },
  'cart.checkout': { es: 'Confirmar pedido', en: 'Confirm order' },
  'cart.items': { es: 'artículos', en: 'items' },

  // Checkout
  'checkout.customer_info': { es: 'Datos del Cliente', en: 'Customer Info' },
  'checkout.name': { es: 'Nombre', en: 'Name' },
  'checkout.name_placeholder': { es: 'Tu nombre', en: 'Your name' },
  'checkout.phone': { es: 'Teléfono', en: 'Phone' },
  'checkout.table': { es: 'Mesa (opcional)', en: 'Table (optional)' },
  'checkout.notes': { es: 'Notas (opcional)', en: 'Notes (optional)' },
  'checkout.notes_placeholder': { es: 'Ej: Sin cebolla, extra salsa...', en: 'E.g.: No onion, extra sauce...' },
  'checkout.continue': { es: 'Continuar al pago', en: 'Continue to payment' },
  'checkout.back': { es: 'Volver', en: 'Back' },

  // Payment
  'payment.title': { es: 'Pago SINPE Móvil', en: 'SINPE Mobile Payment' },
  'payment.send_to': { es: 'Envía el monto a:', en: 'Send amount to:' },
  'payment.owner': { es: 'A nombre de:', en: 'Account holder:' },
  'payment.copy': { es: 'Copiar número', en: 'Copy number' },
  'payment.copied': { es: 'Copiado', en: 'Copied' },
  'payment.receipt': { es: 'Sube tu comprobante SINPE', en: 'Upload your SINPE receipt' },
  'payment.receipt_desc': { es: 'Toma una captura de pantalla de tu transferencia', en: 'Take a screenshot of your transfer' },
  'payment.take_photo': { es: 'Tomar foto', en: 'Take photo' },
  'payment.select_file': { es: 'Seleccionar archivo', en: 'Select file' },
  'payment.confirm': { es: 'Confirmar pedido', en: 'Confirm order' },
  'payment.processing': { es: 'Procesando...', en: 'Processing...' },

  // Confirmation
  'confirm.title': { es: 'Pedido Confirmado', en: 'Order Confirmed' },
  'confirm.order_number': { es: 'Pedido', en: 'Order' },
  'confirm.whatsapp': { es: 'Enviar por WhatsApp', en: 'Send via WhatsApp' },
  'confirm.new_order': { es: 'Nuevo pedido', en: 'New order' },

  // Badges
  'badge.mas_pedido': { es: 'Más pedido', en: 'Most ordered' },
  'badge.se_agota_rapido': { es: 'Se agota rápido', en: 'Selling fast' },
  'badge.nuevo': { es: 'Nuevo', en: 'New' },
  'badge.chef_recomienda': { es: 'Chef recomienda', en: 'Chef recommends' },

  // Upsell
  'upsell.title': { es: '¿Querés agregar algo más?', en: 'Want to add something else?' },
  'upsell.add': { es: 'Agregar', en: 'Add' },
  'upsell.skip': { es: 'No, gracias', en: 'No, thanks' },

  // General
  'general.close': { es: 'Cerrar', en: 'Close' },
  'general.loading': { es: 'Cargando...', en: 'Loading...' },
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('es');

  const toggleLang = useCallback(() => {
    setLang(prev => prev === 'es' ? 'en' : 'es');
  }, []);

  const t = useCallback((key: string): string => {
    return translations[key]?.[lang] || key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
