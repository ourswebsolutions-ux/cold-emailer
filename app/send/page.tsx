"use client"

import type React from "react"
import Switch from "react-switch";
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, CheckCircle2, Send, Trash2, Pause } from "lucide-react"
import dynamic from "next/dynamic"
import "react-quill-new/dist/quill.snow.css"

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
  const [autoDelay, setAutoDelay] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const fileInputsRef = useRef<Map<number, HTMLInputElement>>(new Map())
  const [minDelay, setMinDelay] = useState("1");
  const [maxDelay, setMaxDelay] = useState("2");
  const [activeSMTP, setActiveSMTP] = useState<SMTPAccount | null>(null)

  const [userId, setUserId] = useState<string>("");


useEffect(() => {
  const user = localStorage.getItem("user");
    // alert(user)

  if (user) {
    const parsedUser = JSON.parse(user);
    console.log(parsedUser?.id)
    setUserId(parsedUser?.id);
  }
}, []);  


  // Fetch active SMTP account
  const fetchActiveSMTP = async () => {
    if (!userId) return
    try {
      const response = await fetch(`/api/config?userId=${userId}`)
      const result = await response.json()

      if (result.success && result.data) {
        const activeAccount = result.data.find((acc: SMTPAccount) => acc.isActive)
        if (activeAccount) {
          setActiveSMTP(activeAccount)
          setSenderEmail(activeAccount.senderEmail)
          setSenderName(activeAccount.senderName || "")
        } else if (result.data.length > 0) {
          // Fallback to first if none active
          const first = result.data[0]
          setActiveSMTP(first)
          setSenderEmail(first.senderEmail)
          setSenderName(first.senderName || "")
        }
      }
    } catch (error) {
      console.error("Failed to fetch active SMTP:", error)
    }
  }

  useEffect(() => {
    fetchActiveSMTP()
  }, [userId])

const isEmailFor = (str: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

  const parseRecipients = (text: string): Recipient[] => {
  if (!text.trim()) return [];

  // Split by commas or newlines
  const parts = text
    .split(/[\n,]/)           // split on newlines OR commas
    .map((p) => p.trim())
    .filter(Boolean);

  const recipients: Recipient[] = [];

  for (let i = 0; i < parts.length; i++) {
    const current = parts[i];

    // Check if it looks like an email
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current);

    if (isEmail) {
      // Previous item was name (if exists)
      const name = i > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parts[i - 1])
        ? parts[i - 1]
        : current.split("@")[0]; // fallback to local part

      recipients.push({ name, email: current });
      // Skip next if we consumed a name
      if (i > 0 && !isEmailFor(parts[i - 1])) i++;
    } else {
      // Current is name, next should be email
      const email = parts[i + 1];
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        recipients.push({ name: current, email });
        i++; // skip the email we just used
      }
    }
  }

  return recipients;
};

// Helper


const handleParseRecipients = () => {
  const parsed = parseRecipients(recipientText);
  setRecipients(parsed);
  setStatuses(
    parsed.map((recipient, index) => ({
      index,
      email: recipient.email,
      status: "pending",
    }))
  );

  if (parsed.length === 0 && recipientText.trim()) {
    alert("No valid recipients found. Use format: name,email or one email per line.");
  }
};

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
      alert("Please configure at least one SMTP account, fill in all required fields, and add recipients")
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

      formData.append("autoDelay", autoDelay.toString());
      formData.append("minDelay", minDelay);
      formData.append("maxDelay", maxDelay);
      formData.append("recipients", JSON.stringify(recipients))
      

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
              email:
  typeof update.email === "string"
    ? update.email
    : (update.email as any)?.email ?? "",
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
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2 sm:mb-3">Cold <span className="text-blue-600">Email Sender</span></h1>
          <p className="text-sm sm:text-base text-muted-foreground">Send bulk emails with optional attachments</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Panel - Compose */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <Card className="animate-slideInLeft">
              <CardHeader className="pb- sm:pb-6">
                <CardTitle className="text-lg sm:text-xl">Email Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 
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
                  <div className="border rounded-lg overflow-hidden">
                    <ReactQuill
                      theme="snow"
                      value={body}
                      onChange={setBody}
                      modules={quillModules}
                      formats={quillFormats}
                      placeholder="Use {{name}} for recipient name token"
                      style={{
                        height: "250px",
                        marginBottom: "42px",
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Tip: Use {`{{name}}`} to personalize emails</p>
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
                    checkedIcon={false}
                    uncheckedIcon={false}
                    height={22}
                    width={46}
                  />
                </div>

                {!autoDelay ? (
                  <>
                    <label>Delay (ms)</label>

                    <Input
                      value={delay}
                      onChange={(e) => setDelay(e.target.value)}
                      placeholder="500"
                    />
                  </>
                ) : (
                  <>
                    <label>Minimum Delay (Minutes)</label>

                    <Input
                      value={minDelay}
                      onChange={(e) => setMinDelay(e.target.value)}
                      placeholder="1"
                    />

                    <label>Maximum Delay (Minutes)</label>

                    <Input
                      value={maxDelay}
                      onChange={(e) => setMaxDelay(e.target.value)}
                      placeholder="2"
                    />
                  </>
                )}

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
                    disabled={isSending }
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
                          <p className="font-medium truncate">
  {typeof status.email === "string"
    ? status.email
    : status.email?.email || "unknown"}
</p>
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