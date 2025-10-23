"use client"

import Link from "next/link"
import { Mail } from "lucide-react"
import { useState } from "react"

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-slate-950 border-b border-blue-100 dark:border-blue-900/30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          <Link
            href="/"
            className="flex items-center gap-2 sm:gap-3 font-bold text-lg sm:text-xl text-primary hover:text-primary/80 transition-colors duration-200 flex-shrink-0"
          >
            <Mail className="w-6 h-6 sm:w-7 sm:h-7" />
            <span className="hidden sm:inline">Axoraweb Solutions</span>
            <span className="sm:hidden">Axoraweb</span>
          </Link>

          <div className="hidden sm:flex gap-6 lg:gap-8">
            <Link
              href="/env"
              className="text-sm lg:text-base font-medium text-foreground hover:text-primary transition-colors duration-200 py-2"
            >
              Configuration
            </Link>
            <Link
              href="/send"
              className="text-sm lg:text-base font-medium text-foreground hover:text-primary transition-colors duration-200 py-2"
            >
              Sender
            </Link>
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="sm:hidden p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {isOpen && (
          <div className="sm:hidden pb-4 space-y-2 animate-slideInLeft">
            <Link
              href="/env"
              className="block px-4 py-2 rounded-lg text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Configuration
            </Link>
            <Link
              href="/send"
              className="block px-4 py-2 rounded-lg text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Sender
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
