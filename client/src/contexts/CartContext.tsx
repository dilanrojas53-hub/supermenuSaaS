import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { MenuItem, CartItem } from '@/lib/types';

/** Generate a short unique ID for cart items */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface AddItemOptions {
  isUpsell?: boolean;
  upsellSource?: 'ai' | 'static' | null;
  parentCartItemId?: string | null;
  preventCheckoutUpsell?: boolean;
  quantity?: number;
  // V11.0 Telemetría Local (SOLO en memoria, NUNCA a Supabase)
  triggerItemId?: string | null;
  upsellAcceptedAt?: string | null;
}

interface CartContextType {
  items: CartItem[];
  /** Quick add — increments quantity if same menuItem already exists (legacy behavior) */
  addItem: (item: MenuItem, isUpsell?: boolean, upsellSource?: 'ai' | 'static' | null) => void;
  /** Advanced add — always creates a new cart entry with unique cartItemId */
  addItemAdvanced: (item: MenuItem, opts?: AddItemOptions) => string;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  /** Mark a cart item as having been through the upsell flow */
  markUpsellHandled: (cartItemId: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Legacy addItem — for Quick Add button (increments if exists)
  const addItem = useCallback((menuItem: MenuItem, isUpsell?: boolean, upsellSource?: 'ai' | 'static' | null) => {
    setItems(prev => {
      const existing = prev.find(i => i.menuItem.id === menuItem.id && !i.isUpsell);
      if (existing) {
        return prev.map(i =>
          i.cartItemId === existing.cartItemId
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, {
        cartItemId: uid(),
        menuItem,
        quantity: 1,
        isUpsell: isUpsell || false,
        upsell_source: upsellSource || null,
        parent_cart_item_id: null,
        prevent_checkout_upsell: false,
      }];
    });
  }, []);

  // Advanced addItem — always creates a new entry, returns the cartItemId
  const addItemAdvanced = useCallback((menuItem: MenuItem, opts?: AddItemOptions): string => {
    const newId = uid();
    setItems(prev => [...prev, {
      cartItemId: newId,
      menuItem,
      quantity: opts?.quantity || 1,
      isUpsell: opts?.isUpsell || false,
      upsell_source: opts?.upsellSource || null,
      parent_cart_item_id: opts?.parentCartItemId || null,
      prevent_checkout_upsell: opts?.preventCheckoutUpsell || false,
      // V11.0 Telemetría Local — SOLO en memoria, NUNCA llegan a Supabase
      trigger_item_id: opts?.triggerItemId || null,
      upsell_accepted_at: opts?.upsellAcceptedAt || null,
    }]);
    return newId;
  }, []);

  // Remove by cartItemId (also removes any child upsell items)
  const removeItem = useCallback((cartItemId: string) => {
    setItems(prev => prev.filter(i =>
      i.cartItemId !== cartItemId && i.parent_cart_item_id !== cartItemId
    ));
  }, []);

  // Update quantity by cartItemId
  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i =>
        i.cartItemId !== cartItemId && i.parent_cart_item_id !== cartItemId
      ));
      return;
    }
    setItems(prev =>
      prev.map(i =>
        i.cartItemId === cartItemId ? { ...i, quantity } : i
      )
    );
  }, []);

  // Mark an item as having been through the upsell flow (accepted or rejected)
  const markUpsellHandled = useCallback((cartItemId: string) => {
    setItems(prev =>
      prev.map(i =>
        i.cartItemId === cartItemId ? { ...i, prevent_checkout_upsell: true } : i
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, addItem, addItemAdvanced, removeItem, updateQuantity,
      markUpsellHandled, clearCart, totalItems, totalPrice
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
