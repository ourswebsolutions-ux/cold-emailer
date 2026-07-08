'use client';

import React, { useState, useEffect } from 'react';
import { 
  Mail, Inbox, Sparkles, Trash2, Pause, Play 
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

interface SMTPConfig {
  id: string;
  userId: string;
  host: string;
  port: number;
  username: string;
  password: string;
  senderEmail: string;
  senderName?: string;
  isActive: boolean;
  warmup: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WarmupAccount {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'paused';
  repliesToday: number;
  addedDate: string;
}

const EmailWarmupPage: React.FC = () => {
  const [accounts, setAccounts] = useState<WarmupAccount[]>([]);
  const [smtpConfigs, setSmtpConfigs] = useState<SMTPConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    }).format(date);
  };

  const getUserIdFromCookie = (): string | null => {
    if (typeof document === 'undefined') return null;
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'userId' || name.includes('userId')) {
        return decodeURIComponent(value || '');
      }
    }
    return null;
  };

  const fetchSmtpConfigs = async () => {
    if (!userId) return;
    
    try {
      setError(null);
      const response = await fetch(`/api/config?userId=${encodeURIComponent(userId)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      const data: SMTPConfig[] = result.data || result || [];
      
      setSmtpConfigs(data);
      
      // Active Warmup Accounts (only warmup: true)
      const activeWarmup = data
        .filter(config => config.warmup === true)
        .map(config => ({
          id: config.id,
          email: config.senderEmail,
          displayName: config.senderName || config.senderEmail.split('@')[0],
          status: 'active' as const,
          repliesToday: 0,
          addedDate: formatDate(config.createdAt)
        }));
      
      setAccounts(activeWarmup);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load SMTP configurations.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleWarmup = async (id: string, newWarmupState: boolean) => {
    if (!userId) return;

    try {
      const response = await fetch('/api/warmup/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id,userId, warmup: newWarmupState }),
      });

      if (!response.ok) throw new Error('Failed to toggle warmup');

      await fetchSmtpConfigs(); // Refresh both sections
    } catch (err) {
      console.error('Toggle error:', err);
      setError('Failed to update warmup status.');
      await fetchSmtpConfigs(); // Revert on error
    }
  };

  const deleteAccount = (id: string) => {
    // Optimistic UI update (extend with DELETE API later if needed)
    setAccounts(prev => prev.filter(a => a.id !== id));
    setSmtpConfigs(prev => prev.filter(c => c.id !== id));
  };

  const toggleAccountStatus = (id: string) => {
    const config = smtpConfigs.find(c => c.id === id);
    if (config) {
      toggleWarmup(id, !config.warmup);
    }
  };

  useEffect(() => {
    const id = getUserIdFromCookie();
    if (id) {
      setUserId(id);
    } else {
      setError('Authentication required. Please log in.');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      fetchSmtpConfigs();
    }
  }, [userId]);

  const hasNoConfigs = smtpConfigs.length === 0 && !isLoading;

  return (
    <div className="min-h-screen bg-white text-zinc-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header - unchanged */}
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
          {/* Active Warmup Accounts */}
          <div className="lg:col-span-7">
            <Card className="bg-white border border-zinc-100 shadow-xl">
              <CardHeader className="pb-6">
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Inbox className="w-6 h-6 text-violet-600" />
                  Active Warmup Accounts
                </CardTitle>
                <CardDescription className="text-base">
                  Manage your enrolled email accounts ({accounts.length})
                  
                  <span className='block text-red-700'>This Feature is comming soon </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`space-y-4 pr-2 max-h-[520px] overflow-y-auto custom-scroll ${accounts.length > 3 ? 'pb-4' : ''}`}>
                  {isLoading ? (
                    <div className="text-center py-20 text-zinc-400">Loading accounts...</div>
                  ) : error ? (
                    <div className="text-center py-20 text-red-500">{error}</div>
                  ) : accounts.length === 0 ? (
                    <div className="text-center py-20 text-zinc-400">
                      No active warmup accounts yet. Enable from the right panel.
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

                          <Badge className="px-4 py-1.5 text-sm font-medium whitespace-nowrap bg-emerald-100 text-emerald-700">
                            ● Active
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
                              <Pause className="w-4 h-4 mr-1"/> Pause
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

          {/* Available Emails */}
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
                {isLoading ? (
                  <div className="text-center py-12 text-zinc-400">Loading emails...</div>
                ) : hasNoConfigs ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-3xl p-8 text-center">
                    <div className="text-amber-600 mb-3">
                      <Sparkles className="w-8 h-8 mx-auto" />
                    </div>
                    <p className="font-medium text-amber-800">Warmup system is currently under development.</p>
                    <p className="text-sm text-amber-700 mt-2">Live warmup automation will be available soon.</p>
                  </div>
                ) : error ? (
                  <div className="text-center py-12 text-red-500">{error}</div>
                ) : (
                  <div className="max-h-[520px] overflow-y-auto custom-scroll pr-2 space-y-3">
                    {smtpConfigs.map((config) => (
                      <div 
                        key={config.id}
                        className="p-5 rounded-2xl border border-zinc-200 hover:border-zinc-300 transition-all flex items-center justify-between group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {config.senderName || 'Unnamed Account'}
                          </p>
                          <p className="text-sm text-zinc-600 font-mono truncate">{config.senderEmail}</p>
                        </div>

                        <div className="flex items-center gap-3">
                          <Switch 
                            checked={config.warmup}
                            onCheckedChange={() => toggleWarmup(config.id, !config.warmup)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

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