"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Inbox,
  Star,
  Send,
  FileText,
  Trash2,
  Search,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mail,
  Paperclip,
  Reply,
  ReplyAll,
  Forward,
  MoreHorizontal,
  Star as StarIcon,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Calendar,
  Eye,
  Download,
  Menu,
  Archive,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface EmailAccount {
  id: string;
  provider: "SMTP" | "GMAIL" | "OUTLOOK";
  senderEmail: string;
  senderName?: string | null;
  isActive: boolean;
  unreadCount?: number;
}

interface Attachment {
  id?: string;
  filename: string;
  size?: number;
  mimeType?: string;
  url?: string;
}

interface Message {
  id: string;
  threadId?: string;
  from: string;
  fromName?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject: string;
  snippet?: string;
  body?: string;
  date: string;
  unread?: boolean;
  starred?: boolean;
  hasAttachments?: boolean;
  attachments?: Attachment[];
  folder?: "inbox" | "starred" | "sent" | "drafts" | "trash";
}

type FolderType = "inbox" | "starred" | "sent" | "drafts" | "trash";
type ComposeMode = "compose" | "reply" | "replyAll" | "forward" | null;

interface Notification {
  type: "success" | "error" | "info";
  message: string;
}

// ============================================================================
// Helpers
// ============================================================================

function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  // Common patterns used by existing Next.js apps
  try {
    const fromLocal = localStorage.getItem("userId");
    if (fromLocal) return fromLocal;
    const fromSession = sessionStorage.getItem("userId");
    if (fromSession) return fromSession;
    // Fallback: try common auth keys
    const user = localStorage.getItem("user");
    if (user) {
      const parsed = JSON.parse(user);
      if (parsed?.id) return parsed.id;
      if (parsed?.userId) return parsed.userId;
    }
  } catch {
    // ignore
  }
  return null;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) {
      return "Yesterday";
    }
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function getInitials(name?: string | null, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

function providerIcon(provider: string) {
  switch (provider) {
    case "GMAIL":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-600 dark:bg-red-900/40 dark:text-red-400">
          G
        </span>
      );
    case "OUTLOOK":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
          O
        </span>
      );
    default:
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          S
        </span>
      );
  }
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

function extractName(from: string, fromName?: string): string {
  if (fromName) return fromName;
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return from.split("@")[0];
}

// ============================================================================
// Main Component
// ============================================================================

export default function InboxPage() {
  // ---------- State ----------
  const [userId, setUserId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [folder, setFolder] = useState<FolderType>("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);

  // Mobile view: "list" | "detail" | "sidebar"
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Account selector
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  // Compose / Reply
  const [composeMode, setComposeMode] = useState<ComposeMode>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Thread expand/collapse
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set());

  // Follow-up modal
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDays, setFollowUpDays] = useState("1");
  const [followUpCustom, setFollowUpCustom] = useState("");
  const [followUpBody, setFollowUpBody] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // More menu
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const accountDropdownRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // ---------- Derived ----------
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );

  const selectedMessage = useMemo(
    () => messages.find((m) => m.id === selectedMessageId) || null,
    [messages, selectedMessageId]
  );

  const threadMessages = useMemo(() => {
    if (!selectedMessage) return [];
    const tid = selectedMessage.threadId || selectedMessage.id;
    return messages
      .filter((m) => (m.threadId || m.id) === tid)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [messages, selectedMessage]);

  const filteredMessages = useMemo(() => {
    let list = messages;

    // Folder filter
    if (folder === "starred") {
      list = list.filter((m) => m.starred);
    } else if (folder === "sent") {
      list = list.filter((m) => m.folder === "sent");
    } else if (folder === "drafts") {
      list = list.filter((m) => m.folder === "drafts");
    } else if (folder === "trash") {
      list = list.filter((m) => m.folder === "trash");
    } else {
      // inbox: exclude sent/drafts/trash if folder is set, otherwise show all non-trash
      list = list.filter(
        (m) => !m.folder || m.folder === "inbox" || (!["sent", "drafts", "trash"].includes(m.folder))
      );
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          (m.from || "").toLowerCase().includes(q) ||
          (m.fromName || "").toLowerCase().includes(q) ||
          (m.to || "").toLowerCase().includes(q) ||
          (m.subject || "").toLowerCase().includes(q) ||
          (m.snippet || "").toLowerCase().includes(q) ||
          (m.body || "").toLowerCase().includes(q)
      );
    }

    // Sort newest first
    return [...list].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [messages, folder, searchQuery]);

  const unreadCounts = useMemo(() => {
    const counts: Record<FolderType, number> = {
      inbox: 0,
      starred: 0,
      sent: 0,
      drafts: 0,
      trash: 0,
    };
    messages.forEach((m) => {
      if (m.unread) {
        if (!m.folder || m.folder === "inbox") counts.inbox++;
        if (m.starred) counts.starred++;
        if (m.folder === "sent") counts.sent++;
        if (m.folder === "drafts") counts.drafts++;
        if (m.folder === "trash") counts.trash++;
      }
    });
    return counts;
  }, [messages]);

  // ---------- Notifications ----------
  const showNotification = useCallback((type: Notification["type"], message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // ---------- API Calls ----------
  const fetchAccounts = useCallback(async (uid: string) => {
    setLoadingAccounts(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/accounts?userId=${encodeURIComponent(uid)}`);
      if (!res.ok) throw new Error("Failed to load accounts");
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
        // Auto-select first active account
        const active = data.accounts.find((a: EmailAccount) => a.isActive);
        if (active) {
          setSelectedAccountId((prev) => prev || active.id);
        } else if (data.accounts.length > 0) {
          setSelectedAccountId((prev) => prev || data.accounts[0].id);
        }
      } else {
        setAccounts([]);
      }
    } catch (e) {
      setError("Unable to load inbox.");
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const fetchMessages = useCallback(
    async (accountId: string, preserveSelected = true) => {
      setLoadingMessages(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/inbox/messages?accountId=${encodeURIComponent(accountId)}`
        );
        if (!res.ok) throw new Error("Failed to load messages");
        const data = await res.json();
        const list: Message[] = Array.isArray(data.messages)
          ? data.messages
          : Array.isArray(data)
            ? data
            : [];
        setMessages(list);
        if (!preserveSelected) {
          setSelectedMessageId(null);
        } else if (selectedMessageId && !list.find((m) => m.id === selectedMessageId)) {
          setSelectedMessageId(null);
        }
      } catch {
        setError("Unable to load inbox.");
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [selectedMessageId]
  );

  const handleRefresh = useCallback(async () => {
    if (!selectedAccountId || refreshing) return;
    setRefreshing(true);
    await fetchMessages(selectedAccountId, true);
    setRefreshing(false);
  }, [selectedAccountId, refreshing, fetchMessages]);

  const markAsRead = useCallback(
    async (messageId: string) => {
      if (!selectedAccountId) return;
      // Optimistic
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, unread: false } : m))
      );
      try {
        await fetch("/api/inbox/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: selectedAccountId, messageId }),
        });
      } catch {
        // revert on failure
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, unread: true } : m))
        );
      }
    },
    [selectedAccountId]
  );

  const markAsUnread = useCallback(
    async (messageId: string) => {
      if (!selectedAccountId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, unread: true } : m))
      );
      setMoreMenuOpen(false);
      try {
        await fetch("/api/inbox/unread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: selectedAccountId, messageId }),
        });
        showNotification("success", "Marked as unread");
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, unread: false } : m))
        );
        showNotification("error", "Failed to mark as unread");
      }
    },
    [selectedAccountId, showNotification]
  );

  const toggleStar = useCallback(
    async (messageId: string, currentlyStarred: boolean) => {
      if (!selectedAccountId) return;
      const next = !currentlyStarred;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, starred: next } : m))
      );
      try {
        await fetch("/api/inbox/star", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: selectedAccountId,
            messageId,
            starred: next,
          }),
        });
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, starred: currentlyStarred } : m
          )
        );
        showNotification("error", "Failed to update star");
      }
    },
    [selectedAccountId, showNotification]
  );

  // ---------- Effects ----------
  useEffect(() => {
    const uid = getUserId();
    setUserId(uid);
    if (uid) {
      fetchAccounts(uid);
    } else {
      setLoadingAccounts(false);
      setError("Unable to identify user. Please sign in again.");
    }
  }, [fetchAccounts]);

  useEffect(() => {
    if (selectedAccountId && selectedAccount?.isActive) {
      fetchMessages(selectedAccountId, false);
    } else {
      setMessages([]);
      setSelectedMessageId(null);
    }
  }, [selectedAccountId, selectedAccount?.isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(e.target as Node)
      ) {
        setAccountDropdownOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Expand latest message in thread by default
  useEffect(() => {
    if (threadMessages.length > 0) {
      const latest = threadMessages[threadMessages.length - 1];
      setExpandedMessageIds(new Set([latest.id]));
    }
  }, [selectedMessageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Handlers ----------
  const selectMessage = (msg: Message) => {
    setSelectedMessageId(msg.id);
    setMobileView("detail");
    setComposeMode(null);
    if (msg.unread) {
      markAsRead(msg.id);
    }
  };

  const openCompose = () => {
    setComposeMode("compose");
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeError(null);
  };

  const openReply = (mode: "reply" | "replyAll" | "forward") => {
    if (!selectedMessage || !selectedAccount) return;
    setComposeMode(mode);
    setComposeError(null);

    if (mode === "forward") {
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject(`Fwd: ${selectedMessage.subject || ""}`);
      setComposeBody(
        `\n\n---------- Forwarded message ----------\nFrom: ${selectedMessage.fromName || selectedMessage.from}\nDate: ${formatFullDate(selectedMessage.date)}\nSubject: ${selectedMessage.subject}\n\n${selectedMessage.body || selectedMessage.snippet || ""}`
      );
    } else {
      const replyTo = extractEmail(selectedMessage.from);
      setComposeTo(replyTo);
      if (mode === "replyAll") {
        const others = [selectedMessage.to, selectedMessage.cc]
          .filter(Boolean)
          .join(", ");
        setComposeCc(others);
      } else {
        setComposeCc("");
      }
      setComposeBcc("");
      const subj = selectedMessage.subject || "";
      setComposeSubject(subj.startsWith("Re:") ? subj : `Re: ${subj}`);
      setComposeBody("");
    }
  };

  const handleSend = async () => {
    if (!selectedAccountId || !composeMode) return;
    if (!composeTo.trim() && composeMode !== "forward") {
      setComposeError("Recipient is required");
      return;
    }
    if (composeMode === "forward" && !composeTo.trim()) {
      setComposeError("Recipient is required");
      return;
    }

    setComposeLoading(true);
    setComposeError(null);

    try {
      if (composeMode === "compose" || composeMode === "forward") {
        const res = await fetch("/api/inbox/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: selectedAccountId,
            to: composeTo.trim(),
            cc: composeCc.trim() || undefined,
            bcc: composeBcc.trim() || undefined,
            subject: composeSubject,
            body: composeBody,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Failed to send");
        }
        showNotification("success", "Message sent successfully");
      } else {
        // reply / replyAll
        const res = await fetch("/api/inbox/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: selectedAccountId,
            threadId: selectedMessage?.threadId || selectedMessage?.id,
            to: composeTo.trim(),
            subject: composeSubject,
            body: composeBody,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Failed to send reply");
        }
        showNotification("success", "Reply sent successfully");
      }

      setComposeMode(null);
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject("");
      setComposeBody("");
      // Refresh
      if (selectedAccountId) {
        await fetchMessages(selectedAccountId, true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to send message";
      setComposeError(msg);
      showNotification("error", msg);
    } finally {
      setComposeLoading(false);
    }
  };

  const handleScheduleFollowUp = async () => {
    if (!selectedAccountId || !selectedMessage) return;
    setFollowUpLoading(true);
    try {
      let scheduledAt: string;
      if (followUpDays === "custom" && followUpCustom) {
        scheduledAt = new Date(followUpCustom).toISOString();
      } else {
        const days = parseInt(followUpDays, 10) || 1;
        const d = new Date();
        d.setDate(d.getDate() + days);
        scheduledAt = d.toISOString();
      }

      const res = await fetch("/api/inbox/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          threadId: selectedMessage.threadId || selectedMessage.id,
          recipient: extractEmail(selectedMessage.from),
          subject: selectedMessage.subject?.startsWith("Re:")
            ? selectedMessage.subject
            : `Re: ${selectedMessage.subject || ""}`,
          body: followUpBody || "Just following up on my previous message.",
          scheduledAt,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to schedule follow-up");
      }
      showNotification("success", "Follow-up scheduled successfully.");
      setFollowUpOpen(false);
      setFollowUpBody("");
      setFollowUpDays("1");
      setFollowUpCustom("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to schedule follow-up";
      showNotification("error", msg);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---------- Render helpers ----------
  const folders: { key: FolderType; label: string; icon: React.ReactNode }[] = [
    { key: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" /> },
    { key: "starred", label: "Starred", icon: <Star className="h-4 w-4" /> },
    { key: "sent", label: "Sent", icon: <Send className="h-4 w-4" /> },
    { key: "drafts", label: "Drafts", icon: <FileText className="h-4 w-4" /> },
    { key: "trash", label: "Trash", icon: <Trash2 className="h-4 w-4" /> },
  ];

  // ============================================================================
  // Skeleton components
  // ============================================================================

  const AccountSkeleton = () => (
    <div className="animate-pulse space-y-2 p-3">
      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-3 w-40 rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  );

  const MessageRowSkeleton = () => (
    <div className="flex animate-pulse gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
      <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );

  const DetailSkeleton = () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="space-y-2 pt-4">
        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );

  // ============================================================================
  // Notification toast
  // ============================================================================

  const Toast = () => {
    if (!notification) return null;
    return (
      <div
        className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all ${
          notification.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : notification.type === "error"
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              : "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        }`}
      >
        {notification.type === "success" ? (
          <CheckCircle2 className="h-5 w-5 shrink-0" />
        ) : notification.type === "error" ? (
          <AlertCircle className="h-5 w-5 shrink-0" />
        ) : (
          <Mail className="h-5 w-5 shrink-0" />
        )}
        <span className="text-sm font-medium">{notification.message}</span>
        <button
          onClick={() => setNotification(null)}
          className="ml-auto rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  };

  // ============================================================================
  // Account Selector
  // ============================================================================

  const AccountSelector = () => (
    <div className="relative" ref={accountDropdownRef}>
      <button
        onClick={() => setAccountDropdownOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {selectedAccount ? (
          <>
            {providerIcon(selectedAccount.provider)}
            <span className="max-w-[180px] truncate">{selectedAccount.senderEmail}</span>
          </>
        ) : (
          <span>All Accounts</span>
        )}
        <ChevronDown className="h-4 w-4 opacity-60" />
      </button>

      {accountDropdownOpen && (
        <div className="absolute left-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Accounts
          </div>
          {loadingAccounts ? (
            <AccountSkeleton />
          ) : accounts.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              No email accounts connected.
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {accounts.map((acc) => (
                <li key={acc.id}>
                  <button
                    onClick={() => {
                      setSelectedAccountId(acc.id);
                      setAccountDropdownOpen(false);
                      setSelectedMessageId(null);
                      setMobileView("list");
                    }}
                    className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      selectedAccountId === acc.id
                        ? "bg-slate-50 dark:bg-slate-800/80"
                        : ""
                    }`}
                  >
                    {providerIcon(acc.provider)}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {acc.senderName || acc.senderEmail}
                      </div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {acc.senderEmail}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            acc.isActive
                              ? "bg-emerald-500"
                              : "bg-slate-300 dark:bg-slate-600"
                          }`}
                        />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {acc.isActive ? "Active" : "Inactive"}
                        </span>
                        {acc.unreadCount && acc.unreadCount > 0 ? (
                          <span className="ml-auto rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {acc.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  // ============================================================================
  // Sidebar
  // ============================================================================

  const Sidebar = ({ className = "" }: { className?: string }) => (
    <aside
      className={`flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/50 ${className}`}
    >
      <div className="p-3">
        <button
          onClick={openCompose}
          disabled={!selectedAccount?.isActive}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Compose
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 pb-4">
        {folders.map((f) => {
          const count = unreadCounts[f.key];
          const active = folder === f.key;
          return (
            <button
              key={f.key}
              onClick={() => {
                setFolder(f.key);
                setSelectedMessageId(null);
                setMobileView("list");
                setSidebarOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {f.icon}
              <span className="flex-1 text-left">{f.label}</span>
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );

  // ============================================================================
  // Conversation List
  // ============================================================================

  const ConversationList = () => {
    if (!selectedAccount) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <Mail className="h-12 w-12 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            No email accounts connected.
          </p>
          <p className="text-xs text-slate-500">
            Connect an email account from Config.
          </p>
        </div>
      );
    }

    if (!selectedAccount.isActive) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-amber-400" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Account is inactive
          </p>
          <p className="max-w-xs text-xs text-slate-500">
            Activate this account from Config before accessing its inbox.
          </p>
        </div>
      );
    }

    if (loadingMessages && messages.length === 0) {
      return (
        <div className="flex-1 overflow-y-auto">
          {Array.from({ length: 8 }).map((_, i) => (
            <MessageRowSkeleton key={i} />
          ))}
        </div>
      );
    }

    if (error && messages.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {error}
          </p>
          <button
            onClick={handleRefresh}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (filteredMessages.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <Inbox className="h-12 w-12 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {searchQuery ? "No messages found." : "Your inbox is empty."}
          </p>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-y-auto">
        {filteredMessages.map((msg) => {
          const isSelected = msg.id === selectedMessageId;
          const name = extractName(msg.from, msg.fromName);
          return (
            <button
              key={msg.id}
              onClick={() => selectMessage(msg)}
              className={`group flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition dark:border-slate-800/80 ${
                isSelected
                  ? "bg-blue-50 dark:bg-blue-950/30"
                  : msg.unread
                    ? "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                    : "bg-slate-50/50 hover:bg-slate-100/80 dark:bg-slate-950/40 dark:hover:bg-slate-800/40"
              }`}
            >
              {/* Unread dot + avatar */}
              <div className="relative shrink-0 pt-0.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
                    msg.unread
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {getInitials(msg.fromName, msg.from)}
                </div>
                {msg.unread && (
                  <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-blue-600" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate text-sm ${
                      msg.unread
                        ? "font-semibold text-slate-900 dark:text-slate-50"
                        : "font-medium text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {name}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                    {formatDate(msg.date)}
                  </span>
                </div>
                <div
                  className={`truncate text-sm ${
                    msg.unread
                      ? "font-medium text-slate-800 dark:text-slate-200"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {msg.subject || "(no subject)"}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <p className="truncate text-xs text-slate-500 dark:text-slate-500">
                    {msg.snippet || ""}
                  </p>
                  {msg.hasAttachments && (
                    <Paperclip className="h-3 w-3 shrink-0 text-slate-400" />
                  )}
                  {msg.starred && (
                    <StarIcon className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  // ============================================================================
  // Message Detail / Thread View
  // ============================================================================

  const MessageDetail = () => {
    if (!selectedMessage) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-slate-400">
          <Mail className="h-14 w-14 opacity-40" />
          <p className="text-sm">Select a conversation to read</p>
        </div>
      );
    }

    if (loadingMessages && !selectedMessage.body) {
      return <DetailSkeleton />;
    }

    return (
      <div className="flex h-full flex-col">
        {/* Header actions */}
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
          <button
            onClick={() => {
              setSelectedMessageId(null);
              setMobileView("list");
            }}
            className="mr-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            onClick={() => openReply("reply")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Reply className="h-4 w-4" />
            <span className="hidden sm:inline">Reply</span>
          </button>
          <button
            onClick={() => openReply("replyAll")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ReplyAll className="h-4 w-4" />
            <span className="hidden sm:inline">Reply All</span>
          </button>
          <button
            onClick={() => openReply("forward")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Forward className="h-4 w-4" />
            <span className="hidden sm:inline">Forward</span>
          </button>

          <button
            onClick={() =>
              toggleStar(selectedMessage.id, !!selectedMessage.starred)
            }
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title={selectedMessage.starred ? "Unstar" : "Star"}
          >
            <StarIcon
              className={`h-4 w-4 ${
                selectedMessage.starred
                  ? "fill-amber-400 text-amber-400"
                  : ""
              }`}
            />
          </button>

          <button
            onClick={() => setFollowUpOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Schedule Follow-up</span>
          </button>

          <div className="relative ml-auto" ref={moreMenuRef}>
            <button
              onClick={() => setMoreMenuOpen((o) => !o)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <button
                  onClick={() => markAsUnread(selectedMessage.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Eye className="h-4 w-4" />
                  Mark as unread
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Subject */}
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {selectedMessage.subject || "(no subject)"}
          </h2>
        </div>

        {/* Thread messages */}
        <div className="flex-1 overflow-y-auto">
          {threadMessages.map((msg, idx) => {
            const isExpanded = expandedMessageIds.has(msg.id);
            const name = extractName(msg.from, msg.fromName);
            const email = extractEmail(msg.from);
            const isLatest = idx === threadMessages.length - 1;

            return (
              <div
                key={msg.id}
                className={`border-b border-slate-100 dark:border-slate-800/60 ${
                  isExpanded ? "bg-white dark:bg-slate-900" : "bg-slate-50/50 dark:bg-slate-950/30"
                }`}
              >
                {/* Message header (always visible) */}
                <button
                  onClick={() => toggleExpand(msg.id)}
                  className="flex w-full items-start gap-3 px-6 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      msg.unread
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {getInitials(msg.fromName, msg.from)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {name}
                      </span>
                      <span className="text-xs text-slate-500">&lt;{email}&gt;</span>
                      <span className="ml-auto text-xs text-slate-400">
                        {formatFullDate(msg.date)}
                      </span>
                    </div>
                    {!isExpanded && (
                      <p className="mt-0.5 truncate text-sm text-slate-500">
                        {msg.snippet || msg.body?.slice(0, 120) || ""}
                      </p>
                    )}
                    {isExpanded && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        To: {msg.to || selectedAccount?.senderEmail || "—"}
                        {msg.cc ? ` · Cc: ${msg.cc}` : ""}
                      </div>
                    )}
                  </div>
                  <ChevronDown
                    className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="px-6 pb-5 pl-[4.25rem]">
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700 dark:prose-invert dark:text-slate-300">
                      {msg.body || msg.snippet || "(no content)"}
                    </div>

                    {/* Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Attachments
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att, i) => (
                            <a
                              key={att.id || i}
                              href={att.url || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              <span className="max-w-[160px] truncate">
                                {att.filename}
                              </span>
                              <Download className="h-3.5 w-3.5 opacity-50" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.hasAttachments && (!msg.attachments || msg.attachments.length === 0) && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                        <Paperclip className="h-3.5 w-3.5" />
                        This message has attachments
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Inline reply composer */}
        {(composeMode === "reply" ||
          composeMode === "replyAll" ||
          composeMode === "forward") && (
          <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="space-y-0 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 border-b border-slate-50 px-3 py-2 dark:border-slate-800/50">
                  <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                    To
                  </span>
                  <input
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
                    placeholder="recipient@example.com"
                  />
                </div>
                {(composeMode === "replyAll" || composeCc) && (
                  <div className="flex items-center gap-2 border-b border-slate-50 px-3 py-2 dark:border-slate-800/50">
                    <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                      Cc
                    </span>
                    <input
                      value={composeCc}
                      onChange={(e) => setComposeCc(e.target.value)}
                      className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                    Subject
                  </span>
                  <input
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
                  />
                </div>
              </div>
              <textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                rows={6}
                placeholder="Write your message..."
                className="w-full resize-none bg-transparent px-3 py-3 text-sm outline-none dark:text-slate-100"
              />
              {composeError && (
                <p className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">
                  {composeError}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setComposeMode(null)}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={composeLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {composeLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {composeMode === "forward" ? "Send" : "Send Reply"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // Compose Modal (new message)
  // ============================================================================

  const ComposeModal = () => {
    if (composeMode !== "compose") return null;

    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={() => !composeLoading && setComposeMode(null)}
        />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              New Message
            </h3>
            <button
              onClick={() => !composeLoading && setComposeMode(null)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-0 overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-slate-50 px-4 py-2.5 dark:border-slate-800/50">
              <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                From
              </span>
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {selectedAccount?.senderEmail || "—"}
              </span>
            </div>
            <div className="flex items-center gap-2 border-b border-slate-50 px-4 py-2.5 dark:border-slate-800/50">
              <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                To
              </span>
              <input
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
                placeholder="recipient@example.com"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2 border-b border-slate-50 px-4 py-2.5 dark:border-slate-800/50">
              <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                Cc
              </span>
              <input
                value={composeCc}
                onChange={(e) => setComposeCc(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
                placeholder="optional"
              />
            </div>
            <div className="flex items-center gap-2 border-b border-slate-50 px-4 py-2.5 dark:border-slate-800/50">
              <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                Bcc
              </span>
              <input
                value={composeBcc}
                onChange={(e) => setComposeBcc(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
                placeholder="optional"
              />
            </div>
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
              <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                Subject
              </span>
              <input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
                placeholder="Subject"
              />
            </div>
            <textarea
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              rows={12}
              placeholder="Write your message..."
              className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none dark:text-slate-100"
            />
          </div>

          {composeError && (
            <p className="px-4 pb-1 text-xs text-red-600 dark:text-red-400">
              {composeError}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setComposeMode(null)}
                disabled={composeLoading}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={composeLoading}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {composeLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // Follow-up Modal
  // ============================================================================

  const FollowUpModal = () => {
    if (!followUpOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={() => !followUpLoading && setFollowUpOpen(false)}
        />
        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Schedule Follow-up
            </h3>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                Send after
              </label>
              <select
                value={followUpDays}
                onChange={(e) => setFollowUpDays(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="1">1 day</option>
                <option value="2">2 days</option>
                <option value="3">3 days</option>
                <option value="7">1 week</option>
                <option value="14">2 weeks</option>
                <option value="custom">Custom Date & Time</option>
              </select>
            </div>
            {followUpDays === "custom" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={followUpCustom}
                  onChange={(e) => setFollowUpCustom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                Message
              </label>
              <textarea
                value={followUpBody}
                onChange={(e) => setFollowUpBody(e.target.value)}
                rows={4}
                placeholder="Just following up on my previous message..."
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
            <button
              onClick={() => setFollowUpOpen(false)}
              disabled={followUpLoading}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleScheduleFollowUp}
              disabled={followUpLoading}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {followUpLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
              Schedule
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // Main Layout
  // ============================================================================

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-[600px] flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      {/* Top Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        {/* Mobile menu */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
          <AccountSelector />
        </div>

        <div className="ml-auto flex flex-1 items-center justify-end gap-2 sm:ml-4 sm:max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:bg-slate-900"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || !selectedAccount?.isActive}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            title="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={openCompose}
            disabled={!selectedAccount?.isActive}
            className="hidden items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:flex"
          >
            <Plus className="h-4 w-4" />
            Compose
          </button>
        </div>
      </header>

      {/* Body: 3-column on desktop */}
      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar - desktop always, mobile drawer */}
        <div
          className={`fixed inset-y-0 left-0 z-30 transform transition lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar className="h-full" />
        </div>
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Conversation list */}
        <div
          className={`flex w-full flex-col border-r border-slate-200 dark:border-slate-800 md:w-[340px] md:shrink-0 lg:w-[380px] ${
            mobileView === "detail" ? "hidden md:flex" : "flex"
          }`}
        >
          <ConversationList />
        </div>

        {/* Message detail */}
        <div
          className={`min-w-0 flex-1 ${
            mobileView === "list" ? "hidden md:flex md:flex-col" : "flex flex-col"
          }`}
        >
          <MessageDetail />
        </div>
      </div>

      {/* Modals */}
      <ComposeModal />
      <FollowUpModal />
      <Toast />
    </div>
  );
}