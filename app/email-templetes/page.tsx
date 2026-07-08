"use client"

/**
 * Email Templates — /app/(dashboard)/email-templates/page.tsx
 * VIP Clean Version
 */

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import "react-quill-new/dist/quill.snow.css"

import {
  Eye,
  Loader2,
  Mail,
  Plus,
  Search,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
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
    [{ list: "ordered" }, { list: "bullet" }],   // This stays correct
    [{ align: [] }],
    ["link", "image"],
    ["blockquote", "code-block"],
    ["clean"],
  ],
}

const quillFormats = [
  "header", "bold", "italic", "underline", "strike",
  "color", "background", "list", "align",      // "list" only
  "link", "image", "blockquote", "code-block"
]

type EmailTemplate = {
  id: string
  userId: string
  subject: string
  body: string
  createdAt: string
  updatedAt: string
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")          // Remove HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")            // Apostrophe
    .replace(/&quot;/g, '"')           // Double quote
    .replace(/&#34;/g, '"')
    .replace(/&#38;/g, "&")
    .replace(/&#60;/g, "<")
    .replace(/&#62;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
// Create Template Dialog
function CreateTemplateDialog({
  isOpen,
  onOpenChange,
  draftSubject,
  setDraftSubject,
  draftBody,
  setDraftBody,
  onCreate,
  saving,
  quillRef,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  draftSubject: string
  setDraftSubject: (value: string) => void
  draftBody: string
  setDraftBody: (value: string) => void
  onCreate: () => void
  saving: boolean
  quillRef: React.RefObject<any>
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent className="max-w-[95vw] lg:max-w-7xl  p-0 gap-0 rounded-3xl h-[95vh] flex flex-col">
        <div className="border-b bg-slate-50 px- rounded-3xl py-6 lg:px-12 flex-shrink-0">
          <DialogTitle className="text-2xl font-semibold">Create Email Template</DialogTitle>
          <DialogDescription className="text-slate-500">Design a professional reusable email template</DialogDescription>
        </div>

        <div className="flex-1 overflow-hidden  flex flex-col p- lg:p-8">
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
                Available placeholder: <span className="font-mono text-slate-600">{"{{name}}"}</span>
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="px-8 lg:px-12 py-6 rounded-3xl border-t bg-slate-50 flex-shrink-0">
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onCreate}
            disabled={saving || !draftSubject.trim() || !draftBody.trim() || draftBody === "<p><br></p>"}
            className="px-8 bg-indigo-600 hover:bg-indigo-700"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// View Template Dialog - Same Look as Create
function ViewTemplateDialog({
  viewingTemplate,
  onClose,
}: {
  viewingTemplate: EmailTemplate | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!viewingTemplate} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] lg:max-w-7xl p-0 gap-0 rounded-2xl h-auto flex flex-col">
        {viewingTemplate && (
          <>
            {/* Header - Same style as Create */}
            <div className="border-b bg-slate-50 px-6 lg:px-12 py-3 rounded-t-2xl">
              <DialogTitle className="text-2xl font-semibold">Preview Email Template</DialogTitle>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col bg-white rounded-b-2xl lg:p-6">
              <div className="mb-4 px-6 lg:px-0">
                <h3 className="text-xl font-semibold text-slate-900 mb-1">
                  {viewingTemplate.subject}
                </h3>
              </div>
              
              <div className="flex-1 overflow-auto px-6 lg:px-0">
                <div className="prose prose-slate max-w-none bg-white rounded-2xl leading-relaxed p-6 ">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: viewingTemplate.body.replace(/\n/g, '<br>')
                    }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [query, setQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [draftSubject, setDraftSubject] = useState("")
  const [draftBody, setDraftBody] = useState("")
  const [saving, setSaving] = useState(false)

  const [viewingTemplate, setViewingTemplate] = useState<EmailTemplate | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<EmailTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [userId, setUserId] = useState<string>("")

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  const quillRef = useRef<any>(null)

  useEffect(() => {
    const user = localStorage.getItem("user")
    if (user) {
      try {
        const parsedUser = JSON.parse(user)
        setUserId(parsedUser?.id)
      } catch (e) {}
    }
  }, [])

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2800)
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

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter((t) => t.subject.toLowerCase().includes(q))
  }, [templates, query])

  const resetDraft = () => {
    setDraftSubject("")
    setDraftBody("")
  }

  const handleCreate = async () => {
    if (!draftSubject.trim() || !draftBody.trim() || draftBody === "<p><br></p>" || !userId) return

    setSaving(true)
    try {
      const res = await fetch("/api/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subject: draftSubject.trim(), body: draftBody }),
      })

      if (!res.ok) throw new Error("Failed to create template")

      const newTemplate = await res.json()
      setTemplates((prev) => [newTemplate, ...prev])
      setIsCreateOpen(false)
      resetDraft()
      showToast("Template created successfully")
    } catch (err) {
      console.error(err)
      showToast("Failed to create template", "error")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingTemplate) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/email-templates?id=${deletingTemplate.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete template")

      setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id))
      setDeletingTemplate(null)
      showToast("Template deleted successfully")
    } catch (err) {
      console.error(err)
      showToast("Failed to delete template", "error")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen w-auto bg-slate-50">
      <div className="mx-auto max-w-7xl py-10 ">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-10">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Email Templates</h1>
            <p className="mt-2 text-slate-600">Create and manage professional email templates</p>
          </div>

          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 h-11 px-6">
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
          </p>
        </div>

        {isLoading ? (
          <div className="mt-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="mt-12 rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-red-600">{error}</p>
            <Button onClick={loadTemplates} variant="outline" className="mt-4">Retry</Button>
          </div>
        ) : filteredTemplates.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="group flex flex-col h-full rounded-3xl border border-slate-100 bg-white p-7 shadow-sm hover:shadow-xl hover:border-slate-200 transition-all duration-300"
              >
                <div className="flex items-center justify-between flex-shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-blue-100">
                    <Mail className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(template.updatedAt).toLocaleDateString()}
                  </div>
                </div>

                <h3 className="mt-6 line-clamp-2 text-lg font-semibold text-slate-900 leading-tight">
                  {template.subject}
                </h3>

                <p className="mt-4 line-clamp-5 text-sm text-slate-600 leading-relaxed flex-1">
                  {stripHtml(template.body)}
                </p>

                <div className="mt-8 flex items-center gap-3 pt-4 border-t flex-shrink-0">
                  <Button
                    variant="default"
                    onClick={() => setViewingTemplate(template)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Full
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingTemplate(template)}
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-20 flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white py-20">
            <Mail className="h-12 w-12 text-slate-300" />
            <p className="mt-6 text-xl font-medium text-slate-700">No templates yet</p>
            <p className="mt-2 text-slate-500">Create your first professional email template</p>
            <Button onClick={() => setIsCreateOpen(true)} className="mt-8">
              Create Template
            </Button>
          </div>
        )}
      </div>

      <CreateTemplateDialog
        isOpen={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) resetDraft()
        }}
        draftSubject={draftSubject}
        setDraftSubject={setDraftSubject}
        draftBody={draftBody}
        setDraftBody={setDraftBody}
        onCreate={handleCreate}
        saving={saving}
        quillRef={quillRef}
      />

      <ViewTemplateDialog
        viewingTemplate={viewingTemplate}
        onClose={() => setViewingTemplate(null)}
      />

      <AlertDialog open={!!deletingTemplate} onOpenChange={(open) => !open && !deleting && setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The template{" "}
              <span className="font-medium">"{deletingTemplate?.subject}"</span> will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 rounded-2xl px-6 py-3.5 text-sm shadow-xl",
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        )}>
          {toast.message}
        </div>
      )}

      <style jsx global>{`
        .ql-editor { min-height: 420px; line-height: 1.7; }
      `}</style>
    </div>
  )
}