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

  useEffect(() => {
    const saved = sessionStorage.getItem("smtpConfig")
    if (saved) {
      try {
        setConfig(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to load config:", e)
      }
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setConfig((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = () => {
    sessionStorage.setItem("smtpConfig", JSON.stringify(config))
    setSaveMessage("Configuration saved to session")
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
          host: config.host,
          port: Number.parseInt(config.port),
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 sm:p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 sm:mb-8 md:mb-12 animate-fadeInUp">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2 sm:mb-3">
            SMTP Configuration
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Configure your email sending credentials for testing with Mailtrap
          </p>
        </div>

        <Card className="mb-6 animate-slideInLeft">
          <CardHeader className="pb-4 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">SMTP Settings</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              These credentials are stored in your browser session only
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">SMTP Host</label>
                <Input
                  name="host"
                  value={config.host}
                  onChange={handleChange}
                  placeholder="smtp.mailtrap.io"
                  className="w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">SMTP Port</label>
                <Input
                  name="port"
                  value={config.port}
                  onChange={handleChange}
                  placeholder="2525"
                  className="w-full text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">Username</label>
                <Input
                  name="username"
                  value={config.username}
                  onChange={handleChange}
                  placeholder="Your Mailtrap username"
                  className="w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">Password</label>
                <Input
                  name="password"
                  type="password"
                  value={config.password}
                  onChange={handleChange}
                  placeholder="Your Mailtrap password"
                  className="w-full text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">
                  Default Sender Email
                </label>
                <Input
                  name="senderEmail"
                  value={config.senderEmail}
                  onChange={handleChange}
                  placeholder="sender@example.com"
                  className="w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">Default Sender Name</label>
                <Input
                  name="senderName"
                  value={config.senderName}
                  onChange={handleChange}
                  placeholder="Your Name"
                  className="w-full text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">Default Delay (ms)</label>
              <Input
                name="defaultDelay"
                value={config.defaultDelay}
                onChange={handleChange}
                placeholder="500"
                className="w-full text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">Delay between sending each email</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Button
            onClick={handleSave}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200"
          >
            Save Configuration
          </Button>
          <Button
            onClick={handleTestSMTP}
            variant="outline"
            disabled={testStatus === "testing"}
            className="flex-1 transition-all duration-200 bg-transparent"
          >
            {testStatus === "testing" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Test SMTP
          </Button>
        </div>

        {saveMessage && (
          <div className="p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 rounded-lg text-green-800 dark:text-green-300 text-sm mb-4 animate-slideInLeft">
            {saveMessage}
          </div>
        )}

        {testStatus !== "idle" && (
          <Card
            className={
              testStatus === "success"
                ? "border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 mb-6 animate-slideInLeft"
                : "border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 mb-6 animate-slideInLeft"
            }
          >
            <CardContent className="pt-6 flex items-start gap-3">
              {testStatus === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p
                  className={
                    testStatus === "success"
                      ? "text-green-800 dark:text-green-300 text-sm"
                      : "text-red-800 dark:text-red-300 text-sm"
                  }
                >
                  {testMessage}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50">
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-amber-900 dark:text-amber-200 text-lg sm:text-xl">Security Notice</CardTitle>
          </CardHeader>
          <CardContent className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 space-y-2 leading-relaxed">
            <p>
              This tool is for testing purposes only. Mass unsolicited emails may violate laws and terms of service.
            </p>
            <p>
              All SMTP credentials are stored in your browser session and are never persisted to a server or database.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
