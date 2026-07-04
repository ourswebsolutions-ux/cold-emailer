"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

interface SMTPConfig {
  host: string
  port: string
  username: string
  password: string
  senderEmail: string
  senderName: string
  defaultDelay: string
}

export default function EnvPage() {
  const [config, setConfig] = useState<SMTPConfig>({
    host: "",
    port: "2525",
    username: "",
    password: "",
    senderEmail: "",
    senderName: "",
    defaultDelay: "500",
  })

  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle")
  const [testMessage, setTestMessage] = useState("")
  const [saveMessage, setSaveMessage] = useState("")
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)

  const [userId] = useState("cmr6decxk0000v3qkdxk7k7fp")

  // Saved Email Accounts state
  const [emails, setEmails] = useState<string[]>([
    "admin@gmail.com",
    "support@gmail.com",
    "sales@gmail.com",
    "info@gmail.com",
    "marketing@gmail.com"
  ])
  const [selectedEmail, setSelectedEmail] = useState("admin@gmail.com")

  // Fetch SMTP Config
  const fetchConfig = async () => {
    if (!userId) return
    setIsLoadingConfig(true)
    try {
      const response = await fetch(`/api/config?userId=${userId}`)
      if (response.ok) {
        const result = await response.json()
        console.log("SMTP Config Response:", result)

        if (result.success && result.data) {
          const data = result.data
          setConfig({
            host: data.host || "",
            port: data.port?.toString() || "2525",
            username: data.username || "",
            password: data.password || "",
            senderEmail: data.senderEmail || "",
            senderName: data.senderName || "",
            defaultDelay: "500",
          })
        }
      }
    } catch (error) {
      console.error("Failed to fetch SMTP config from API:", error)
      const saved = sessionStorage.getItem("smtpConfig")
      if (saved) {
        try {
          setConfig(JSON.parse(saved))
        } catch (e) {
          console.error("Failed to load from session:", e)
        }
      }
    } finally {
      setIsLoadingConfig(false)
    }
  }

  // Fetch Emails
  const fetchEmails = async () => {
    if (!userId) return
    try {
      const response = await fetch(`/api/config?userId=${userId}`)
      if (response.ok) {
        const result = await response.json()
        console.log("Fetched data for emails:", result)

        let emailList: string[] = []

        if (result.success && result.data?.senderEmail) {
          emailList = [result.data.senderEmail]
        }

        if (emailList.length === 0) {
          emailList = [
            "admin@gmail.com",
            "support@gmail.com",
            "sales@gmail.com",
            "info@gmail.com",
            "marketing@gmail.com"
          ]
        }

        setEmails(emailList)
        if (emailList.length > 0) setSelectedEmail(emailList[0])
      }
    } catch (error) {
      console.error("Failed to fetch emails:", error)
    }
  }

  useEffect(() => {
    fetchConfig()
    fetchEmails()
  }, [userId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setConfig((prev) => ({ ...prev, [name]: value }))
  }

  // Only POST - No PUT
  const handleSave = async () => {
    sessionStorage.setItem("smtpConfig", JSON.stringify(config))

    if (!userId) {
      setSaveMessage("Configuration saved to session (no userId)")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    try {
      const payload = {
        userId,
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
        setSaveMessage("Configuration saved successfully to database")
      } else if (result.message?.includes("already exists")) {
        setSaveMessage("Configuration already exists. Please delete first or update manually.")
      } else {
        setSaveMessage("Configuration saved to session only")
      }
    } catch (error) {
      console.error("API save failed:", error)
      setSaveMessage("Configuration saved to session only")
    }

    setTimeout(() => setSaveMessage(""), 3000)
  }

  const handleTestSMTP = async () => {
    setTestStatus("testing")
    setTestMessage("")

    try {
      const response = await fetch("/api/smtp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: config.host || "smtp.gmail.com",
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

  const handleEmailSelect = (email: string) => {
    setSelectedEmail(email)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 md:mb-12 animate-fadeInUp">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            SMTP Configuration
          </h1>
          <p className="text-muted-foreground max-w-md">
            Manage your email sending accounts and SMTP settings
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN - Saved Email Accounts */}
          <div className="lg:col-span-1">
            <Card className="rounded-2xl shadow-lg border border-border/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl h-full">
              <CardHeader>
                <CardTitle className="text-xl">Saved Email Accounts</CardTitle>
                <CardDescription>
                  Select which email account should be used for sending.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {emails.map((email) => (
                    <div
                      key={email}
                      onClick={() => handleEmailSelect(email)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/70 cursor-pointer transition-all duration-200 group border border-transparent hover:border-border"
                    >
                      <input
                        type="radio"
                        name="selectedEmail"
                        checked={selectedEmail === email}
                        onChange={() => handleEmailSelect(email)}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{email}</p>
                        <p className="text-xs text-muted-foreground">Verified account</p>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    This selection will be used as the default sender for future email campaigns.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN - SMTP Settings */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="rounded-2xl shadow-lg border border-border/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
              <CardHeader className="pb-6">
                <CardTitle className="text-xl flex items-center gap-2">
                  SMTP Settings
                  {isLoadingConfig && <Loader2 className="w-4 h-4 animate-spin" />}
                </CardTitle>
                <CardDescription>
                  These credentials are stored in your browser session and synced to your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">SMTP Host</label>
                    <Input name="host" value={config.host} onChange={handleChange} placeholder="smtp.mailtrap.io" className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">SMTP Port</label>
                    <Input name="port" value={config.port} onChange={handleChange} placeholder="2525" className="w-full" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Username</label>
                    <Input name="username" value={config.username} onChange={handleChange} placeholder="Your Mailtrap username" className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Password</label>
                    <Input name="password" type="password" value={config.password} onChange={handleChange} placeholder="Your Mailtrap password" className="w-full" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Default Sender Email</label>
                    <Input name="senderEmail" value={config.senderEmail} onChange={handleChange} placeholder="sender@example.com" className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Default Sender Name</label>
                    <Input name="senderName" value={config.senderName} onChange={handleChange} placeholder="Your Name" className="w-full" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Default Delay (ms)</label>
                  <Input name="defaultDelay" value={config.defaultDelay} onChange={handleChange} placeholder="500" className="w-full" />
                  <p className="text-xs text-muted-foreground mt-2">Delay between sending each email</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={handleSave}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 py-6 rounded-2xl text-base font-medium"
              >
                Save Configuration
              </Button>
              <Button
                onClick={handleTestSMTP}
                variant="outline"
                disabled={testStatus === "testing"}
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
                <p>All SMTP credentials are stored in your browser session and synced securely to your account.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}