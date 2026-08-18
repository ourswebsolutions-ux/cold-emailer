'use client';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Edit2, Search, Download, Upload, Save, X, ChevronDown, Check, FileText, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  website: string;
  category: string;
  company: string;
}

type CsvMapping = 'ignore' | 'name' | 'email' | 'phone' | 'website' | 'category' | 'company';

interface CsvColumn {
  index: number;
  originalName: string;
  normalizedName: string;
  mapping: CsvMapping;
  samples: string[];
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

const MAPPING_OPTIONS: { value: CsvMapping; label: string; required?: boolean }[] = [
  { value: 'ignore', label: 'Do not import' },
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email *', required: true },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'company', label: 'Company' },
  { value: 'category', label: 'Category' },
];

// ---------- Robust CSV Parser (handles quotes, commas, escapes, BOM, CRLF) ----------
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }

    if (char === '\r') {
      currentRow.push(currentField);
      currentField = '';
      rows.push(currentRow);
      currentRow = [];
      if (next === '\n') i += 2;
      else i++;
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentField);
      currentField = '';
      rows.push(currentRow);
      currentRow = [];
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  while (rows.length > 0 && rows[rows.length - 1].every(c => c.trim() === '')) {
    rows.pop();
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1).filter(r => r.some(c => c.trim() !== ''));

  const normalizedRows = dataRows.map(row => {
    const r = [...row];
    while (r.length < headers.length) r.push('');
    return r.slice(0, headers.length);
  });

  return { headers, rows: normalizedRows };
}

// ---------- Auto-detection helpers ----------
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ');
}

const NAME_ALIASES = [
  'name', 'full name', 'fullname', 'contact name', 'contact name',
  'first name', 'firstname', 'person name', 'lead name', 'customer name',
  'client name', 'display name'
];

const EMAIL_ALIASES = [
  'email', 'email address', 'email address', 'e mail', 'e-mail',
  'my email', 'work email', 'business email', 'contact email',
  'mail', 'email id', 'emailid', 'email_id', 'primary email'
];

const PHONE_ALIASES = [
  'phone', 'phone number', 'phone number', 'mobile', 'mobile number',
  'mobile number', 'telephone', 'tel', 'contact number', 'contact number',
  'whatsapp', 'whatsapp number', 'cell', 'cell phone', 'cellphone'
];

const WEBSITE_ALIASES = [
  'website', 'web site', 'website url', 'website url', 'company website',
  'company url', 'company url', 'url', 'domain', 'company domain',
  'web', 'homepage', 'site'
];

const COMPANY_ALIASES = [
  'company', 'company name', 'companyname', 'organization', 'organisation',
  'org', 'business', 'business name', 'firm', 'employer', 'workplace',
  'company_name', 'org name', 'organization name'
];

const CATEGORY_ALIASES = [
  'category', 'type', 'industry', 'business type', 'business type',
  'sector', 'niche', 'vertical', 'segment'
];

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPhoneLike(value: string): boolean {
  const cleaned = value.replace(/[\s\-\(\)\+\.]/g, '');
  return /^\d{7,15}$/.test(cleaned);
}

function isWebsiteLike(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return (
    /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i.test(v) ||
    /^[\w-]+\.[\w-]{2,}$/i.test(v)
  );
}

function suggestMapping(header: string, samples: string[]): CsvMapping {
  const norm = normalizeHeader(header);

  if (NAME_ALIASES.some(a => norm === a || norm.includes(a))) return 'name';
  if (EMAIL_ALIASES.some(a => norm === a || norm.includes(a))) return 'email';
  if (PHONE_ALIASES.some(a => norm === a || norm.includes(a))) return 'phone';
  if (WEBSITE_ALIASES.some(a => norm === a || norm.includes(a))) return 'website';
  if (COMPANY_ALIASES.some(a => norm === a || norm.includes(a))) return 'company';
  if (CATEGORY_ALIASES.some(a => norm === a || norm.includes(a))) return 'category';

  const nonEmpty = samples.filter(s => s && s.trim());
  if (nonEmpty.length === 0) return 'ignore';

  const emailHits = nonEmpty.filter(isEmailLike).length;
  const phoneHits = nonEmpty.filter(isPhoneLike).length;
  const websiteHits = nonEmpty.filter(isWebsiteLike).length;

  const total = nonEmpty.length;
  if (emailHits / total >= 0.6) return 'email';
  if (phoneHits / total >= 0.6) return 'phone';
  if (websiteHits / total >= 0.6) return 'website';

  return 'ignore';
}

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
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [bulkRows, setBulkRows] = useState(10);

  // Dynamic row range selection
  const [selectFrom, setSelectFrom] = useState(1);
  const [selectTo, setSelectTo] = useState(10);

  // ---------- Import modal state ----------
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<'mapping' | 'preview'>('mapping');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvColumns, setCsvColumns] = useState<CsvColumn[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/email?userId=${userId}&listId=${listId}`);
      const json = await res.json();
      const data = (json.data || []).map((c: any) => ({
        ...c,
        company: c.company ?? '',
      }));
      setContacts([...data]);
      setOriginalContacts([...data]);
    } catch (e) {
      console.error("Fetch error:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();
  }, [userId, listId]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c =>
      (c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone && c.phone.includes(searchTerm)) ||
        (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase()))) &&
      (!categoryFilter || c.category === categoryFilter)
    );
  }, [contacts, searchTerm, categoryFilter]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
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
    const newRows: Contact[] = Array.from({ length: bulkRows }, () => ({
      id: `temp-${Date.now()}-${Math.random()}`,
      name: '', email: '', phone: '', website: '', category: '', company: ''
    }));
    setContacts(prev => [...prev, ...newRows]);
    showToast(`${bulkRows} rows created`);
  };

  // ---------- Dynamic From → To row selection ----------
  const selectRowRange = () => {
    if (filteredContacts.length === 0) return;

    let from = Math.max(1, Math.floor(Number(selectFrom)) || 1);
    let to = Math.max(1, Math.floor(Number(selectTo)) || 1);

    if (from > to) {
      [from, to] = [to, from];
    }

    const max = filteredContacts.length;
    from = Math.min(from, max);
    to = Math.min(to, max);

    const idsToSelect = filteredContacts
      .slice(from - 1, to)
      .map(c => c.id);

    setSelected(prev => {
      const next = new Set(prev);
      idsToSelect.forEach(id => next.add(id));
      return next;
    });

    showToast(`Selected rows ${from}–${to}`);
  };

  const saveAll = async () => {
    console.clear();
    console.log("========== SAVE ALL ==========");

    const valid = contacts.filter(c =>
      c.email?.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)
    );

    const newRows = valid
      .filter(c => c.id.startsWith("temp-"))
      .map(c => {
        const { id, ...rest } = c;
        return rest;
      });

    const updatedRows = valid
      .filter(c => !c.id.startsWith("temp-"))
      .filter(c => {
        const orig = originalContacts.find(o => o.id === c.id);
        if (!orig) return false;

        return (
          orig.name !== c.name ||
          orig.email !== c.email ||
          orig.phone !== c.phone ||
          orig.website !== c.website ||
          orig.category !== c.category ||
          orig.company !== c.company
        );
      });

    try {
      if (newRows.length > 0) {
        const res = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            listId,
            contacts: newRows,
          }),
        });
        console.log("POST Status:", res.status);
      }

      if (updatedRows.length > 0) {
        const res = await fetch("/api/email", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            listId,
            contacts: updatedRows,
          }),
        });
        console.log("PUT Status:", res.status);
      }

      await fetchContacts();
      showToast("Contacts saved");
    } catch (err) {
      console.error("SAVE ERROR:", err);
      showToast("Failed to save contacts", "error");
    }
  };

  const deleteContact = async (id: string) => {
    if (!id.startsWith('temp-')) {
      try {
        await fetch('/api/email', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [id], listId })
        });
      } catch (e) {}
    }
    setContacts(p => p.filter(c => c.id !== id));
    setOriginalContacts(p => p.filter(c => c.id !== id));
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    const realIds = Array.from(selected).filter(id => !id.startsWith('temp-'));
    if (realIds.length) {
      try {
        await fetch('/api/email', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: realIds, listId })
        });
      } catch (e) {}
    }
    setContacts(p => p.filter(c => !selected.has(c.id)));
    setOriginalContacts(p => p.filter(c => !selected.has(c.id)));
    setSelected(new Set());
    showToast('Selected contacts deleted');
  };

  // ---------- Universal CSV Import ----------
  const resetImportState = () => {
    setImportModalOpen(false);
    setImportStep('mapping');
    setCsvFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setCsvColumns([]);
    setImporting(false);
    setDragOver(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processCsvFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      showToast('Please select a valid CSV file', 'error');
      return;
    }

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0) {
        showToast('CSV has no headers or is empty', 'error');
        return;
      }

      if (rows.length === 0) {
        showToast('CSV has no data rows', 'error');
        return;
      }

      const columns: CsvColumn[] = headers.map((h, idx) => {
        const samples = rows
          .slice(0, 8)
          .map(r => (r[idx] ?? '').trim())
          .filter(Boolean);
        const suggested = suggestMapping(h, samples);
        return {
          index: idx,
          originalName: h,
          normalizedName: normalizeHeader(h),
          mapping: suggested,
          samples,
        };
      });

      // Enforce unique destination mappings
      const used = new Set<CsvMapping>();
      for (const col of columns) {
        if (col.mapping !== 'ignore') {
          if (used.has(col.mapping)) {
            col.mapping = 'ignore';
          } else {
            used.add(col.mapping);
          }
        }
      }

      setCsvFile(file);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setCsvColumns(columns);
      setImportStep('mapping');
      setImportModalOpen(true);
    } catch (err) {
      console.error(err);
      showToast('Failed to parse CSV file', 'error');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processCsvFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processCsvFile(file);
  };

  const updateColumnMapping = (colIndex: number, newMapping: CsvMapping) => {
    setCsvColumns(prev => {
      const next = prev.map(c => ({ ...c }));

      if (newMapping !== 'ignore') {
        for (const c of next) {
          if (c.index !== colIndex && c.mapping === newMapping) {
            c.mapping = 'ignore';
          }
        }
      }

      const target = next.find(c => c.index === colIndex);
      if (target) target.mapping = newMapping;

      return next;
    });
  };

  const buildImportData = useCallback(() => {
    const mappingByIndex: Record<number, CsvMapping> = {};
    csvColumns.forEach(c => {
      mappingByIndex[c.index] = c.mapping;
    });

    const result: {
      contact: { name: string; email: string; phone: string; website: string; category: string; company: string };
      rowIndex: number;
      valid: boolean;
      reason?: string;
    }[] = [];

    const seenEmails = new Set<string>();

    csvRows.forEach((row, rowIdx) => {
      const contact = {
        name: '',
        email: '',
        phone: '',
        website: '',
        category: '',
        company: '',
      };

      for (let i = 0; i < row.length; i++) {
        const map = mappingByIndex[i];
        if (!map || map === 'ignore') continue;
        const val = (row[i] ?? '').trim();
        if (map === 'name') contact.name = val;
        else if (map === 'email') contact.email = val;
        else if (map === 'phone') contact.phone = val;
        else if (map === 'website') contact.website = val;
        else if (map === 'category') contact.category = val;
        else if (map === 'company') contact.company = val;
      }

      if (!contact.email) {
        result.push({ contact, rowIndex: rowIdx + 2, valid: false, reason: 'Missing email' });
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
        result.push({ contact, rowIndex: rowIdx + 2, valid: false, reason: 'Invalid email' });
        return;
      }

      const emailKey = contact.email.toLowerCase();
      if (seenEmails.has(emailKey)) {
        result.push({ contact, rowIndex: rowIdx + 2, valid: false, reason: 'Duplicate email' });
        return;
      }
      seenEmails.add(emailKey);

      result.push({ contact, rowIndex: rowIdx + 2, valid: true });
    });

    return result;
  }, [csvColumns, csvRows]);

  const importStats = useMemo(() => {
    const data = buildImportData();
    const valid = data.filter(d => d.valid);
    const invalid = data.filter(d => !d.valid);
    const duplicates = invalid.filter(d => d.reason === 'Duplicate email').length;
    const otherInvalid = invalid.length - duplicates;

    return {
      total: data.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      duplicates,
      otherInvalid,
      validContacts: valid.map(d => d.contact),
      errors: invalid.map(d => `Row ${d.rowIndex}: ${d.reason}`),
      preview: valid.slice(0, 10).map(d => d.contact),
    };
  }, [buildImportData]);

  const hasEmailMapping = csvColumns.some(c => c.mapping === 'email');

  const handleImportConfirm = async () => {
    if (!hasEmailMapping || importStats.validCount === 0) return;

    setImporting(true);
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          listId,
          contacts: importStats.validContacts,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error ${res.status}`);
      }

      await fetchContacts();
      showToast(`Imported ${importStats.validCount} contacts successfully`);
      resetImportState();
    } catch (err) {
      console.error(err);
      showToast('Import failed. Please try again.', 'error');
    } finally {
      setImporting(false);
    }
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
      headers = ['Name', 'Email', 'Phone', 'Website', 'Company', 'Category'];
      rows = toExport.map(c => `"${c.name}","${c.email}","${c.phone}","${c.website}","${c.company}","${c.category}"`);
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
      if (e.key === 'Escape' && importModalOpen) resetImportState();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredContacts, selected, editing, importModalOpen]);

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const allFilteredSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every(c => selected.has(c.id));
  const someFilteredSelected =
    filteredContacts.some(c => selected.has(c.id)) && !allFilteredSelected;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Contacts</h1>
            <p className="text-zinc-500 text-sm">Enterprise CRM</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-4 py-2.5 border border-zinc-200 hover:bg-white rounded-2xl text-sm font-medium cursor-pointer transition-all active:scale-[0.985]">
              <Upload size={16} /> Import CSV
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>

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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white border border-zinc-200 rounded-3xl p-2 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-md min-w-[200px]">
              <Search className="absolute left-4 top-3.5 text-zinc-400" size={18} />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-zinc-200 pl-11 py-3 rounded-2xl text-sm focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>

            <div className="relative w-56">
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

          <div className="flex items-center gap-2 flex-wrap">
            {/* Dynamic From → To selection */}
            <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-2xl px-2.5 py-1">
              <span className="text-xs text-zinc-500 font-medium pl-1">From</span>
              <input
                type="number"
                min={1}
                value={selectFrom}
                onChange={e => setSelectFrom(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-transparent text-center focus:outline-none text-sm font-medium"
              />
              <span className="text-xs text-zinc-500 font-medium">To</span>
              <input
                type="number"
                min={1}
                value={selectTo}
                onChange={e => setSelectTo(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-transparent text-center focus:outline-none text-sm font-medium"
              />
              <button
                onClick={selectRowRange}
                disabled={filteredContacts.length === 0}
                className="text-xs font-semibold px-3 py-1.5 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Select Rows
              </button>
            </div>

            <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl px-3 py-1">
              <input
                type="number"
                value={bulkRows}
                onChange={e => setBulkRows(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-transparent text-center focus:outline-none text-sm font-medium"
              />
              <button onClick={addBulkRows} className="text-xs font-semibold px-3 py-1.5 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50">
                Add Rows
              </button>
            </div>

            {selected.size > 0 && (
              <button onClick={deleteSelected} className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-2xl text-sm font-medium transition">
                <Trash2 size={16} /> Delete ({selected.size})
              </button>
            )}
          </div>

          <div className="text-sm text-zinc-500 tabular-nums">
            {filteredContacts.length} contacts • {selected.size} selected
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10 border-b border-zinc-200">
              <tr>
                <th className="w-12 p-4">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={el => {
                      if (el) el.indeterminate = someFilteredSelected;
                    }}
                    onChange={() => {
                      if (allFilteredSelected) {
                        setSelected(prev => {
                          const next = new Set(prev);
                          filteredContacts.forEach(c => next.delete(c.id));
                          return next;
                        });
                      } else {
                        setSelected(prev => {
                          const next = new Set(prev);
                          filteredContacts.forEach(c => next.add(c.id));
                          return next;
                        });
                      }
                    }}
                    className="w-4 h-4 accent-blue-600"
                  />
                </th>
                <th className="w-12 p-4 text-left text-xs font-medium text-zinc-500">#</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">NAME</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">EMAIL</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">PHONE</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">WEBSITE</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">COMPANY</th>
                <th className="p-4 text-left text-xs font-medium text-zinc-500">CATEGORY</th>
                <th className="w-20 p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="p-5"><div className="h-4 bg-zinc-100 rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-20 text-center">
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
                        onChange={() => setSelected(prev => {
                          const n = new Set(prev);
                          n.has(contact.id) ? n.delete(contact.id) : n.add(contact.id);
                          return n;
                        })}
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

                    {/* Company */}
                    <td className="p-4">
                      {editing?.id === contact.id && editing.field === 'company' ? (
                        <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} autoFocus className="w-full px-3 py-2.5 border border-blue-500 rounded-xl text-sm focus:outline-none" />
                      ) : (
                        <div onClick={() => startEditing(contact.id, 'company', contact.company)} className="cursor-text min-h-[44px] flex items-center py-1 px-2 rounded-xl hover:bg-white transition">{contact.company || <span className="text-zinc-400 italic">Company name</span>}</div>
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

      {/* ========== IMPORT MODAL ========== */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={resetImportState} />

          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Import Contacts</h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Map your CSV columns to contact fields before importing.
                </p>
              </div>
              <button onClick={resetImportState} className="p-2 hover:bg-zinc-100 rounded-xl transition">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/80">
              <div className="flex items-center gap-3 text-sm">
                <div className={`flex items-center gap-2 ${importStep === 'mapping' ? 'text-blue-600 font-semibold' : 'text-zinc-400'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${importStep === 'mapping' ? 'bg-blue-600 text-white' : 'bg-zinc-200'}`}>1</span>
                  Map Columns
                </div>
                <ArrowRight size={16} className="text-zinc-300" />
                <div className={`flex items-center gap-2 ${importStep === 'preview' ? 'text-blue-600 font-semibold' : 'text-zinc-400'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${importStep === 'preview' ? 'bg-blue-600 text-white' : 'bg-zinc-200'}`}>2</span>
                  Review & Import
                </div>
              </div>
            </div>

            {csvFile && (
              <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-zinc-400" />
                  <span className="font-medium">{csvFile.name}</span>
                  <span className="text-zinc-400">•</span>
                  <span className="text-zinc-500">{csvRows.length.toLocaleString()} rows</span>
                  <span className="text-zinc-400">•</span>
                  <span className="text-zinc-500">{csvHeaders.length} columns</span>
                </div>
                <button
                  onClick={() => {
                    resetImportState();
                    fileInputRef.current?.click();
                  }}
                  className="text-blue-600 hover:underline text-sm font-medium"
                >
                  Choose another file
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {importStep === 'mapping' && (
                <>
                  {!csvFile && (
                    <div
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-12 text-center transition ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-zinc-200'}`}
                    >
                      <Upload size={32} className="mx-auto text-zinc-400 mb-3" />
                      <p className="font-medium">Drop CSV file here</p>
                      <p className="text-sm text-zinc-500 mt-1">or</p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-3 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
                      >
                        Choose File
                      </button>
                    </div>
                  )}

                  {csvColumns.length > 0 && (
                    <div className="space-y-4">
                      <div className="overflow-x-auto rounded-2xl border border-zinc-200">
                        <table className="w-full text-sm">
                          <thead className="bg-zinc-50 border-b border-zinc-200">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium text-zinc-500">CSV Column</th>
                              <th className="px-4 py-3 text-left font-medium text-zinc-500">Sample Data</th>
                              <th className="px-4 py-3 text-left font-medium text-zinc-500 w-48">Import As</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {csvColumns.map(col => (
                              <tr key={col.index} className="hover:bg-zinc-50/50">
                                <td className="px-4 py-3 font-medium">{col.originalName || <span className="text-zinc-400 italic">Empty header</span>}</td>
                                <td className="px-4 py-3 text-zinc-600 max-w-xs truncate">
                                  {col.samples.slice(0, 3).join(' · ') || <span className="text-zinc-400">—</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <select
                                    value={col.mapping}
                                    onChange={e => updateColumnMapping(col.index, e.target.value as CsvMapping)}
                                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-white"
                                  >
                                    {MAPPING_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {!hasEmailMapping && (
                        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
                          <AlertCircle size={18} />
                          Please map a column to <strong>Email</strong> before continuing.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {importStep === 'preview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-zinc-50 rounded-2xl px-4 py-3 border border-zinc-200">
                      <div className="text-2xl font-semibold tabular-nums">{importStats.total}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">Rows found</div>
                    </div>
                    <div className="bg-emerald-50 rounded-2xl px-4 py-3 border border-emerald-200">
                      <div className="text-2xl font-semibold tabular-nums text-emerald-700">{importStats.validCount}</div>
                      <div className="text-xs text-emerald-600 mt-0.5">Valid</div>
                    </div>
                    <div className="bg-amber-50 rounded-2xl px-4 py-3 border border-amber-200">
                      <div className="text-2xl font-semibold tabular-nums text-amber-700">{importStats.otherInvalid}</div>
                      <div className="text-xs text-amber-600 mt-0.5">Invalid</div>
                    </div>
                    <div className="bg-zinc-50 rounded-2xl px-4 py-3 border border-zinc-200">
                      <div className="text-2xl font-semibold tabular-nums">{importStats.duplicates}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">Duplicates removed</div>
                    </div>
                  </div>

                  {importStats.errors.length > 0 && (
                    <details className="bg-zinc-50 border border-zinc-200 rounded-2xl">
                      <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-zinc-700 flex items-center gap-2">
                        <AlertCircle size={16} className="text-amber-600" />
                        {importStats.errors.length} rows skipped
                      </summary>
                      <div className="px-4 pb-3 max-h-40 overflow-y-auto text-sm text-zinc-600 space-y-1">
                        {importStats.errors.slice(0, 50).map((err, i) => (
                          <div key={i}>{err}</div>
                        ))}
                        {importStats.errors.length > 50 && (
                          <div className="text-zinc-400">…and {importStats.errors.length - 50} more</div>
                        )}
                      </div>
                    </details>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-zinc-700">
                        Preview: {importStats.validCount.toLocaleString()} contacts
                      </h3>
                      {importStats.validCount > 10 && (
                        <span className="text-xs text-zinc-400">Showing first 10 of {importStats.validCount.toLocaleString()}</span>
                      )}
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-zinc-200">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-medium text-zinc-500">Name</th>
                            <th className="px-4 py-2.5 text-left font-medium text-zinc-500">Email</th>
                            <th className="px-4 py-2.5 text-left font-medium text-zinc-500">Phone</th>
                            <th className="px-4 py-2.5 text-left font-medium text-zinc-500">Website</th>
                            <th className="px-4 py-2.5 text-left font-medium text-zinc-500">Company</th>
                            <th className="px-4 py-2.5 text-left font-medium text-zinc-500">Category</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {importStats.preview.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                                No valid contacts to preview
                              </td>
                            </tr>
                          ) : (
                            importStats.preview.map((c, i) => (
                              <tr key={i} className="hover:bg-zinc-50/50">
                                <td className="px-4 py-2.5">{c.name || <span className="text-zinc-300">—</span>}</td>
                                <td className="px-4 py-2.5 font-mono text-xs">{c.email}</td>
                                <td className="px-4 py-2.5">{c.phone || <span className="text-zinc-300">—</span>}</td>
                                <td className="px-4 py-2.5">{c.website || <span className="text-zinc-300">—</span>}</td>
                                <td className="px-4 py-2.5">{c.company || <span className="text-zinc-300">—</span>}</td>
                                <td className="px-4 py-2.5">{c.category || <span className="text-zinc-300">—</span>}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {importStats.validCount === 0 && (
                    <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm">
                      <AlertCircle size={18} />
                      No valid contacts to import. Please go back and adjust mappings.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex items-center justify-between gap-3">
              <button
                onClick={resetImportState}
                className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-2xl transition"
              >
                Cancel
              </button>

              <div className="flex items-center gap-3">
                {importStep === 'preview' && (
                  <button
                    onClick={() => setImportStep('mapping')}
                    className="flex items-center gap-2 px-5 py-2.5 border border-zinc-200 rounded-2xl text-sm font-medium hover:bg-white transition"
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                )}

                {importStep === 'mapping' ? (
                  <button
                    onClick={() => setImportStep('preview')}
                    disabled={!hasEmailMapping}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-2xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={handleImportConfirm}
                    disabled={importing || importStats.validCount === 0}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-2xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {importing ? 'Importing…' : `Import ${importStats.validCount} Contacts`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 text-sm px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-4 ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-zinc-900 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}