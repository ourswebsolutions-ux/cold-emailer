"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Plus,
  Search,
  MoreHorizontal,
  Play,
  Pause,
  Square,
  Trash2,
  Eye,
  Copy,
  X,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Mail,
  Users,
  Clock,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Globe,
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  List,
  Variable,
  Monitor,
  Smartphone,
  ArrowRight,
  Settings,
  Zap,
  BarChart3,
  User,
  Building2,
  Phone,
  RefreshCw,
  Loader2,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types (aligned with Prisma + API responses)
// ─────────────────────────────────────────────

type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "STOPPED";

type RecipientStatus =
  | "PENDING"
  | "RUNNING"
  | "REPLIED"
  | "COMPLETED"
  | "FAILED"
  | "STOPPED";

type StepStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

interface EmailContact {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  website: string | null;
  phone: string | null;
  category: string | null;
  status?: string;
}

interface FollowUpStep {
  id: string;
  campaignId: string;
  stepNumber: number;
  delayDays: number;
  subject: string;
  body: string;
  enabled: boolean;
}

interface FollowUpRecipientStep {
  id: string;
  recipientId: string;
  stepId: string;
  status: StepStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  error: string | null;
  step?: FollowUpStep;
}

interface FollowUpRecipient {
  id: string;
  campaignId: string;
  emailId: string;
  status: RecipientStatus;
  currentStep: number;
  nextStepAt: string | null;
  lastSentAt: string | null;
  repliedAt: string | null;
  completedAt: string | null;
  email?: EmailContact;
  steps?: FollowUpRecipientStep[];
}

interface CampaignStats {
  total: number;
  pending: number;
  running: number;
  sent: number;
  replied: number;
  completed: number;
  failed: number;
  stopped: number;
  remaining: number;
  progress: number;
}

interface Campaign {
  id: string;
  userId: string;
  smtpConfigId: string | null;
  name: string;
  status: CampaignStatus;
  stopOnReply: boolean;
  scheduledAt: string | null;
  timezone: string;
  sendingStart: string;
  sendingEnd: string;
  createdAt: string;
  updatedAt: string;
  steps?: FollowUpStep[];
  recipients?: FollowUpRecipient[];
  stats?: CampaignStats;
  _count?: { recipients: number };
  smtpConfig?: { id: string; senderEmail: string; senderName: string | null } | null;
}

interface SmtpAccount {
  id: string;
  senderEmail: string;
  senderName: string | null;
  isActive: boolean;
  provider?: string;
}

interface DraftStep {
  localId: string;
  stepNumber: number;
  delayDays: number;
  subject: string;
  body: string;
  enabled: boolean;
}

// ─────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────

async function api<T>(
  url: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      credentials: "include",
    });
    const json = await res.json().catch(() => ({
      success: false,
      error: res.statusText || "Request failed",
    }));
    if (!res.ok && !json.error) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    return json;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

// ─────────────────────────────────────────────
// Status configs
// ─────────────────────────────────────────────

const CAMPAIGN_STATUS: Record<
  CampaignStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  DRAFT: {
    label: "Draft",
    bg: "bg-zinc-100",
    text: "text-zinc-700",
    dot: "bg-zinc-400",
  },
  SCHEDULED: {
    label: "Scheduled",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  RUNNING: {
    label: "Running",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  PAUSED: {
    label: "Paused",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  COMPLETED: {
    label: "Completed",
    bg: "bg-violet-50",
    text: "text-violet-700",
    dot: "bg-violet-500",
  },
  STOPPED: {
    label: "Stopped",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

const RECIPIENT_STATUS: Record<
  RecipientStatus,
  { label: string; bg: string; text: string }
> = {
  PENDING: { label: "Pending", bg: "bg-zinc-100", text: "text-zinc-700" },
  RUNNING: { label: "Running", bg: "bg-emerald-50", text: "text-emerald-700" },
  REPLIED: { label: "Replied", bg: "bg-violet-50", text: "text-violet-700" },
  COMPLETED: {
    label: "Completed",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  FAILED: { label: "Failed", bg: "bg-red-50", text: "text-red-700" },
  STOPPED: { label: "Stopped", bg: "bg-zinc-100", text: "text-zinc-600" },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function replaceVars(
  text: string,
  contact: { name?: string | null; email: string; company?: string | null; website?: string | null }
): string {
  const first = contact.name?.split(" ")[0] || contact.name || "";
  return text
    .replace(/\{\{name\}\}/gi, first)
    .replace(/\{\{email\}\}/gi, contact.email || "")
    .replace(/\{\{company\}\}/gi, contact.company || "")
    .replace(/\{\{website\}\}/gi, contact.website || "");
}

function genId() {
  return Math.random().toString(36).slice(2, 11);
}

// ─────────────────────────────────────────────
// Small UI pieces
// ─────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const styles = {
    success: "bg-white border-emerald-200 text-emerald-900 shadow-emerald-100/50",
    error: "bg-white border-red-200 text-red-900 shadow-red-100/50",
    info: "bg-white border-zinc-200 text-zinc-900 shadow-zinc-100/50",
  };
  const iconStyles = {
    success: "text-emerald-500",
    error: "text-red-500",
    info: "text-zinc-500",
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm font-medium shadow-xl ${styles[type]}`}
    >
      {type === "success" && (
        <CheckCircle2 className={`h-4.5 w-4.5 shrink-0 ${iconStyles[type]}`} />
      )}
      {type === "error" && (
        <AlertCircle className={`h-4.5 w-4.5 shrink-0 ${iconStyles[type]}`} />
      )}
      {type === "info" && (
        <AlertCircle className={`h-4.5 w-4.5 shrink-0 ${iconStyles[type]}`} />
      )}
      <span className="max-w-sm leading-snug">{message}</span>
      <button
        onClick={onClose}
        className="ml-1 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = CAMPAIGN_STATUS[status] || CAMPAIGN_STATUS.DRAFT;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function RecipientBadge({ status }: { status: RecipientStatus }) {
  const cfg = RECIPIENT_STATUS[status] || RECIPIENT_STATUS.PENDING;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  variant = "primary",
  loading,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "primary" | "danger";
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl shadow-zinc-900/10">
        <div className="px-6 pt-6 pb-2">
          <h3 className="text-[17px] font-semibold tracking-tight text-zinc-900">
            {title}
          </h3>
          <div className="mt-2.5 text-[13px] leading-relaxed text-zinc-500">
            {description}
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-zinc-100 bg-zinc-50/80 px-6 py-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all disabled:opacity-50 ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700 shadow-red-600/20"
                : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20"
            }`}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function FollowUpsPage() {
  // Data
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [smtpAccounts, setSmtpAccounts] = useState<SmtpAccount[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Views
  const [view, setView] = useState<"list" | "create" | "tracking">("list");
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Toast / confirm
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "stop" | "pause";
    campaignId: string;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create flow
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [campaignName, setCampaignName] = useState("");
  const [smtpConfigId, setSmtpConfigId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>([
    {
      localId: genId(),
      stepNumber: 1,
      delayDays: 1,
      subject: "Just checking in",
      body: "Hi {{name}},\n\nI wanted to follow up on my previous email about {{company}}. Would love to hear your thoughts.\n\nBest regards",
      enabled: true,
    },
  ]);
  const [activeStepLocalId, setActiveStepLocalId] = useState<string | null>(null);
  const [stopOnReply, setStopOnReply] = useState(true);
  const [scheduleType, setScheduleType] = useState<"immediate" | "scheduled">(
    "immediate"
  );
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [sendingStart, setSendingStart] = useState("09:00");
  const [sendingEnd, setSendingEnd] = useState("18:00");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [previewIdx, setPreviewIdx] = useState(0);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);

  // Tracking
  const [trackingSearch, setTrackingSearch] = useState("");
  const [trackingStatus, setTrackingStatus] = useState("all");
  const [selectedRecipient, setSelectedRecipient] =
    useState<FollowUpRecipient | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "success") => {
      setToast({ message, type });
    },
    []
  );

  // ─── Data loaders ───

  const loadCampaigns = useCallback(async () => {
    setLoadingList(true);
    const res = await api<Campaign[]>("/api/follow-up/campaigns");
    if (res.success && res.data) {
      setCampaigns(res.data);
    } else {
      showToast(res.error || "Failed to load campaigns", "error");
    }
    setLoadingList(false);
  }, [showToast]);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    // Try common email/contact endpoints used in cold-email apps
    const endpoints = [
      "/api/emails",
      "/api/contacts",
      "/api/email",
      "/api/emails?limit=500",
    ];
    let loaded = false;
    for (const url of endpoints) {
      const res = await api<EmailContact[] | { data: EmailContact[]; emails?: EmailContact[] }>(
        url
      );
      if (res.success && res.data) {
        const list = Array.isArray(res.data)
          ? res.data
          : (res.data as { emails?: EmailContact[] }).emails ||
            (res.data as { data?: EmailContact[] }).data ||
            [];
        if (Array.isArray(list) && list.length >= 0) {
          setContacts(list as EmailContact[]);
          loaded = true;
          break;
        }
      }
    }
    if (!loaded) {
      // Fallback empty — user may not have contacts API at expected path
      setContacts([]);
    }
    setLoadingContacts(false);
  }, []);

  const loadSmtp = useCallback(async () => {
    const endpoints = [
      "/api/smtp",
      "/api/config",
      "/api/config",
      "/api/accounts",
    ];
    for (const url of endpoints) {
      const res = await api<SmtpAccount[] | { data: SmtpAccount[] }>(url);
      if (res.success && res.data) {
        const list = Array.isArray(res.data)
          ? res.data
          : (res.data as { data?: SmtpAccount[] }).data || [];
        if (Array.isArray(list)) {
          setSmtpAccounts(list.filter((a) => a.isActive !== false));
          if (list.length > 0 && !smtpConfigId) {
            const active = list.find((a) => a.isActive) || list[0];
            if (active) setSmtpConfigId(active.id);
          }
          break;
        }
      }
    }
  }, [smtpConfigId]);

  const loadCampaignDetail = useCallback(
    async (id: string) => {
      setLoadingDetail(true);
      const res = await api<Campaign>(`/api/follow-up/campaigns/${id}`);
      if (res.success && res.data) {
        setActiveCampaign(res.data);
      } else {
        showToast(res.error || "Failed to load campaign", "error");
        setView("list");
      }
      setLoadingDetail(false);
    },
    [showToast]
  );

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Overview
  const overview = useMemo(
    () => ({
      total: campaigns.length,
      active: campaigns.filter((c) => c.status === "RUNNING").length,
      scheduled: campaigns.filter((c) => c.status === "SCHEDULED").length,
      completed: campaigns.filter((c) => c.status === "COMPLETED").length,
    }),
    [campaigns]
  );

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const q = contactSearch.toLowerCase();
      const matchQ =
        !q ||
        (c.name || "").toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q);
      const matchCat =
        categoryFilter === "all" || c.category === categoryFilter;
      return matchQ && matchCat;
    });
  }, [contacts, contactSearch, categoryFilter]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(contacts.map((c) => c.category).filter(Boolean) as string[])
      ),
    [contacts]
  );

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selectedIds.has(c.id)),
    [contacts, selectedIds]
  );

  const stepPreviewDates = useMemo(() => {
    const base = new Date();
    let cum = 0;
    return draftSteps.map((s) => {
      cum += s.delayDays;
      return addDays(base, cum).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    });
  }, [draftSteps]);

  const totalPossibleSends =
    selectedIds.size * draftSteps.filter((s) => s.enabled).length;

  // ─── Actions ───

  const openCreate = () => {
    setView("create");
    setCreateStep(1);
    setCampaignName("");
    setSelectedIds(new Set());
    setContactSearch("");
    setCategoryFilter("all");
    setDraftSteps([
      {
        localId: genId(),
        stepNumber: 1,
        delayDays: 1,
        subject: "Just checking in",
        body: "Hi {{name}},\n\nI wanted to follow up on my previous email about {{company}}. Would love to hear your thoughts.\n\nBest regards",
        enabled: true,
      },
    ]);
    setActiveStepLocalId(null);
    setStopOnReply(true);
    setScheduleType("immediate");
    setScheduledDate("");
    setScheduledTime("09:00");
    setTimezone("Asia/Karachi");
    setSendingStart("09:00");
    setSendingEnd("18:00");
    setNameError(false);
    setPreviewIdx(0);
    loadContacts();
    loadSmtp();
  };

  const closeCreate = () => {
    setView("list");
    setActiveCampaignId(null);
    setActiveCampaign(null);
  };

  const openTracking = async (id: string) => {
    setActiveCampaignId(id);
    setView("tracking");
    setTrackingSearch("");
    setTrackingStatus("all");
    setSelectedRecipient(null);
    await loadCampaignDetail(id);
  };

  const toggleContact = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredContacts.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const addDraftStep = () => {
    const step: DraftStep = {
      localId: genId(),
      stepNumber: draftSteps.length + 1,
      delayDays: 2,
      subject: "",
      body: "Hi {{name}},\n\n",
      enabled: true,
    };
    setDraftSteps((prev) => [...prev, step]);
    setActiveStepLocalId(step.localId);
  };

  const updateDraftStep = (localId: string, patch: Partial<DraftStep>) => {
    setDraftSteps((prev) =>
      prev.map((s) => (s.localId === localId ? { ...s, ...patch } : s))
    );
  };

  const removeDraftStep = (localId: string) => {
    if (draftSteps.length <= 1) {
      showToast("At least one follow-up is required", "error");
      return;
    }
    setDraftSteps((prev) =>
      prev
        .filter((s) => s.localId !== localId)
        .map((s, i) => ({ ...s, stepNumber: i + 1 }))
    );
    if (activeStepLocalId === localId) setActiveStepLocalId(null);
  };

  const duplicateDraftStep = (localId: string) => {
    const step = draftSteps.find((s) => s.localId === localId);
    if (!step) return;
    const copy: DraftStep = { ...step, localId: genId() };
    const idx = draftSteps.findIndex((s) => s.localId === localId);
    setDraftSteps((prev) => {
      const next = [
        ...prev.slice(0, idx + 1),
        copy,
        ...prev.slice(idx + 1),
      ];
      return next.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  };

  const buildPayload = (asDraft: boolean) => {
    const scheduledAt =
      scheduleType === "scheduled" && scheduledDate
        ? `${scheduledDate}T${scheduledTime}:00`
        : null;

    return {
      name: campaignName.trim(),
      smtpConfigId: smtpConfigId || null,
      stopOnReply,
      timezone,
      sendingStart,
      sendingEnd,
      scheduledAt,
      recipientEmailIds: Array.from(selectedIds),
      steps: draftSteps.map((s, i) => ({
        stepNumber: i + 1,
        delayDays: Math.max(1, s.delayDays),
        subject: s.subject.trim(),
        body: s.body,
        enabled: s.enabled,
      })),
    };
  };

  const validate = (): string | null => {
    if (!campaignName.trim()) {
      setNameError(true);
      return "Campaign name is required";
    }
    if (selectedIds.size === 0) return "Select at least one recipient";
    if (!smtpConfigId && smtpAccounts.length > 0) {
      return "Select an SMTP account to send from";
    }
    const bad = draftSteps.find(
      (s) => s.enabled && (!s.subject.trim() || !s.body.trim())
    );
    if (bad) return "All enabled follow-ups need a subject and body";
    if (draftSteps.some((s) => s.delayDays < 1)) return "Minimum delay is 1 day";
    return null;
  };

  const saveDraft = async () => {
    const err = validate();
    if (err && err !== "Select an SMTP account to send from") {
      // Allow draft without SMTP in some cases, but name + recipients required
      if (!campaignName.trim() || selectedIds.size === 0) {
        showToast(err, "error");
        return;
      }
    }
    if (!campaignName.trim()) {
      setNameError(true);
      showToast("Campaign name is required", "error");
      return;
    }

    setSaving(true);
    const payload = buildPayload(true);
    const res = await api<Campaign>("/api/follow-up/campaigns", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.success) {
      showToast(res.error || "Failed to save draft", "error");
      return;
    }

    // Keep as draft — if API created as SCHEDULED/DRAFT based on scheduledAt
    if (res.data?.id && res.data.status !== "DRAFT") {
      // Optionally force draft via PATCH if needed
      await api(`/api/follow-up/campaigns/${res.data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "DRAFT" }),
      });
    }

    showToast("Draft saved");
    setView("list");
    loadCampaigns();
  };

  const validateAndConfirmStart = () => {
    const err = validate();
    if (err) {
      showToast(err, "error");
      return;
    }
    setShowStartConfirm(true);
  };

  const confirmStart = async () => {
    setSaving(true);
    const payload = buildPayload(false);
    const createRes = await api<Campaign>("/api/follow-up/campaigns", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!createRes.success || !createRes.data) {
      setSaving(false);
      setShowStartConfirm(false);
      showToast(createRes.error || "Failed to create campaign", "error");
      return;
    }

    const campaignId = createRes.data.id;

    // Start unless purely scheduled for the future and already SCHEDULED
    if (createRes.data.status !== "SCHEDULED") {
      const startRes = await api(`/api/follow-up/campaigns/${campaignId}/start`, {
        method: "POST",
      });
      if (!startRes.success) {
        setSaving(false);
        setShowStartConfirm(false);
        showToast(
          startRes.error ||
            "Campaign created but failed to start. You can start it from the list.",
          "error"
        );
        setView("list");
        loadCampaigns();
        return;
      }
    }

    setSaving(false);
    setShowStartConfirm(false);
    showToast(
      scheduleType === "scheduled"
        ? "Campaign scheduled successfully"
        : "Campaign started successfully"
    );
    setView("list");
    loadCampaigns();
  };

  const runCampaignAction = async (
    campaignId: string,
    action: "pause" | "resume" | "stop" | "delete"
  ) => {
    if (action === "delete" || action === "stop" || action === "pause") {
      if (action === "delete" || action === "stop") {
        setConfirmAction({ type: action, campaignId });
        setActionMenuId(null);
        return;
      }
    }

    setActionLoading(campaignId);
    const res = await api(`/api/follow-up/campaigns/${campaignId}/${action}`, {
      method: "POST",
    });
    setActionLoading(null);
    setActionMenuId(null);

    if (!res.success) {
      showToast(res.error || `Failed to ${action}`, "error");
      return;
    }

    showToast(
      action === "pause"
        ? "Campaign paused"
        : action === "resume"
        ? "Campaign resumed"
        : "Done"
    );
    await loadCampaigns();
    if (activeCampaignId === campaignId) {
      await loadCampaignDetail(campaignId);
    }
  };

  const confirmCampaignAction = async () => {
    if (!confirmAction) return;
    const { type, campaignId } = confirmAction;
    setConfirmLoading(true);

    if (type === "delete") {
      const res = await api(`/api/follow-up/campaigns/${campaignId}`, {
        method: "DELETE",
      });
      setConfirmLoading(false);
      setConfirmAction(null);
      if (!res.success) {
        showToast(res.error || "Failed to delete", "error");
        return;
      }
      showToast("Campaign deleted");
      if (activeCampaignId === campaignId) {
        setView("list");
        setActiveCampaign(null);
      }
      loadCampaigns();
      return;
    }

    const res = await api(`/api/follow-up/campaigns/${campaignId}/${type}`, {
      method: "POST",
    });
    setConfirmLoading(false);
    setConfirmAction(null);
    if (!res.success) {
      showToast(res.error || `Failed to ${type}`, "error");
      return;
    }
    showToast(type === "stop" ? "Campaign stopped" : "Campaign paused");
    loadCampaigns();
    if (activeCampaignId === campaignId) loadCampaignDetail(campaignId);
  };

  // Tracking derived
  const trackingRecipients = useMemo(() => {
    if (!activeCampaign?.recipients) return [];
    return activeCampaign.recipients.filter((r) => {
      const q = trackingSearch.toLowerCase();
      const matchQ =
        !q ||
        (r.email?.name || "").toLowerCase().includes(q) ||
        (r.email?.email || "").toLowerCase().includes(q);
      const matchS =
        trackingStatus === "all" || r.status === trackingStatus;
      return matchQ && matchS;
    });
  }, [activeCampaign, trackingSearch, trackingStatus]);

  const trackingStats: CampaignStats = useMemo(() => {
    if (activeCampaign?.stats) return activeCampaign.stats;
    if (!activeCampaign?.recipients) {
      return {
        total: 0,
        pending: 0,
        running: 0,
        sent: 0,
        replied: 0,
        completed: 0,
        failed: 0,
        stopped: 0,
        remaining: 0,
        progress: 0,
      };
    }
    const recs = activeCampaign.recipients;
    const total = recs.length;
    const pending = recs.filter((r) => r.status === "PENDING").length;
    const running = recs.filter((r) => r.status === "RUNNING").length;
    const replied = recs.filter((r) => r.status === "REPLIED").length;
    const completed = recs.filter((r) => r.status === "COMPLETED").length;
    const failed = recs.filter((r) => r.status === "FAILED").length;
    const stopped = recs.filter((r) => r.status === "STOPPED").length;
    const sent = running + replied + completed + failed;
    const remaining = pending + running;
    const done = replied + completed + failed + stopped;
    return {
      total,
      pending,
      running,
      sent,
      replied,
      completed,
      failed,
      stopped,
      remaining,
      progress: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  }, [activeCampaign]);

  const previewContact =
    selectedContacts[previewIdx] || selectedContacts[0] || null;
  const activeDraft =
    draftSteps.find((s) => s.localId === activeStepLocalId) || draftSteps[0];

  // ═══════════════════════════════════════════
  // LIST VIEW
  // ═══════════════════════════════════════════

  if (view === "list") {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-10">
            <div>
              <h1 className="text-[26px] font-semibold tracking-tight text-zinc-900 leading-none">
                Follow-ups
              </h1>
              <p className="mt-2.5 text-[14px] text-zinc-500 leading-relaxed max-w-lg">
                Automate personalized follow-up emails and track every recipient.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => loadCampaigns()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200/80 bg-white text-zinc-500 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-700 hover:border-zinc-300"
                title="Refresh"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`}
                />
              </button>
              <button
                onClick={openCreate}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-sm shadow-blue-600/25 transition-all hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/30 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Add Follow-up
              </button>
            </div>
          </div>

          {/* Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
            {[
              {
                label: "Total Campaigns",
                value: overview.total,
                icon: BarChart3,
                iconBg: "bg-zinc-100",
                iconColor: "text-zinc-600",
              },
              {
                label: "Active",
                value: overview.active,
                icon: Zap,
                iconBg: "bg-emerald-50",
                iconColor: "text-emerald-600",
              },
              {
                label: "Scheduled",
                value: overview.scheduled,
                icon: Calendar,
                iconBg: "bg-blue-50",
                iconColor: "text-blue-600",
              },
              {
                label: "Completed",
                value: overview.completed,
                icon: CheckCircle2,
                iconBg: "bg-violet-50",
                iconColor: "text-violet-600",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="group relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:border-zinc-300/80 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
                      {card.label}
                    </p>
                    <p className="mt-2 text-[28px] font-semibold tracking-tight text-zinc-900 tabular-nums leading-none">
                      {card.value}
                    </p>
                  </div>
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.iconBg}`}
                  >
                    <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* List */}
          {loadingList ? (
            <div className="rounded-2xl border border-zinc-200/70 bg-white py-24 flex flex-col items-center justify-center gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              <p className="text-[13px] text-zinc-400">Loading campaigns…</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white py-20 px-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-100/80">
                <Mail className="h-6 w-6 text-blue-500" />
              </div>
              <h3 className="mt-5 text-[15px] font-semibold text-zinc-900">
                No follow-up campaigns yet
              </h3>
              <p className="mt-1.5 text-[13px] text-zinc-500 max-w-sm mx-auto leading-relaxed">
                Create an automated sequence to reconnect with your contacts and
                track every reply.
              </p>
              <button
                onClick={openCreate}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-blue-600/25 transition-all hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Add Follow-up
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      {[
                        "Campaign",
                        "Recipients",
                        "Sent",
                        "Pending",
                        "Replies",
                        "Failed",
                        "Status",
                        "Created",
                        "Actions",
                      ].map((h) => (
                        <th
                          key={h}
                          className={`px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-400 ${
                            h === "Campaign"
                              ? "text-left px-5"
                              : h === "Actions"
                              ? "text-right pr-5"
                              : "text-left"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {campaigns.map((camp) => {
                      const stats = camp.stats;
                      const recipientCount =
                        stats?.total ?? camp._count?.recipients ?? 0;
                      return (
                        <tr
                          key={camp.id}
                          className="group transition-colors hover:bg-zinc-50/80"
                        >
                          <td className="px-5 py-4">
                            <button
                              onClick={() => openTracking(camp.id)}
                              className="font-semibold text-zinc-900 hover:text-blue-600 transition-colors text-left"
                            >
                              {camp.name}
                            </button>
                            <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">
                              {camp.steps?.length ?? 0} follow-up
                              {(camp.steps?.length ?? 0) !== 1 ? "s" : ""}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-zinc-600 tabular-nums font-medium">
                            {recipientCount || "—"}
                          </td>
                          <td className="px-4 py-4 text-zinc-600 tabular-nums">
                            {stats?.sent ?? "—"}
                          </td>
                          <td className="px-4 py-4 text-zinc-600 tabular-nums">
                            {stats?.pending ?? "—"}
                          </td>
                          <td className="px-4 py-4 text-zinc-600 tabular-nums">
                            {stats?.replied ?? "—"}
                          </td>
                          <td className="px-4 py-4 text-zinc-600 tabular-nums">
                            {stats?.failed ?? "—"}
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge status={camp.status} />
                          </td>
                          <td className="px-4 py-4 text-zinc-400 text-[12px] tabular-nums">
                            {formatShortDate(camp.createdAt)}
                          </td>
                          <td className="px-4 pr-5 py-4 text-right relative">
                            <button
                              onClick={() =>
                                setActionMenuId(
                                  actionMenuId === camp.id ? null : camp.id
                                )
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-700 focus:opacity-100"
                            >
                              {actionLoading === camp.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </button>
                            {actionMenuId === camp.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setActionMenuId(null)}
                                />
                                <div className="absolute right-4 top-11 z-20 w-48 overflow-hidden rounded-xl border border-zinc-200/80 bg-white py-1.5 shadow-xl shadow-zinc-900/10">
                                  <button
                                    onClick={() => {
                                      openTracking(camp.id);
                                      setActionMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-zinc-400" />{" "}
                                    View
                                  </button>
                                  {camp.status === "RUNNING" && (
                                    <button
                                      onClick={() =>
                                        runCampaignAction(camp.id, "pause")
                                      }
                                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                    >
                                      <Pause className="h-3.5 w-3.5 text-zinc-400" />{" "}
                                      Pause
                                    </button>
                                  )}
                                  {camp.status === "PAUSED" && (
                                    <button
                                      onClick={() =>
                                        runCampaignAction(camp.id, "resume")
                                      }
                                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                    >
                                      <Play className="h-3.5 w-3.5 text-zinc-400" />{" "}
                                      Resume
                                    </button>
                                  )}
                                  {(camp.status === "DRAFT" ||
                                    camp.status === "SCHEDULED") && (
                                    <button
                                      onClick={() =>
                                        runCampaignAction(camp.id, "resume") ||
                                        api(
                                          `/api/follow-up/campaigns/${camp.id}/start`,
                                          { method: "POST" }
                                        ).then((r) => {
                                          if (r.success) {
                                            showToast("Campaign started");
                                            loadCampaigns();
                                          } else {
                                            showToast(
                                              r.error || "Failed to start",
                                              "error"
                                            );
                                          }
                                          setActionMenuId(null);
                                        })
                                      }
                                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                    >
                                      <Play className="h-3.5 w-3.5 text-zinc-400" />{" "}
                                      Start
                                    </button>
                                  )}
                                  {(camp.status === "RUNNING" ||
                                    camp.status === "PAUSED" ||
                                    camp.status === "SCHEDULED") && (
                                    <button
                                      onClick={() =>
                                        runCampaignAction(camp.id, "stop")
                                      }
                                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                    >
                                      <Square className="h-3.5 w-3.5 text-zinc-400" />{" "}
                                      Stop
                                    </button>
                                  )}
                                  <div className="my-1.5 border-t border-zinc-100" />
                                  <button
                                    onClick={() =>
                                      runCampaignAction(camp.id, "delete")
                                    }
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        <ConfirmModal
          open={!!confirmAction}
          title={
            confirmAction?.type === "delete"
              ? "Delete campaign?"
              : "Stop campaign?"
          }
          description={
            confirmAction?.type === "delete"
              ? "This permanently deletes the campaign and all tracking data."
              : "Stopping cancels all remaining follow-ups for every recipient."
          }
          confirmLabel={
            confirmAction?.type === "delete" ? "Delete" : "Stop Campaign"
          }
          variant="danger"
          loading={confirmLoading}
          onConfirm={confirmCampaignAction}
          onCancel={() => setConfirmAction(null)}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // TRACKING VIEW
  // ═══════════════════════════════════════════

  if (view === "tracking") {
    return (
      <div className="min-h-screen bg-zinc-50/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loadingDetail || !activeCampaign ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => {
                      setView("list");
                      setActiveCampaign(null);
                      loadCampaigns();
                    }}
                    className="mt-1 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                        {activeCampaign.name}
                      </h1>
                      <StatusBadge status={activeCampaign.status} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {activeCampaign.steps?.length ?? 0} follow-ups · Created{" "}
                      {formatShortDate(activeCampaign.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      activeCampaignId && loadCampaignDetail(activeCampaignId)
                    }
                    className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-500 hover:bg-zinc-50"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${loadingDetail ? "animate-spin" : ""}`}
                    />
                  </button>
                  {activeCampaign.status === "RUNNING" && (
                    <button
                      onClick={() =>
                        runCampaignAction(activeCampaign.id, "pause")
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </button>
                  )}
                  {activeCampaign.status === "PAUSED" && (
                    <button
                      onClick={() =>
                        runCampaignAction(activeCampaign.id, "resume")
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      <Play className="h-3.5 w-3.5" /> Resume
                    </button>
                  )}
                  {(activeCampaign.status === "DRAFT" ||
                    activeCampaign.status === "SCHEDULED") && (
                    <button
                      onClick={async () => {
                        const r = await api(
                          `/api/follow-up/campaigns/${activeCampaign.id}/start`,
                          { method: "POST" }
                        );
                        if (r.success) {
                          showToast("Campaign started");
                          loadCampaignDetail(activeCampaign.id);
                          loadCampaigns();
                        } else {
                          showToast(r.error || "Failed to start", "error");
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <Play className="h-3.5 w-3.5" /> Start
                    </button>
                  )}
                  {(activeCampaign.status === "RUNNING" ||
                    activeCampaign.status === "PAUSED") && (
                    <button
                      onClick={() =>
                        runCampaignAction(activeCampaign.id, "stop")
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <Square className="h-3.5 w-3.5" /> Stop
                    </button>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {[
                  { label: "Total Recipients", value: trackingStats.total },
                  { label: "Sent", value: trackingStats.sent },
                  { label: "Pending", value: trackingStats.pending },
                  { label: "Replies", value: trackingStats.replied },
                  { label: "Failed", value: trackingStats.failed },
                  { label: "Completed", value: trackingStats.completed },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-zinc-200/80 bg-white p-3.5 shadow-sm"
                  >
                    <p className="text-xs font-medium text-zinc-500">
                      {s.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-zinc-900">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Progress */}
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-700">
                    Campaign Progress
                  </span>
                  <span className="text-sm font-semibold text-zinc-900">
                    {trackingStats.progress}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${trackingStats.progress}%` }}
                  />
                </div>
              </div>

              {/* Recipients table */}
              <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Recipient Activity
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                      <input
                        value={trackingSearch}
                        onChange={(e) => setTrackingSearch(e.target.value)}
                        placeholder="Search..."
                        className="h-9 w-48 rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <select
                      value={trackingStatus}
                      onChange={(e) => setTrackingStatus(e.target.value)}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="all">All statuses</option>
                      <option value="PENDING">Pending</option>
                      <option value="RUNNING">Running</option>
                      <option value="REPLIED">Replied</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="FAILED">Failed</option>
                      <option value="STOPPED">Stopped</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 bg-zinc-50/50">
                        {[
                          "Recipient",
                          "Email",
                          "Current Step",
                          "Last Sent",
                          "Next Follow-up",
                          "Status",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 first:px-5"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {trackingRecipients.map((r) => (
                        <tr
                          key={r.id}
                          onClick={() => setSelectedRecipient(r)}
                          className="hover:bg-zinc-50/70 cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-3.5 font-medium text-zinc-900">
                            {r.email?.name || "—"}
                          </td>
                          <td className="px-4 py-3.5 text-zinc-600">
                            {r.email?.email}
                          </td>
                          <td className="px-4 py-3.5 text-zinc-600">
                            {r.status === "REPLIED" || r.status === "COMPLETED"
                              ? "—"
                              : r.currentStep === 0
                              ? "Initial"
                              : `Follow-up #${r.currentStep}`}
                          </td>
                          <td className="px-4 py-3.5 text-zinc-600">
                            {formatShortDate(r.lastSentAt)}
                          </td>
                          <td className="px-4 py-3.5 text-zinc-600">
                            {formatShortDate(r.nextStepAt)}
                          </td>
                          <td className="px-4 py-3.5">
                            <RecipientBadge status={r.status} />
                          </td>
                        </tr>
                      ))}
                      {trackingRecipients.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-5 py-12 text-center text-sm text-zinc-500"
                          >
                            No recipients match your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Recipient drawer */}
        {selectedRecipient && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setSelectedRecipient(null)}
            />
            <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col">
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
                <h3 className="text-base font-semibold text-zinc-900">
                  Recipient Detail
                </h3>
                <button
                  onClick={() => setSelectedRecipient(null)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-3">
                    Contact Information
                  </h4>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm text-zinc-900">
                        {selectedRecipient.email?.name || "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm text-zinc-600">
                        {selectedRecipient.email?.email}
                      </span>
                    </div>
                    {selectedRecipient.email?.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm text-zinc-600">
                          {selectedRecipient.email.phone}
                        </span>
                      </div>
                    )}
                    {selectedRecipient.email?.website && (
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm text-zinc-600">
                          {selectedRecipient.email.website}
                        </span>
                      </div>
                    )}
                    {selectedRecipient.email?.category && (
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm text-zinc-600">
                          {selectedRecipient.email.category}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
                    Campaign Status
                  </h4>
                  <RecipientBadge status={selectedRecipient.status} />
                  {selectedRecipient.repliedAt && (
                    <p className="mt-2 text-xs text-violet-600">
                      ↩ Replied {formatDate(selectedRecipient.repliedAt)}
                    </p>
                  )}
                  {selectedRecipient.completedAt && (
                    <p className="mt-2 text-xs text-emerald-600">
                      ✓ Completed {formatDate(selectedRecipient.completedAt)}
                    </p>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-4">
                    Timeline
                  </h4>
                  <div className="space-y-0">
                    {(selectedRecipient.steps || []).map((item, idx, arr) => {
                      const label =
                        item.step?.subject ||
                        `Follow-up #${item.step?.stepNumber ?? idx + 1}`;
                      return (
                        <div key={item.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                                item.status === "SENT"
                                  ? "border-emerald-500 bg-emerald-50"
                                  : item.status === "FAILED"
                                  ? "border-red-400 bg-red-50"
                                  : item.status === "CANCELLED"
                                  ? "border-zinc-300 bg-zinc-50"
                                  : item.status === "SENDING"
                                  ? "border-blue-400 bg-blue-50"
                                  : "border-zinc-200 bg-white"
                              }`}
                            >
                              {item.status === "SENT" && (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                              {item.status === "FAILED" && (
                                <X className="h-3.5 w-3.5 text-red-500" />
                              )}
                              {item.status === "CANCELLED" && (
                                <X className="h-3.5 w-3.5 text-zinc-400" />
                              )}
                              {(item.status === "PENDING" ||
                                item.status === "SENDING") && (
                                <Clock className="h-3.5 w-3.5 text-zinc-400" />
                              )}
                            </div>
                            {idx < arr.length - 1 && (
                              <div className="w-px flex-1 bg-zinc-200 my-1 min-h-[20px]" />
                            )}
                          </div>
                          <div className="pb-5">
                            <p
                              className={`text-sm font-medium ${
                                item.status === "CANCELLED"
                                  ? "text-zinc-400 line-through"
                                  : "text-zinc-900"
                              }`}
                            >
                              {label}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {item.status === "SENT" &&
                                `✓ Sent · ${formatDate(item.sentAt)}`}
                              {item.status === "PENDING" &&
                                `⏳ Pending · ${formatDate(item.scheduledAt)}`}
                              {item.status === "SENDING" && "Sending…"}
                              {item.status === "CANCELLED" && "⊘ Cancelled"}
                              {item.status === "FAILED" &&
                                `✗ Failed · ${item.error || formatDate(item.failedAt)}`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {(selectedRecipient.steps || []).length === 0 && (
                      <p className="text-sm text-zinc-500">No steps yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        <ConfirmModal
          open={!!confirmAction}
          title={
            confirmAction?.type === "delete"
              ? "Delete campaign?"
              : "Stop campaign?"
          }
          description={
            confirmAction?.type === "delete"
              ? "This permanently deletes the campaign and all tracking data."
              : "Stopping cancels all remaining follow-ups for every recipient."
          }
          confirmLabel={
            confirmAction?.type === "delete" ? "Delete" : "Stop Campaign"
          }
          variant="danger"
          loading={confirmLoading}
          onConfirm={confirmCampaignAction}
          onCancel={() => setConfirmAction(null)}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // CREATE WORKSPACE
  // ═══════════════════════════════════════════

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-[56px] items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={closeCreate}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="h-4 w-px shrink-0 bg-zinc-200" />
              <input
                value={campaignName}
                onChange={(e) => {
                  setCampaignName(e.target.value);
                  setNameError(false);
                }}
                placeholder="Untitled campaign"
                className={`min-w-0 bg-transparent text-[15px] font-semibold tracking-tight text-zinc-900 placeholder:text-zinc-400 focus:outline-none w-40 sm:w-72 ${
                  nameError ? "text-red-600" : ""
                }`}
              />
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="hidden sm:inline text-[12px] font-medium text-zinc-400 tabular-nums">
                Step {createStep} of 2
              </span>
              <button
                onClick={closeCreate}
                className="rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-zinc-600 shadow-sm transition-all hover:bg-zinc-50 hover:border-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28">
        {/* Steps */}
        <div className="flex items-center gap-2 mb-8">
          <button
            onClick={() => setCreateStep(1)}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all ${
              createStep === 1
                ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                createStep === 1
                  ? "bg-white/20 text-white"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              1
            </span>
            Select Recipients
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
          <button
            onClick={() => {
              if (selectedIds.size > 0) setCreateStep(2);
              else showToast("Select at least one recipient", "error");
            }}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all ${
              createStep === 2
                ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                createStep === 2
                  ? "bg-white/20 text-white"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              2
            </span>
            Build Sequence
          </button>
        </div>

        {/* STEP 1 */}
        {createStep === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Select Recipients
              </h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                Choose contacts who will receive this follow-up sequence.
              </p>
            </div>

            {/* SMTP picker */}
            {smtpAccounts.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Send from
                </label>
                <select
                  value={smtpConfigId}
                  onChange={(e) => setSmtpConfigId(e.target.value)}
                  className="mt-1.5 h-10 w-full sm:w-80 rounded-lg border border-zinc-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select SMTP account…</option>
                  {smtpAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.senderName
                        ? `${a.senderName} <${a.senderEmail}>`
                        : a.senderEmail}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Search contacts..."
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <button
                onClick={selectAllFiltered}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                Select all ({filteredContacts.length})
              </button>
              <span className="text-zinc-300">·</span>
              <button
                onClick={clearSelection}
                className="font-medium text-zinc-500 hover:text-zinc-700"
              >
                Clear selection
              </button>
            </div>

            {loadingContacts ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-12 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
                <Users className="mx-auto h-8 w-8 text-zinc-300" />
                <p className="mt-3 text-sm font-medium text-zinc-900">
                  No contacts available
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Import contacts first, or check that /api/emails is available.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 bg-zinc-50/50">
                        <th className="w-12 px-4 py-3" />
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Category
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Company
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredContacts.map((c) => {
                        const selected = selectedIds.has(c.id);
                        return (
                          <tr
                            key={c.id}
                            onClick={() => toggleContact(c.id)}
                            className={`cursor-pointer transition-colors ${
                              selected
                                ? "bg-blue-50/60"
                                : "hover:bg-zinc-50/70"
                            }`}
                          >
                            <td className="px-4 py-3.5">
                              <div
                                className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                                  selected
                                    ? "border-blue-600 bg-blue-600"
                                    : "border-zinc-300 bg-white"
                                }`}
                              >
                                {selected && (
                                  <Check className="h-3 w-3 text-white" />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-medium text-zinc-900">
                              {c.name || "—"}
                            </td>
                            <td className="px-4 py-3.5 text-zinc-600">
                              {c.email}
                            </td>
                            <td className="px-4 py-3.5">
                              {c.category ? (
                                <span className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                                  {c.category}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-zinc-600">
                              {c.company || "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredContacts.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-12 text-center text-sm text-zinc-500"
                          >
                            No contacts match your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-200/80 bg-white/90 backdrop-blur-xl">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
                <p className="text-[13px] font-medium text-zinc-600">
                  {selectedIds.size === 0 ? (
                    <span className="text-zinc-400">
                      Select recipients to continue
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-md bg-blue-50 px-1.5 text-blue-700 font-semibold tabular-nums">
                        {selectedIds.size}
                      </span>{" "}
                      recipient{selectedIds.size !== 1 ? "s" : ""} selected
                    </>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 && (
                    <button
                      onClick={clearSelection}
                      className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (selectedIds.size === 0) {
                        showToast("Select at least one recipient", "error");
                        return;
                      }
                      setCreateStep(2);
                      setActiveStepLocalId(draftSteps[0]?.localId || null);
                    }}
                    disabled={selectedIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-blue-600/25 transition-all hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    Continue
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {createStep === 2 && (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <div className="xl:col-span-3 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Follow-up Sequence
                </h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {selectedIds.size} recipient
                  {selectedIds.size !== 1 ? "s" : ""} selected
                </p>
              </div>

              {/* Timeline */}
              <div className="space-y-0">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-50">
                      <Check className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="w-px flex-1 bg-zinc-200 my-1 min-h-[24px]" />
                  </div>
                  <div className="pb-6 pt-1">
                    <p className="text-sm font-semibold text-zinc-900">
                      Initial Email
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Sent previously · ✓ Completed
                    </p>
                  </div>
                </div>

                {draftSteps.map((step, idx) => (
                  <div key={step.localId} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                          activeStepLocalId === step.localId
                            ? "border-blue-600 bg-blue-600 text-white"
                            : step.enabled
                            ? "border-zinc-300 bg-white text-zinc-600"
                            : "border-zinc-200 bg-zinc-50 text-zinc-400"
                        }`}
                      >
                        {idx + 1}
                      </div>
                      {idx < draftSteps.length - 1 && (
                        <div className="w-px flex-1 bg-zinc-200 my-1 min-h-[24px]" />
                      )}
                    </div>
                    <div
                      className={`flex-1 pb-6 rounded-xl border transition-all ${
                        activeStepLocalId === step.localId
                          ? "border-blue-200 bg-blue-50/30 shadow-sm"
                          : "border-zinc-200 bg-white"
                      } ${!step.enabled ? "opacity-60" : ""}`}
                    >
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer"
                        onClick={() =>
                          setActiveStepLocalId(
                            activeStepLocalId === step.localId
                              ? null
                              : step.localId
                          )
                        }
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="text-sm font-semibold text-zinc-900">
                            Follow-up #{idx + 1}
                          </p>
                          <span className="text-xs text-zinc-400">
                            Wait {step.delayDays} day
                            {step.delayDays !== 1 ? "s" : ""} ·{" "}
                            {stepPreviewDates[idx]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDraftStep(step.localId, {
                                enabled: !step.enabled,
                              });
                            }}
                            className={`rounded-md px-2 py-1 text-xs font-medium ${
                              step.enabled
                                ? "text-emerald-600 hover:bg-emerald-50"
                                : "text-zinc-400 hover:bg-zinc-100"
                            }`}
                          >
                            {step.enabled ? "Enabled" : "Disabled"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateDraftStep(step.localId);
                            }}
                            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeDraftStep(step.localId);
                            }}
                            className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <ChevronDown
                            className={`h-4 w-4 text-zinc-400 transition-transform ${
                              activeStepLocalId === step.localId
                                ? "rotate-180"
                                : ""
                            }`}
                          />
                        </div>
                      </div>

                      {activeStepLocalId === step.localId && (
                        <div className="border-t border-zinc-100 px-4 py-4 space-y-4">
                          <div>
                            <label className="text-xs font-medium text-zinc-500">
                              Wait
                            </label>
                            <div className="mt-1.5 flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                value={step.delayDays}
                                onChange={(e) =>
                                  updateDraftStep(step.localId, {
                                    delayDays: Math.max(
                                      1,
                                      parseInt(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="h-9 w-20 rounded-lg border border-zinc-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                              <span className="text-sm text-zinc-600">Days</span>
                              <span className="text-xs text-zinc-400 ml-2">
                                → {stepPreviewDates[idx]}
                              </span>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-zinc-500">
                              Subject
                            </label>
                            <input
                              value={step.subject}
                              onChange={(e) =>
                                updateDraftStep(step.localId, {
                                  subject: e.target.value,
                                })
                              }
                              placeholder="Email subject..."
                              className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-medium text-zinc-500">
                                Body
                              </label>
                              <div className="flex items-center gap-0.5">
                                {[Bold, Italic, Underline, LinkIcon, List].map(
                                  (Icon, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100"
                                    >
                                      <Icon className="h-3.5 w-3.5" />
                                    </button>
                                  )
                                )}
                                <div className="w-px h-4 bg-zinc-200 mx-1" />
                                <div className="relative group">
                                  <button
                                    type="button"
                                    className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100"
                                  >
                                    <Variable className="h-3.5 w-3.5" />
                                  </button>
                                  <div className="absolute right-0 top-8 z-10 hidden group-hover:block w-40 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                                    {[
                                      "{{name}}",
                                      "{{email}}",
                                      "{{company}}",
                                      "{{website}}",
                                    ].map((v) => (
                                      <button
                                        key={v}
                                        type="button"
                                        onClick={() =>
                                          updateDraftStep(step.localId, {
                                            body: step.body + v,
                                          })
                                        }
                                        className="block w-full px-3 py-1.5 text-left text-xs font-mono text-zinc-600 hover:bg-zinc-50"
                                      >
                                        {v}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <textarea
                              value={step.body}
                              onChange={(e) =>
                                updateDraftStep(step.localId, {
                                  body: e.target.value,
                                })
                              }
                              rows={6}
                              placeholder="Write your follow-up message..."
                              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
                            />
                            <p className="mt-1.5 text-xs text-zinc-400">
                              Variables are automatically replaced when the email
                              is sent.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  onClick={addDraftStep}
                  className="ml-13 flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 w-full justify-center"
                >
                  <Plus className="h-4 w-4" />
                  Add Follow-up
                </button>
              </div>

              {/* Automation */}
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                  <Settings className="h-4 w-4 text-zinc-400" />
                  Automation Rules
                </h3>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-800">
                      Stop follow-ups when recipient replies
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                      When a recipient replies to any campaign email, all
                      remaining follow-ups are automatically cancelled for that
                      recipient.
                    </p>
                    {stopOnReply && (
                      <p className="mt-2 text-xs font-medium text-emerald-600 flex items-center gap-1">
                        <Check className="h-3 w-3" /> Reply detection enabled
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setStopOnReply(!stopOnReply)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      stopOnReply ? "bg-blue-600" : "bg-zinc-200"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        stopOnReply ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Scheduling */}
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-5">
                <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  Scheduling
                </h3>
                <div className="space-y-3">
                  <p className="text-xs font-medium text-zinc-500">
                    Start campaign
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    {(
                      [
                        { value: "immediate" as const, label: "Immediately" },
                        {
                          value: "scheduled" as const,
                          label: "Schedule for later",
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setScheduleType(opt.value)}
                        className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                          scheduleType === opt.value
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                        }`}
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${
                            scheduleType === opt.value
                              ? "border-blue-600"
                              : "border-zinc-300"
                          }`}
                        >
                          {scheduleType === opt.value && (
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                          )}
                        </span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {scheduleType === "scheduled" && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="text-xs text-zinc-500">Date</label>
                        <input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500">Time</label>
                        <input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500">Timezone</label>
                        <select
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="Asia/Karachi">Asia/Karachi</option>
                          <option value="America/New_York">
                            America/New_York
                          </option>
                          <option value="America/Los_Angeles">
                            America/Los_Angeles
                          </option>
                          <option value="Europe/London">Europe/London</option>
                          <option value="Europe/Paris">Europe/Paris</option>
                          <option value="Asia/Tokyo">Asia/Tokyo</option>
                          <option value="Asia/Singapore">Asia/Singapore</option>
                          <option value="UTC">UTC</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-zinc-100 pt-4">
                  <p className="text-xs font-medium text-zinc-500 mb-3">
                    Sending window
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Start</span>
                      <input
                        type="time"
                        value={sendingStart}
                        onChange={(e) => setSendingStart(e.target.value)}
                        className="h-8 rounded-lg border border-zinc-200 px-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">End</span>
                      <input
                        type="time"
                        value={sendingEnd}
                        onChange={(e) => setSendingEnd(e.target.value)}
                        className="h-8 rounded-lg border border-zinc-200 px-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-zinc-900 mb-4">
                  Campaign Summary
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-5">
                  <div>
                    <p className="text-xs text-zinc-500">Recipients</p>
                    <p className="text-lg font-semibold text-zinc-900">
                      {selectedIds.size}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Follow-ups</p>
                    <p className="text-lg font-semibold text-zinc-900">
                      {draftSteps.filter((s) => s.enabled).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Total possible sends</p>
                    <p className="text-lg font-semibold text-zinc-900">
                      {totalPossibleSends}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-zinc-600">
                    <span>Initial</span>
                    <span className="text-zinc-400">Already sent</span>
                  </div>
                  {draftSteps
                    .filter((s) => s.enabled)
                    .map((s, i) => (
                      <div
                        key={s.localId}
                        className="flex justify-between text-zinc-600"
                      >
                        <span>Follow-up #{i + 1}</span>
                        <span className="text-zinc-400">
                          +{s.delayDays} day{s.delayDays !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                  <div className="flex justify-between pt-2 border-t border-zinc-100">
                    <span className="text-zinc-600">Reply protection</span>
                    <span
                      className={
                        stopOnReply
                          ? "text-emerald-600 font-medium"
                          : "text-zinc-400"
                      }
                    >
                      {stopOnReply ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Live preview */}
            <div className="xl:col-span-2">
              <div className="sticky top-20 rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Live Preview
                  </h3>
                  <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewMode("desktop")}
                      className={`rounded-md p-1.5 ${
                        previewMode === "desktop"
                          ? "bg-white shadow-sm text-zinc-900"
                          : "text-zinc-400"
                      }`}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode("mobile")}
                      className={`rounded-md p-1.5 ${
                        previewMode === "mobile"
                          ? "bg-white shadow-sm text-zinc-900"
                          : "text-zinc-400"
                      }`}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {selectedContacts.length > 1 && (
                  <div className="border-b border-zinc-100 px-4 py-2 flex items-center gap-2 overflow-x-auto">
                    {selectedContacts.slice(0, 6).map((c, i) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setPreviewIdx(i)}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                          previewIdx === i
                            ? "bg-blue-100 text-blue-700"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {(c.name || c.email).split(" ")[0]}
                      </button>
                    ))}
                    {selectedContacts.length > 6 && (
                      <span className="text-xs text-zinc-400">
                        +{selectedContacts.length - 6}
                      </span>
                    )}
                  </div>
                )}
                <div
                  className={`p-4 ${
                    previewMode === "mobile" ? "max-w-[320px] mx-auto" : ""
                  }`}
                >
                  <div className="rounded-lg border border-zinc-200 overflow-hidden">
                    <div className="bg-zinc-50 px-4 py-2.5 border-b border-zinc-100 space-y-1">
                      <div className="flex gap-2 text-xs">
                        <span className="text-zinc-400 w-10">To:</span>
                        <span className="text-zinc-700">
                          {previewContact?.email || "—"}
                        </span>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <span className="text-zinc-400 w-10">Subject:</span>
                        <span className="text-zinc-900 font-medium">
                          {activeDraft
                            ? replaceVars(
                                activeDraft.subject || "(No subject)",
                                previewContact || { email: "" }
                              )
                            : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="px-4 py-4 min-h-[200px]">
                      <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-700 leading-relaxed">
                        {activeDraft
                          ? replaceVars(
                              activeDraft.body || "",
                              previewContact || { email: "" }
                            )
                          : "Select a follow-up to preview"}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {createStep === 2 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            <button
              onClick={() => setCreateStep(1)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              ← Back
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={saveDraft}
                disabled={saving}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Draft"}
              </button>
              <button
                onClick={validateAndConfirmStart}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
              >
                {scheduleType === "scheduled"
                  ? "Schedule Campaign"
                  : "Start Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showStartConfirm}
        title="Ready to start?"
        description={
          <div className="space-y-1.5 mt-2">
            <p>
              <span className="font-medium text-zinc-900">
                {selectedIds.size}
              </span>{" "}
              recipients selected
            </p>
            <p>
              <span className="font-medium text-zinc-900">
                {draftSteps.filter((s) => s.enabled).length}
              </span>{" "}
              follow-ups configured
            </p>
            <p>
              <span className="font-medium text-zinc-900">
                {totalPossibleSends}
              </span>{" "}
              maximum follow-up emails
            </p>
          </div>
        }
        confirmLabel={
          scheduleType === "scheduled" ? "Schedule Campaign" : "Start Campaign"
        }
        loading={saving}
        onConfirm={confirmStart}
        onCancel={() => setShowStartConfirm(false)}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}