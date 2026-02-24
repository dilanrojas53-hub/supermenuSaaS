export interface Tenant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  address: string | null;
  sinpe_number: string | null;
  sinpe_owner: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ThemeSettings {
  id: string;
  tenant_id: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  view_mode: 'grid' | 'list';
  hero_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  badge: 'mas_pedido' | 'se_agota_rapido' | 'nuevo' | 'chef_recomienda' | null;
  upsell_item_id: string | null;
  upsell_text: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

export interface TenantData {
  tenant: Tenant;
  theme: ThemeSettings;
  categories: Category[];
  menuItems: MenuItem[];
}

// Badge display config
export const BADGE_CONFIG: Record<string, { label: string; icon: string; className: string }> = {
  mas_pedido: { label: 'Más pedido', icon: '🔥', className: 'badge-popular' },
  se_agota_rapido: { label: 'Se agota rápido', icon: '⚡', className: 'badge-scarce' },
  nuevo: { label: 'Nuevo', icon: '✨', className: 'badge-new' },
  chef_recomienda: { label: 'Chef recomienda', icon: '👨‍🍳', className: 'badge-chef' },
};

// Hero images per tenant slug
export const TENANT_HERO_IMAGES: Record<string, string> = {
  'la-casona-tica': 'https://private-us-east-1.manuscdn.com/sessionFile/LmxDH7UEpgKfSjGvBRWUVQ/sandbox/Hg7EvMZapJ560UeySRsbNJ-img-1_1771925494000_na1fn_aGVyby1jYXNvbmEtdGljYQ.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvTG14REg3VUVwZ0tmU2pHdkJSV1VWUS9zYW5kYm94L0hnN0V2TVphcEo1NjBVZXlTUnNiTkotaW1nLTFfMTc3MTkyNTQ5NDAwMF9uYTFmbl9hR1Z5YnkxallYTnZibUV0ZEdsallRLmpwZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=RWjr4KdWX2k7I9BY8VZxiDuBSSEniUscgIMajYW0ZdLEmP3elw4QNIl2bGIVN2AkjbCSvJp7r8BC6pOxachCn9MQNfvYYPmHiVyJsO343vc-Gz28GFck1yVHr6c22dt81toVX90lbyzRrReJJ726e-MzXir~SHsxxsTv8ejqA6pzu2wdscBJJ7iLSONF6zaM2hYZw-j0HHJhlsfc00lS47tGxovheFq6oncapRmcuf82RW1VwbwFoG7maWLp8FaOcjvnZNQgvpkGL1fpe2acKCUO2ajibaR8J6-j5iteHBcjc1jNt~Fm-GzTxz7QpNHfg1Nh3DLl1cxzjH4exvK7Sg__',
  'burger-lab-cr': 'https://private-us-east-1.manuscdn.com/sessionFile/LmxDH7UEpgKfSjGvBRWUVQ/sandbox/Hg7EvMZapJ560UeySRsbNJ-img-2_1771925480000_na1fn_aGVyby1idXJnZXItbGFi.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvTG14REg3VUVwZ0tmU2pHdkJSV1VWUS9zYW5kYm94L0hnN0V2TVphcEo1NjBVZXlTUnNiTkotaW1nLTJfMTc3MTkyNTQ4MDAwMF9uYTFmbl9hR1Z5YnkxaWRYSm5aWEl0YkdGaS5qcGc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=mRI-4bsdI9iyYtgK9rphL2oRNWCuKLLkAUWC-yDZI9JwKsIO7p8sw78T2TMoOExGClG1X3xJ61NbD7pKTJBHZ3Gj1WjM3Mx63Tt0HAuoeW~WL6E8SLel6AwXplWY7f~PZCCACMGPW~5XnX~Dq2ZgHWcyvUa2qcVkAut5s2pN6dIMdw0WYbOetR67QBz-dNi0nZtWSAr1pkLZP-fe82D0wGfmZIcNHptP03TY3pU7sB23YPnrUxVBxjveZxacvl3~YonkPz8W2oVJg1m9rOIXyg1EUOPgDlkwCpTeQ9AcDOdZBnT64wyjazUm2zN0wEqtTvN-PVcab9xBSG1ISO3KfA__',
  'marisqueria-el-pacifico': 'https://private-us-east-1.manuscdn.com/sessionFile/LmxDH7UEpgKfSjGvBRWUVQ/sandbox/Hg7EvMZapJ560UeySRsbNJ-img-3_1771925499000_na1fn_aGVyby1tYXJpc3F1ZXJpYQ.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvTG14REg3VUVwZ0tmU2pHdkJSV1VWUS9zYW5kYm94L0hnN0V2TVphcEo1NjBVZXlTUnNiTkotaW1nLTNfMTc3MTkyNTQ5OTAwMF9uYTFmbl9hR1Z5YnkxdFlYSnBjM0YxWlhKcFlRLmpwZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=S3BYRDgN7TBa5~ejiMXplKXAc0OV3COfdYMeWqvpj~wWVbFrB3gm6eK7xt7byuNYjBh~n4k-T6Yipcg6UgrTYFP6ZyVgdShhUFn068TENW9EJNqEFzBSmGlg9IXSxoaDiJ8EwmWNSFiIrW7df-K56Goo43eO9R77juT9Cxw6V5txz~X00OOrtosYt9LG3XjrE2ipaY-3Pubil-96xsFzu6VxxQ0p2TAD17elNkH4fbqrZ-6on1wAkIyRhBrqgZeuEeT0btiGc173TRqMpvsD36MPrumZ3dfijVMloLk0cL5dJmZjwn-kDgyPaiZCtQ8JSoatPfQ0pyAlYeaxiHMakA__',
};

// Format price in Costa Rican Colones
export function formatPrice(price: number): string {
  return `₡${price.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Determine if a color is dark (for text contrast)
export function isColorDark(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// Get font family CSS value
export function getFontFamily(fontName: string): string {
  const fontMap: Record<string, string> = {
    'Georgia': "'Georgia', serif",
    'Poppins': "'Poppins', sans-serif",
    'Montserrat': "'Montserrat', sans-serif",
    'Inter': "'Inter', sans-serif",
    'Lora': "'Lora', serif",
    'Nunito': "'Nunito', sans-serif",
  };
  return fontMap[fontName] || `'${fontName}', sans-serif`;
}
