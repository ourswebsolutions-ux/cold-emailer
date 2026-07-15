// components/Navbar.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogIn, LogOut, Phone, Lock, Shield, Zap, X, Mail, FileText, ChevronDown } from "lucide-react";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [userPhone, setUserPhone] = useState("");
  const [mobileEmailOpen, setMobileEmailOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const pathname = usePathname();
  const isEmailActive = pathname === "/emails" || pathname === "/email-templetes";

  // Validate session on mount
  useEffect(() => {
    const validateSession = async () => {
      const savedPhone = localStorage.getItem("phone");
      if (!savedPhone) return;

      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: savedPhone }),
        });

        if (res.ok) {
          setUserPhone(savedPhone);
          setLoggedIn(true);
        } else {
          localStorage.removeItem("phone");
        }
      } catch {
        localStorage.removeItem("phone");
      }
    };

    validateSession();
  }, []);

  // ESC key support
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDropdownOpen(false);
        setMobileEmailOpen(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  async function handleAuth() {
    if (!phone || (isCreating && !password)) {
      setError("Phone and password are required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          phone, 
          password: isCreating ? password : (password || undefined) 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Operation failed");
        return;
      }

      if (isCreating) {
        alert("Account created successfully! You can now login.");
        setIsCreating(false);
        setPassword("");
        setPhone("");
      } else {
        localStorage.setItem("phone", phone);
        localStorage.setItem("user", JSON.stringify(data.user));
        setUserPhone(phone);
        setLoggedIn(true);
        setPassword("");
        setShowAuthModal(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    try {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (e) {
      console.error("Error clearing storage:", e);
    }

    setLoggedIn(false);
    setUserPhone("");
    setPhone("");
    setPassword("");
    setError("");
    setIsCreating(false);
    setIsOpen(false);
  }

  const openLogin = () => {
    setShowAuthModal(true);
    setIsCreating(false);
    setPhone("");
    setPassword("");
    setError("");
  };

  return (
    <>
      {/* Main Navbar */}
      <nav className="sticky top-0 z-50 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-blue-100 dark:border-blue-900/30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 ">
          <div className="flex items-center justify-between h-16 sm:h-20">
            <Link
              href="/"
              className="flex items-center gap-2 sm:gap-3 font-bold text-lg sm:text-xl text-primary hover:text-primary/80 transition-colors flex-shrink-0"
            >
              <img src="/logo.png" className="h-16 sm:h-12 md:-ml-12 md:h-24 w-auto" alt="Logo" />
            </Link>

            <div className="hidden sm:flex gap-6 lg:gap-8">
              <Link href="/env" className="text-sm lg:text-base font-medium text-foreground hover:text-primary transition-colors duration-200 py-2">
                Configuration
              </Link>
              <Link href="/send" className="text-sm lg:text-base font-medium text-foreground hover:text-primary transition-colors duration-200 py-2">
                Sender
              </Link>
              <Link href="/warm-up" className="text-sm lg:text-base font-medium text-foreground hover:text-primary transition-colors duration-200 py-2">
                WarmUp
              </Link>

              {/* Premium Email Dropdown */}
              <div className="relative">
                <div
                  className={`flex items-center gap-1 text-sm lg:text-base font-medium py-2 cursor-pointer transition-colors duration-200 ${isEmailActive ? "text-primary" : "text-foreground hover:text-primary"}`}
                  onMouseEnter={() => setIsDropdownOpen(true)}
                  onMouseLeave={() => setIsDropdownOpen(false)}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  Email
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
                </div>

                {/* Dropdown Menu */}
                <div
                  className={`absolute left-1/2 -translate-x-1/2 top-full z-50 pt-3 transition-all duration-200 origin-top ${
                    isDropdownOpen ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
                  }`}
                  onMouseEnter={() => setIsDropdownOpen(true)}
                  onMouseLeave={() => setIsDropdownOpen(false)}
                >
                  <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 w-[340px] py-2 overflow-hidden">
                    <Link
                      href="/emails"
                      onClick={() => setIsDropdownOpen(false)}
                      className={`group/item flex items-start gap-4 px-4 py-3 mx-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-all ${pathname === "/emails" ? "bg-blue-50 dark:bg-blue-950/50" : ""}`}
                    >
                      <div className="mt-0.5 text-blue-600 flex-shrink-0">
                        <Mail className="w-5 h-5 transition-transform group-hover/item:scale-110 duration-200" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground">Emails</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">Manage contacts and email lists</div>
                      </div>
                    </Link>

                    <Link
                      href="/email-templetes"
                      onClick={() => setIsDropdownOpen(false)}
                      className={`group/item flex items-start gap-4 px-4 py-3 mx-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-all ${pathname === "/email-templetes" ? "bg-blue-50 dark:bg-blue-950/50" : ""}`}
                    >
                      <div className="mt-0.5 text-blue-600 flex-shrink-0">
                        <FileText className="w-5 h-5 transition-transform group-hover/item:scale-110 duration-200" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground">Email Templates</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">Create and manage email templates</div>
                      </div>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-4">
              {loggedIn ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 dark:bg-blue-950 rounded-full">
                    <Phone className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {userPhone}
                    </span>
                  </div>
                  <button
                    onClick={logout}
                    className="flex items-center gap-2 rounded-lg bg-red-500 hover:bg-red-600 px-5 py-2.5 text-white text-sm font-semibold transition-all active:scale-95"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={openLogin}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-6 py-2.5 text-white text-sm font-semibold shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </button>
              )}
            </div>

            <button
              onClick={() => setIsOpen(!isOpen)}
              className="sm:hidden p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Mobile Menu */}
          {isOpen && (
            <div className="sm:hidden pb-6 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
              <Link href="/env" onClick={() => setIsOpen(false)} className="block px-4 py-3 rounded-xl text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                Configuration
              </Link>
              <Link href="/send" onClick={() => setIsOpen(false)} className="block px-4 py-3 rounded-xl text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                Sender
              </Link>

              {/* Mobile Email Collapsible */}
              <div>
                <button
                  onClick={() => setMobileEmailOpen(!mobileEmailOpen)}
                  className="flex w-full items-center justify-between px-4 py-3 rounded-xl text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <span>Email</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${mobileEmailOpen ? "rotate-180" : ""}`} />
                </button>
                {mobileEmailOpen && (
                  <div className="pl-8 mt-1 space-y-1">
                    <Link
                      href="/emails"
                      onClick={() => {
                        setIsOpen(false);
                        setMobileEmailOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      Emails
                    </Link>
                    <Link
                      href="/email-templetes"
                      onClick={() => {
                        setIsOpen(false);
                        setMobileEmailOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      Email Templates
                    </Link>
                  </div>
                )}
              </div>

              {loggedIn ? (
                <>
                  <div className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 mt-2">
                    {userPhone}
                  </div>
                  <button onClick={() => { logout(); setIsOpen(false); }} className="w-full text-left px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors">
                    Logout
                  </button>
                </>
              ) : (
                <button onClick={() => { setIsOpen(false); openLogin(); }} className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors mt-2">
                  Login
                </button>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Responsive Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-xl p-3 sm:p-4">
          <div className="w-full max-w-4xl lg:max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col lg:flex-row max-h-[95vh] lg:h-auto relative">
            
            {/* Left Panel - Important Notice */}
            <div className="lg:w-5/12 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 lg:p-12 flex flex-col order-2 lg:order-1">
              <div className="flex flex-col h-full">
                <div className="mb-8 lg:mb-12">
                  <h2 className="text-white text-2xl sm:text-3xl font-semibold mb-6">Important Notice</h2>
                  <div className="text-white/90 leading-relaxed space-y-5 text-[15px]">
                    <p>Login only using the same WhatsApp number that was used to purchase your license.</p>
                    <p className="font-medium border-l-4 border-rose-500 pl-4">
                      Logging in with another WhatsApp number may result in your account being suspended or permanently deleted.
                    </p>
                    <p>If you need to change your registered WhatsApp number, please contact support before logging in.</p>
                  </div>
                </div>

                <div className="mt-auto space-y-6 hidden lg:block">
                  <div className="flex items-start gap-4">
                    <Shield className="w-6 h-6 text-emerald-400 mt-0.5" />
                    <div className="text-sm text-white/70">Enterprise Security</div>
                  </div>
                  <div className="flex items-start gap-4">
                    <Zap className="w-6 h-6 text-emerald-400 mt-0.5" />
                    <div className="text-sm text-white/70">Fast &amp; Secure Login</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Auth Form */}
            <div className="lg:w-7/12 bg-white dark:bg-slate-900 p-6 sm:p-8 lg:p-12 flex flex-col relative order-1 lg:order-2">
              {/* Close Button */}
              <button
                onClick={() => setShowAuthModal(false)}
                className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors z-20"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full pt-4 lg:pt-0">
                <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white mb-2 text-center">
                  {isCreating ? "Create Test Account" : "Sign In"}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-center mb-8 sm:mb-10 text-sm sm:text-base">
                  {isCreating ? "Create a temporary test account" : "Access your dashboard"}
                </p>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">PHONE NUMBER</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                      <input
                        type="tel"
                        placeholder="+923001234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:border-blue-500 text-base sm:text-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">PASSWORD</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                      <input
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:border-blue-500 text-base sm:text-lg"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 p-4 rounded-2xl text-sm">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleAuth}
                    disabled={loading || !phone || (isCreating && !password)}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-70 rounded-2xl text-white font-semibold text-lg transition-all active:scale-[0.985]"
                  >
                    {loading 
                      ? (isCreating ? "Creating..." : "Signing in...") 
                      : (isCreating ? "Create Account" : "Login")}
                  </button>

                  <div className="text-center">
                    <button
                      onClick={() => {
                        setIsCreating(!isCreating);
                        setError("");
                        setPassword("");
                      }}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      {isCreating ? "← Back to Login" : "Create Test Account"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}