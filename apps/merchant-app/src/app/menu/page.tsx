'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { merchantApi, type MenuItem } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

const GRADIENT_BG = [
  'from-[#f093fb] to-[#f5576c]',
  'from-[#43e97b] to-[#38f9d7]',
  'from-[#fa709a] to-[#fee140]',
  'from-[#a18cd1] to-[#fbc2eb]',
  'from-[#ff6b35] to-[#ff8f65]',
  'from-[#fbc2eb] to-[#a6c1ee]',
];

export default function MenuPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [merchant, setMerchant] = useState<any>(null);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add/Edit form
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', price: '', category: 'MAIN_COURSE', description: '' });

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    async function load() {
      try {
        const res = await merchantApi.list({ take: 200 });
        const m = (res.items || []).find((m2: any) => m2.userId === user?.id);
        setMerchant(m);
        if (m) {
          const items = await merchantApi.getMenu(m.id);
          setMenuItems(Array.isArray(items) ? items : []);
        }
      } catch {} finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, user, router]);

  async function handleAdd() {
    if (!merchant || !form.name || !form.price) return;
    setSaving(true);
    try {
      const created = await merchantApi.addMenuItem(merchant.id, {
        name: form.name,
        price: Number(form.price),
        category: form.category as any,
        description: form.description,
      });
      setMenuItems([...menuItems, created]);
      setShowForm(false);
      setForm({ name: '', price: '', category: 'MAIN_COURSE', description: '' });
    } catch {} finally { setSaving(false); }
  }

  async function handleUpdate() {
    if (!merchant || !editing) return;
    setSaving(true);
    try {
      const updated = await merchantApi.updateMenuItem(merchant.id, editing.id, {
        name: form.name,
        price: Number(form.price),
        category: form.category as any,
        description: form.description,
      });
      setMenuItems(menuItems.map(i => i.id === editing.id ? updated : i));
      setEditing(null);
      setShowForm(false);
      setForm({ name: '', price: '', category: 'MAIN_COURSE', description: '' });
    } catch {} finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!merchant || !confirm('Xac nhan xoa mon nay?')) return;
    try {
      await (merchantApi as any).deleteMenuItem(merchant.id, id);
      setMenuItems(menuItems.filter(i => i.id !== id));
    } catch {}
  }

  async function handleToggle(item: any) {
    if (!merchant) return;
    try {
      const updated = await (merchantApi as any).toggleMenuItem(merchant.id, item.id);
      setMenuItems(menuItems.map(i => i.id === item.id ? updated : i));
    } catch {}
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[420px] mx-auto pb-20">
      <header className="bg-[#1a1a2e] px-4 py-4 text-white">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">←</Link>
          <h1 className="text-lg font-bold">Menu Management</h1>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-[#ff6b35] text-white px-3 py-1.5 rounded-lg text-sm font-semibold">+ Add</button>
        </div>
      </header>

      <main className="px-4 py-6 space-y-4">
        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <h3 className="font-bold">{editing ? 'Edit Item' : 'Add Item'}</h3>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Name" className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35]" />
            <input type="number" value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder="Price (VND)" className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35]" />
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none">
              <option value="MAIN_COURSE">Main Course</option>
              <option value="BEVERAGE">Beverage</option>
              <option value="DESSERT">Dessert</option>
              <option value="SIDE_DISH">Side Dish</option>
            </select>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" rows={2} className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35] resize-none" />
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 bg-gray-200 py-2.5 rounded-xl text-sm font-semibold">Cancel</button>
              <button onClick={editing ? handleUpdate : handleAdd} disabled={saving} className="flex-1 bg-[#ff6b35] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        )}

        {menuItems.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
            <p className="text-4xl mb-3">Empty</p>
            <p className="text-gray-400">No menu items yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {menuItems.map((item: any, idx: number) => (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm p-3 text-center">
                <div className={`h-20 bg-gradient-to-br ${GRADIENT_BG[idx % GRADIENT_BG.length]} rounded-lg mb-2`} />
                <p className="text-sm font-semibold truncate">{item.name}</p>
                <p className="text-sm font-bold text-[#ff6b35]">{item.price?.toLocaleString('vi-VN')} VND</p>
                <div className="flex gap-2 mt-2 justify-center">
                  <button onClick={() => {
                    setEditing(item);
                    setForm({ name: item.name, price: String(item.price), category: item.category || 'MAIN_COURSE', description: item.description || '' });
                    setShowForm(true);
                  }} className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Edit</button>
                  <button onClick={() => handleDelete(item.id)} className="text-xs bg-red-100 text-red-500 px-2 py-1 rounded">Del</button>
                  <button onClick={() => handleToggle(item)} className={`text-xs px-2 py-1 rounded ${item.available !== false ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                    {item.available !== false ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">Home</span><span>Home</span></Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">Orders</span><span>Orders</span></Link>
        <Link href="/menu" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"><span className="text-[22px]">Menu</span><span>Menu</span></Link>
        <button onClick={() => { clearAuth(); router.push('/'); }} className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer"><span className="text-[22px]">Account</span><span>Account</span></button>
      </nav>
    </div>
  );
}