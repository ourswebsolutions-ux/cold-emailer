"use client"

import type React from "react"
import Switch from "react-switch"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, CheckCircle2, Send, Trash2, Pause, Upload } from "lucide-react"
import dynamic from "next/dynamic"
import "react-quill-new/dist/quill.snow.css"

// Import Select components
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  "font", "size", "bold", "italic", "underline", "strike",
  "color", "background", "align", "list", "blockquote", "link",
]

interface EmailStatus {
  index: number
  email: string
  status: "pending" | "sending" | "sent" | "error"
  message?: string
}

interface Recipient {
  name: string
  email: string
  file?: File
}

interface SMTPAccount {
  id: string
  senderEmail: string
  senderName?: string
  host: string
  port: number
  username: string
  password: string
  isActive: boolean
}

interface EmailTemplate {
  id: string
  subject: string
  body: string
}

export default function SendPage() {
  const [senderEmail, setSenderEmail] = useState("")
  const [senderName, setSenderName] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [recipientText, setRecipientText] = useState("")
  const [delay, setDelay] = useState("500")
  const [attachmentMode, setAttachmentMode] = useState<"none" | "single" | "per-recipient">("none")
  const [singleFile, setSingleFile] = useState<File | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [statuses, setStatuses] = useState<EmailStatus[]>([])
  const [autoDelay, setAutoDelay] = useState(false)

  // CSV Preview States
  const [showCsvPreview, setShowCsvPreview] = useState(false)
  const [csvPreviewData, setCsvPreviewData] = useState<Recipient[]>([])
  const [tempCsvText, setTempCsvText] = useState("")

  const [jobId, setJobId] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const fileInputsRef = useRef<Map<number, HTMLInputElement>>(new Map())
  const [minDelay, setMinDelay] = useState("1")
  const [maxDelay, setMaxDelay] = useState("2")
  const [activeSMTP, setActiveSMTP] = useState<SMTPAccount | null>(null)
  const [userId, setUserId] = useState<string>("")

  // Template states
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  const csvFileInputRef = useRef<HTMLInputElement>(null)

  // ==================== DRAFT PERSISTENCE ====================
  const DRAFT_KEY = "coldEmailDraft_v1"

  // Load draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const draft = JSON.parse(saved)
        if (draft.subject) setSubject(draft.subject)
        if (draft.body) setBody(draft.body)
      }
    } catch (e) {
      console.error("Failed to load draft", e)
    }
  }, [])

  // Auto save draft
  useEffect(() => {
    try {
      const draft = { subject, body, timestamp: Date.now() }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch (e) {
      console.error("Failed to save draft", e)
    }
  }, [subject, body])

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
  }

  // ==================== USER & SMTP ====================
  useEffect(() => {
    const user = localStorage.getItem("user")
    if (user) {
      try {
        const parsedUser = JSON.parse(user)
        setUserId(parsedUser?.id)
      } catch (e) { }
    }
  }, [])

  const fetchActiveSMTP = async () => {
    if (!userId) return
    try {
      const response = await fetch(`/api/config?userId=${userId}`)
      const result = await response.json()
      if (result.success && result.data?.length) {
        const activeAccount = result.data.find((acc: SMTPAccount) => acc.isActive) || result.data[0]
        setActiveSMTP(activeAccount)
        setSenderEmail(activeAccount.senderEmail)
        setSenderName(activeAccount.senderName || "")
      }
    } catch (error) {
      console.error("Failed to fetch active SMTP:", error)
    }
  }

  useEffect(() => {
    fetchActiveSMTP()
  }, [userId])

  // Fetch templates when userId is available
  useEffect(() => {
    const fetchTemplates = async () => {
      if (!userId) return
      
      setLoadingTemplates(true)
      try {
        const response = await fetch(`/api/email-templates?userId=${userId}`)
        if (response.ok) {
          const data = await response.json()
          setTemplates(data || [])
        } else {
          console.error("Failed to fetch templates")
          setTemplates([])
        }
      } catch (error) {
        console.error("Error fetching templates:", error)
        setTemplates([])
      } finally {
        setLoadingTemplates(false)
      }
    }

    fetchTemplates()
  }, [userId])

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    
    const selectedTemplate = templates.find(t => t.id === templateId)
    if (selectedTemplate) {
      setSubject(selectedTemplate.subject)
      setBody(selectedTemplate.body)
    }
  }

  const isEmailFor = (str: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)

  // ==================== CSV HANDLING ====================
  const parseCsvToRecipients = (csvText: string): Recipient[] => {
    const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const result: Recipient[] = []

    for (const line of lines) {
      const columns = line.split(',').map(col => col.trim().replace(/^"|"$/g, ''))
      if (columns.length === 0) continue

      if (columns[0].toLowerCase() === "name" && 
          (columns[1]?.toLowerCase() === "email" || columns[1]?.toLowerCase() === "e-mail")) {
        continue
      }

      let name = columns[0] || ""
      let email = columns.length > 1 ? columns[1] : columns[0]

      if (!isEmailFor(email) && isEmailFor(name)) {
        [name, email] = [email, name]
      }

      if (isEmailFor(email)) {
        result.push({ name: name || email.split("@")[0], email: email.trim() })
      }
    }
    return result
  }

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please select a valid CSV file.")
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const csvText = event.target?.result as string
      if (!csvText) return

      const parsed = parseCsvToRecipients(csvText)
      if (parsed.length === 0) {
        alert("No valid recipients found in the CSV file.")
        return
      }

      setCsvPreviewData(parsed)
      setTempCsvText(parsed.map(r => `${r.name},${r.email}`).join("\n"))
      setShowCsvPreview(true)
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const parseRecipients = (text: string): Recipient[] => {
    if (!text.trim()) return []
    const parts = text.split(/[\n,]/).map(p => p.trim()).filter(Boolean)
    const recipients: Recipient[] = []

    for (let i = 0; i < parts.length; i++) {
      const current = parts[i]
      if (isEmailFor(current)) {
        const name = i > 0 && !isEmailFor(parts[i - 1]) ? parts[i - 1] : current.split("@")[0]
        recipients.push({ name, email: current })
        if (i > 0 && !isEmailFor(parts[i - 1])) i++
      } else {
        const email = parts[i + 1]
        if (email && isEmailFor(email)) {
          recipients.push({ name: current, email })
          i++
        }
      }
    }
    return recipients
  }

  const handleParseRecipients = () => {
    const parsed = parseRecipients(recipientText)
    setRecipients(parsed)
    setStatuses(parsed.map((recipient, index) => ({
      index,
      email: recipient.email,
      status: "pending",
    })))
  }

  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSingleFile(e.target.files[0])
    }
  }

  const handlePerRecipientFileChange = (index: number, file: File | null) => {
    setRecipients((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], file }
      return updated
    })
  }

  const handleStartSending = async () => {
    if (!subject || !body || recipients.length === 0) {
      alert("Please fill in all required fields and add recipients")
      return
    }

    setIsSending(true)
    setStatuses((prev) => prev.map((s) => ({ ...s, status: "pending" })))

    try {
      const formData = new FormData()
      formData.append("senderEmail", senderEmail)
      formData.append("senderName", senderName)
      formData.append("subject", subject)
      formData.append("body", body)
      formData.append("delay", delay)
      formData.append("userId", userId)
      formData.append("autoDelay", autoDelay.toString())
      formData.append("minDelay", minDelay)
      formData.append("maxDelay", maxDelay)
      formData.append("recipients", JSON.stringify(recipients))

      if (attachmentMode === "single" && singleFile) {
        formData.append("singleAttachment", singleFile)
      } else if (attachmentMode === "per-recipient") {
        recipients.forEach((r, i) => {
          if (r.file) formData.append(`attachment_${i}`, r.file)
        })
      }

      const response = await fetch("/api/send", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        alert("Error: " + (data.error || "Unknown error"))
        setIsSending(false)
        return
      }

      setJobId(data.jobId)
      clearDraft() // Clear draft after successful send start

      const eventSource = new EventSource(`/api/send?jobId=${data.jobId}`)

      eventSource.onmessage = (event) => {
        const update = JSON.parse(event.data)
        if (update.type === "progress") {
          setStatuses((prev) => {
            const updated = [...prev]
            updated[update.index] = {
              index: update.index,
              email: typeof update.email === "string" ? update.email : (update.email as any)?.email ?? "",
              status: update.status,
              message: update.message,
            }
            return updated
          })
        } else if (update.type === "completed") {
          setIsSending(false)
          eventSource.close()
        }
      }

      eventSource.onerror = () => {
        setIsSending(false)
        eventSource.close()
      }

      eventSourceRef.current = eventSource
    } catch (error) {
      console.error(error)
      alert("Error starting send job")
      setIsSending(false)
    }
  }

  const handleStop = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    setIsSending(false)
  }

  const handleClear = () => {
    setRecipients([])
    setRecipientText("")
    setStatuses([])
    setSingleFile(null)
    setSubject("")
    setBody("")
    setSelectedTemplateId("")
    clearDraft()
    fileInputsRef.current.forEach((input) => {
      input.value = ""
    })
  }

  const successCount = statuses.filter((s) => s.status === "sent").length
  const errorCount = statuses.filter((s) => s.status === "error").length
  const isComplete = statuses.length > 0 && statuses.every((s) => s.status !== "pending" && s.status !== "sending")

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 sm:mb-8 md:mb-12 animate-fadeInUp">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2 sm:mb-3">
            Cold <span className="text-blue-600">Email Sender</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">Send bulk emails with optional attachments</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Email Details */}
            <Card className="animate-slideInLeft">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg sm:text-xl">Email Details</CardTitle>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-blue-500 font-medium ">  Choose Template</label>
                  <Select 
                    value={selectedTemplateId} 
                    onValueChange={handleTemplateSelect}
                    disabled={loadingTemplates || templates.length === 0}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder={
                        loadingTemplates 
                          ? "Loading Templates..." 
                          : templates.length === 0 
                            ? "No Templates Found" 
                            : "Select Template"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.subject}
                        </SelectItem>
                      ))}
                      {templates.length === 0 && !loadingTemplates && (
                        <SelectItem value="none" disabled>No Templates Found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Subject</label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Message Body</label>
                  <div className="border rounded-lg overflow-hidden">
                    <ReactQuill
                      theme="snow"
                      value={body}
                      onChange={setBody}
                      modules={quillModules}
                      formats={quillFormats}
                      placeholder="Use {{name}} for recipient name token"
                      style={{ height: "250px", marginBottom: "42px" }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Tip: Use {'{{name}}'} to personalize emails</p>
                </div>
              </CardContent>
            </Card>

            {/* Recipients */}
            <Card className="animate-slideInLeft">
              <CardHeader className="flex flex-row items-start justify-between pb-4">
                <div>
                  <CardTitle>Recipients</CardTitle>
                  <CardDescription>Paste emails or import CSV</CardDescription>
                </div>
                <Button
                  onClick={() => csvFileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Import CSV
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={recipientText}
                  onChange={(e) => setRecipientText(e.target.value)}
                  placeholder="name,email1@example.com&#10;name,email2@example.com&#10;name,email3@example.com"
                  rows={4}
                  className="text-sm"
                />
                <Button onClick={handleParseRecipients} variant="outline" className="w-full">
                  Parse Recipients ({recipients.length})
                </Button>

                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvImport}
                  className="hidden"
                />
              </CardContent>
            </Card>

            {/* Attachments */}
            <Card className="animate-slideInLeft">
              <CardHeader>
                <CardTitle>Attachments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  {(["none", "single", "per-recipient"] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={attachmentMode === mode ? "default" : "outline"}
                      onClick={() => setAttachmentMode(mode)}
                      className="flex-1"
                    >
                      {mode === "none" ? "No Attachments" : mode === "single" ? "Single File" : "Per-Recipient"}
                    </Button>
                  ))}
                </div>

                {attachmentMode === "single" && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Upload Single File</label>
                    <input
                      type="file"
                      onChange={handleSingleFileChange}
                      accept=".pdf,.docx,.doc"
                      className="block w-full text-sm"
                    />
                    {singleFile && <p className="text-green-600 mt-2">Selected: {singleFile.name}</p>}
                  </div>
                )}

                {attachmentMode === "per-recipient" && recipients.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {recipients.map((recipient, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <span className="flex-1 truncate">{recipient.email}</span>
                        <input
                          ref={(el) => { if (el) fileInputsRef.current.set(index, el) }}
                          type="file"
                          onChange={(e) => handlePerRecipientFileChange(index, e.target.files?.[0] || null)}
                          accept=".pdf,.docx,.doc"
                        />
                        {recipient.file && <span className="text-green-600 text-sm">{recipient.file.name}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Send Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Send Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Auto Random Delay</span>
                  <Switch
                    checked={autoDelay}
                    onChange={setAutoDelay}
                    onColor="#2563eb"
                    offColor="#9ca3af"
                    height={22}
                    width={46}
                  />
                </div>

                {!autoDelay ? (
                  <>
                    <label>Delay (ms)</label>
                    <Input value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="500" />
                  </>
                ) : (
                  <>
                    <label>Minimum Delay (Minutes)</label>
                    <Input value={minDelay} onChange={(e) => setMinDelay(e.target.value)} placeholder="1" />
                    <label>Maximum Delay (Minutes)</label>
                    <Input value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} placeholder="2" />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Status Panel */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20 lg:top-24">
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button onClick={handleStartSending} disabled={isSending} className="flex-1">
                    <Send className="w-4 h-4 mr-2" /> Start
                  </Button>
                  <Button onClick={handleStop} disabled={!isSending} variant="outline" className="flex-1">
                    <Pause className="w-4 h-4 mr-2" /> Stop
                  </Button>
                </div>

                <Button onClick={handleClear} variant="outline" className="w-full">
                  <Trash2 className="w-4 h-4 mr-2" /> Clear
                </Button>

                {isComplete && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg">
                    <p className="font-medium text-green-700">Completed</p>
                    <p className="text-sm">{successCount} sent, {errorCount} failed</p>
                  </div>
                )}

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {statuses.map((status, idx) => (
                    <div key={idx} className="text-xs p-3 bg-muted rounded-lg">
                      <div className="flex items-start gap-2">
                        {status.status === "sent" && <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />}
                        {status.status === "error" && <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />}
                        {(status.status === "sending" || status.status === "pending") && (
                          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{status.email}</p>
                          <p className="text-muted-foreground capitalize">{status.status}</p>
                          {status.message && <p className="text-red-600">{status.message}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* CSV Preview Modal */}
      {showCsvPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <h3 className="text-xl font-semibold">CSV Preview</h3>
              <p className="text-sm text-muted-foreground">{csvPreviewData.length} recipients found</p>
            </div>

            <div className="p-6 overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-3 text-left">Name</th>
                    <th className="p-3 text-left">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {csvPreviewData.map((recipient, idx) => (
                    <tr key={idx}>
                      <td className="p-3">{recipient.name}</td>
                      <td className="p-3 font-mono">{recipient.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t flex gap-3">
              <Button variant="outline" onClick={() => setShowCsvPreview(false)} className="flex-1">Cancel</Button>
              <Button
                onClick={() => {
                  setRecipientText(tempCsvText)
                  const parsed = parseRecipients(tempCsvText)
                  setRecipients(parsed)
                  setStatuses(parsed.map((r, i) => ({ index: i, email: r.email, status: "pending" })))
                  setShowCsvPreview(false)
                }}
                className="flex-1"
              >
                Import {csvPreviewData.length} Recipients
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
