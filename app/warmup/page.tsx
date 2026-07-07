'use client';

import React, { useState } from 'react';
import { 
  Mail, Inbox, Sparkles, Trash2, Pause, Play 
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

interface WarmupAccount {
  id: number;
  email: string;
  displayName: string;
  status: 'active' | 'paused';
  repliesToday: number;
  addedDate: string;
}

const EmailWarmupPage: React.FC = () => {
  const [accounts, setAccounts] = useState<WarmupAccount[]>([
    {
      id: 1,
      email: "hello@acme.io",
      displayName: "Acme Team",
      status: 'active',
      repliesToday: 12,
      addedDate: "Jun 12, 2026"
    },
    {
      id: 2,
      email: "support@startup.dev",
      displayName: "Support",
      status: 'paused',
      repliesToday: 3,
      addedDate: "May 28, 2026"
    }
  ]);

  // Dummy emails with their own toggle state
  const [dummyEmails, setDummyEmails] = useState([
    { id: 1, email: "team@yourcompany.com", displayName: "Company Team", enabled: false },
    { id: 2, email: "marketing@brand.io", displayName: "Marketing", enabled: false },
    { id: 3, email: "sales@startup.dev", displayName: "Sales Team", enabled: false },
    { id: 4, email: "info@business.co", displayName: "Business Info", enabled: false },
    { id: 5, email: "ceo@enterprise.com", displayName: "CEO Office", enabled: false },
    { id: 6, email: "noreply@product.app", displayName: "Product Updates", enabled: false },
    { id: 7, email: "hello@techflow.io", displayName: "Techflow", enabled: false },
    { id: 8, email: "support@saasly.app", displayName: "SaaSly Support", enabled: false },
  ]);

  const addFromDummy = (email: string, displayName: string) => {
    const newAccount: WarmupAccount = {
      id: Date.now(),
      email,
      displayName,
      status: 'active',
      repliesToday: 0,
      addedDate: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())
    };

    setAccounts(prev => [newAccount, ...prev]);
  };

  const toggleDummy = (id: number) => {
    setDummyEmails(prev => 
      prev.map(item => 
        item.id === id ? { ...item, enabled: !item.enabled } : item
      )
    );
  };

  const toggleAccountStatus = (id: number) => {
    setAccounts(prev => 
      prev.map(account => 
        account.id === id 
          ? { ...account, status: account.status === 'active' ? 'paused' : 'active' } 
          : account
      )
    );
  };

  const deleteAccount = (id: number) => {
    setAccounts(prev => prev.filter(account => account.id !== id));
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10 md:mb-12">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="w-12 h-12 rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Email Warmup</h1>
              <p className="text-zinc-600 mt-1 text-base md:text-lg">Premium Deliverability Management</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* LEFT - Active Warmup Accounts */}
          <div className="lg:col-span-7">
            <Card className="bg-white border border-zinc-100 shadow-xl">
              <CardHeader className="pb-6">
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Inbox className="w-6 h-6 text-violet-600" />
                  Active Warmup Accounts
                </CardTitle>
                <CardDescription className="text-base">
                  Manage your enrolled email accounts ({accounts.length})
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`space-y-4 pr-2 max-h-[520px] overflow-y-auto custom-scroll ${accounts.length > 3 ? 'pb-4' : ''}`}>
                  {accounts.length === 0 ? (
                    <div className="text-center py-20 text-zinc-400">
                      No accounts added yet. Toggle from right side.
                    </div>
                  ) : (
                    accounts.map((account) => (
                      <div 
                        key={account.id} 
                        className="group bg-white border border-zinc-100 hover:border-violet-200 rounded-3xl p-6 transition-all duration-300 hover:shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-violet-100 to-fuchsia-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                              <Mail className="w-6 h-6 text-violet-600" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-lg truncate">{account.displayName}</div>
                              <div className="text-zinc-600 font-mono text-sm truncate">{account.email}</div>
                            </div>
                          </div>

                          <Badge 
                            className={`px-4 py-1.5 text-sm font-medium whitespace-nowrap ${
                              account.status === 'active' 
                                ? "bg-emerald-100 text-emerald-700" 
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {account.status === 'active' ? '● Active' : 'Paused'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-8 text-sm">
                          <div>
                            <p className="text-zinc-500">Replies Today</p>
                            <p className="text-2xl font-semibold mt-1">{account.repliesToday}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Added</p>
                            <p className="text-zinc-700 mt-1">{account.addedDate}</p>
                          </div>
                          <div className="flex items-end justify-end gap-3 col-span-2 md:col-span-1">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => toggleAccountStatus(account.id)}
                              className="border-zinc-300 text-xs md:text-sm"
                            >
                              {account.status === 'active' ? (
                                <><Pause className="w-4 h-4 mr-1"/> Pause</>
                              ) : (
                                <><Play className="w-4 h-4 mr-1"/> Resume</>
                              )}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => deleteAccount(account.id)}
                              className="text-red-600 hover:bg-red-50 border-red-200"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT - Available Emails with Switch */}
          <div className="lg:col-span-5">
            <Card className="bg-white border border-zinc-100 shadow-xl h-full">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-amber-500" />
                  Available Emails
                </CardTitle>
                <CardDescription>
                  Toggle to add into warmup system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[520px] overflow-y-auto custom-scroll pr-2 space-y-3">
                  {dummyEmails.map((item) => (
                    <div 
                      key={item.id}
                      className="p-5 rounded-2xl border border-zinc-200 hover:border-zinc-300 transition-all flex items-center justify-between group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.displayName}</p>
                        <p className="text-sm text-zinc-600 font-mono truncate">{item.email}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <Switch 
                          checked={item.enabled}
                          onCheckedChange={() => {
                            toggleDummy(item.id);
                            if (!item.enabled) {
                              addFromDummy(item.email, item.displayName);
                            }
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-8" />

                <p className="text-xs text-center text-zinc-500">
                  Toggle ON to instantly add email to warmup
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailWarmupPage;