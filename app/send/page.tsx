"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, CheckCircle2, Send, Trash2, Pause } from "lucide-react"

interface EmailStatus {
  index: number
  email: string
  status: "pending" | "sending" | "sent" | "error"
  message?: string
}

interface Recipient {
  email: string
  file?: File
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
  const [jobId, setJobId] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const fileInputsRef = useRef<Map<number, HTMLInputElement>>(new Map())

  useEffect(() => {
    const saved = sessionStorage.getItem("smtpConfig")
    if (saved) {
      try {
        const config = JSON.parse(saved)
        setSenderEmail(config.senderEmail)
        setSenderName(config.senderName)
        setDelay(config.defaultDelay)
      } catch (e) {
        console.error("Failed to load config:", e)
      }
    }
  }, [])

  const parseRecipients = (text: string): string[] => {
    return text
      .split(/[,\n]/)
      .map((email) => email.trim())
      .filter((email) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  }

  const handleParseRecipients = () => {
    const emails = parseRecipients(recipientText)
    const newRecipients = emails.map((email) => ({ email }))
    setRecipients(newRecipients)
    setStatuses(emails.map((email, index) => ({ index, email, status: "pending" })))
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
    if (!senderEmail || !subject || !body || recipients.length === 0) {
      alert("Please configure SMTP settings, fill in all required fields, and add recipients")
      return
    }

    setIsSending(true)
    setStatuses((prev) => prev.map((s) => ({ ...s, status: "pending" })))

    try {
      const smtpConfig = JSON.parse(sessionStorage.getItem("smtpConfig") || "{}")

      const formData = new FormData()
      formData.append("senderEmail", senderEmail)
      formData.append("senderName", senderName)
      formData.append("subject", subject)
      formData.append("body", body)
      formData.append("delay", delay)
      formData.append("recipients", JSON.stringify(recipients.map((r) => r.email)))

      if (attachmentMode === "single" && singleFile) {
        formData.append("singleAttachment", singleFile)
      } else if (attachmentMode === "per-recipient") {
        recipients.forEach((r, i) => {
          if (r.file) {
            formData.append(`attachment_${i}`, r.file)
          }
        })
      }

      const response = await fetch("/api/send", {
        method: "POST",
        body: formData,
        headers: {
          "x-smtp-host": smtpConfig.host || "",
          "x-smtp-port": smtpConfig.port || "2525",
          "x-smtp-username": smtpConfig.username || "",
          "x-smtp-password": smtpConfig.password || "",
        },
      })

      let data
      try {
        data = await response.json()
      } catch (parseError) {
        console.error("[v0] Failed to parse response:", parseError)
        const text = await response.text()
        console.error("[v0] Response text:", text)
        alert("Error: Server returned an invalid response. Check console for details.")
        setIsSending(false)
        return
      }

      if (!response.ok) {
        alert("Error starting send job: " + (data.error || "Unknown error"))
        setIsSending(false)
        return
      }

      setJobId(data.jobId)

      const eventSource = new EventSource(`/api/send?jobId=${data.jobId}`)

      eventSource.onmessage = (event) => {
        const update = JSON.parse(event.data)

        if (update.type === "progress") {
          setStatuses((prev) => {
            const updated = [...prev]
            updated[update.index] = {
              index: update.index,
              email: update.email,
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
        console.error("[v0] EventSource error")
        setIsSending(false)
        eventSource.close()
      }

      eventSourceRef.current = eventSource
    } catch (error) {
      console.error("[v0] Error:", error)
      alert("Error: " + (error instanceof Error ? error.message : "Unknown error"))
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
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2 sm:mb-3">Cold Email Sender</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Send bulk emails with optional attachments</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Panel - Compose */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <Card className="animate-slideInLeft">
              <CardHeader className="pb-4 sm:pb-6">
                <CardTitle className="text-lg sm:text-xl">Email Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">Sender Email</label>
                    <div className="p-2 sm:p-3 bg-muted rounded-lg border border-input text-foreground text-sm">
                      {senderEmail || "Not configured"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Configured in SMTP settings</p>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">
                      Sender Name (Optional)
                    </label>
                    <Input
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Your Name"
                      className="text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">Subject</label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject"
                    className="text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">Message Body</label>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Use {{name}} for recipient name token"
                    rows={6}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-2">Tip: Use {`{{'name'}}`} to personalize emails</p>
                </div>
              </CardContent>
            </Card>

            <Card className="animate-slideInLeft">
              <CardHeader className="pb-4 sm:pb-6">
                <CardTitle className="text-lg sm:text-xl">Recipients</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Paste emails one per line or comma-separated
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={recipientText}
                  onChange={(e) => setRecipientText(e.target.value)}
                  placeholder="email1@example.com&#10;email2@example.com&#10;email3@example.com"
                  rows={4}
                  className="text-sm"
                />
                <Button
                  onClick={handleParseRecipients}
                  variant="outline"
                  className="w-full transition-all duration-200 bg-transparent"
                >
                  Parse Recipients ({recipients.length})
                </Button>
              </CardContent>
            </Card>

            <Card className="animate-slideInLeft">
              <CardHeader className="pb-4 sm:pb-6">
                <CardTitle className="text-lg sm:text-xl">Attachments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  {(["none", "single", "per-recipient"] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={attachmentMode === mode ? "default" : "outline"}
                      onClick={() => setAttachmentMode(mode)}
                      className="flex-1 text-xs sm:text-sm transition-all duration-200"
                    >
                      {mode === "none" ? "No Attachments" : mode === "single" ? "Single File" : "Per-Recipient"}
                    </Button>
                  ))}
                </div>

                {attachmentMode === "single" && (
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">Upload File</label>
                    <input
                      type="file"
                      onChange={handleSingleFileChange}
                      accept=".pdf,.docx,.doc"
                      className="block w-full text-xs sm:text-sm text-muted-foreground"
                    />
                    {singleFile && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-2">Selected: {singleFile.name}</p>
                    )}
                  </div>
                )}

                {attachmentMode === "per-recipient" && recipients.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {recipients.map((recipient, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 sm:p-3 bg-muted rounded-lg">
                        <span className="text-xs sm:text-sm flex-1 truncate">{recipient.email}</span>
                        <input
                          ref={(el) => {
                            if (el) {
                              fileInputsRef.current.set(index, el)
                            }
                          }}
                          type="file"
                          onChange={(e) => handlePerRecipientFileChange(index, e.target.files?.[0] || null)}
                          accept=".pdf,.docx,.doc"
                          className="text-xs"
                        />
                        {recipient.file && (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            {recipient.file.name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="animate-slideInLeft">
              <CardHeader className="pb-4 sm:pb-6">
                <CardTitle className="text-lg sm:text-xl">Send Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">
                  Delay Between Sends (ms)
                </label>
                <Input value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="500" className="text-sm" />
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Status */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20 lg:top-24 animate-slideInRight">
              <CardHeader className="pb-4 sm:pb-6">
                <CardTitle className="text-lg sm:text-xl">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
                  <Button
                    onClick={handleStartSending}
                    disabled={isSending || recipients.length === 0 || !senderEmail}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 text-sm"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Start
                  </Button>
                  <Button
                    onClick={handleStop}
                    disabled={!isSending}
                    variant="outline"
                    className="flex-1 transition-all duration-200 text-sm bg-transparent"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </div>

                <Button
                  onClick={handleClear}
                  variant="outline"
                  className="w-full transition-all duration-200 text-sm bg-transparent"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear
                </Button>

                {isComplete && (
                  <div className="p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 rounded-lg animate-slideInLeft">
                    <p className="text-xs sm:text-sm font-medium text-green-900 dark:text-green-200">Completed</p>
                    <p className="text-xs text-green-800 dark:text-green-300 mt-1">
                      {successCount} sent, {errorCount} failed
                    </p>
                  </div>
                )}

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {statuses.map((status, idx) => (
                    <div key={idx} className="text-xs p-2 sm:p-3 bg-muted rounded-lg">
                      <div className="flex items-start gap-2">
                        {status.status === "sent" && (
                          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        )}
                        {status.status === "error" && (
                          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        {(status.status === "sending" || status.status === "pending") && (
                          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{status.email}</p>
                          <p className="text-muted-foreground capitalize">{status.status}</p>
                          {status.message && <p className="text-red-600 dark:text-red-400 mt-0.5">{status.message}</p>}
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
    </main>
  )
}
