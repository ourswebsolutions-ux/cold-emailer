"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Play,
    Pause,
    Square,
    RotateCcw,
    Save,
    Mail,
    Server,
    Users,
    Clock,
    Calendar,
    Settings,
    ChevronDown,
    Search,
    CheckSquare,
    Square as SquareIcon,
    Plus,
    Trash2,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Send,
    Eye,
    FileText,
    Zap,
    Ban,
} from "lucide-react";
import type {
    Campaign,
    CampaignStatus,
    CampaignStep,
    ContactRecord,
    CreateCampaignPayload,
    IntervalUnit,
    RecipientStatus,
    SmtpAccount,
    CampaignStats,
} from "@/types/campaign";

import dynamic from "next/dynamic"
import "react-quill-new/dist/quill.snow.css"
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<
    RecipientStatus | CampaignStatus,
    { bg: string; text: string; label: string }
> = {
    DRAFT: { bg: "bg-zinc-100", text: "text-zinc-700", label: "Draft" },
    SCHEDULED: { bg: "bg-blue-50", text: "text-blue-700", label: "Scheduled" },
    RUNNING: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Running" },
    PAUSED: { bg: "bg-amber-50", text: "text-amber-700", label: "Paused" },
    COMPLETED: { bg: "bg-indigo-50", text: "text-indigo-700", label: "Completed" },
    CANCELLED: { bg: "bg-red-50", text: "text-red-700", label: "Cancelled" },
    PENDING: { bg: "bg-zinc-100", text: "text-zinc-600", label: "Pending" },
    SCHEDULED: { bg: "bg-blue-50", text: "text-blue-700", label: "Scheduled" },
    SENDING: { bg: "bg-sky-50", text: "text-sky-700", label: "Sending" },
    SENT: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Sent" },
    FAILED: { bg: "bg-red-50", text: "text-red-700", label: "Failed" },
    COMPLETED: { bg: "bg-indigo-50", text: "text-indigo-700", label: "Completed" },
    PAUSED: { bg: "bg-amber-50", text: "text-amber-700", label: "Paused" },
    SKIPPED: { bg: "bg-zinc-100", text: "text-zinc-500", label: "Skipped" },
};

function StatusBadge({ status }: { status: RecipientStatus | CampaignStatus }) {
    const cfg = STATUS_BADGE[status] || {
        bg: "bg-zinc-100",
        text: "text-zinc-600",
        label: status,
    };
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
        >
            {cfg.label}
        </span>
    );
}

function formatDate(iso?: string | null) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "—";
    }
}

function replaceVariables(
    text: string,
    data: { name?: string | null; email?: string; company?: string | null; website?: string | null }
) {
    return text
        .replace(/\{name\}/gi, data.name || "there")
        .replace(/\{email\}/gi, data.email || "")
        .replace(/\{company\}/gi, data.company || "your company")
        .replace(/\{website\}/gi, data.website || "");
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
const ReactQuill = dynamic(() => import("react-quill-new"), {
    ssr: false,
})

const quillModules = {
    toolbar: [
        [{ font: [] }],
        [{ size: ["small", false, "large", "huge"] }],
        ["bold", "italic", "underline", "strike"],
        [{ color: [] }, { background: [] }],
        [{ align: [] }],
        [{ list: "ordered" }, { list: "bullet" }],
        ["blockquote", "link"],
        ["clean"],
    ],
}

const quillFormats = [
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "align",
    "list",
    "blockquote",
    "link",
]

export default function CampaignPage() {
    // ---- Data ----
    const [smtpAccounts, setSmtpAccounts] = useState<SmtpAccount[]>([]);
    const [contacts, setContacts] = useState<ContactRecord[]>([]);
    const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; body: string }[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

    // ---- UI state ----
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

    // ---- Form state ----
    const [campaignName, setCampaignName] = useState("My Follow-Up Campaign");
    const [selectedSmtpId, setSelectedSmtpId] = useState<string>("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [greetingEnabled, setGreetingEnabled] = useState(true);
    const [spinTextEnabled, setSpinTextEnabled] = useState(false);
    const [intervalValue, setIntervalValue] = useState(30);
    const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("minutes");
    const [dailyLimit, setDailyLimit] = useState(50);
    const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
    const [scheduledAt, setScheduledAt] = useState("");
    const [timezone, setTimezone] = useState(
        typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"
    );
    const [steps, setSteps] = useState<CampaignStep[]>([
        { stepNumber: 1, subject: "", body: "", delayDays: 1, enabled: true },
    ]);

    // ---- Recipients selection ----
    const [search, setSearch] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // ---- Composer focus helpers ----
    const subjectRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);
    const [activeField, setActiveField] = useState<"subject" | "body">("body");

    // ---- Preview ----
    const previewRecipient = useMemo(() => {
        if (selectedIds.size === 0) {
            return { name: "John Doe", email: "john@example.com", company: "Acme Inc", website: "https://acme.com" };
        }
        const first = contacts.find((c) => selectedIds.has(c.id));
        return first || { name: "John Doe", email: "john@example.com", company: "Acme Inc", website: "https://acme.com" };
    }, [selectedIds, contacts]);

    const previewSubject = replaceVariables(subject || steps[0]?.subject || "", previewRecipient);
    const previewBody = replaceVariables(body || steps[0]?.body || "", previewRecipient);

    // ---------------------------------------------------------------------------
    // Data loading
    // ---------------------------------------------------------------------------

    const showToast = useCallback((type: "success" | "error", message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const loadSmtpAccounts = useCallback(async () => {
        try {
            // Reuse existing SMTP source – common patterns in this architecture
            const res = await fetch("/api/config?list=1").catch(() => null);
            if (res?.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : data.accounts || data.smtpConfigs || data.data || [];
                setSmtpAccounts(
                    list.map((a: any) => ({
                        id: a.id,
                        name: a.name || a.fromName || a.label,
                        email: a.email || a.from || a.username || a.user,
                        host: a.host || a.smtpHost,
                        port: a.port || a.smtpPort || 587,
                        username: a.username || a.user || a.email,
                        fromName: a.fromName || a.name,
                        isActive: a.isActive !== false,
                        lastTestedAt: a.lastTestedAt,
                    }))
                );
                return;
            }
            // Fallback: try follow-up campaigns route which may embed smtp info
            const res2 = await fetch("/api/follow-up/campaigns?include=smtp");
            if (res2.ok) {
                const data = await res2.json();
                // If the API returns smtp configs nested, extract unique ones
                const configs = data.smtpConfigs || data.accounts || [];
                if (configs.length) {
                    setSmtpAccounts(configs);
                    return;
                }
            }
            // Last resort – empty (user will see empty state)
            setSmtpAccounts([]);
        } catch (e) {
            console.error("Failed to load SMTP accounts", e);
            setSmtpAccounts([]);
        }
    }, []);

    const loadContacts = useCallback(async () => {
        try {
            const res = await fetch("/api/email");
            if (!res.ok) throw new Error("Failed to load contacts");
            const data = await res.json();
            // Support multiple response shapes used by existing /api/email
            const list = Array.isArray(data)
                ? data
                : data.emails || data.contacts || data.data || data.records || [];
            setContacts(
                list.map((c: any, idx: number) => ({
                    id: c.id || c._id || String(idx),
                    name: c.name || c.fullName || c.firstName || null,
                    email: c.email || c.address,
                    company: c.company || c.organization || null,
                    website: c.website || c.url || null,
                    status: c.status || null,
                    createdAt: c.createdAt,
                }))
            );
        } catch (e) {
            console.error("Failed to load contacts", e);
            setContacts([]);
        }
    }, []);

    const loadTemplates = useCallback(async () => {
        try {
            const res = await fetch("/api/email-templates");
            if (!res.ok) return;
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.templates || data.data || [];
            setTemplates(
                list.map((t: any) => ({
                    id: t.id,
                    name: t.name || t.title || "Untitled",
                    subject: t.subject || "",
                    body: t.body || t.html || t.content || "",
                }))
            );
        } catch {
            /* optional */
        }
    }, []);

    const loadCampaigns = useCallback(async () => {
        try {
            const res = await fetch("/api/follow-up/campaigns");
            if (!res.ok) return;
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.campaigns || data.data || [];
            setCampaigns(list);
            // If a running campaign exists, set it as active for monitoring
            const running = list.find((c: Campaign) => c.status === "RUNNING" || c.status === "PAUSED");
            if (running) setActiveCampaign(running);
        } catch (e) {
            console.error("Failed to load campaigns", e);
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await Promise.all([loadSmtpAccounts(), loadContacts(), loadTemplates(), loadCampaigns()]);
            setLoading(false);
        })();
    }, [loadSmtpAccounts, loadContacts, loadTemplates, loadCampaigns]);

    // Poll active campaign for live progress
    useEffect(() => {
        if (!activeCampaign || (activeCampaign.status !== "RUNNING" && activeCampaign.status !== "PAUSED")) {
            return;
        }
        const id = setInterval(async () => {
            try {
                const res = await fetch(`/api/follow-up/campaigns?id=${activeCampaign.id}`);
                if (res.ok) {
                    const data = await res.json();
                    const camp = data.campaign || data;
                    if (camp) setActiveCampaign(camp);
                }
            } catch {
                /* ignore */
            }
        }, 5000);
        return () => clearInterval(id);
    }, [activeCampaign?.id, activeCampaign?.status]);

    // ---------------------------------------------------------------------------
    // Selection helpers
    // ---------------------------------------------------------------------------

    const filteredContacts = useMemo(() => {
        let list = contacts;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(
                (c) =>
                    (c.name || "").toLowerCase().includes(q) ||
                    c.email.toLowerCase().includes(q) ||
                    (c.company || "").toLowerCase().includes(q)
            );
        }
        return list;
    }, [contacts, search]);

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllVisible = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            filteredContacts.forEach((c) => next.add(c.id));
            return next;
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    // ---------------------------------------------------------------------------
    // Variables insertion
    // ---------------------------------------------------------------------------

    const insertVariable = (variable: string) => {
        const token = `{${variable}}`;
        if (activeField === "subject" && subjectRef.current) {
            const el = subjectRef.current;
            const start = el.selectionStart ?? subject.length;
            const end = el.selectionEnd ?? subject.length;
            const next = subject.slice(0, start) + token + subject.slice(end);
            setSubject(next);
            setTimeout(() => {
                el.focus();
                el.setSelectionRange(start + token.length, start + token.length);
            }, 0);
        } else if (bodyRef.current) {
            const el = bodyRef.current;
            const start = el.selectionStart ?? body.length;
            const end = el.selectionEnd ?? body.length;
            const next = body.slice(0, start) + token + body.slice(end);
            setBody(next);
            setTimeout(() => {
                el.focus();
                el.setSelectionRange(start + token.length, start + token.length);
            }, 0);
        }
    };

    // ---------------------------------------------------------------------------
    // Follow-up steps
    // ---------------------------------------------------------------------------

    const addStep = () => {
        setSteps((prev) => [
            ...prev,
            {
                stepNumber: prev.length + 1,
                subject: "",
                body: "",
                delayDays: 1,
                enabled: true,
            },
        ]);
    };

    const updateStep = (index: number, patch: Partial<CampaignStep>) => {
        setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    };

    const removeStep = (index: number) => {
        if (steps.length <= 1) return;
        setSteps((prev) =>
            prev
                .filter((_, i) => i !== index)
                .map((s, i) => ({ ...s, stepNumber: i + 1 }))
        );
    };

    // ---------------------------------------------------------------------------
    // Template load
    // ---------------------------------------------------------------------------

    const applyTemplate = (templateId: string) => {
        const t = templates.find((x) => x.id === templateId);
        if (!t) return;
        setSubject(t.subject);
        setBody(t.body);
        if (steps[0]) {
            updateStep(0, { subject: t.subject, body: t.body });
        }
    };

    // ---------------------------------------------------------------------------
    // CSV import
    // ---------------------------------------------------------------------------

    const handleCsvImport = async (file: File) => {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
            showToast("error", "CSV appears empty or invalid");
            return;
        }
        const headers = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
        const emailIdx = headers.findIndex((h) => h.includes("email"));
        const nameIdx = headers.findIndex((h) => h.includes("name"));
        const companyIdx = headers.findIndex((h) => h.includes("company") || h.includes("organization"));
        const websiteIdx = headers.findIndex((h) => h.includes("website") || h.includes("url"));

        if (emailIdx === -1) {
            showToast("error", "CSV must contain an email column");
            return;
        }

        let imported = 0;
        let skipped = 0;
        let duplicates = 0;
        let invalid = 0;
        const existingEmails = new Set(contacts.map((c) => c.email.toLowerCase()));
        const newContacts: ContactRecord[] = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
            const email = (cols[emailIdx] || "").toLowerCase();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                invalid++;
                continue;
            }
            if (existingEmails.has(email)) {
                duplicates++;
                continue;
            }
            existingEmails.add(email);
            newContacts.push({
                id: `import-${Date.now()}-${i}`,
                email,
                name: nameIdx >= 0 ? cols[nameIdx] : null,
                company: companyIdx >= 0 ? cols[companyIdx] : null,
                website: websiteIdx >= 0 ? cols[websiteIdx] : null,
            });
            imported++;
        }

        // Persist via existing email API if possible
        if (newContacts.length > 0) {
            try {
                await fetch("/api/email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ emails: newContacts }),
                });
                await loadContacts();
            } catch {
                // Still add locally so user can select them for this campaign
                setContacts((prev) => [...prev, ...newContacts]);
            }
        }

        showToast(
            "success",
            `Imported: ${imported} · Skipped: ${skipped} · Duplicates: ${duplicates} · Invalid: ${invalid}`
        );
    };

    // ---------------------------------------------------------------------------
    // Validation & actions
    // ---------------------------------------------------------------------------

    const validate = (): string | null => {
        if (!campaignName.trim()) return "Campaign name is required";
        if (!selectedSmtpId) return "Please select an SMTP sender account";
        if (selectedIds.size === 0) return "Select at least one recipient";
        if (!subject.trim() && !steps[0]?.subject?.trim()) return "Subject is required";
        if (!body.trim() && !steps[0]?.body?.trim()) return "Email body is required";
        if (dailyLimit < 1) return "Daily limit must be at least 1";
        if (intervalValue < 0) return "Interval must be ≥ 0";
        if (scheduleMode === "later" && !scheduledAt) return "Please choose a schedule date/time";
        return null;
    };

    const buildPayload = (): CreateCampaignPayload => {
        const finalSubject = subject || steps[0]?.subject || "";
        const finalBody = body || steps[0]?.body || "";
        const normalizedSteps =
            steps.length > 0
                ? steps.map((s, i) => ({
                    stepNumber: i + 1,
                    subject: i === 0 ? finalSubject : s.subject,
                    body: i === 0 ? finalBody : s.body,
                    delayDays: s.delayDays,
                    delayHours: s.delayHours,
                    enabled: s.enabled,
                }))
                : [
                    {
                        stepNumber: 1,
                        subject: finalSubject,
                        body: finalBody,
                        delayDays: 1,
                        enabled: true,
                    },
                ];

        return {
            name: campaignName.trim(),
            campaignType: "EMAIL",
            smtpConfigId: selectedSmtpId,
            subject: finalSubject,
            body: finalBody,
            greetingEnabled,
            spinTextEnabled,
            intervalValue,
            intervalUnit,
            dailyLimit,
            scheduledAt: scheduleMode === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
            timezone,
            steps: normalizedSteps,
            recipientEmailIds: Array.from(selectedIds),
        };
    };

    const handleSave = async () => {
        const err = validate();
        if (err) {
            setError(err);
            showToast("error", err);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const payload = buildPayload();
            const res = await fetch("/api/follow-up/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...payload, status: "DRAFT" }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || errData.message || "Failed to save campaign");
            }
            const data = await res.json();
            const camp = data.campaign || data;
            setActiveCampaign(camp);
            await loadCampaigns();
            showToast("success", "Campaign saved as draft");
        } catch (e: any) {
            setError(e.message);
            showToast("error", e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleStart = async () => {
        const err = validate();
        if (err) {
            setError(err);
            showToast("error", err);
            return;
        }
        setStarting(true);
        setError(null);
        try {
            const payload = buildPayload();
            // Create then start
            const createRes = await fetch("/api/follow-up/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payload,
                    status: scheduleMode === "later" ? "SCHEDULED" : "RUNNING",
                }),
            });
            if (!createRes.ok) {
                const errData = await createRes.json().catch(() => ({}));
                throw new Error(errData.error || errData.message || "Failed to create campaign");
            }
            const data = await createRes.json();
            const camp = data.campaign || data;

            // Explicit start if needed
            if (camp.id && camp.status !== "RUNNING" && scheduleMode === "now") {
                await fetch(`/api/follow-up/campaigns`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: camp.id, status: "RUNNING" }),
                });
            }

            setActiveCampaign({ ...camp, status: scheduleMode === "later" ? "SCHEDULED" : "RUNNING" });
            await loadCampaigns();
            showToast("success", scheduleMode === "later" ? "Campaign scheduled" : "Campaign started");
        } catch (e: any) {
            setError(e.message);
            showToast("error", e.message);
        } finally {
            setStarting(false);
        }
    };

    const handleStatusChange = async (status: "PAUSED" | "RUNNING" | "CANCELLED") => {
        if (!activeCampaign?.id) return;
        try {
            const res = await fetch("/api/follow-up/campaigns", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: activeCampaign.id, status }),
            });
            if (!res.ok) throw new Error("Failed to update campaign status");
            const data = await res.json();
            setActiveCampaign(data.campaign || { ...activeCampaign, status });
            showToast("success", `Campaign ${status.toLowerCase()}`);
        } catch (e: any) {
            showToast("error", e.message);
        }
    };

    const handleRetryFailed = async () => {
        if (!activeCampaign?.id) return;
        try {
            const res = await fetch("/api/follow-up/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "retryFailed", campaignId: activeCampaign.id }),
            });
            if (!res.ok) throw new Error("Retry failed");
            showToast("success", "Failed recipients queued for retry");
            // refresh
            const refresh = await fetch(`/api/follow-up/campaigns?id=${activeCampaign.id}`);
            if (refresh.ok) {
                const data = await refresh.json();
                setActiveCampaign(data.campaign || data);
            }
        } catch (e: any) {
            showToast("error", e.message);
        }
    };

    // ---------------------------------------------------------------------------
    // Derived stats
    // ---------------------------------------------------------------------------

    const stats: CampaignStats = activeCampaign?.stats || {
        total: selectedIds.size,
        sent: 0,
        pending: selectedIds.size,
        sending: 0,
        failed: 0,
        completed: 0,
        remaining: selectedIds.size,
        todaySent: 0,
        dailyLimit,
        dailyRemaining: dailyLimit,
    };

    const progressPct =
        stats.total > 0 ? Math.round(((stats.sent + stats.completed) / stats.total) * 100) : 0;

    const selectedSmtp = smtpAccounts.find((a) => a.id === selectedSmtpId);

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-50 p-6">
                <div className="mx-auto max-w-7xl space-y-6">
                    <div className="h-10 w-64 animate-pulse rounded-lg bg-zinc-200" />
                    <div className="grid gap-6 lg:grid-cols-3">
                        <div className="h-40 animate-pulse rounded-xl bg-zinc-200 lg:col-span-2" />
                        <div className="h-40 animate-pulse rounded-xl bg-zinc-200" />
                    </div>
                    <div className="h-96 animate-pulse rounded-xl bg-zinc-200" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50/80">
            {/* Toast */}
            {toast && (
                <div
                    className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${toast.type === "success"
                        ? "bg-emerald-600 text-white"
                        : "bg-red-600 text-white"
                        }`}
                >
                    {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {toast.message}
                </div>
            )}

            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {/* ========== HEADER ========== */}
                <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-zinc-200 bg-white/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                                <Send className="h-5 w-5" />
                            </div>
                            <div>
                                <input
                                    value={campaignName}
                                    onChange={(e) => setCampaignName(e.target.value)}
                                    className="border-0 bg-transparent text-xl font-semibold text-zinc-900 outline-none focus:ring-0"
                                    placeholder="Campaign name"
                                />
                                <div className="mt-0.5 flex items-center gap-2 text-sm text-zinc-500">
                                    {activeCampaign ? (
                                        <StatusBadge status={activeCampaign.status} />
                                    ) : (
                                        <span className="text-zinc-400">New campaign</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={handleSave}
                                disabled={saving || starting}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save
                            </button>

                            {(!activeCampaign || activeCampaign.status === "DRAFT" || activeCampaign.status === "SCHEDULED") && (
                                <button
                                    onClick={handleStart}
                                    disabled={starting || saving}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                    Start Campaign
                                </button>
                            )}

                            {activeCampaign?.status === "RUNNING" && (
                                <button
                                    onClick={() => handleStatusChange("PAUSED")}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                                >
                                    <Pause className="h-4 w-4" />
                                    Pause
                                </button>
                            )}

                            {activeCampaign?.status === "PAUSED" && (
                                <button
                                    onClick={() => handleStatusChange("RUNNING")}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                                >
                                    <Play className="h-4 w-4" />
                                    Resume
                                </button>
                            )}

                            {activeCampaign &&
                                (activeCampaign.status === "RUNNING" || activeCampaign.status === "PAUSED") && (
                                    <button
                                        onClick={() => handleStatusChange("CANCELLED")}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                                    >
                                        <Square className="h-4 w-4" />
                                        Stop
                                    </button>
                                )}

                            {activeCampaign && stats.failed > 0 && (
                                <button
                                    onClick={handleRetryFailed}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    Retry Failed
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        {error}
                    </div>
                )}

                {/* ========== STATS CARDS ========== */}
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                        { label: "Total", value: stats.total, color: "text-zinc-900" },
                        { label: "Sent", value: stats.sent, color: "text-emerald-600" },
                        { label: "Pending", value: stats.pending, color: "text-zinc-600" },
                        { label: "Failed", value: stats.failed, color: "text-red-600" },
                        { label: "Completed", value: stats.completed, color: "text-indigo-600" },
                        {
                            label: "Today",
                            value: `${stats.todaySent} / ${stats.dailyLimit}`,
                            color: "text-blue-600",
                        },
                    ].map((s) => (
                        <div
                            key={s.label}
                            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                        >
                            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                                {s.label}
                            </div>
                            <div className={`mt-1 text-2xl font-semibold tabular-nums ${s.color}`}>
                                {s.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Progress bar */}
                {(activeCampaign || selectedIds.size > 0) && (
                    <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                        <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="font-medium text-zinc-700">
                                Progress · {stats.sent + stats.completed} / {stats.total} sent
                            </span>
                            <span className="tabular-nums text-zinc-500">{progressPct}%</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
                            <div
                                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-5">
                    {/* ========== LEFT COLUMN ========== */}
                    <div className="space-y-6 lg:col-span-3">
                        {/* SMTP Sender */}
                        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                            <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3.5">
                                <Server className="h-4 w-4 text-zinc-500" />
                                <h2 className="text-sm font-semibold text-zinc-900">Sender Account (SMTP)</h2>
                            </div>
                            <div className="p-5">
                                {smtpAccounts.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                                        No SMTP accounts found. Add an SMTP configuration in your settings first.
                                    </div>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {smtpAccounts.map((acc) => {
                                            const selected = selectedSmtpId === acc.id;
                                            return (
                                                <button
                                                    key={acc.id}
                                                    type="button"
                                                    onClick={() => setSelectedSmtpId(acc.id)}
                                                    className={`rounded-lg border p-4 text-left transition ${selected
                                                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20"
                                                        : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                                                        }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="truncate font-medium text-zinc-900">
                                                                {acc.name || acc.fromName || acc.email}
                                                            </div>
                                                            <div className="mt-0.5 truncate text-sm text-zinc-500">
                                                                {acc.email}
                                                            </div>
                                                            <div className="mt-1 text-xs text-zinc-400">
                                                                {acc.host}:{acc.port}
                                                            </div>
                                                        </div>
                                                        {selected && (
                                                            <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" />
                                                        )}
                                                    </div>
                                                    <div className="mt-2 flex items-center gap-1.5 text-xs">
                                                        <span
                                                            className={`inline-block h-1.5 w-1.5 rounded-full ${acc.isActive !== false ? "bg-emerald-500" : "bg-zinc-300"
                                                                }`}
                                                        />
                                                        {acc.isActive !== false ? "Connected" : "Inactive"}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Email Composer */}
                        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-zinc-500" />
                                    <h2 className="text-sm font-semibold text-zinc-900">Email Content</h2>
                                </div>
                                {templates.length > 0 && (
                                    <select
                                        className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700"
                                        onChange={(e) => e.target.value && applyTemplate(e.target.value)}
                                        defaultValue=""
                                    >
                                        <option value="">Load template…</option>
                                        {templates.map((t) => (
                                            <option key={t.id} value={t.id}>
                                                {t.subject || t.name || "Untitled template"}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="space-y-4 p-5">
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-zinc-600">
                                        Subject
                                    </label>
                                    <input
                                        ref={subjectRef}
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        onFocus={() => setActiveField("subject")}
                                        placeholder="Quick follow-up for {company}"
                                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-zinc-600">
                                        Body
                                    </label>
                                    <div className="border rounded-lg overflow-hidden">
                                        <ReactQuill
                                            theme="snow"
                                            value={body}
                                            onChange={setBody}
                                            modules={quillModules}
                                            formats={quillFormats}
                                            placeholder="Use {{name}} for recipient name token. Use {{greeting}} when Spin Text is on."
                                            style={{ height: "250px", marginBottom: "42px" }}
                                        />
                                    </div>
                                </div>

                                {/* Variables */}
                                <div>
                                    <div className="mb-1.5 text-xs font-medium text-zinc-600">
                                        Variables (click to insert)
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {["name", "email", "company", "website"].map((v) => (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => insertVariable(v)}
                                                className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-xs text-zinc-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                            >
                                                {`{${v}}`}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Greeting + Spin */}
                                <div className="flex flex-wrap gap-4">
                                    <label className="flex items-center gap-2 text-sm text-zinc-700">
                                        <input
                                            type="checkbox"
                                            checked={greetingEnabled}
                                            onChange={(e) => setGreetingEnabled(e.target.checked)}
                                            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        Greeting personalization
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-zinc-700">
                                        <input
                                            type="checkbox"
                                            checked={spinTextEnabled}
                                            onChange={(e) => setSpinTextEnabled(e.target.checked)}
                                            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        Spin text{" "}
                                        <span className="text-xs text-zinc-400">
                                            ({`{Hi|Hello|Hey}`} supported)
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </section>

                        {/* Sending Rules */}
                        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                            <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3.5">
                                <Clock className="h-4 w-4 text-zinc-500" />
                                <h2 className="text-sm font-semibold text-zinc-900">Sending Rules</h2>
                            </div>
                            <div className="grid gap-5 p-5 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-zinc-600">
                                        Delay between emails
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            min={0}
                                            value={intervalValue}
                                            onChange={(e) => setIntervalValue(Math.max(0, Number(e.target.value) || 0))}
                                            className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                        />
                                        <select
                                            value={intervalUnit}
                                            onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                                            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                        >
                                            <option value="seconds">Seconds</option>
                                            <option value="minutes">Minutes</option>
                                            <option value="hours">Hours</option>
                                            <option value="days">Days</option>
                                        </select>
                                    </div>
                                    <p className="mt-1.5 text-xs text-zinc-400">
                                        e.g. 30 minutes → email 2 waits 30m after email 1
                                    </p>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-zinc-600">
                                        Daily sending limit
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={dailyLimit}
                                        onChange={(e) => setDailyLimit(Math.max(1, Number(e.target.value) || 1))}
                                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
                                    <p className="mt-1.5 text-xs text-zinc-400">
                                        Max emails per day. Remaining recipients continue tomorrow.
                                    </p>
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="mb-1.5 block text-xs font-medium text-zinc-600">
                                        Schedule
                                    </label>
                                    <div className="flex flex-wrap items-center gap-4">
                                        <label className="flex items-center gap-2 text-sm">
                                            <input
                                                type="radio"
                                                checked={scheduleMode === "now"}
                                                onChange={() => setScheduleMode("now")}
                                                className="text-blue-600"
                                            />
                                            Start immediately
                                        </label>
                                        <label className="flex items-center gap-2 text-sm">
                                            <input
                                                type="radio"
                                                checked={scheduleMode === "later"}
                                                onChange={() => setScheduleMode("later")}
                                                className="text-blue-600"
                                            />
                                            Schedule for later
                                        </label>
                                    </div>
                                    {scheduleMode === "later" && (
                                        <div className="mt-3 flex flex-wrap gap-3">
                                            <input
                                                type="datetime-local"
                                                value={scheduledAt}
                                                onChange={(e) => setScheduledAt(e.target.value)}
                                                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                            />
                                            <input
                                                value={timezone}
                                                onChange={(e) => setTimezone(e.target.value)}
                                                placeholder="Timezone"
                                                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* Follow-up Steps */}
                        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-zinc-500" />
                                    <h2 className="text-sm font-semibold text-zinc-900">Follow-up Steps</h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={addStep}
                                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add Step
                                </button>
                            </div>
                            <div className="divide-y divide-zinc-100">
                                {steps.map((step, idx) => (
                                    <div key={idx} className="space-y-3 p-5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                                                    {step.stepNumber}
                                                </span>
                                                <label className="flex items-center gap-2 text-sm text-zinc-600">
                                                    <input
                                                        type="checkbox"
                                                        checked={step.enabled}
                                                        onChange={(e) => updateStep(idx, { enabled: e.target.checked })}
                                                        className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600"
                                                    />
                                                    Enabled
                                                </label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {idx > 0 && (
                                                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                                        Delay
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={step.delayDays}
                                                            onChange={(e) =>
                                                                updateStep(idx, { delayDays: Number(e.target.value) || 0 })
                                                            }
                                                            className="w-14 rounded border border-zinc-200 px-1.5 py-0.5 text-center text-xs"
                                                        />
                                                        days
                                                    </div>
                                                )}
                                                {steps.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeStep(idx)}
                                                        className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {idx === 0 ? (
                                            <p className="text-xs text-zinc-400">
                                                Uses the main subject & body above. Additional steps can override.
                                            </p>
                                        ) : (
                                            <>
                                                <input
                                                    value={step.subject}
                                                    onChange={(e) => updateStep(idx, { subject: e.target.value })}
                                                    placeholder="Follow-up subject"
                                                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                                />
                                                <textarea
                                                    value={step.body}
                                                    onChange={(e) => updateStep(idx, { body: e.target.value })}
                                                    rows={4}
                                                    placeholder="Follow-up body…"
                                                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                                />
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* ========== RIGHT COLUMN ========== */}
                    <div className="space-y-6 lg:col-span-2">
                        {/* Live Preview */}
                        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                            <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3.5">
                                <Eye className="h-4 w-4 text-zinc-500" />
                                <h2 className="text-sm font-semibold text-zinc-900">Preview</h2>
                            </div>
                            <div className="p-5">
                                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                                    <div className="mb-2 text-xs text-zinc-500">
                                        <span className="font-medium text-zinc-700">From:</span>{" "}
                                        {selectedSmtp?.email || "—"}
                                    </div>
                                    <div className="mb-2 text-xs text-zinc-500">
                                        <span className="font-medium text-zinc-700">To:</span>{" "}
                                        {previewRecipient.email}
                                    </div>
                                    <div className="mb-3 border-b border-zinc-200 pb-2 font-medium text-zinc-900">
                                        {previewSubject || "(no subject)"}
                                    </div>
                                    <div
  className="ql-editor !p-0 max-w-full overflow-hidden text-zinc-700"
  style={{
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  }}
  dangerouslySetInnerHTML={{
    __html: previewBody || "<p>(empty body)</p>",
  }}
/>
                                </div>
                            </div>
                        </section>

                        {/* Summary */}
                        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                            <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3.5">
                                <Settings className="h-4 w-4 text-zinc-500" />
                                <h2 className="text-sm font-semibold text-zinc-900">Campaign Summary</h2>
                            </div>
                            <dl className="space-y-3 p-5 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-zinc-500">Recipients</dt>
                                    <dd className="font-medium text-zinc-900">{selectedIds.size}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-zinc-500">Sender</dt>
                                    <dd className="truncate font-medium text-zinc-900">
                                        {selectedSmtp?.email || "—"}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-zinc-500">Interval</dt>
                                    <dd className="font-medium text-zinc-900">
                                        {intervalValue} {intervalUnit}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-zinc-500">Daily limit</dt>
                                    <dd className="font-medium text-zinc-900">{dailyLimit}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-zinc-500">Steps</dt>
                                    <dd className="font-medium text-zinc-900">
                                        {steps.filter((s) => s.enabled).length}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-zinc-500">Schedule</dt>
                                    <dd className="font-medium text-zinc-900">
                                        {scheduleMode === "now" ? "Immediate" : scheduledAt || "—"}
                                    </dd>
                                </div>
                            </dl>
                        </section>

                        {/* Campaign History */}
                        {campaigns.length > 0 && (
                            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                                <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3.5">
                                    <FileText className="h-4 w-4 text-zinc-500" />
                                    <h2 className="text-sm font-semibold text-zinc-900">Recent Campaigns</h2>
                                </div>
                                <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto">
                                    {campaigns.slice(0, 8).map((c) => (
                                        <li key={c.id}>
                                            <button
                                                type="button"
                                                onClick={() => setActiveCampaign(c)}
                                                className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-zinc-50"
                                            >
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-medium text-zinc-900">
                                                        {c.name}
                                                    </div>
                                                    <div className="text-xs text-zinc-500">
                                                        {formatDate(c.createdAt)}
                                                    </div>
                                                </div>
                                                <StatusBadge status={c.status} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </div>
                </div>

                {/* ========== RECIPIENTS TABLE ========== */}
                <section className="mt-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-zinc-500" />
                            <h2 className="text-sm font-semibold text-zinc-900">Recipients</h2>
                            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                                {selectedIds.size} selected
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search name, email, company…"
                                    className="w-56 rounded-lg border border-zinc-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-blue-500"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={selectAllVisible}
                                className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                                Select all
                            </button>
                            <button
                                type="button"
                                onClick={clearSelection}
                                className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                                Clear
                            </button>
                            <label className="cursor-pointer rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                                Import CSV
                                <input
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleCsvImport(f);
                                        e.target.value = "";
                                    }}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-medium uppercase tracking-wide text-zinc-500">
                                    <th className="w-10 px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={
                                                filteredContacts.length > 0 &&
                                                filteredContacts.every((c) => selectedIds.has(c.id))
                                            }
                                            onChange={(e) =>
                                                e.target.checked ? selectAllVisible() : clearSelection()
                                            }
                                            className="h-4 w-4 rounded border-zinc-300 text-blue-600"
                                        />
                                    </th>
                                    <th className="px-3 py-3">#</th>
                                    <th className="px-3 py-3">Name</th>
                                    <th className="px-3 py-3">Email</th>
                                    <th className="px-3 py-3">Company</th>
                                    <th className="px-3 py-3">Website</th>
                                    <th className="px-3 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {filteredContacts.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">
                                            {contacts.length === 0
                                                ? "No contacts found. Import a CSV or add contacts via the existing email system."
                                                : "No contacts match your search."}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredContacts.map((c, idx) => {
                                        const selected = selectedIds.has(c.id);
                                        // If we have an active campaign, try to show live recipient status
                                        const live =
                                            activeCampaign?.recipients?.find(
                                                (r) => r.email === c.email || r.contactId === c.id
                                            ) || null;
                                        return (
                                            <tr
                                                key={c.id}
                                                className={`hover:bg-zinc-50/80 ${selected ? "bg-blue-50/40" : ""}`}
                                            >
                                                <td className="px-4 py-2.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        onChange={() => toggleSelect(c.id)}
                                                        className="h-4 w-4 rounded border-zinc-300 text-blue-600"
                                                    />
                                                </td>
                                                <td className="px-3 py-2.5 tabular-nums text-zinc-400">{idx + 1}</td>
                                                <td className="px-3 py-2.5 font-medium text-zinc-900">
                                                    {c.name || "—"}
                                                </td>
                                                <td className="px-3 py-2.5 text-zinc-700">{c.email}</td>
                                                <td className="px-3 py-2.5 text-zinc-600">{c.company || "—"}</td>
                                                <td className="max-w-[140px] truncate px-3 py-2.5 text-zinc-500">
                                                    {c.website || "—"}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    {live ? (
                                                        <div className="space-y-0.5">
                                                            <StatusBadge status={live.status} />
                                                            {live.error && (
                                                                <div className="max-w-[180px] truncate text-xs text-red-600" title={live.error}>
                                                                    {live.error}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-zinc-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ========== LIVE RECIPIENT STATUS (when campaign active) ========== */}
                {activeCampaign?.recipients && activeCampaign.recipients.length > 0 && (
                    <section className="mt-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
                        <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3.5">
                            <Send className="h-4 w-4 text-zinc-500" />
                            <h2 className="text-sm font-semibold text-zinc-900">
                                Campaign Recipient Status
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-medium uppercase tracking-wide text-zinc-500">
                                        <th className="px-4 py-3">#</th>
                                        <th className="px-3 py-3">Name</th>
                                        <th className="px-3 py-3">Email</th>
                                        <th className="px-3 py-3">Step</th>
                                        <th className="px-3 py-3">Status</th>
                                        <th className="px-3 py-3">Sent At</th>
                                        <th className="px-3 py-3">Next Send</th>
                                        <th className="px-3 py-3">Error</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                    {activeCampaign.recipients.map((r, idx) => (
                                        <tr key={r.id} className="hover:bg-zinc-50/80">
                                            <td className="px-4 py-2.5 tabular-nums text-zinc-400">{idx + 1}</td>
                                            <td className="px-3 py-2.5 font-medium text-zinc-900">
                                                {r.name || "—"}
                                            </td>
                                            <td className="px-3 py-2.5 text-zinc-700">{r.email}</td>
                                            <td className="px-3 py-2.5 text-zinc-600">Step {r.currentStep}</td>
                                            <td className="px-3 py-2.5">
                                                <StatusBadge status={r.status} />
                                            </td>
                                            <td className="px-3 py-2.5 text-zinc-500">{formatDate(r.sentAt)}</td>
                                            <td className="px-3 py-2.5 text-zinc-500">
                                                {formatDate(r.nextSendAt)}
                                            </td>
                                            <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-red-600" title={r.error || undefined}>
                                                {r.error || "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}