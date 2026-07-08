"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react"

interface SystemAccount {
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

export default function SystemEmailConfigPage() {
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
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [systemAccounts, setSystemAccounts] = useState<SystemAccount[]>([])
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  // Get logged-in userId from cookie
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

  // Fetch all system email accounts
  const fetchSystemAccounts = async () => {
    if (!userId) return

    setIsLoadingAccounts(true)
    try {
      const response = await fetch(`/api/system-config?userId=${userId}`)
      const result = await response.json()

      if (result.success && Array.isArray(result.data)) {
        setSystemAccounts(result.data)
      } else {
        console.error("Failed to fetch accounts:", result.message)
      }
    } catch (error) {
      console.error("Failed to fetch system email accounts:", error)
    } finally {
      setIsLoadingAccounts(false)
    }
  }

  useEffect(() => {
    if (userId) {
      fetchSystemAccounts()
    }
  }, [userId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setConfig((prev) => ({ ...prev, [name]: value }))
  }

  // Create new account
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
        port: parseInt(config.port),
        username: config.username,
        password: config.password,
        senderEmail: config.senderEmail,
        senderName: config.senderName || undefined,
      }

      const response = await fetch("/api/system-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setSaveMessage("New system email account created successfully")
        
        // Clear form
        setConfig({
          host: "",
          port: "2525",
          username: "",
          password: "",
          senderEmail: "",
          senderName: "",
        })

        await fetchSystemAccounts()
      } else {
        setSaveMessage(result.message || "Failed to create account")
      }
    } catch (error) {
      console.error("Save failed:", error)
      setSaveMessage("Failed to create system email account")
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
        setTestMessage("System email connection successful!")
      } else {
        setTestStatus("error")
        setTestMessage(data.error || "System email test failed")
      }
    } catch (error) {
      setTestStatus("error")
      setTestMessage(error instanceof Error ? error.message : "Connection error")
    }

    setTimeout(() => setTestStatus("idle"), 5000)
  }

  // Toggle active status (supports multiple active accounts)
  const handleToggleActive = async (id: string, currentActive: boolean) => {
    if (!userId) return

    try {
      const response = await fetch("/api/system-config/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id, 
          userId,
          isActive: !currentActive 
        }),
      })

      const result = await response.json()

      if (result.success) {
        await fetchSystemAccounts()
      } else {
        alert(result.message || "Failed to update status")
      }
    } catch (error) {
      console.error("Failed to toggle account:", error)
      alert("Failed to update account status")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this system email account?")) return

    setIsDeleting(id)
    try {
      const response = await fetch(`/api/system-config?id=${id}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (result.success) {
        await fetchSystemAccounts()
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
            System Email Configuration
          </h1>
          <p className="text-muted-foreground max-w-md">
            Manage system email sending accounts
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN - Saved Accounts */}
          <div className="lg:col-span-1">
            <Card className="rounded-2xl shadow-lg border border-border/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl h-full">
              <CardHeader>
                <CardTitle className="text-xl flex items-center justify-between">
                  Saved System Email Accounts
                  {isLoadingAccounts && <Loader2 className="w-4 h-4 animate-spin" />}
                </CardTitle>
                <CardDescription>
                  Toggle multiple accounts ON (TRUE) / OFF (FALSE)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!userId ? (
                  <p className="text-red-500 text-sm py-8 text-center">
                    Please login to manage system email accounts
                  </p>
                ) : systemAccounts.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    No system email accounts yet. Create one below.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {systemAccounts.map((account) => (
                      <div
                        key={account.id}
                        className={`flex items-center justify-between px-4 py-4 rounded-xl border transition-all duration-200 group ${
                          account.isActive 
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" 
                            : "border-border hover:border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{account.senderEmail}</p>
                          {account.senderName && (
                            <p className="text-xs text-muted-foreground truncate">{account.senderName}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <div className={`text-xs font-mono font-medium px-2.5 py-1 rounded-full border ${
                            account.isActive 
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300" 
                              : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                          }`}>
                            {account.isActive ? "TRUE" : "FALSE"}
                          </div>

                          <Switch
                            checked={account.isActive}
                            onCheckedChange={() => handleToggleActive(account.id, account.isActive)}
                            className="data-[state=checked]:bg-emerald-600"
                          />
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(account.id)}
                          disabled={isDeleting === account.id}
                          className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 hover:bg-red-100/50 ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-border">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      System Email Configuration Guide
                    </h3>
                    <ol className="text-xs text-muted-foreground space-y-3 list-decimal list-inside">
                      <li><strong>SMTP Host:</strong> e.g. <code className="px-1 py-0.5 bg-muted rounded">smtp.gmail.com</code></li>
                      <li><strong>SMTP Port:</strong> Usually <code className="px-1 py-0.5 bg-muted rounded">587</code></li>
                      <li><strong>Username / Email:</strong> Your email address</li>
                      <li><strong>Password:</strong> Use App Password if required</li>
                      <li><strong>Sender Email:</strong> Same as above</li>
                      <li><strong>Sender Name:</strong> Optional display name</li>
                      <li><strong>Active (TRUE):</strong> Toggle to enable account for sending emails</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN - Add New Account */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="rounded-2xl shadow-lg border border-border/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
              <CardHeader className="pb-6">
                <CardTitle className="text-xl">Add New System Email Account</CardTitle>
                <CardDescription>
                  Fill the form and click Save. Multiple accounts can be active.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">SMTP Host</label>
                    <Input name="host" value={config.host} onChange={handleChange} placeholder="smtp.gmail.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">SMTP Port</label>
                    <Input name="port" value={config.port} onChange={handleChange} placeholder="587" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Username / Email</label>
                    <Input name="username" value={config.username} onChange={handleChange} placeholder="your@email.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Password / App Password</label>
                    <Input name="password" type="password" value={config.password} onChange={handleChange} placeholder="••••••••" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Sender Email</label>
                    <Input name="senderEmail" value={config.senderEmail} onChange={handleChange} placeholder="sender@example.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Sender Name (Optional)</label>
                    <Input name="senderName" value={config.senderName} onChange={handleChange} placeholder="John Doe" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={handleSave}
                disabled={!userId}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-6 rounded-2xl text-base font-medium"
              >
                Save New System Email Account
              </Button>
              <Button
                onClick={handleTestSMTP}
                variant="outline"
                disabled={testStatus === "testing" || !userId}
                className="flex-1 py-6 rounded-2xl text-base font-medium border-2 hover:bg-muted"
              >
                {testStatus === "testing" && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
                Test Connection
              </Button>
            </div>

            {saveMessage && (
              <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-900/60 rounded-2xl text-green-800 dark:text-green-300 text-sm flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                {saveMessage}
              </div>
            )}

            {testStatus !== "idle" && (
              <Card className={testStatus === "success" ? "border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20" : "border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20"}>
                <CardContent className="pt-6 flex items-start gap-3">
                  {testStatus === "success" ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <p className={testStatus === "success" ? "text-green-800 dark:text-green-300 font-medium" : "text-red-800 dark:text-red-300 font-medium"}>
                    {testMessage}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-amber-900 dark:text-amber-200 text-lg">Security Notice</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-amber-800 dark:text-amber-300 space-y-3">
                <p>This software is built with security and reliability as a top priority.</p>
                <p>All sensitive information is handled securely and stored with appropriate protections.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}