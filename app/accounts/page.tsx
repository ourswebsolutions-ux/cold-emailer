"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Mail,
  Shield,
  CheckCircle2,
  AlertTriangle,
  MoreVertical,
  Eye,
  EyeOff,
  Loader2,
  Inbox,
  Server,
  Lock,
  X,
} from "lucide-react";

type AccountStatus = "Active" | "Needs Attention" | "Disconnected";

interface ConnectedAccount {
  id: string;
  email: string;
  provider: "Google" | "Custom SMTP";
  status: AccountStatus;
  warmupDay: number;
  dailyLimit: number;
  health: number;
}

const INITIAL_ACCOUNTS: ConnectedAccount[] = [
  {
    id: "1",
    email: "john@gmail.com",
    provider: "Google",
    status: "Active",
    warmupDay: 12,
    dailyLimit: 40,
    health: 96,
  },
  {
    id: "2",
    email: "sales@company.com",
    provider: "Custom SMTP",
    status: "Active",
    warmupDay: 7,
    dailyLimit: 25,
    health: 91,
  },
  {
    id: "3",
    email: "test@gmail.com",
    provider: "Google",
    status: "Needs Attention",
    warmupDay: 3,
    dailyLimit: 10,
    health: 72,
  },
];

export default function ConnectAccountsPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(INITIAL_ACCOUNTS);
  const [showManualForm, setShowManualForm] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle");

  const [form, setForm] = useState({
    email: "",
    senderName: "",
    smtpHost: "",
    smtpPort: "587",
    smtpUsername: "",
    smtpPassword: "",
    imapHost: "",
    imapPort: "993",
  });

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const connectedCount = accounts.length;
  const activeCount = accounts.filter((a) => a.status === "Active").length;
  const needsAttentionCount = accounts.filter(
    (a) => a.status === "Needs Attention" || a.status === "Disconnected"
  ).length;

  const handleGoogleConnect = () => {
    console.log("Starting Google OAuth...");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult("idle");
    setTimeout(() => {
      setIsTesting(false);
      setTestResult("success");
      setTimeout(() => setTestResult("idle"), 3000);
    }, 1500);
  };

  const handleSaveAccount = () => {
    if (!form.email.trim()) return;
    const newAccount: ConnectedAccount = {
      id: Date.now().toString(),
      email: form.email.trim(),
      provider: "Custom SMTP",
      status: "Active",
      warmupDay: 1,
      dailyLimit: 10,
      health: 100,
    };
    setAccounts((prev) => [newAccount, ...prev]);
    setShowManualForm(false);
    setForm({
      email: "",
      senderName: "",
      smtpHost: "",
      smtpPort: "587",
      smtpUsername: "",
      smtpPassword: "",
      imapHost: "",
      imapPort: "993",
    });
    setTestResult("idle");
  };

  const handleRemoveAccount = (id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setOpenMenuId(null);
  };

  const statusBadge = (status: AccountStatus) => {
    const styles: Record<AccountStatus, string> = {
      Active: "bg-green-50 text-green-700 border-green-200",
      "Needs Attention": "bg-amber-50 text-amber-700 border-amber-200",
      Disconnected: "bg-red-50 text-red-700 border-red-200",
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}
      >
        {status}
      </span>
    );
  };

  const healthBar = (health: number) => {
    const color =
      health >= 90 ? "bg-green-500" : health >= 70 ? "bg-amber-500" : "bg-red-500";
    return (
      <div className="flex items-center gap-2 min-w-[100px]">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${color}`}
            style={{ width: `${health}%` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-600 w-8">{health}%</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6  py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-[#0F172A] tracking-tight">
              Connect Accounts
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">
              Connect your email accounts to send warm-up emails and manage replies.
            </p>
          </div>
          <button
            onClick={() => {
              setShowManualForm(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Connect Account
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-5">
            <p className="text-sm font-medium text-[#64748B]">Connected Accounts</p>
            <p className="mt-2 text-3xl font-semibold text-[#0F172A]">{connectedCount}</p>
            <p className="mt-1 text-xs text-[#64748B] flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              Total linked
            </p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-5">
            <p className="text-sm font-medium text-[#64748B]">Active Accounts</p>
            <p className="mt-2 text-3xl font-semibold text-[#0F172A]">{activeCount}</p>
            <p className="mt-1 text-xs text-[#64748B] flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" />
              Currently warming up
            </p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-5">
            <p className="text-sm font-medium text-[#64748B]">Needs Attention</p>
            <p className="mt-2 text-3xl font-semibold text-[#0F172A]">
              {needsAttentionCount}
            </p>
            <p className="mt-1 text-xs text-[#64748B] flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B]" />
              Require action
            </p>
          </div>
        </div>

        {/* Connection Methods */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-6 mb-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[#0F172A]">
              Connect an Email Account
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">
              Choose how you want to connect your email account.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Google Option */}
            <div className="relative rounded-xl border-2 border-[#2563EB]/20 bg-blue-50/30 p-5 flex flex-col">
              <div className="absolute top-3 right-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-[#2563EB] text-white">
                  Recommended
                </span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-[#E2E8F0] shadow-sm">
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#0F172A]">Google</h3>
                  <p className="text-xs text-[#64748B]">OAuth connection</p>
                </div>
              </div>
              <p className="text-sm text-[#64748B] mb-4 flex-1">
                Connect your Google account securely using OAuth.
              </p>
              <button
                onClick={handleGoogleConnect}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 transition-colors"
              >
                Continue with Google
              </button>
              <p className="mt-3 text-xs text-[#64748B] flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-[#16A34A]" />
                Your password is never shared with this application.
              </p>
            </div>

            {/* Manual SMTP Option */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 border border-[#E2E8F0]">
                  <Server className="h-5 w-5 text-[#64748B]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#0F172A]">
                    Manual SMTP / IMAP
                  </h3>
                  <p className="text-xs text-[#64748B]">Custom credentials</p>
                </div>
              </div>
              <p className="text-sm text-[#64748B] mb-4 flex-1">
                Connect Gmail, Outlook, custom domains, or other email providers using
                SMTP and IMAP credentials.
              </p>
              <button
                onClick={() => setShowManualForm(true)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#0F172A] text-sm font-medium px-4 py-2.5 transition-colors"
              >
                Connect Manually
              </button>
            </div>
          </div>

          {/* Security note */}
          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:gap-6 text-xs text-[#64748B]">
            <p className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Your credentials are encrypted and securely stored.
            </p>
            <p className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              Google connections use OAuth and do not require your Google password.
            </p>
          </div>
        </div>

        {/* Manual Connection Form */}
        {showManualForm && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-[#0F172A]">
                  Manual SMTP / IMAP Connection
                </h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  Enter your email server credentials to connect.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowManualForm(false);
                  setTestResult("idle");
                }}
                className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleInputChange}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Sender Name
                </label>
                <input
                  type="text"
                  name="senderName"
                  value={form.senderName}
                  onChange={handleInputChange}
                  placeholder="John Doe"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  SMTP Host
                </label>
                <input
                  type="text"
                  name="smtpHost"
                  value={form.smtpHost}
                  onChange={handleInputChange}
                  placeholder="smtp.gmail.com"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  SMTP Port
                </label>
                <input
                  type="text"
                  name="smtpPort"
                  value={form.smtpPort}
                  onChange={handleInputChange}
                  placeholder="587"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  SMTP Username
                </label>
                <input
                  type="text"
                  name="smtpUsername"
                  value={form.smtpUsername}
                  onChange={handleInputChange}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  SMTP Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="smtpPassword"
                    value={form.smtpPassword}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 pr-10 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#64748B] hover:text-[#0F172A]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  IMAP Host
                </label>
                <input
                  type="text"
                  name="imapHost"
                  value={form.imapHost}
                  onChange={handleInputChange}
                  placeholder="imap.gmail.com"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  IMAP Port
                </label>
                <input
                  type="text"
                  name="imapPort"
                  value={form.imapPort}
                  onChange={handleInputChange}
                  placeholder="993"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#0F172A] text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-60"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </button>
              <button
                onClick={handleSaveAccount}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 transition-colors"
              >
                Save Account
              </button>
              {testResult === "success" && (
                <span className="text-sm text-[#16A34A] flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Connection successful
                </span>
              )}
            </div>
          </div>
        )}

        {/* Connected Accounts */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-[#E2E8F0]">
            <h2 className="text-lg font-semibold text-[#0F172A]">Connected Accounts</h2>
            <p className="mt-1 text-sm text-[#64748B]">
              Manage the email accounts connected to your workspace.
            </p>
          </div>

          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 border border-[#E2E8F0] mb-4">
                <Inbox className="h-6 w-6 text-[#64748B]" />
              </div>
              <h3 className="text-base font-semibold text-[#0F172A]">
                Connect your first email account
              </h3>
              <p className="mt-1 text-sm text-[#64748B] max-w-sm">
                Connect an account to start email warm-up.
              </p>
              <button
                onClick={() => setShowManualForm(false)}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Connect Account
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-slate-50/50">
                      <th className="px-6 py-3 text-xs font-medium text-[#64748B] uppercase tracking-wider">
                        Account
                      </th>
                      <th className="px-6 py-3 text-xs font-medium text-[#64748B] uppercase tracking-wider">
                        Provider
                      </th>
                      <th className="px-6 py-3 text-xs font-medium text-[#64748B] uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-xs font-medium text-[#64748B] uppercase tracking-wider">
                        Warm-up
                      </th>
                      <th className="px-6 py-3 text-xs font-medium text-[#64748B] uppercase tracking-wider">
                        Daily Limit
                      </th>
                      <th className="px-6 py-3 text-xs font-medium text-[#64748B] uppercase tracking-wider">
                        Health
                      </th>
                      <th className="px-6 py-3 text-xs font-medium text-[#64748B] uppercase tracking-wider text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {accounts.map((account) => (
                      <tr key={account.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[#64748B]">
                              <Mail className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-medium text-[#0F172A]">
                              {account.email}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-[#64748B]">{account.provider}</span>
                        </td>
                        <td className="px-6 py-4">{statusBadge(account.status)}</td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-[#0F172A]">
                            Day {account.warmupDay}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-[#0F172A]">
                            {account.dailyLimit}/day
                          </span>
                        </td>
                        <td className="px-6 py-4">{healthBar(account.health)}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="relative inline-block" ref={openMenuId === account.id ? menuRef : null}>
                            <button
                              onClick={() =>
                                setOpenMenuId(openMenuId === account.id ? null : account.id)
                              }
                              className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 transition-colors"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openMenuId === account.id && (
                              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[#E2E8F0] bg-white shadow-lg py-1">
                                <button className="w-full text-left px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50">
                                  View Details
                                </button>
                                <button className="w-full text-left px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50">
                                  Test Connection
                                </button>
                                <button className="w-full text-left px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50">
                                  Pause Warm-up
                                </button>
                                <button className="w-full text-left px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50">
                                  Reconnect
                                </button>
                                <button
                                  onClick={() => handleRemoveAccount(account.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-[#DC2626] hover:bg-red-50"
                                >
                                  Remove Account
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-[#E2E8F0]">
                {accounts.map((account) => (
                  <div key={account.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[#64748B]">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0F172A] truncate">
                            {account.email}
                          </p>
                          <p className="text-xs text-[#64748B]">{account.provider}</p>
                        </div>
                      </div>
                      <div className="relative shrink-0" ref={openMenuId === account.id ? menuRef : null}>
                        <button
                          onClick={() =>
                            setOpenMenuId(openMenuId === account.id ? null : account.id)
                          }
                          className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenuId === account.id && (
                          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[#E2E8F0] bg-white shadow-lg py-1">
                            <button className="w-full text-left px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50">
                              View Details
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50">
                              Test Connection
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50">
                              Pause Warm-up
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-[#0F172A] hover:bg-slate-50">
                              Reconnect
                            </button>
                            <button
                              onClick={() => handleRemoveAccount(account.id)}
                              className="w-full text-left px-4 py-2 text-sm text-[#DC2626] hover:bg-red-50"
                            >
                              Remove Account
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      {statusBadge(account.status)}
                      <span className="text-xs text-[#64748B]">
                        Day {account.warmupDay}
                      </span>
                      <span className="text-xs text-[#64748B]">
                        {account.dailyLimit}/day
                      </span>
                    </div>
                    <div className="mt-3">{healthBar(account.health)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}