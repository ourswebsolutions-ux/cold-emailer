'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, UserCheck, UserX, UserMinus, Search, 
  RefreshCw, Lock, Trash2, X 
} from 'lucide-react';
import { useRouter } from "next/navigation";
interface User {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  passwordExpiresAt: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired" | "disabled">("all");
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    expiredUsers: 0,
    disabledUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
const router = useRouter();
  // Modal states
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [changePassModalOpen, setChangePassModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("30");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

    const [role, setRole] = useState<string>("");
  
useEffect(() => {
  const user = localStorage.getItem("user");

  if (!user) {
    router.push("/login");
    return;
  }

  const parsedUser = JSON.parse(user);

  if (parsedUser?.role !== "ADMIN") {
    router.push("/send"); // or "/"
    return;
  }

  setRole(parsedUser.role);
}, []); 
  
  

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch("/api/admin?action=dashboard"),
        fetch("/api/admin")
      ]);

      if (statsRes.ok) {
        const s = await statsRes.json();
        if (s.success) setStats(s.stats);
      }

      if (usersRes.ok) {
        const u = await usersRes.json();
        if (u.success) {
          setUsers(u.users || []);
          setFilteredUsers(u.users || []);
        }
      }
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  React.useEffect(() => {
    let result = [...users];
    
    if (searchTerm) {
      result = result.filter(u => 
        u.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (statusFilter !== "all") {
      result = result.filter(u => {
        const expired = new Date(u.passwordExpiresAt) < new Date();
        if (statusFilter === "expired") return expired;
        if (statusFilter === "active") return !expired && u.status === "ACTIVE";
        if (statusFilter === "disabled") return u.status === "DISABLED";
        return true;
      });
    }
    
    setFilteredUsers(result);
  }, [searchTerm, statusFilter, users]);

  const handleAction = async (action: string, payload: any) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });

      const data = await res.json();
      
      if (data.success) {
        await fetchData(); // Refresh table + stats
      } else {
        alert(data.message || "Operation failed");
      }
    } catch (err) {
      alert("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const openRenewModal = (user: User) => {
    setSelectedUser(user);
    setSelectedPlan("30");
    setRenewModalOpen(true);
  };

  const openChangePassModal = (user: User) => {
    setSelectedUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setChangePassModalOpen(true);
  };

  const openDeleteModal = (user: User) => {
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  const getStatusBadge = (user: User) => {
    if (new Date(user.passwordExpiresAt) < new Date()) {
      return (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 rounded-full text-sm font-medium">
          Expired
        </div>
      );
    }
    if (user.status === 'ACTIVE') {
      return (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-full text-sm font-medium">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          Active
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full text-sm font-medium">
        Disabled
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-2xl">A</span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">SaaS Management Panel</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground hidden md:block">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center cursor-pointer hover:bg-accent transition-colors">
              👤
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
        {/* Title + Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight">Overview</h2>
            <p className="text-muted-foreground mt-1">Monitor and manage your users</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search users by name or phone..."
                className="w-full bg-background border border-input pl-11 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <select 
              className="bg-background border border-input px-5 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-4xl font-semibold mt-3 tracking-tighter">{stats.totalUsers}</p>
              </div>
              <div className="w-11 h-11 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-4xl font-semibold mt-3 tracking-tighter text-emerald-600 dark:text-emerald-400">{stats.activeUsers}</p>
              </div>
              <div className="w-11 h-11 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Expired Users</p>
                <p className="text-4xl font-semibold mt-3 tracking-tighter text-rose-600 dark:text-rose-400">{stats.expiredUsers}</p>
              </div>
              <div className="w-11 h-11 bg-rose-500/10 rounded-2xl flex items-center justify-center">
                <UserX className="w-6 h-6 text-rose-600 dark:text-rose-400" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Disabled Users</p>
                <p className="text-4xl font-semibold mt-3 tracking-tighter">{stats.disabledUsers}</p>
              </div>
              <div className="w-11 h-11 bg-muted rounded-2xl flex items-center justify-center">
                <UserMinus className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden">
          <div className="px-6 md:px-8 py-6 border-b border-border flex items-center justify-between bg-muted/30">
            <h3 className="font-semibold text-xl">All Users</h3>
            <div className="text-sm text-muted-foreground">
              {filteredUsers.length} of {users.length} users
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-6 md:px-8 py-5 text-left text-sm font-medium text-muted-foreground">Phone Number</th>
                  <th className="px-6 md:px-8 py-5 text-left text-sm font-medium text-muted-foreground">Name</th>
                  <th className="px-6 md:px-8 py-5 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-6 md:px-8 py-5 text-left text-sm font-medium text-muted-foreground">Expiry Date</th>
                  <th className="px-6 md:px-8 py-5 text-right text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 md:px-8 py-6 font-mono text-sm">{user.phone}</td>
                      <td className="px-6 md:px-8 py-6 font-medium">{user.name || '—'}</td>
                      <td className="px-6 md:px-8 py-6">
                        {getStatusBadge(user)}
                      </td>
                      <td className="px-6 md:px-8 py-6 text-sm text-muted-foreground">
                        {new Date(user.passwordExpiresAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 md:px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => openRenewModal(user)}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-700 dark:text-emerald-400 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw size={16} />
                            Renew
                          </button>
                          
                          <button 
                            onClick={() => openChangePassModal(user)}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-input hover:bg-muted transition-colors disabled:opacity-50"
                          >
                            <Lock size={16} />
                            Password
                          </button>

                          <button 
                            onClick={() => handleAction("toggle-status", { id: user.id })}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-input hover:bg-muted transition-colors disabled:opacity-50"
                          >
                            {user.status === "ACTIVE" ? "Disable" : "Enable"}
                          </button>

                          <button 
                            onClick={() => openDeleteModal(user)}
                            disabled={actionLoading}
                            className="p-3 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-xl transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center text-muted-foreground">
                      {loading ? "Loading users..." : "No users found matching your criteria"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Renew Modal */}
      {renewModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-card border border-border rounded-3xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-8 border-b">
              <div>
                <h3 className="text-2xl font-semibold">Renew Account</h3>
                <p className="text-sm text-muted-foreground mt-1">{selectedUser.phone}</p>
              </div>
              <button onClick={() => setRenewModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={24} />
              </button>
            </div>

            <div className="p-8 space-y-8">
              <div>
                <label className="text-sm text-muted-foreground block mb-3">Renew For</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "30 Days", value: "30" },
                    { label: "3 Months", value: "90" },
                    { label: "6 Months", value: "180" },
                    { label: "1 Year", value: "365" }
                  ].map(plan => (
                    <button
                      key={plan.value}
                      onClick={() => setSelectedPlan(plan.value)}
                      className={`p-4 rounded-2xl border text-left transition-all ${selectedPlan === plan.value 
                        ? 'border-primary bg-primary/5 text-primary' 
                        : 'border-border hover:border-input'}`}
                    >
                      <div className="font-medium">{plan.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-8 border-t flex gap-4">
              <button 
                onClick={() => setRenewModalOpen(false)}
                disabled={actionLoading}
                className="flex-1 py-3.5 rounded-xl border hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleAction("renew", { id: selectedUser.id, days: selectedPlan })}
                disabled={actionLoading}
                className="flex-1 py-3.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
              >
                {actionLoading ? "Processing..." : "Confirm Renewal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {changePassModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-card border border-border rounded-3xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-8 border-b">
              <h3 className="text-2xl font-semibold">Change Password</h3>
              <button onClick={() => setChangePassModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={24} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Phone Number</p>
                <p className="font-mono bg-muted p-4 rounded-2xl border border-border">{selectedUser.phone}</p>
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground block mb-2">New Password</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-background border border-input rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter new password"
                />
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground block mb-2">Confirm Password</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-background border border-input rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            <div className="p-8 border-t flex gap-4">
              <button 
                onClick={() => setChangePassModalOpen(false)}
                disabled={actionLoading}
                className="flex-1 py-3.5 rounded-xl border hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleAction("change-password", { id: selectedUser.id, newPassword })}
                disabled={actionLoading || !newPassword || newPassword !== confirmPassword}
                className="flex-1 py-3.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
              >
                {actionLoading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-card border border-border rounded-3xl w-full max-w-sm shadow-xl">
            <div className="p-10 text-center">
              <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
                <Trash2 className="w-8 h-8 text-destructive" />
              </div>
              <h3 className="text-2xl font-semibold mb-3">Delete User?</h3>
              <p className="text-muted-foreground">
                Are you sure you want to permanently delete<br />
                <span className="font-medium text-foreground">{selectedUser.phone}</span>?
              </p>
            </div>

            <div className="p-8 border-t flex gap-4">
              <button 
                onClick={() => setDeleteModalOpen(false)}
                disabled={actionLoading}
                className="flex-1 py-3.5 rounded-xl border hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleAction("delete", { id: selectedUser.id })}
                disabled={actionLoading}
                className="flex-1 py-3.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium disabled:opacity-50"
              >
                {actionLoading ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}