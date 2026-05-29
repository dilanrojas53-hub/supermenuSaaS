import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@/lib/types';

type Promo = {
  id: string;
  name: string;
  image_url: string | null;
  description: string | null;
  active_until: string | null;
};

function inputDate(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16);
}

export default function PromotionMediaPanel({ tenant }: { tenant: Tenant }) {
  const [rows, setRows] = useState<Promo[]>([]);
  const [id, setId] = useState('');
  const [image, setImage] = useState('');
  const [description, setDescription] = useState('');
  const [until, setUntil] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await supabase
      .from('promotions')
      .select('id,name,image_url,description,active_until')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });
    const data = (res.data || []) as Promo[];
    setRows(data);
    if (!id && data[0]) setId(data[0].id);
  }

  useEffect(() => { load(); }, [tenant.id]);

  useEffect(() => {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    setImage(row.image_url || '');
    setDescription(row.description || '');
    setUntil(inputDate(row.active_until));
  }, [id, rows]);

  async function save() {
    if (!id) return;
    setSaving(true);
    await supabase
      .from('promotions')
      .update({ image_url: image || null, description: description || null, active_until: until ? new Date(until).toISOString() : null })
      .eq('id', id)
      .eq('tenant_id', tenant.id);
    setSaving(false);
    load();
  }

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl p-4 mb-4 space-y-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="text-sm font-black text-amber-400">Imagen y vencimiento</div>
      <select value={id} onChange={e => setId(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
        {rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <input value={image} onChange={e => setImage(e.target.value)} placeholder="Ruta o enlace de imagen" className="w-full px-3 py-2 rounded-xl text-sm bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      {image && <img src={image} alt="Promo" className="w-full h-32 rounded-xl object-cover" />}
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción" className="w-full px-3 py-2 rounded-xl text-sm bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      <input value={until} onChange={e => setUntil(e.target.value)} type="datetime-local" className="w-full px-3 py-2 rounded-xl text-sm bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      <button onClick={save} disabled={saving} className="w-full py-2 rounded-xl text-sm font-bold" style={{ background: '#F59E0B', color: '#000' }}>{saving ? 'Guardando...' : 'Guardar imagen'}</button>
    </div>
  );
}
