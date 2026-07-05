// components/Navbar.tsx (or wherever you have it)
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

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
          setPhone(savedPhone);
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
        body: JSON.stringify({ phone, password: isCreating ? password : password || undefined }),
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
      } else {
        // Login successful
        localStorage.setItem("phone", phone);
        localStorage.setItem("user", JSON.stringify(data.user));
        setLoggedIn(true);
        setPassword("");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("phone");
    setLoggedIn(false);
    setPhone("");
    setPassword("");
    setError("");
    setIsOpen(false);
    setIsCreating(false);
  }

  // Auth Screen (Not Logged In)
  if (!loggedIn) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-slate-900 shadow-2xl p-8">
          <div className="flex justify-center mb-8 md:-ml-4 border">
            <img src="/logo.png" alt="Logo" className="h-16 md:-ml-4 w-auto" />
          </div>

          <h2 className="text-3xl font-bold text-center mb-2">
            {isCreating ? "Create Test Account" : "Welcome Back"}
          </h2>
          <p className="text-center text-gray-500 mb-8">
            {isCreating
              ? "Create a temporary test account"
              : "Login to continue using the Email Sender."}
          </p>

          <div className="space-y-4">
            <input
              type="tel"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border p-3 outline-none text-black focus:ring-2 focus:ring-blue-500"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border p-3 outline-none text-black focus:ring-2 focus:ring-blue-500"
            />

            {error && <div className="text-sm text-red-500">{error}</div>}

            <button
              onClick={handleAuth}
              disabled={loading || !phone || (isCreating && !password)}
              className="w-full rounded-lg bg-blue-600 py-3 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading
                ? (isCreating ? "Creating Account..." : "Logging In...")
                : (isCreating ? "Create Account" : "Login")}
            </button>

            <div className="pt-2 text-center">
              <button
                onClick={() => {
                  setIsCreating(!isCreating);
                  setError("");
                  setPassword("");
                }}
                className="text-blue-600 hover:underline font-medium"
              >
                {isCreating ? "Back to Login" : "Create Test Account"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged-in Navbar
  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-slate-950 border-b border-blue-100 dark:border-blue-900/30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          <Link
            href="/"
            className="flex items-center gap-2 sm:gap-3 font-bold text-lg sm:text-xl text-primary hover:text-primary/80 transition-colors flex-shrink-0"
          >
            <img src="/logo.png" className=" md:-ml-12 w-62" alt="Logo" />
          </Link>

          <div className="hidden sm:flex gap-6 lg:gap-8">
            <Link href="/env" className="text-sm lg:text-base font-medium text-foreground hover:text-primary transition-colors duration-200 py-2">
              Configuration
            </Link>
            <Link href="/send" className="text-sm lg:text-base font-medium text-foreground hover:text-primary transition-colors duration-200 py-2">
              Sender
            </Link>
          </div>

          <div className="hidden sm:flex items-center gap-4">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {phone}
            </span>
            <button
              onClick={logout}
              className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 transition"
            >
              Logout
            </button>
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="sm:hidden p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {isOpen && (
          <div className="sm:hidden pb-4 space-y-2">
            <Link href="/env" onClick={() => setIsOpen(false)} className="block px-4 py-2 rounded-lg text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20">
              Configuration
            </Link>
            <Link href="/send" onClick={() => setIsOpen(false)} className="block px-4 py-2 rounded-lg text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20">
              Sender
            </Link>
            <button
              onClick={logout}
              className="w-full text-left px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}