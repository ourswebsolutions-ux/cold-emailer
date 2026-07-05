"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react"

interface SMTPAccount {
  id: string
  host: string
  port: number
  username: string
  password: string
  senderEmail: string
  senderName?: string
  isActive: boolean
  createdAt: string
}

export default function EnvPage() {
  const [config, setConfig] = useState({
    host: "",
    port: "2525",
    username: "",
    password: "",
    senderEmail: "",
    senderName: "",
  })

  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle")
  const [testMessage, setTestMessage] = useState("")
  const [saveMessage, setSaveMessage] = useState("")
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)

  // Real userId from auth (cookie)
  const [userId, setUserId] = useState<string | null>(null)
  const [smtpAccounts, setSmtpAccounts] = useState<SMTPAccount[]>([])
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  // Get logged-in userId from cookie (set during login)
  useEffect(() => {
    const getUserIdFromCookie = () => {
      const cookies = document.cookie.split("; ")
      const userCookie = cookies.find(cookie => cookie.startsWith("userId="))
      if (userCookie) {
        const id = userCookie.split("=")[1]
        setUserId(id)
      } else {
        console.warn("No userId cookie found. Please login.")
      }
    }

    getUserIdFromCookie()
  }, [])

  // Fetch all SMTP accounts for current user
  const fetchSMTPAccounts = async () => {
    if (!userId) return

    setIsLoadingAccounts(true)
    try {
      const response = await fetch(`/api/config?userId=${userId}`)
      const result = await response.json()

      if (result.success && Array.isArray(result.data)) {
        setSmtpAccounts(result.data)
      } else {
        console.error("Failed to fetch accounts:", result.message)
      }
    } catch (error) {
      console.error("Failed to fetch SMTP accounts:", error)
    } finally {
      setIsLoadingAccounts(false)
    }
  }

  useEffect(() => {
    if (userId) {
      fetchSMTPAccounts()
    }
  }, [userId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setConfig((prev) => ({ ...prev, [name]: value }))
  }

  // Always create NEW account
  const handleSave = async () => {
    if (!userId) {
      setSaveMessage("Please login first")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    if (!config.host || !config.port || !config.username || !config.password || !config.senderEmail) {
      setSaveMessage("Please fill all required fields")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    try {
      const payload = {
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        senderEmail: config.senderEmail,
        senderName: config.senderName,
      }

      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setSaveMessage("New SMTP account created successfully")
        
        // Clear form
        setConfig({
          host: "",
          port: "2525",
          username: "",
          password: "",
          senderEmail: "",
          senderName: "",
        })

        // Refresh list
        await fetchSMTPAccounts()
      } else {
        setSaveMessage(result.message || "Failed to create account")
      }
    } catch (error) {
      console.error("Save failed:", error)
      setSaveMessage("Failed to create SMTP account")
    }

    setTimeout(() => setSaveMessage(""), 4000)
  }

  const handleTestSMTP = async () => {
    if (!config.host || !config.username || !config.password) {
      setTestMessage("Please fill host, username and password")
      setTestStatus("error")
      setTimeout(() => { setTestStatus("idle"); setTestMessage(""); }, 3000)
      return
    }

    setTestStatus("testing")
    setTestMessage("")

    try {
      const response = await fetch("/api/smtp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: config.host,
          port: Number.parseInt(config.port) ?? 587,
          username: config.username,
          password: config.password,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setTestStatus("success")
        setTestMessage("SMTP connection successful!")
      } else {
        setTestStatus("error")
        setTestMessage(data.error || "SMTP test failed")
      }
    } catch (error) {
      setTestStatus("error")
      setTestMessage(error instanceof Error ? error.message : "Connection error")
    }

    setTimeout(() => setTestStatus("idle"), 5000)
  }

  const handleActivate = async (id: string) => {
    if (!userId) return

    try {
      const response = await fetch("/api/config/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, userId }),
      })

      const result = await response.json()

      if (result.success) {
        await fetchSMTPAccounts()
      }
    } catch (error) {
      console.error("Failed to activate account:", error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this SMTP account?")) return

    setIsDeleting(id)
    try {
      const response = await fetch(`/api/config?id=${id}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (result.success) {
        await fetchSMTPAccounts()
      } else {
        alert(result.message || "Failed to delete")
      }
    } catch (error) {
      console.error("Delete failed:", error)
      alert("Failed to delete account")
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 md:mb-12 animate-fadeInUp">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            SMTP Configuration
          </h1>
          <p className="text-muted-foreground max-w-md">
            Manage multiple email sending accounts
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN - Saved Email Accounts */}
          <div className="lg:col-span-1">
            <Card className="rounded-2xl shadow-lg border border-border/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl h-full">
              <CardHeader>
                <CardTitle className="text-xl flex items-center justify-between">
                  Saved Email Accounts
                  {isLoadingAccounts && <Loader2 className="w-4 h-4 animate-spin" />}
                </CardTitle>
                <CardDescription>
                  Select active account for sending. Unlimited accounts supported.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!userId ? (
                  <p className="text-red-500 text-sm py-8 text-center">
                    Please login to manage SMTP accounts
                  </p>
                ) : smtpAccounts.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    No SMTP accounts yet. Create one below.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {smtpAccounts.map((account) => (
                      <div
                        key={account.id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 group ${
                          account.isActive 
                            ? "border-primary bg-primary/5" 
                            : "border-transparent hover:border-border hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="smtpAccount"
                          checked={account.isActive}
                          onChange={() => handleActivate(account.id)}
                          className="w-4 h-4 accent-primary cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{account.senderEmail}</p>
                          {account.senderName && (
                            <p className="text-xs text-muted-foreground truncate">{account.senderName}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(account.id)}
                          disabled={isDeleting === account.id}
                          className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 hover:bg-red-100/50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Click radio button to make an account active. Active account is used for sending emails.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN - SMTP Settings Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="rounded-2xl shadow-lg border border-border/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
              <CardHeader className="pb-6">
                <CardTitle className="text-xl flex items-center gap-2">
                  Add New SMTP Account
                  {isLoadingConfig && <Loader2 className="w-4 h-4 animate-spin" />}
                </CardTitle>
                <CardDescription>
                  Fill the form and click Save to create a new account. Previous accounts are preserved.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">SMTP Host</label>
                    <Input name="host" value={config.host} onChange={handleChange} placeholder="smtp.gmail.com" className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">SMTP Port</label>
                    <Input name="port" value={config.port} onChange={handleChange} placeholder="587" className="w-full" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Username / Email</label>
                    <Input name="username" value={config.username} onChange={handleChange} placeholder="your@email.com" className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Password / App Password</label>
                    <Input name="password" type="password" value={config.password} onChange={handleChange} placeholder="••••••••" className="w-full" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Sender Email</label>
                    <Input name="senderEmail" value={config.senderEmail} onChange={handleChange} placeholder="sender@example.com" className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Sender Name (Optional)</label>
                    <Input name="senderName" value={config.senderName} onChange={handleChange} placeholder="John Doe" className="w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={handleSave}
                disabled={!userId}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 py-6 rounded-2xl text-base font-medium"
              >
                Save New SMTP Account
              </Button>
              <Button
                onClick={handleTestSMTP}
                variant="outline"
                disabled={testStatus === "testing" || !userId}
                className="flex-1 transition-all duration-200 py-6 rounded-2xl text-base font-medium border-2 hover:bg-muted"
              >
                {testStatus === "testing" && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
                Test SMTP
              </Button>
            </div>

            {saveMessage && (
              <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-900/60 rounded-2xl text-green-800 dark:text-green-300 text-sm flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                {saveMessage}
              </div>
            )}

            {testStatus !== "idle" && (
              <Card className={testStatus === "success" ? "border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 rounded-2xl" : "border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 rounded-2xl"}>
                <CardContent className="pt-6 flex items-start gap-3">
                  {testStatus === "success" ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={testStatus === "success" ? "text-green-800 dark:text-green-300 font-medium" : "text-red-800 dark:text-red-300 font-medium"}>
                      {testMessage}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50 rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-amber-900 dark:text-amber-200 text-lg">Security Notice</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-amber-800 dark:text-amber-300 space-y-3">
                <p>This tool is for testing purposes only. Mass unsolicited emails may violate laws and terms of service.</p>
                <p>Credentials are stored securely in the database.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}