"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Settings, Zap, Building2, Users, Globe } from "lucide-react"

// Constants for auto-increment calculations
const MS_IN_24_HOURS = 24 * 60 * 60 * 1000
const MS_IN_48_HOURS = 48 * 60 * 60 * 1000

export default function Home() {
  // Target values requested
  const targetCompanies = 15
  const targetUsers = 253
  const targetInternational = 30

  // 1. Persisted values that increment automatically over time
  const [baseCompanies, setBaseCompanies] = useState(targetCompanies)
  const [baseInternational, setBaseInternational] = useState(targetInternational)

  // 2. Animated display states shown to the user
  const [displayCompanies, setDisplayCompanies] = useState(0)
  const [displayUsers, setDisplayUsers] = useState(0)
  const [displayInternational, setDisplayInternational] = useState(0)

  // Handle localStorage background persistence logic
  useEffect(() => {
    const now = Date.now()
    
    // Logic for Trusted Companies (+1 every 48 hours)
    const storedCompaniesTime = localStorage.getItem("stats_companies_time")
    const storedCompaniesCount = localStorage.getItem("stats_companies_count")
    
    let currentCompanies = targetCompanies
    if (!storedCompaniesTime || !storedCompaniesCount) {
      localStorage.setItem("stats_companies_time", now.toString())
      localStorage.setItem("stats_companies_count", targetCompanies.toString())
    } else {
      const initialTime = parseInt(storedCompaniesTime, 10)
      const initialCount = parseInt(storedCompaniesCount, 10)
      const increments = Math.floor((now - initialTime) / MS_IN_48_HOURS)
      currentCompanies = initialCount + increments
    }
    setBaseCompanies(currentCompanies)

    // Logic for International Users (+1 every 24 hours)
    const storedInternationalTime = localStorage.getItem("stats_international_time")
    const storedInternationalCount = localStorage.getItem("stats_international_count")
    
    let currentInternational = targetInternational
    if (!storedInternationalTime || !storedInternationalCount) {
      localStorage.setItem("stats_international_time", now.toString())
      localStorage.setItem("stats_international_count", targetInternational.toString())
    } else {
      const initialTime = parseInt(storedInternationalTime, 10)
      const initialCount = parseInt(storedInternationalCount, 10)
      const increments = Math.floor((now - initialTime) / MS_IN_24_HOURS)
      currentInternational = initialCount + increments
    }
    setBaseInternational(currentInternational)

    // Trigger smooth counter animations from 0 to the calculated final numbers
    animateCounter(currentCompanies, setDisplayCompanies)
    animateCounter(targetUsers, setDisplayUsers)
    animateCounter(currentInternational, setDisplayInternational)
  }, [])

  // High performance smooth count animation using requestAnimationFrame
  const animateCounter = (targetValue: number, setDisplay: (val: number) => void) => {
    const duration = 1200 // Animation duration in ms
    let startTimestamp: number | null = null

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      
      // Use standard easeOutQuad for silky smooth frame transitions
      const easeProgress = progress * (2 - progress)
      const currentValue = Math.floor(easeProgress * targetValue)
      
      setDisplay(currentValue)

      if (progress < 1) {
        window.requestAnimationFrame(step)
      } else {
        setDisplay(targetValue)
      }
    }

    window.requestAnimationFrame(step)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-24 lg:py-32">
        <div className="text-center mb-8 sm:mb-12 md:mb-16 animate-fadeInUp">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-3 sm:mb-4 md:mb-6 leading-tight">
            Cold Email Sender
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed px-2">
           Powered by <span className="font-semibold text-primary"> AxoraWeb Solutions.</span>.
         An AI-powered automated email system built for <span className="font-semibold text-primary"> speed</span>, intelligence, and precision.
Send powerful, smartly optimized emails with optional attachments and seamless delivery <span className="font-semibold text-primary"> automation</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-12">
          <Card className="hover:shadow-lg hover:border-primary/30 transition-all duration-300 animate-slideInLeft">
            <CardHeader className="pb-3 sm:pb-4">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg sm:text-xl">Configure SMTP</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Set up your email credentials</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Configure your SMTP settings and test the connection. Credentials are stored in your browser session
                only.
              </p>
              <Link href="/env" className="block">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200">
                  Go to Configuration
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg hover:border-primary/30 transition-all duration-300 animate-slideInRight">
            <CardHeader className="pb-3 sm:pb-4">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Mail className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg sm:text-xl">Send Emails</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Compose and send bulk emails</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Compose your email, add recipients, and send with optional attachments. Real-time status updates.
              </p>
              <Link href="/send" className="block">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200">
                  Go to Sender
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50 animate-fadeInUp mb-8 sm:mb-12">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <CardTitle className="text-amber-900 dark:text-amber-200 text-lg sm:text-xl">Important Notice</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-amber-800 dark:text-amber-300 space-y-2 leading-relaxed">
            <p>Powered by Artificial Intelligence, this platform helps streamline bulk email workflows with enhanced performance and automation.</p>
            <p>Our intelligent system is designed to provide a faster, smoother, and more reliable email sending experience.</p>
            <p>Always use this tool responsibly and comply with applicable email regulations and service policies.</p>
          </CardContent>
        </Card>

        {/* Brand New Statistics Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 animate-fadeInUp">
          <Card className="relative overflow-hidden bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950 border border-slate-200/60 dark:border-slate-800/60 shadow-md hover:shadow-xl hover:border-primary/30 transform hover:-translate-y-1 transition-all duration-300 rounded-xl group">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Trusted Companies</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight select-none">
                  {displayCompanies}+
                </h3>
              </div>
              <div className="p-3 bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl transition-all duration-300 group-hover:scale-110">
                <Building2 className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950 border border-slate-200/60 dark:border-slate-800/60 shadow-md hover:shadow-xl hover:border-primary/30 transform hover:-translate-y-1 transition-all duration-300 rounded-xl group">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Active Users</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight select-none">
                  {displayUsers}+
                </h3>
              </div>
              <div className="p-3 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl transition-all duration-300 group-hover:scale-110">
                <Users className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950 border border-slate-200/60 dark:border-slate-800/60 shadow-md hover:shadow-xl hover:border-primary/30 transform hover:-translate-y-1 transition-all duration-300 rounded-xl group">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">International Users</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight select-none">
                  {displayInternational}+
                </h3>
              </div>
              <div className="p-3 bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 rounded-xl transition-all duration-300 group-hover:scale-110">
                <Globe className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}