import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Settings, Zap } from "lucide-react"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-24 lg:py-32">
        <div className="text-center mb-8 sm:mb-12 md:mb-16 animate-fadeInUp">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-3 sm:mb-4 md:mb-6 leading-tight">
            Cold Email Sender
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed px-2">
            Powered by <span className="font-semibold text-primary">Axoraweb Solutions</span>. Send bulk emails with
            optional attachments. No database, no persistence. Perfect for testing.
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

        <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50 animate-fadeInUp">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <CardTitle className="text-amber-900 dark:text-amber-200 text-lg sm:text-xl">Important Notice</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-amber-800 dark:text-amber-300 space-y-2 leading-relaxed">
            <p>This tool is designed for testing purposes only using Mailtrap or similar services.</p>
            <p>Sending unsolicited bulk emails may violate laws and email service terms of service.</p>
            <p>All data is ephemeral and stored only in your browser session during use.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
