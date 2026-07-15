'use client';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, Search, Download, Upload, Save, X, ChevronDown, Check } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  website: string;
  category: string;
}

const categories = [
  { id: '1', name: 'Dental' },
  { id: '2', name: 'SaaS' },
  { id: '3', name: 'Agency' },
  { id: '4', name: 'Restaurant' },
  { id: '5', name: 'Healthcare' },
  { id: '6', name: 'Education' },
  { id: '7', name: 'Finance' }
];

export default function ContactManager() {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const listId = categoryFilter || '1';

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [originalContacts, setOriginalContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [editing, setEditing] = useState<{ id: string; field: keyof Contact } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [toast, setToast] = useState<{msg: string; type: 'success' | 'error'} | null>(null);

  const [bulkRows, setBulkRows] = useState(10);
  const [bulkSelectN, setBulkSelectN] = useState(10);

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (user) {
      try {
        const parsedUser = JSON.parse(user);
        setUserId(parsedUser?.id || "");
      } catch (e) {}
    }
  }, []);

  const fetchContacts = async () => {
    if (!listId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/email?userId=${userId}`);
      const json = await res.json();
      const data = json.data || [];
      setContacts([...data]);
      setOriginalContacts([...data]);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { fetchContacts(); }, [userId]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c =>
      (c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
       c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
       (c.phone && c.phone.includes(searchTerm))) &&
      (!categoryFilter || c.category === categoryFilter)
    );
  }, [contacts, searchTerm, categoryFilter]);

  const showToast = (msg: string) => {
    setToast({msg, type: 'success'});
    setTimeout(() => setToast(null), 2000);
  };

  const updateLocalContact = useCallback((id: string, field: keyof Contact, value: string) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }, []);

  const startEditing = (id: string, field: keyof Contact, value: string) => {
    setEditing({ id, field });
    setEditValue(value);
  };

  const commitEdit = () => {
    if (!editing) return;
    updateLocalContact(editing.id, editing.field, editValue.trim());
    setEditing(null);
    setEditValue('');
  };

  const addBulkRows = () => {
    const newRows: Contact[] = Array.from({length: bulkRows}, () => ({
      id: `temp-${Date.now()}-${Math.random()}`,
      name: '', email: '', phone: '', website: '', category: ''
    }));
    setContacts(prev => [...prev, ...newRows]);
    showToast(`${bulkRows} rows created`);
  };

  const selectFirstN = () => {
    const toSelect = filteredContacts.slice(0, bulkSelectN).map(c => c.id);
    setSelected(new Set(toSelect));
    showToast(`Selected first ${toSelect.length} rows`);
  };

  const saveAll = async () => {
    const valid = contacts.filter(c => c.name?.trim() && c.email?.trim() && c.category?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));
    const newRows = valid.filter(c => c.id.startsWith('temp-')).map(c => { const p = {...c}; delete p.id; return p; });
    const updatedRows = valid.filter(c => !c.id.startsWith('temp-')).filter(c => {
      const orig = originalContacts.find(o => o.id === c.id);
      return orig && JSON.stringify(c) !== JSON.stringify(orig);
    });

    if (newRows.length) {
      await fetch('/api/email', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userId, listId, contacts: newRows }) });
    }
    if (updatedRows.length) {
      await fetch('/api/email', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ contacts: updatedRows }) });
    }
    await fetchContacts();
    showToast('Contacts saved');
  };

  const deleteContact = async (id: string) => {
    if (!id.startsWith('temp-')) {
      await fetch('/api/email', { method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ids: [id], listId }) });
    }
    setContacts(p => p.filter(c => c.id !== id));
    setOriginalContacts(p => p.filter(c => c.id !== id));
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    const realIds = Array.from(selected).filter(id => !id.startsWith('temp-'));
    if (realIds.length) {
      await fetch('/api/email', { method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ids: realIds, listId }) });
    }
    setContacts(p => p.filter(c => !selected.has(c.id)));
    setOriginalContacts(p => p.filter(c => !selected.has(c.id)));
    setSelected(new Set());
    showToast('Selected contacts deleted');
  };

  const importContacts = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const rows = text.split('\n').slice(1);
      const newContacts: any[] = [];
      rows.forEach(row => {
        if (!row.trim()) return;
        const [name, email, phone, website, category] = row.split(',').map(s => s.trim().replace(/"/g, ''));
        if (email && name && category && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          newContacts.push({ name, email, phone: phone || '', website: website || '', category });
        }
      });
      if (newContacts.length) {
        await fetch('/api/email', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userId, listId, contacts: newContacts }) });
        fetchContacts();
        showToast('Import successful');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportCSV = (mode: 'all' | 'sending') => {
    if (selected.size === 0) {
      alert('Please select at least one contact.');
      return;
    }
    const toExport = contacts.filter(c => selected.has(c.id));
    let headers: string[], rows: string[];
    if (mode === 'sending') {
      headers = ['Name', 'Email'];
      rows = toExport.map(c => `"${c.name}","${c.email}"`);
    } else {
      headers = ['Name', 'Email', 'Phone', 'Website', 'Category'];
      rows = toExport.map(c => `"${c.name}","${c.email}","${c.phone}","${c.website}","${c.category}"`);
    }
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `contacts-${mode}.csv`; a.click();
    showToast('Export successful');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveAll(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(filteredContacts.map(c => c.id))); }
      if (e.key === 'Delete' && selected.size > 0) deleteSelected();
      if (e.key === 'Escape' && editing) { setEditing(null); setEditValue(''); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredContacts, selected, editing]);

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white sticky top-0  shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Contacts</h1>
            <p className="text-zinc-500 text-sm">Enterprise CRM</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-4 py-2.5 border border-zinc-200 hover:bg-white rounded-2xl text-sm font-medium cursor-pointer transition-all active:scale-[0.985]">
              <Upload size={16} /> Import CSV
              <input type="file" accept=".csv" onChange={importContacts} className="hidden" />
            </label>

            {/* Export Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-2 px-5 py-2.5 border border-zinc-200 hover:bg-white rounded-2xl text-sm font-medium transition-all">
                <Download size={16} /> Export <ChevronDown size={14} />
              </button>
              <div className="absolute hidden group-hover:block right-0 mt-2 w-56 bg-white rounded-3xl border border-zinc-200 shadow-xl py-2 z-50">
                <button onClick={() => exportCSV('all')} className="w-full px-4 py-2.5 text-left hover:bg-zinc-50 flex items-center gap-3 text-sm">All columns</button>
                <button onClick={() => exportCSV('sending')} className="w-full px-4 py-2.5 text-left hover:bg-zinc-50 flex items-center gap-3 text-sm">For sending (Name, Email)</button>
              </div>
            </div>

            <button onClick={saveAll} className="bg-blue-600 text-white px-6 py-2.5 rounded-2xl flex items-center gap-2 text-sm font-semibold hover:bg-blue-700 transition-all active:scale-[0.985]">
              <Save size={18} /> Save All
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6 bg-white border border-zinc-200 rounded-3xl p-2 shadow-sm">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative max-w-md">
              <Search className="absolute left-4 top-3.5 text-zinc-400" size={18} />
              <input 
                type="text" 
                placeholder="Search contacts..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                className="w-full bg-white border border-zinc-200 pl-11 py-3 rounded-2xl text-sm focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>

            {/* Category Filter */}
            <div className="relative w-64">
              <button 
                onClick={() => setCategoryOpen(!categoryOpen)}
                className="w-full bg-white border border-zinc-200 hover:border-zinc-300 px-4 py-3 rounded-2xl text-sm flex items-center justify-between transition-all"
              >
                <span className="flex items-center gap-2">
                  <span>Category</span>
                  {categoryFilter && <span className="text-blue-600 font-medium">• {categoryFilter}</span>}
                </span>
                <ChevronDown size={16} />
              </button>

              {categoryOpen && (
                <div className="absolute mt-2 w-full bg-white border border-zinc-200 rounded-3xl shadow-xl py-2 z-50 max-h-80 overflow-auto">
                  <div className="px-3 pb-2">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Search categories..." 
                        value={categorySearch} 
                        onChange={e => setCategorySearch(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 pl-9 py-2 rounded-xl text-sm"
                      />
                      <Search size={16} className="absolute left-3.5 top-3 text-zinc-400" />
                    </div>
                  </div>
                  <button 
                    onClick={() => { setCategoryFilter(''); setCategoryOpen(false); setCategorySearch(''); }}
                    className="w-full px-4 py-2.5 text-left hover:bg-zinc-50 text-sm flex items-center gap-2"
                  >
                    All Categories
                  </button>
                  {filteredCategories.map(c => (
                    <button 
                      key={c.id}
                      onClick={() => { setCategoryFilter(c.name); setCategoryOpen(false); setCategorySearch(''); }}
                      className="w-full px-4 py-2.5 text-left hover:bg-zinc-50 text-sm flex items-center justify-between"
                    >
                      {c.name}
                      {categoryFilter === c.name && <Check size={16} className="text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bulk Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl px-3 py-1">
              <input 
                type="number" 
                value={bulkRows} 
                onChange={e => setBulkRows(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-transparent text-center focus:outline-none text-sm font-medium"
              />
              <button onClick={addBulkRows} className="text-xs font-semibold px-4 py-1.5 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50">Add Rows</button>
            </div>

            <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl px-3 py-1">
              <input 
                type="number" 
                value={bulkSelectN} 
                onChange={e => setBulkSelectN(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-transparent text-center focus:outline-none text-sm font-medium"
              />
              <button onClick={selectFirstN} className="text-xs font-semibold px-4 py-1.5 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50">Select</button>
            </div>

            {selected.size > 0 && (
              <button onClick={deleteSelected} className="flex items-center gap-2 px-5 py-2.5 text-red-600 hover:bg-red-50 rounded-2xl text-sm font-medium transition">
                <Trash2 size={16} /> Delete ({selected.size})
              </button>
            )}
          </div>

          <div className="text-sm text-zinc-500 tabular-nums">{filteredContacts.length} contacts • {selected.size} selected</div>
        </div>

        {/* Table Container */}
        <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10 border-b border-zinc-200">
              <tr>
                <th className="w-12 p-4"><input type="checkbox" checked={filteredContacts.length > 0 && selected.size === filteredContacts.length} onChange={() => setSelected(selected.size === filteredContacts.length ? new Set() : new Set(filteredContacts.map(c => c.id)))} className="w-4 h-4 accent-blue-600" /></th>
                <th className="w-12 p-4 text-left text-xs font-medium text-zinc-500">#</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">NAME</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">EMAIL</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">PHONE</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">WEBSITE</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">CATEGORY</th>
                <th className="w-20 p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                Array.from({length: 5}).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({length: 8}).map((_, j) => <td key={j} className="p-5"><div className="h-4 bg-zinc-100 rounded w-3/4" /></td>)}
                  </tr>
                ))
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-20 text-center">
                    <div className="mx-auto w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                      <Search size={28} className="text-zinc-400" />
                    </div>
                    <p className="text-xl font-medium text-zinc-400">No contacts found</p>
                    <p className="text-sm text-zinc-500 mt-1">Import a CSV or add new rows</p>
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact, idx) => (
                  <tr key={contact.id} className={`group transition-colors ${selected.has(contact.id) ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}>
                    <td className="p-4">
                      <input 
                        type="checkbox" 
                        checked={selected.has(contact.id)} 
                        onChange={() => setSelected(prev => { const n = new Set(prev); n.has(contact.id) ? n.delete(contact.id) : n.add(contact.id); return n; })} 
                        className="w-4 h-4 accent-blue-600"
                      />
                    </td>
                    <td className="p-4 text-xs font-mono text-zinc-400">{idx + 1}</td>
                    
                    {/* Name */}
                    <td className="p-4">
                      {editing?.id === contact.id && editing.field === 'name' ? (
                        <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} autoFocus className="w-full px-3 py-2.5 border border-blue-500 rounded-xl text-sm focus:outline-none" />
                      ) : (
                        <div onClick={() => startEditing(contact.id, 'name', contact.name)} className="cursor-text min-h-[44px] flex items-center py-1 px-2 rounded-xl hover:bg-white transition">{contact.name || <span className="text-zinc-400 italic">Enter name</span>}</div>
                      )}
                    </td>

                    {/* Email */}
                    <td className="p-4 font-mono text-sm">
                      {editing?.id === contact.id && editing.field === 'email' ? (
                        <input type="email" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} autoFocus className="w-full px-3 py-2.5 border border-blue-500 rounded-xl text-sm focus:outline-none" />
                      ) : (
                        <div onClick={() => startEditing(contact.id, 'email', contact.email)} className="cursor-text min-h-[44px] flex items-center py-1 px-2 rounded-xl hover:bg-white transition">{contact.email || <span className="text-zinc-400 italic">user@domain.com</span>}</div>
                      )}
                    </td>

                    {/* Phone */}
                    <td className="p-4">
                      {editing?.id === contact.id && editing.field === 'phone' ? (
                        <input type="tel" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} autoFocus className="w-full px-3 py-2.5 border border-blue-500 rounded-xl text-sm focus:outline-none" />
                      ) : (
                        <div onClick={() => startEditing(contact.id, 'phone', contact.phone)} className="cursor-text min-h-[44px] flex items-center py-1 px-2 rounded-xl hover:bg-white transition">{contact.phone || <span className="text-zinc-400 italic">+1 (555) 000-0000</span>}</div>
                      )}
                    </td>

                    {/* Website */}
                    <td className="p-4">
                      {editing?.id === contact.id && editing.field === 'website' ? (
                        <input type="url" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} autoFocus className="w-full px-3 py-2.5 border border-blue-500 rounded-xl text-sm focus:outline-none" />
                      ) : (
                        <div onClick={() => startEditing(contact.id, 'website', contact.website)} className="cursor-text min-h-[44px] flex items-center py-1 px-2 rounded-xl hover:bg-white transition">{contact.website || <span className="text-zinc-400 italic">example.com</span>}</div>
                      )}
                    </td>

                    {/* Category */}
                    <td className="p-4">
                      {editing?.id === contact.id && editing.field === 'category' ? (
                        <select value={editValue} onChange={e => { setEditValue(e.target.value); updateLocalContact(contact.id, 'category', e.target.value); setEditing(null); }} className="w-full px-3 py-2.5 border border-blue-500 rounded-xl text-sm focus:outline-none">
                          <option value="">Select category</option>
                          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      ) : (
                        <div onClick={() => startEditing(contact.id, 'category', contact.category)} className="cursor-text min-h-[44px] flex items-center py-1 px-2 rounded-xl hover:bg-white transition text-sm">{contact.category || <span className="text-zinc-400 italic">Select</span>}</div>
                      )}
                    </td>

                    <td className="p-4">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => startEditing(contact.id, 'name', contact.name)} className="p-2 hover:bg-white rounded-xl"><Edit2 size={16} /></button>
                        <button onClick={() => deleteContact(contact.id)} className="p-2 hover:bg-white text-red-500 rounded-xl"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-zinc-900 text-white text-sm px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-4">
          {toast.msg}
        </div>
      )}
    </div>
  );
}