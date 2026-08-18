"use client"

/**
 * Email Templates — /app/(dashboard)/email-templates/page.tsx
 * VIP Clean Version + AI Email Analysis / Improve + A/B Testing + Edit
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import "react-quill-new/dist/quill.snow.css"

import {
  Eye,
  Loader2,
  Mail,
  Plus,
  Search,
  Trash2,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  FlaskConical,
  Trophy,
  GitCompareArrows,
  Pencil,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false })

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    ["link", "image"],
    ["blockquote", "code-block"],
    ["clean"],
  ],
}

const quillFormats = [
  "header", "bold", "italic", "underline", "strike",
  "color", "background", "list", "align",
  "link", "image", "blockquote", "code-block",
]

type EmailTemplate = {
  id: string
  userId: string
  subject: string
  body: string
  createdAt: string
  updatedAt: string
}

type EmailAnalysis = {
  score: number
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  detectedWords: string[]
  detectedPhrases: string[]
  issues: string[]
  suggestions: string[]
}

type ImprovedEmail = {
  subject: string
  body: string
  wordCount: number
  estimatedRiskScore: number
  changedItems: string[]
}

/** A/B test pair — metadata only (templates live in existing CRUD) */
type ABTest = {
  id: string
  userId: string
  name: string
  variantAId: string
  variantBId: string
  status: "running" | "completed"
  winnerId?: string
  originalScore?: number
  improvedScore?: number
  createdAt: string
  completedAt?: string
}

const AB_STORAGE_KEY = "email-templates-ab-tests"

function loadABTests(userId: string): ABTest[] {
  if (typeof window === "undefined" || !userId) return []
  try {
    const raw = localStorage.getItem(AB_STORAGE_KEY)
    if (!raw) return []
    const all = JSON.parse(raw) as ABTest[]
    return Array.isArray(all) ? all.filter((t) => t.userId === userId) : []
  } catch {
    return []
  }
}

function saveABTests(userId: string, tests: ABTest[]) {
  if (typeof window === "undefined" || !userId) return
  try {
    const raw = localStorage.getItem(AB_STORAGE_KEY)
    const existing = raw ? (JSON.parse(raw) as ABTest[]) : []
    const others = Array.isArray(existing)
      ? existing.filter((t) => t.userId !== userId)
      : []
    localStorage.setItem(AB_STORAGE_KEY, JSON.stringify([...others, ...tests]))
  } catch {
    // ignore storage errors
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#38;/g, "&")
    .replace(/&#60;/g, "<")
    .replace(/&#62;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Safely highlight detected words/phrases in HTML.
 * Only touches text content outside of tags — never corrupts attributes, tags, or structure.
 * Highlight markup is display-only and is never persisted.
 */
function highlightDetectedInHtml(
  html: string,
  words: string[],
  phrases: string[]
): string {
  const terms = [...phrases, ...words]
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)

  if (terms.length === 0) return html

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi")
  const parts = html.split(/(<[^>]+>)/g)

  return parts
    .map((part) => {
      if (part.startsWith("<") && part.endsWith(">")) return part
      return part.replace(
        pattern,
        '<mark class="ai-highlight" style="background-color: #fef3c7; color: #92400e; padding: 0 2px; border-radius: 2px;">$1</mark>'
      )
    })
    .join("")
}

function riskBadgeClasses(level: "LOW" | "MEDIUM" | "HIGH") {
  switch (level) {
    case "LOW":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "MEDIUM":
      return "bg-amber-50 text-amber-800 border-amber-200"
    case "HIGH":
      return "bg-red-50 text-red-700 border-red-200"
    default:
      return "bg-slate-50 text-slate-700 border-slate-200"
  }
}

function riskScoreColor(level: "LOW" | "MEDIUM" | "HIGH") {
  switch (level) {
    case "LOW":
      return "text-emerald-700"
    case "MEDIUM":
      return "text-amber-700"
    case "HIGH":
      return "text-red-700"
    default:
      return "text-slate-700"
  }
}

function scoreToRiskLevel(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score <= 34) return "LOW"
  if (score <= 69) return "MEDIUM"
  return "HIGH"
}

function riskLabel(level: "LOW" | "MEDIUM" | "HIGH") {
  switch (level) {
    case "LOW":
      return "Low content-based risk"
    case "MEDIUM":
      return "Moderate content-based risk"
    case "HIGH":
      return "High content-based risk"
    default:
      return "Content-based risk"
  }
}

function riskBarColor(level: "LOW" | "MEDIUM" | "HIGH") {
  switch (level) {
    case "LOW":
      return "bg-emerald-500"
    case "MEDIUM":
      return "bg-amber-500"
    case "HIGH":
      return "bg-red-500"
    default:
      return "bg-slate-400"
  }
}

function generateId() {
  return `ab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** Shared AI Content Check panel — used in Create (compact) and View (full) */
function AIContentCheckPanel({
  analysis,
  onImprove,
  improving,
  onReanalyze,
  analyzing,
  compact = false,
}: {
  analysis: EmailAnalysis
  onImprove: () => void
  improving: boolean
  onReanalyze: () => void
  analyzing: boolean
  compact?: boolean
}) {
  const issueCount = analysis.issues?.length || 0
  const words = analysis.detectedWords || []
  const phrases = analysis.detectedPhrases || []
  const suggestions = analysis.suggestions || []
  const [showAllIssues, setShowAllIssues] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(!compact)

  const visibleIssues = showAllIssues
    ? analysis.issues || []
    : (analysis.issues || []).slice(0, 3)
  const hasMoreIssues = issueCount > 3

  const busy = analyzing || improving

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 space-y-4 shadow-sm",
        compact ? "bg-slate-50/80 p-4" : "bg-white p-5"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
          <h4 className="text-sm font-semibold text-slate-900 truncate">AI Content Check</h4>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shrink-0",
            riskBadgeClasses(analysis.riskLevel)
          )}
        >
          {analysis.riskLevel} RISK
        </span>
      </div>

      {/* Score block */}
      <div className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3 space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              AI Content Risk
            </p>
            <p className={cn("text-3xl font-semibold tabular-nums leading-none mt-1", riskScoreColor(analysis.riskLevel))}>
              {analysis.score}
              <span className="text-base font-normal text-slate-400"> / 100</span>
            </p>
          </div>
          <p className={cn("text-sm font-medium text-right", riskScoreColor(analysis.riskLevel))}>
            {riskLabel(analysis.riskLevel)}
          </p>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", riskBarColor(analysis.riskLevel))}
            style={{ width: `${Math.min(100, Math.max(0, analysis.score))}%` }}
          />
        </div>
      </div>

      {/* Issue summary — ONLY analysis.issues.length */}
      {issueCount === 0 ? (
        <p className="text-sm text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          No major content issues detected
        </p>
      ) : (
        <p className="text-sm text-slate-700">
          {issueCount} potential issue{issueCount === 1 ? "" : "s"} detected
        </p>
      )}

      {/* Potentially flagged words */}
      {words.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Potentially flagged words</p>
          <div className="flex flex-wrap gap-1.5">
            {words.map((term, i) => (
              <span
                key={`w-${term}-${i}`}
                className="inline-flex items-center rounded-md border border-amber-200/80 bg-amber-50/80 px-2 py-0.5 text-xs font-medium text-amber-800"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Potentially flagged phrases */}
      {phrases.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Potentially flagged phrases</p>
          <div className="flex flex-wrap gap-1.5">
            {phrases.map((term, i) => (
              <span
                key={`p-${term}-${i}`}
                className="inline-flex items-center rounded-md border border-amber-200/80 bg-amber-50/80 px-2 py-0.5 text-xs font-medium text-amber-800"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Potential concerns (issues only) */}
      {issueCount > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Potential concerns</p>
          <ul className="space-y-1.5">
            {visibleIssues.map((issue, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <span>{issue}</span>
              </li>
            ))}
          </ul>
          {hasMoreIssues && !showAllIssues && (
            <button
              type="button"
              onClick={() => setShowAllIssues(true)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all {issueCount} issues
            </button>
          )}
        </div>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowSuggestions((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            AI Suggestions
            <span className="text-slate-400">({suggestions.length})</span>
            <span className="text-slate-400">{showSuggestions ? "▾" : "▸"}</span>
          </button>
          {showSuggestions && (
            <ul className="space-y-1.5">
              {suggestions.map((s, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        AI-based content analysis. This does not guarantee inbox placement.
      </p>

      {/* Actions: Re-analyze (secondary) + Make It More Spam-Less (primary) */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReanalyze}
          disabled={busy}
          className="gap-1.5 h-9 order-2 sm:order-1"
        >
          {analyzing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Re-analyze
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onImprove}
          disabled={busy}
          className="gap-1.5 h-9 bg-indigo-600 hover:bg-indigo-700 order-1 sm:order-2 sm:flex-1"
        >
          {improving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Improving...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Make It More Spam-Less
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ─── A/B info strip (shown in View when template is part of a test) ─────────
function ABTestBanner({
  abTest,
  templateId,
  otherTemplate,
  onViewOther,
  onDeclareWinner,
  declaring,
}: {
  abTest: ABTest
  templateId: string
  otherTemplate: EmailTemplate | null
  onViewOther: () => void
  onDeclareWinner: () => void
  declaring: boolean
}) {
  const isA = abTest.variantAId === templateId
  const isWinner = abTest.winnerId === templateId
  const isCompleted = abTest.status === "completed"

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 space-y-3",
        isCompleted
          ? isWinner
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-slate-200 bg-slate-50/80"
          : "border-violet-200 bg-violet-50/50"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-semibold text-slate-900">
            A/B Test · Variant {isA ? "A" : "B"}
          </span>
          {isCompleted && isWinner && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              <Trophy className="h-3 w-3" />
              Winner
            </span>
          )}
          {isCompleted && !isWinner && (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              Not selected
            </span>
          )}
          {!isCompleted && (
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
              Running
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate max-w-[200px]">{abTest.name}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {otherTemplate && (
          <Button variant="outline" size="sm" onClick={onViewOther} className="h-8 gap-1.5 text-xs">
            <GitCompareArrows className="h-3.5 w-3.5" />
            View Variant {isA ? "B" : "A"}
          </Button>
        )}
        {!isCompleted && (
          <Button
            size="sm"
            onClick={onDeclareWinner}
            disabled={declaring}
            className="h-8 gap-1.5 text-xs bg-violet-600 hover:bg-violet-700"
          >
            {declaring ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Trophy className="h-3.5 w-3.5" />
                Declare Winner
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Before / After + A/B comparison dialog ─────────────────────────────────
function ImprovementComparisonDialog({
  open,
  onOpenChange,
  originalSubject,
  originalBody,
  originalWordCount,
  originalScore,
  improved,
  onKeepOriginal,
  onRegenerate,
  onUseImproved,
  onStartABTest,
  regenerating,
  creatingAB,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  originalSubject: string
  originalBody: string
  originalWordCount: number
  originalScore: number
  improved: ImprovedEmail | null
  onKeepOriginal: () => void
  onRegenerate: () => void
  onUseImproved: () => void
  onStartABTest: () => void
  regenerating: boolean
  creatingAB: boolean
}) {
  if (!improved) return null

  const wordDiffPct =
    originalWordCount > 0
      ? Math.abs(improved.wordCount - originalWordCount) / originalWordCount
      : 0
  const wordCountOk = wordDiffPct <= 0.1
  const scoreDelta = originalScore - improved.estimatedRiskScore
  const improvedRisk = scoreToRiskLevel(improved.estimatedRiskScore)
  const busy = regenerating || creatingAB

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-6xl p-0 gap-0 rounded-2xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="border-b bg-slate-50 px-6 lg:px-10 py-4 flex-shrink-0">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            AI Improved Email
          </DialogTitle>
          <DialogDescription className="text-slate-500 mt-1">
            Review the alternative, use it, or start an A/B test with both versions.
          </DialogDescription>
        </div>

        <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Word Count</p>
              <div className="mt-2 flex items-baseline gap-3">
                <div>
                  <span className="text-sm text-slate-500">Original</span>
                  <p className="text-lg font-semibold tabular-nums">{originalWordCount}</p>
                </div>
                <span className="text-slate-300">→</span>
                <div>
                  <span className="text-sm text-slate-500">Improved</span>
                  <p className="text-lg font-semibold tabular-nums">{improved.wordCount}</p>
                </div>
              </div>
              <p
                className={cn(
                  "mt-2 text-xs flex items-center gap-1",
                  wordCountOk ? "text-emerald-600" : "text-amber-600"
                )}
              >
                {wordCountOk ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Word count preserved
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" /> Word count changed slightly
                  </>
                )}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Risk Score</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="text-center">
                  <p className="text-xs text-slate-500">Original</p>
                  <p
                    className={cn(
                      "text-xl font-semibold tabular-nums",
                      riskScoreColor(scoreToRiskLevel(originalScore))
                    )}
                  >
                    {originalScore}
                  </p>
                </div>
                <div className="flex flex-col items-center text-slate-400">
                  <span className="text-lg">↓</span>
                  {scoreDelta > 0 && (
                    <span className="text-xs font-medium text-emerald-600">↓ {scoreDelta} pts</span>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">Improved</p>
                  <p className={cn("text-xl font-semibold tabular-nums", riskScoreColor(improvedRisk))}>
                    {improved.estimatedRiskScore}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Improved Risk</p>
              <div className="mt-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold",
                    riskBadgeClasses(improvedRisk)
                  )}
                >
                  {improvedRisk}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">Does not guarantee deliverability</p>
            </div>
          </div>

          {improved.changedItems && improved.changedItems.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-800 mb-2">What AI Improved</p>
              <ul className="space-y-1.5">
                {improved.changedItems.map((item, i) => (
                  <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Side-by-side labeled as Variant A / B for A/B clarity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 overflow-hidden flex flex-col min-h-[280px]">
              <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">Variant A · Original</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{originalSubject}</p>
                </div>
                <span className="shrink-0 rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  A
                </span>
              </div>
              <div className="flex-1 overflow-auto p-4 prose prose-slate prose-sm max-w-none bg-white">
                <div
                  dangerouslySetInnerHTML={{
                    __html: originalBody.replace(/\n/g, "<br>"),
                  }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-indigo-200 overflow-hidden flex flex-col min-h-[280px] ring-1 ring-indigo-100">
              <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-200 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-indigo-800">Variant B · Improved</p>
                  <p className="text-xs text-indigo-600 truncate mt-0.5">{improved.subject}</p>
                </div>
                <span className="shrink-0 rounded-md bg-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-900">
                  B
                </span>
              </div>
              <div className="flex-1 overflow-auto p-4 prose prose-slate prose-sm max-w-none bg-white">
                <div
                  dangerouslySetInnerHTML={{
                    __html: improved.body.replace(/\n/g, "<br>"),
                  }}
                />
              </div>
            </div>
          </div>

          {/* A/B explainer */}
          <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm text-slate-600">
            <p className="flex items-start gap-2">
              <FlaskConical className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
              <span>
                <strong className="font-medium text-slate-800">Start A/B Test</strong> saves both
                versions as linked templates so you can send each to a segment and later declare a
                winner. Nothing is auto-sent.
              </span>
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 lg:px-10 py-4 border-t bg-slate-50 flex-shrink-0 flex-col sm:flex-row gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onKeepOriginal} disabled={busy}>
            Keep Original
          </Button>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={onRegenerate} disabled={busy} className="gap-2">
              {regenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onStartABTest}
              disabled={busy}
              className="gap-2 border-violet-300 text-violet-800 hover:bg-violet-50"
            >
              {creatingAB ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating A/B Test...
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4" />
                  Start A/B Test
                </>
              )}
            </Button>
            <Button
              onClick={onUseImproved}
              disabled={busy}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Use Improved Version
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Create / Edit Template Dialog ──────────────────────────────────────────
function TemplateFormDialog({
  isOpen,
  onOpenChange,
  draftSubject,
  setDraftSubject,
  draftBody,
  setDraftBody,
  onSubmit,
  saving,
  quillRef,
  analyzing,
  analysis,
  improving,
  onAnalyze,
  onImprove,
  onReanalyze,
  onClearAnalysis,
  isEditing,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  draftSubject: string
  setDraftSubject: (value: string) => void
  draftBody: string
  setDraftBody: (value: string) => void
  onSubmit: () => void
  saving: boolean
  quillRef: React.RefObject<any>
  analyzing: boolean
  analysis: EmailAnalysis | null
  improving: boolean
  onAnalyze: () => void
  onImprove: () => void
  onReanalyze: () => void
  onClearAnalysis: () => void
  isEditing: boolean
}) {
  const canAnalyze =
    draftSubject.trim().length > 0 &&
    draftBody.trim().length > 0 &&
    draftBody !== "<p><br></p>"

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!saving && !analyzing && !improving) {
          onOpenChange(open)
          if (!open) onClearAnalysis()
        }
      }}
    >
      <DialogContent className="max-w-[95vw] lg:max-w-7xl p-0 gap-0 rounded-3xl h-[95vh] flex flex-col">
        <div className="border-b bg-slate-50 px- rounded-3xl py-6 lg:px-12 flex-shrink-0">
          <DialogTitle className="text-2xl font-semibold">
            {isEditing ? "Edit Email Template" : "Create Email Template"}
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            {isEditing
              ? "Update your professional reusable email template"
              : "Design a professional reusable email template"}
          </DialogDescription>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col p- lg:p-8">
          <div className="space-y-8 overflow-auto flex-1 pr-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Subject</label>
              <Input
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                placeholder="Welcome to our company"
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-2 flex-1 flex flex-col">
              <label className="text-sm font-medium text-slate-700">Body</label>
              <div className="rounded-2xl border border-slate-200 overflow-hidden flex-1">
                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={draftBody}
                  onChange={setDraftBody}
                  modules={quillModules}
                  formats={quillFormats}
                  placeholder="Write your email content here..."
                />
              </div>
              <p className="text-sm text-slate-500 mt-3">
                Available placeholder:{" "}
                <span className="font-mono text-slate-600">{"{{name}}"}</span>
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              {!analysis ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-500" />
                      Check your email content with AI
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Review content-based risk signals before saving.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onAnalyze}
                    disabled={!canAnalyze || analyzing || improving}
                    className="gap-2 shrink-0"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 text-indigo-500" />
                        Analyze Content
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <AIContentCheckPanel
                  analysis={analysis}
                  onImprove={onImprove}
                  improving={improving}
                  onReanalyze={onReanalyze}
                  analyzing={analyzing}
                  compact
                />
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-8 lg:px-12 py-6 rounded-3xl border-t bg-slate-50 flex-shrink-0">
          <Button
            variant="ghost"
            disabled={saving || analyzing || improving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              saving ||
              analyzing ||
              improving ||
              !draftSubject.trim() ||
              !draftBody.trim() ||
              draftBody === "<p><br></p>"
            }
            className="px-8 bg-indigo-600 hover:bg-indigo-700"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isEditing ? "Updating..." : "Creating..."}
              </>
            ) : isEditing ? (
              "Update Template"
            ) : (
              "Create Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── View Template Dialog ───────────────────────────────────────────────────
function ViewTemplateDialog({
  viewingTemplate,
  onClose,
  analyzing,
  analysis,
  improving,
  onAnalyze,
  onImprove,
  onReanalyze,
  onClearAnalysis,
  abTest,
  otherVariant,
  onViewOtherVariant,
  onDeclareWinner,
  declaringWinner,
}: {
  viewingTemplate: EmailTemplate | null
  onClose: () => void
  analyzing: boolean
  analysis: EmailAnalysis | null
  improving: boolean
  onAnalyze: () => void
  onImprove: () => void
  onReanalyze: () => void
  onClearAnalysis: () => void
  abTest: ABTest | null
  otherVariant: EmailTemplate | null
  onViewOtherVariant: () => void
  onDeclareWinner: () => void
  declaringWinner: boolean
}) {
  const highlightedBody = useMemo(() => {
    if (!viewingTemplate || !analysis) {
      return viewingTemplate ? viewingTemplate.body.replace(/\n/g, "<br>") : ""
    }
    return highlightDetectedInHtml(
      viewingTemplate.body.replace(/\n/g, "<br>"),
      analysis.detectedWords || [],
      analysis.detectedPhrases || []
    )
  }, [viewingTemplate, analysis])

  return (
    <Dialog
      open={!!viewingTemplate}
      onOpenChange={(open) => {
        if (!open && !analyzing && !improving && !declaringWinner) {
          onClearAnalysis()
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-[95vw] lg:max-w-7xl p-0 gap-0 rounded-2xl h-auto max-h-[95vh] flex flex-col overflow-hidden">
        {viewingTemplate && (
          <>
            <div className="border-b bg-slate-50 px-6 lg:px-12 py-3 rounded-t-2xl flex-shrink-0">
              <DialogTitle className="text-2xl font-semibold">Preview Email Template</DialogTitle>
            </div>

            <div className="flex-1 overflow-auto flex flex-col bg-white rounded-b-2xl lg:p-6">
              <div className="mb-4 px-6 lg:px-0">
                <h3 className="text-xl font-semibold text-slate-900 mb-1">
                  {viewingTemplate.subject}
                </h3>
              </div>

              <div className="flex-1 overflow-auto px-6 lg:px-0 space-y-6 pb-6">
                {abTest && (
                  <ABTestBanner
                    abTest={abTest}
                    templateId={viewingTemplate.id}
                    otherTemplate={otherVariant}
                    onViewOther={onViewOtherVariant}
                    onDeclareWinner={onDeclareWinner}
                    declaring={declaringWinner}
                  />
                )}

                <div className="prose prose-slate max-w-none bg-white rounded-2xl leading-relaxed p-6 border border-slate-100">
                  <div dangerouslySetInnerHTML={{ __html: highlightedBody }} />
                </div>

                <div className="space-y-3">
                  {!analysis ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-indigo-500" />
                          Check your email content with AI
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Review content-based risk signals before sending.
                        </p>
                      </div>
                      <Button
                        onClick={onAnalyze}
                        disabled={analyzing || improving}
                        className="gap-2 bg-indigo-600 hover:bg-indigo-700 shrink-0"
                      >
                        {analyzing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Analyze Content
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <AIContentCheckPanel
                      analysis={analysis}
                      onImprove={onImprove}
                      improving={improving}
                      onReanalyze={onReanalyze}
                      analyzing={analyzing}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [query, setQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [draftSubject, setDraftSubject] = useState("")
  const [draftBody, setDraftBody] = useState("")
  const [saving, setSaving] = useState(false)

  const [viewingTemplate, setViewingTemplate] = useState<EmailTemplate | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<EmailTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [userId, setUserId] = useState<string>("")

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // AI state
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<EmailAnalysis | null>(null)
  const [improving, setImproving] = useState(false)
  const [improvedEmail, setImprovedEmail] = useState<ImprovedEmail | null>(null)
  const [showImprovement, setShowImprovement] = useState(false)
  const [analysisContext, setAnalysisContext] = useState<"view" | "create" | null>(null)
  const [improveSource, setImproveSource] = useState<{
    subject: string
    body: string
    wordCount: number
  } | null>(null)

  // A/B state
  const [abTests, setAbTests] = useState<ABTest[]>([])
  const [creatingAB, setCreatingAB] = useState(false)
  const [declaringWinner, setDeclaringWinner] = useState(false)

  const quillRef = useRef<any>(null)

  const isEditing = !!editingTemplate

  useEffect(() => {
    const user = localStorage.getItem("user")
    if (user) {
      try {
        const parsedUser = JSON.parse(user)
        setUserId(parsedUser?.id)
      } catch (e) {}
    }
  }, [])

  useEffect(() => {
    if (userId) {
      setAbTests(loadABTests(userId))
    }
  }, [userId])

  const persistABTests = useCallback(
    (next: ABTest[]) => {
      setAbTests(next)
      if (userId) saveABTests(userId, next)
    },
    [userId]
  )

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3200)
  }

  const resetAiState = () => {
    setAnalyzing(false)
    setAnalysis(null)
    setImproving(false)
    setImprovedEmail(null)
    setShowImprovement(false)
    setAnalysisContext(null)
    setImproveSource(null)
    setCreatingAB(false)
  }

  const loadTemplates = async () => {
    if (!userId) {
      setError("User ID is required")
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/email-templates?userId=${userId}`)
      if (!res.ok) throw new Error("Failed to load templates")
      const data = await res.json()
      setTemplates(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setError("Failed to load templates. Please try again.")
      setTemplates([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [userId])

  // Map template id → AB test
  const abByTemplateId = useMemo(() => {
    const map = new Map<string, ABTest>()
    for (const t of abTests) {
      map.set(t.variantAId, t)
      map.set(t.variantBId, t)
    }
    return map
  }, [abTests])

  // Clean up AB tests whose templates no longer exist
  useEffect(() => {
    if (!templates.length && abTests.length === 0) return
    const ids = new Set(templates.map((t) => t.id))
    const pruned = abTests.filter(
      (t) => ids.has(t.variantAId) || ids.has(t.variantBId)
    )
    // Also drop tests where both variants are gone
    const valid = pruned.filter(
      (t) => ids.has(t.variantAId) || ids.has(t.variantBId)
    )
    if (valid.length !== abTests.length) {
      persistABTests(valid)
    }
  }, [templates, abTests, persistABTests])

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter((t) => t.subject.toLowerCase().includes(q))
  }, [templates, query])

  const resetDraft = () => {
    setDraftSubject("")
    setDraftBody("")
    setEditingTemplate(null)
  }

  const createTemplateApi = async (subject: string, body: string): Promise<EmailTemplate> => {
    const res = await fetch("/api/email-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subject: subject.trim(), body }),
    })
    if (!res.ok) throw new Error("Failed to create template")
    return res.json()
  }

  const updateTemplateApi = async (
    id: string,
    subject: string,
    body: string
  ): Promise<EmailTemplate> => {
    const res = await fetch(`/api/email-templates?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject.trim(), body }),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData?.error || "Failed to update template")
    }
    return res.json()
  }

  // ── Analyze ──────────────────────────────────────────────────────────────
  const analyzeEmail = async (
    subject: string,
    body: string,
    context: "view" | "create",
    options?: { keepPrevious?: boolean }
  ) => {
    if (analyzing || improving) return
    setAnalyzing(true)
    setAnalysisContext(context)
    // Only clear previous analysis on first run — re-analyze keeps it until success
    if (!options?.keepPrevious) {
      setAnalysis(null)
    }

    try {
      const res = await fetch("/api/email-templates/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      })

      if (!res.ok) throw new Error("Analyze failed")

      const data = await res.json()
      if (!data?.success || !data?.analysis) throw new Error("Invalid analysis response")

      const a = data.analysis as EmailAnalysis
      if (!a.riskLevel) a.riskLevel = scoreToRiskLevel(a.score)
      setAnalysis(a)
      setImproveSource({
        subject,
        body,
        wordCount: stripHtml(body).split(/\s+/).filter(Boolean).length,
      })
    } catch (err) {
      console.error(err)
      if (options?.keepPrevious) {
        // Keep existing analysis visible on re-analyze failure
        showToast("Unable to re-analyze the email. Please try again.", "error")
      } else {
        showToast("Unable to analyze this email. Please try again.", "error")
        setAnalysis(null)
        setAnalysisContext(null)
      }
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Improve ──────────────────────────────────────────────────────────────
  const improveEmail = async (
    subject: string,
    body: string,
    analysisPayload: EmailAnalysis
  ) => {
    if (improving || analyzing) return
    setImproving(true)

    try {
      const res = await fetch("/api/email-templates/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, analysis: analysisPayload }),
      })

      if (!res.ok) throw new Error("Improve failed")

      const data = await res.json()
      if (!data?.success || !data?.result) throw new Error("Invalid improve response")

      const result = data.result as ImprovedEmail
      if (typeof data.originalWordCount === "number" && improveSource) {
        setImproveSource((prev) =>
          prev ? { ...prev, wordCount: data.originalWordCount } : prev
        )
      }
      setImprovedEmail(result)
      setShowImprovement(true)
    } catch (err) {
      console.error(err)
      showToast("Unable to generate an improved version. Please try again.", "error")
    } finally {
      setImproving(false)
    }
  }

  const handleFormSubmit = async () => {
    if (!draftSubject.trim() || !draftBody.trim() || draftBody === "<p><br></p>" || !userId)
      return

    setSaving(true)
    try {
      if (isEditing && editingTemplate) {
        const updated = await updateTemplateApi(
          editingTemplate.id,
          draftSubject,
          draftBody
        )
        setTemplates((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t))
        )
        setIsFormOpen(false)
        resetDraft()
        resetAiState()
        showToast("Template updated successfully")
      } else {
        const newTemplate = await createTemplateApi(draftSubject, draftBody)
        setTemplates((prev) => [newTemplate, ...prev])
        setIsFormOpen(false)
        resetDraft()
        resetAiState()
        showToast("Template created successfully")
      }
    } catch (err) {
      console.error(err)
      showToast(
        isEditing ? "Failed to update template" : "Failed to create template",
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingTemplate) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/email-templates?id=${deletingTemplate.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete template")

      const id = deletingTemplate.id
      setTemplates((prev) => prev.filter((t) => t.id !== id))

      // Prune or update AB tests that referenced this template
      const nextAB = abTests
        .map((t) => {
          if (t.variantAId === id || t.variantBId === id) {
            // If one side is deleted, remove the whole test pairing
            return null
          }
          return t
        })
        .filter(Boolean) as ABTest[]
      persistABTests(nextAB)

      setDeletingTemplate(null)
      if (viewingTemplate?.id === id) {
        setViewingTemplate(null)
        resetAiState()
      }
      if (editingTemplate?.id === id) {
        setIsFormOpen(false)
        resetDraft()
        resetAiState()
      }
      showToast("Template deleted successfully")
    } catch (err) {
      console.error(err)
      showToast("Failed to delete template", "error")
    } finally {
      setDeleting(false)
    }
  }

  // ── A/B: Start test from comparison dialog ───────────────────────────────
  const handleStartABTest = async () => {
    if (!improvedEmail || !improveSource || !userId || creatingAB) return

    setCreatingAB(true)
    try {
      let variantAId: string
      let variantASubject = improveSource.subject

      if (analysisContext === "view" && viewingTemplate) {
        // Reuse the existing template as Variant A
        variantAId = viewingTemplate.id
        variantASubject = viewingTemplate.subject
      } else if (isEditing && editingTemplate) {
        // Editing: reuse current template as Variant A
        variantAId = editingTemplate.id
        variantASubject = editingTemplate.subject
      } else {
        // Create Variant A from original draft content
        const a = await createTemplateApi(
          improveSource.subject,
          improveSource.body
        )
        variantAId = a.id
        setTemplates((prev) => [a, ...prev])
      }

      // Always create Variant B from improved content
      const bSubject = improvedEmail.subject.trim() || improveSource.subject
      const b = await createTemplateApi(bSubject, improvedEmail.body)
      setTemplates((prev) => {
        // Avoid duplicate if A was just prepended
        const withoutB = prev.filter((t) => t.id !== b.id)
        return [b, ...withoutB]
      })

      const test: ABTest = {
        id: generateId(),
        userId,
        name: variantASubject.slice(0, 80) || "Untitled A/B Test",
        variantAId,
        variantBId: b.id,
        status: "running",
        originalScore: analysis?.score,
        improvedScore: improvedEmail.estimatedRiskScore,
        createdAt: new Date().toISOString(),
      }

      persistABTests([test, ...abTests])

      setShowImprovement(false)
      setImprovedEmail(null)
      setIsFormOpen(false)
      resetDraft()
      resetAiState()
      setViewingTemplate(null)

      showToast("A/B test created — Variant A & B are ready")
    } catch (err) {
      console.error(err)
      showToast("Unable to create A/B test. Please try again.", "error")
    } finally {
      setCreatingAB(false)
    }
  }

  // ── A/B: Declare winner ──────────────────────────────────────────────────
  const handleDeclareWinner = async () => {
    if (!viewingTemplate || declaringWinner) return
    const test = abByTemplateId.get(viewingTemplate.id)
    if (!test || test.status === "completed") return

    setDeclaringWinner(true)
    try {
      const next = abTests.map((t) =>
        t.id === test.id
          ? {
              ...t,
              status: "completed" as const,
              winnerId: viewingTemplate.id,
              completedAt: new Date().toISOString(),
            }
          : t
      )
      persistABTests(next)
      showToast("Winner declared for this A/B test")
    } catch (err) {
      console.error(err)
      showToast("Unable to declare winner. Please try again.", "error")
    } finally {
      setDeclaringWinner(false)
    }
  }

  const handleAnalyzeFromView = () => {
    if (!viewingTemplate) return
    analyzeEmail(viewingTemplate.subject, viewingTemplate.body, "view")
  }

  const handleAnalyzeFromForm = () => {
    analyzeEmail(draftSubject, draftBody, "create")
  }

  /** Re-analyze always uses CURRENT editor / template content */
  const handleReanalyzeFromForm = () => {
    analyzeEmail(draftSubject, draftBody, "create", { keepPrevious: true })
  }

  const handleReanalyzeFromView = () => {
    if (!viewingTemplate) return
    analyzeEmail(viewingTemplate.subject, viewingTemplate.body, "view", {
      keepPrevious: true,
    })
  }

  const handleImproveFromView = () => {
    if (!viewingTemplate || !analysis) return
    improveEmail(viewingTemplate.subject, viewingTemplate.body, analysis)
  }

  const handleImproveFromForm = () => {
    if (!analysis) return
    improveEmail(draftSubject, draftBody, analysis)
  }

  const handleRegenerate = () => {
    if (!improveSource || !analysis) return
    improveEmail(improveSource.subject, improveSource.body, analysis)
  }

  const handleUseImproved = () => {
    if (!improvedEmail) return
    setDraftSubject(improvedEmail.subject)
    setDraftBody(improvedEmail.body)
    setShowImprovement(false)
    setImprovedEmail(null)
    if (analysisContext === "view") {
      // From view → open form in create mode with improved content
      setViewingTemplate(null)
      setEditingTemplate(null)
      setIsFormOpen(true)
    }
    // If already in form (create or edit), just update the draft fields
    setAnalysis(null)
    setAnalysisContext(null)
    setImproveSource(null)
    showToast("Improved version loaded into editor. Review and save when ready.")
  }

  const handleKeepOriginal = () => {
    setShowImprovement(false)
    setImprovedEmail(null)
  }

  const openCreate = () => {
    resetAiState()
    resetDraft()
    setIsFormOpen(true)
  }

  const openEdit = (template: EmailTemplate) => {
    resetAiState()
    setEditingTemplate(template)
    setDraftSubject(template.subject)
    setDraftBody(template.body)
    setIsFormOpen(true)
  }

  const currentABTest = viewingTemplate
    ? abByTemplateId.get(viewingTemplate.id) ?? null
    : null

  const otherVariant = useMemo(() => {
    if (!viewingTemplate || !currentABTest) return null
    const otherId =
      currentABTest.variantAId === viewingTemplate.id
        ? currentABTest.variantBId
        : currentABTest.variantAId
    return templates.find((t) => t.id === otherId) ?? null
  }, [viewingTemplate, currentABTest, templates])

  return (
    <div className="min-h-screen w-auto bg-slate-50">
      <div className="mx-auto max-w-7xl py-10 ">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-10">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
              Email <span className="text-blue-600">Templates</span>
            </h1>
            <p className="mt-2 text-slate-600">
              Create and manage professional email templates
            </p>
          </div>

          <Button
            onClick={openCreate}
            className="gap-2 bg-blue-600 h-11 px-6"
          >
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        </div>

        <div className="mb-8">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates by subject..."
              className="h-12 pl-11 rounded-2xl"
            />
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {filteredTemplates.length} template{filteredTemplates.length === 1 ? "" : "s"}
            {abTests.filter((t) => t.status === "running").length > 0 && (
              <span className="ml-2 text-violet-600">
                · {abTests.filter((t) => t.status === "running").length} A/B test
                {abTests.filter((t) => t.status === "running").length === 1 ? "" : "s"} running
              </span>
            )}
          </p>
        </div>

        {isLoading ? (
          <div className="mt-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="mt-12 rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-red-600">{error}</p>
            <Button onClick={loadTemplates} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        ) : filteredTemplates.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => {
              const ab = abByTemplateId.get(template.id)
              const isA = ab?.variantAId === template.id
              const isWinner = ab?.winnerId === template.id
              const isCompleted = ab?.status === "completed"

              return (
                <div
                  key={template.id}
                  className="group flex flex-col h-full rounded-3xl border border-slate-100 bg-white p-7 shadow-sm hover:shadow-xl hover:border-slate-200 transition-all duration-300"
                >
                  <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-blue-100">
                      <Mail className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="flex items-center gap-2">
                      {ab && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            isCompleted && isWinner
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : isCompleted
                                ? "border-slate-200 bg-slate-50 text-slate-500"
                                : "border-violet-200 bg-violet-50 text-violet-700"
                          )}
                        >
                          {isCompleted && isWinner ? (
                            <>
                              <Trophy className="h-3 w-3" />
                              Winner
                            </>
                          ) : (
                            <>
                              <FlaskConical className="h-3 w-3" />
                              {isA ? "A" : "B"}
                            </>
                          )}
                        </span>
                      )}
                      <div className="text-xs text-slate-500">
                        {new Date(template.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <h3 className="mt-6 line-clamp-2 text-lg font-semibold text-slate-900 leading-tight">
                    {template.subject}
                  </h3>

                  <p className="mt-4 line-clamp-5 text-sm text-slate-600 leading-relaxed flex-1">
                    {stripHtml(template.body)}
                  </p>

                  <div className="mt-8 flex items-center gap-2 pt-4 border-t flex-shrink-0">
                    <Button
                      variant="default"
                      onClick={() => {
                        resetAiState()
                        setViewingTemplate(template)
                      }}
                      className="flex-1 bg-blue-600 hover:bg-indigo-700"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View Full
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEdit(template)}
                      className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200"
                      title="Edit template"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingTemplate(template)}
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="Delete template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="mt-20 flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white py-20">
            <Mail className="h-12 w-12 text-slate-300" />
            <p className="mt-6 text-xl font-medium text-slate-700">No templates yet</p>
            <p className="mt-2 text-slate-500">
              Create your first professional email template
            </p>
            <Button
              onClick={openCreate}
              className="mt-8"
            >
              Create Template
            </Button>
          </div>
        )}
      </div>

      <TemplateFormDialog
        isOpen={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            resetDraft()
            resetAiState()
          }
        }}
        draftSubject={draftSubject}
        setDraftSubject={setDraftSubject}
        draftBody={draftBody}
        setDraftBody={setDraftBody}
        onSubmit={handleFormSubmit}
        saving={saving}
        quillRef={quillRef}
        analyzing={analyzing && analysisContext === "create"}
        analysis={analysisContext === "create" ? analysis : null}
        improving={improving && analysisContext === "create"}
        onAnalyze={handleAnalyzeFromForm}
        onImprove={handleImproveFromForm}
        onReanalyze={handleReanalyzeFromForm}
        onClearAnalysis={() => {
          if (analysisContext === "create") {
            setAnalysis(null)
            setAnalysisContext(null)
            setImproveSource(null)
          }
        }}
        isEditing={isEditing}
      />

      <ViewTemplateDialog
        viewingTemplate={viewingTemplate}
        onClose={() => {
          setViewingTemplate(null)
          resetAiState()
        }}
        analyzing={analyzing && analysisContext === "view"}
        analysis={analysisContext === "view" ? analysis : null}
        improving={improving && analysisContext === "view"}
        onAnalyze={handleAnalyzeFromView}
        onImprove={handleImproveFromView}
        onReanalyze={handleReanalyzeFromView}
        onClearAnalysis={() => {
          if (analysisContext === "view") {
            setAnalysis(null)
            setAnalysisContext(null)
            setImproveSource(null)
          }
        }}
        abTest={currentABTest}
        otherVariant={otherVariant}
        onViewOtherVariant={() => {
          if (otherVariant) {
            resetAiState()
            setViewingTemplate(otherVariant)
          }
        }}
        onDeclareWinner={handleDeclareWinner}
        declaringWinner={declaringWinner}
      />

      <ImprovementComparisonDialog
        open={showImprovement && !!improvedEmail}
        onOpenChange={(open) => {
          if (!open && !improving && !creatingAB) {
            setShowImprovement(false)
            setImprovedEmail(null)
          }
        }}
        originalSubject={improveSource?.subject || ""}
        originalBody={improveSource?.body || ""}
        originalWordCount={improveSource?.wordCount || 0}
        originalScore={analysis?.score ?? 0}
        improved={improvedEmail}
        onKeepOriginal={handleKeepOriginal}
        onRegenerate={handleRegenerate}
        onUseImproved={handleUseImproved}
        onStartABTest={handleStartABTest}
        regenerating={improving}
        creatingAB={creatingAB}
      />

      <AlertDialog
        open={!!deletingTemplate}
        onOpenChange={(open) => !open && !deleting && setDeletingTemplate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The template{" "}
              <span className="font-medium">&quot;{deletingTemplate?.subject}&quot;</span> will
              be permanently removed
              {deletingTemplate && abByTemplateId.has(deletingTemplate.id)
                ? " and its A/B test pairing will be cleared"
                : ""}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 rounded-2xl px-6 py-3.5 text-sm shadow-xl",
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          )}
        >
          {toast.message}
        </div>
      )}

      <style jsx global>{`
        .ql-editor {
          min-height: 420px;
          line-height: 1.7;
        }
        mark.ai-highlight {
          background-color: #fef3c7;
          color: #92400e;
          padding: 0 2px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  )
}