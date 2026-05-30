import { useInsertionEffect } from 'react';

export default function LaTacopediaOrderCss() {
  useInsertionEffect(() => {
    if (!window.location.pathname.includes('/la-tacopedia')) return;
    const style = document.createElement('style');
    style.id = 'lt-order-css';
    style.textContent = '.grid.grid-cols-4.gap-1.mb-2>button:first-child{display:none!important}.grid.grid-cols-4.gap-1.mb-2{grid-template-columns:repeat(3,minmax(0,1fr))!important}';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  return null;
}
