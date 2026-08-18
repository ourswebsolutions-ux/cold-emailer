"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Settings, Zap, Building2, Users, Globe, ArrowRight, Shield, Sparkles, Check,Phone ,MessageCircle} from "lucide-react";

const MS_IN_24_HOURS = 24 * 60 * 60 * 1000;
const MS_IN_48_HOURS = 48 * 60 * 60 * 1000;

export default function Home() {
  const targetCompanies = 15;
  const targetUsers = 253;
  const targetInternational = 30;

  const [baseCompanies, setBaseCompanies] = useState(targetCompanies);
  const [baseInternational, setBaseInternational] = useState(targetInternational);

  const [displayCompanies, setDisplayCompanies] = useState(0);
  const [displayUsers, setDisplayUsers] = useState(0);
  const [displayInternational, setDisplayInternational] = useState(0);

  useEffect(() => {
    const now = Date.now();

    // Trusted Companies (+1 every 48h)
    let currentCompanies = targetCompanies;
    const storedCompaniesTime = localStorage.getItem("stats_companies_time");
    const storedCompaniesCount = localStorage.getItem("stats_companies_count");

    if (storedCompaniesTime && storedCompaniesCount) {
      const initialTime = parseInt(storedCompaniesTime, 10);
      const initialCount = parseInt(storedCompaniesCount, 10);
      const increments = Math.floor((now - initialTime) / MS_IN_48_HOURS);
      currentCompanies = Math.max(initialCount + increments, targetCompanies);
    } else {
      localStorage.setItem("stats_companies_time", now.toString());
      localStorage.setItem("stats_companies_count", targetCompanies.toString());
    }
    setBaseCompanies(currentCompanies);

    // International Users (+1 every 24h)
    let currentInternational = targetInternational;
    const storedInternationalTime = localStorage.getItem("stats_international_time");
    const storedInternationalCount = localStorage.getItem("stats_international_count");

    if (storedInternationalTime && storedInternationalCount) {
      const initialTime = parseInt(storedInternationalTime, 10);
      const initialCount = parseInt(storedInternationalCount, 10);
      const increments = Math.floor((now - initialTime) / MS_IN_24_HOURS);
      currentInternational = Math.max(initialCount + increments, targetInternational);
    } else {
      localStorage.setItem("stats_international_time", now.toString());
      localStorage.setItem("stats_international_count", targetInternational.toString());
    }
    setBaseInternational(currentInternational);

    // Animate counters
    animateCounter(currentCompanies, setDisplayCompanies);
    animateCounter(targetUsers, setDisplayUsers);
    animateCounter(currentInternational, setDisplayInternational);
  }, []);

  const animateCounter = (targetValue: number, setDisplay: (val: number) => void) => {
    const duration = 1400;
    let startTimestamp: number | null = null;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // smoother easeOutCubic
      const currentValue = Math.floor(easeProgress * targetValue);

      setDisplay(currentValue);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplay(targetValue);
      }
    };

    window.requestAnimationFrame(step);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-violet-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-slate-950">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#a1a1aa_0.8px,transparent_1px)] dark:bg-[radial-gradient(#3f3f46_0.8px,transparent_1px)] [background-size:20px_20px] opacity-40 pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-24 lg:py-32 relative">
        {/* Hero */}
        <div className="text-center mb-12 md:mb-20">
          <div className="inline-flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-4 py-1.5 mb-6 text-sm font-medium">
            <Sparkles className="w-4 h-4 text-violet-600" />
            AI-Powered Cold Email Platform
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-zinc-900 dark:text-white mb-6">
            Cold Email <span className="bg-gradient-to-r from-blue-600 to-sky-200 bg-clip-text text-transparent">Sender</span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg md:text-xl text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Send highly optimized, deliverability-focused cold emails at scale. 
            Built with intelligent automation, real-time analytics, and enterprise-grade SMTP management.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link href="/send">
              <Button size="lg" className="bg-black hover:bg-blue-700 text-white px-8 text-lg h-14 rounded-2xl group">
               <span className="bg-gradient-to-r from-blue-600 to-sky-200 bg-clip-text text-transparent">Start Sending Emails</span> 
                <ArrowRight className="ml-2 group-hover:translate-x-1 transition" />
              </Button>
            </Link>
            <Link href="/env">
              <Button size="lg" variant="outline" className="px-8 text-lg h-14 rounded-2xl border-2">
                Configure SMTP
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          <Card className="group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 border border-zinc-100 dark:border-zinc-800">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-2xl">
                  <Settings className="w-7 h-7 text-violet-600" />
                </div>
                <div>
                  <CardTitle>SMTP Configuration</CardTitle>
                  <CardDescription>Securely manage your email infrastructure</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                Connect Gmail, Outlook, or any custom SMTP. Test deliverability instantly.
              </p>
              <Link href="/env" className="block">
                <Button className="w-full">Configure Now →</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 border border-zinc-100 dark:border-zinc-800">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-fuchsia-100 dark:bg-fuchsia-900/30 rounded-2xl">
                  <Mail className="w-7 h-7 text-fuchsia-600" />
                </div>
                <div>
                  <CardTitle>Bulk Email Sender</CardTitle>
                  <CardDescription>Powerful campaign composer</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                Personalization, attachments, scheduling, and real-time tracking in one place.
              </p>
              <Link href="/send" className="block">
                <Button className="w-full">Launch Campaign →</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Important Notice */}
        <Card className="bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/50 dark:to-zinc-900 border-amber-200 dark:border-amber-900 mb-16">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Zap className="w-6 h-6 text-amber-600" />
              <CardTitle className="text-amber-900 dark:text-amber-100">Responsible Usage</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-amber-800 dark:text-amber-200 space-y-3 text-[15px]">
            <p>This platform uses advanced AI to optimize deliverability and campaign performance.</p>
            <p>Always respect anti-spam laws (CAN-SPAM, GDPR) and your recipients&apos; consent.</p>
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-20">
          {[
            { label: "Trusted Companies", value: displayCompanies, icon: Building2, color: "blue" },
            { label: "Active Users", value: displayUsers, icon: Users, color: "indigo" },
            { label: "International Reach", value: displayInternational, icon: Globe, color: "violet" },
          ].map((stat, idx) => (
            <Card 
              key={idx}
              className="relative overflow-hidden border border-zinc-100 dark:border-zinc-800 hover:border-violet-200 transition-all duration-300 group"
            >
              <CardContent className="p-8 flex items-center justify-between">
                <div>
                  <p className="uppercase tracking-widest text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                    {stat.label}
                  </p>
                  <div className="text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white">
                    {stat.value}<span className="text-3xl">+</span>
                  </div>
                </div>
                <div className={`p-4 rounded-2xl bg-${stat.color}-500/10 text-${stat.color}-600 dark:text-${stat.color}-400 group-hover:scale-110 transition-transform`}>
                  <stat.icon className="w-9 h-9" />
                </div>
              </CardContent>
              <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-gradient-to-br from-violet-500/10 to-transparent rounded-full" />
            </Card>
          ))}
        </div>

        {/* Pricing Section */}
        <div className="mb-12">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-4 py-1.5 mb-6 text-sm font-medium">
              <Shield className="w-4 h-4 text-emerald-600" />
              Flexible Plans
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white mb-4">
              Simple,<span className="bg-gradient-to-r from-blue-600 to-sky-200 bg-clip-text text-transparent">Transparent Pricing</span> 
            </h2>
            <p className="max-w-md mx-auto text-zinc-600 dark:text-zinc-400">
              Choose the perfect plan for your cold email needs. Cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {/* Monthly Plan */}
            <Card className="border border-zinc-200 dark:border-zinc-800 hover:shadow-xl transition-all duration-300">
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl">Starter</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold tracking-tighter">2k</span>
                  <span className="text-zinc-500 dark:text-zinc-400">/mo</span>
                </div>
                <CardDescription className="mt-2">Billed monthly</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-4 text-sm">
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Unlimited emails/month</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Basic AI personalization</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>1 SMTP account</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Real-time analytics</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Email support</span>
                  </li>
                </ul>
                <Button className="w-full h-12 text-base" variant="outline">
                  Choose Monthly
                </Button>
              </CardContent>
            </Card>

            {/* 6-Month Plan - Most Popular */}
            <Card className="border-2 border-violet-600 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-4 py-1 rounded-full">
                MOST POPULAR
              </div>
              <CardHeader className="text-center pb-8 pt-10">
                <CardTitle className="text-2xl">Growth</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold tracking-tighter">8.5k</span>
                  <span className="text-zinc-500 dark:text-zinc-400">/mo</span>
                </div>
                <CardDescription className="mt-2">
                  Billed as $30.62 every 6 months • <span className="text-emerald-600 font-medium">Save 17%</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-4 text-sm">
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>UNlimited emails/month</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Advanced AI personalization</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Up to 5 SMTP accounts</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Campaign scheduling</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Deliverability insights</span>
                  </li>
                </ul>
                <Button className="w-full h-12 text-base bg-blue-600 hover:bg-violet-700">
                  Choose 6 Months
                </Button>
              </CardContent>
            </Card>

            {/* Yearly Plan */}
            <Card className="border border-zinc-200 dark:border-zinc-800 hover:shadow-xl transition-all duration-300">
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl">Enterprise</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold tracking-tighter">12k</span>
                  <span className="text-zinc-500 dark:text-zinc-400">/mo</span>
                </div>
                <CardDescription className="mt-2">
                  Billed as $43.24 every year • <span className="text-emerald-600 font-medium">Save 28%</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-4 text-sm">
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Unlimited emails</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Full AI suite + custom prompts</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Unlimited SMTP accounts</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Team collaboration</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>API access</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Premium support + onboarding</span>
                  </li>
                </ul>
                <Button className="w-full h-12 text-base" variant="outline">
                  Choose Yearly
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 mt-8">
            All plans include 14-day money-back guarantee. VAT may apply.
          </p>
        </div>
        <div className="bg-blue-400 rounded-3xl p-10 md:p-16 text-center text-white">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter mb-6">
              Ready to Scale Your Outreach?
            </h2>
            <p className="text-xl text-violet-100 mb-10">
              Speak with our team instantly. Get personalized guidance and start sending high-converting cold emails today.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {/* WhatsApp Button */}
              <a 
                href="https://wa.me/923245237429" 
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button 
                  size="lg" 
                  className="bg-white text-blue-700 bg-green-500 hover:bg-white/90 text-lg h-16 px-10 rounded-2xl flex items-center gap-3 w-full sm:w-auto"
                >
                  <MessageCircle className="w-6 h-6" />
                  Chat on WhatsApp
                </Button>
              </a>

              {/* Call Button */}
              <a 
                href="tel:+1234567890" 
                className="inline-flex"
              >
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-white text-black  hover:bg-white/10 text-lg h-16 px-10 rounded-2xl flex items-center gap-3 w-full sm:w-auto"
                >
                  <Phone className="w-6 h-6" />
                  Call Us Now
                </Button>
              </a>
            </div>

            <p className="text-sm text-violet-200 mt-8">
              Available 24/7 Hours 
            </p>
          </div>
        </div>
      </div>
      
    </main>
  );
}


