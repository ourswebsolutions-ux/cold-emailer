// components/Pricing.tsx
"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Zap, Crown, Calendar, TrendingUp } from "lucide-react";

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  duration: string;
  badge?: string;
  popular?: boolean;
  bestValue?: boolean;
  description: string;
  features: string[];
  cta: string;
  icon: React.ReactNode;
  gradient: string;
}

const pricingPlans: PricingPlan[] = [
  {
    id: "monthly",
    name: "Monthly Plan",
    price: 2000,
    duration: "/month",
    description: "Perfect for getting started",
    features: [
      "Full access to cold email sender",
      "SMTP configuration",
      "Email campaign management",
      "Basic analytics",
      "Email templates",
    ],
    cta: "Start Monthly",
    icon: <Zap className="w-6 h-6" />,
    gradient: "from-blue-500 to-cyan-500",
    popular: false,
    bestValue: false,
  },
  {
    id: "six-months",
    name: "6 Months Plan",
    price: 8500,
    duration: "/6 months",
    badge: "Most Popular",
    description: "Best for growing teams",
    features: [
      "Everything in Monthly Plan",
      "Advanced campaign automation",
      "Priority support",
      "Better value pricing",
      "Performance tracking",
    ],
    cta: "Choose 6 Months",
    icon: <Crown className="w-6 h-6" />,
    gradient: "from-violet-500 to-purple-600",
    popular: true,
    bestValue: false,
  },
  {
    id: "yearly",
    name: "Yearly Plan",
    price: 12000,
    duration: "/year",
    badge: "Best Value",
    description: "Maximum savings & scale",
    features: [
      "Everything in 6 Months Plan",
      "Unlimited campaign management",
      "Advanced analytics",
      "Premium support",
      "Maximum savings",
    ],
    cta: "Get Yearly Plan",
    icon: <Calendar className="w-6 h-6" />,
    gradient: "from-emerald-500 to-teal-600",
    popular: false,
    bestValue: true,
  },
];

export default function Pricing() {
  const handleSelectPlan = (planId: string) => {
    // Add your checkout logic here (Stripe, Lemon Squeezy, etc.)
    console.log(`Selected plan: ${planId}`);
    // Example: router.push(`/checkout?plan=${planId}`);
  };

  return (
    <section className="py-24 bg-gradient-to-b from-zinc-950 via-zinc-900 to-black dark:from-black dark:via-zinc-950 dark:to-zinc-900">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-white/70">Flexible Billing</span>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Simple Pricing, Powerful Email Automation
          </h2>
          <p className="max-w-2xl mx-auto text-xl text-zinc-400">
            Choose the plan that fits your outreach needs and scale your email campaigns.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pricingPlans.map((plan) => (
            <Card
              key={plan.id}
              className={`group relative flex flex-col h-full overflow-hidden border-2 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${
                plan.popular
                  ? "border-violet-500 shadow-xl shadow-violet-500/20"
                  : "border-white/10 hover:border-white/20"
              } bg-zinc-900/80 backdrop-blur-xl`}
            >
              {/* Popular Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <div className="px-6 py-1 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-full shadow-lg flex items-center gap-1.5">
                    <Crown className="w-4 h-4" />
                    {plan.badge}
                  </div>
                </div>
              )}

              <CardHeader className="pt-10 pb-8 text-center">
                <div className={`mx-auto mb-6 w-16 h-16 rounded-2xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center text-white shadow-lg`}>
                  {plan.icon}
                </div>

                <CardTitle className="text-2xl font-semibold text-white mb-1">
                  {plan.name}
                </CardTitle>
                <CardDescription className="text-zinc-400">{plan.description}</CardDescription>

                <div className="mt-8 flex items-baseline justify-center gap-x-2">
                  <span className="text-5xl font-bold tracking-tighter text-white">
                    {plan.price.toLocaleString('en-US')}
                  </span>
                  <span className="text-xl text-zinc-400 font-medium">{plan.duration}</span>
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col px-8 pb-10">
                <ul className="space-y-4 mb-10 flex-1">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3 text-zinc-300">
                      <div className="mt-1 flex-shrink-0">
                        <Check className="w-5 h-5 text-emerald-400" />
                      </div>
                      <span className="leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSelectPlan(plan.id)}
                  size="lg"
                  className={`w-full h-14 text-base font-semibold transition-all duration-200 group-hover:shadow-xl ${
                    plan.popular
                      ? "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg"
                      : "bg-white hover:bg-white/90 text-zinc-900"
                  }`}
                >
                  {plan.cta}
                </Button>

                <p className="text-center text-xs text-zinc-500 mt-4">
                  Cancel anytime • No hidden fees
                </p>
              </CardContent>

              {/* Subtle gradient overlay at bottom for polish */}
              <div className={`absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none`} />
            </Card>
          ))}
        </div>

        {/* Trust signals */}
        <div className="mt-16 text-center">
          <p className="text-zinc-500 text-sm flex items-center justify-center gap-2">
            Trusted by cold email power users • Secure payments • 14-day money-back guarantee
          </p>
        </div>
      </div>
    </section>
  );
}