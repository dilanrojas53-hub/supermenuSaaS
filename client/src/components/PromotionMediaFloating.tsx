import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Promo = { id: string; name: string; image_url: string | null; description: string | null; active_until: string | null };

function slug() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('admin');
  return i >= 0 ? parts[i + 1] : '';
}

function showOnPage() {
  const text = (document.body.textContent || '').toLowerCase();
  return text.includes('motor de promociones');
}

function dt(v: string | null) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16);
}

export default function PromotionMediaFloating() {
  const [visible, setVisible] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [rows, setRows] = useState<Promo[]>([]);
  const [id, setId] = useState('');
  const [image, setImage] = useState('');
  const [desc, setDesc] = useState('');
  const [until, setUntil] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const s = slug();
    if (!s) return;
    const tenant = await supabase.from('tenants').select('id').eq('slug', s).maybeSingle();
    const tid = tenant.data?.id;
    if (!tid) return;
    setTenantId(tid);
    const promos = await supabase.from('promotions').select('id,name,image_url,description,active_until').eq('tenant_id', tid).order('created_at', { ascending: false });
    const data = (promos.data || []) as Promo[];
    setRows(data);
    if (!id && data[0]) setId(data[0].id);
  }

  useEffect(() => {
    const timer = window.setInterval(() => setVisible(showOnPage()), 800);
    setVisible(showOnPage());
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { if (visible) load(); }, [visible]);

  useEffect(() => {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    setImage(row.image_url || '');
    setDesc(row.description || '');
    setUntil(dt(row.active_until));
  }, [id, rows]);

  async function save() {
    if (!tenantId || !id) return;
    setSaving(true);
    await supabase.from('promotions').update({
      image_url: image.trim() || null,
      description: desc.trim() || null,
      active_until: until ? new Date(until).toISOString() : null,
    }).eq('tenant_id', tenantId).eq('id', id);
    setSaving(false);
    load();
  }

  if (!visible || rows.length === 0) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[9999] w-[calc(100vw-24px)] max-w-sm rounded-2xl border border-amber-500/30 bg-slate-950 p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-black text-amber-400">Imagen promo</div>
        <button onClick={() => setVisible(false)} className="text-xs text-slate-400">Cerrar</button>
      </div>
      <select value={id} onChange={e => setId(e.target.value)} className="mb-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">
        {rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <input value={image} onChange={e => setImage(e.target.value)} placeholder="URL de imagen" className="mb-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs text-white" />
      {image && <img src={image} alt="promo" className="mb-2 h-24 w-full rounded-xl object-cover" />}
      <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción" className="mb-2 h-16 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs text-white" />
      <input value={until} onChange={e => setUntil(e.target.value)} type="datetime-local" className="mb-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs text-white" />
      <button onClick={save} disabled={saving} className="w-full rounded-xl bg-amber-500 py-2 text-sm font-black text-black disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
    </div>
  );
}
