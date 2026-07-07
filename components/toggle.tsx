"use client"

import { useState } from "react"
import { MessageCircle, X } from "lucide-react"

export default function WhatsAppButton() {
  const [open, setOpen] = useState(false)

  const whatsappNumber = "923245237429" // apna WhatsApp number country code ke sath
  const message = "Hello, I need assistance."

  const openWhatsApp = () => {
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
    window.open(url, "_blank")
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 bg-white dark:bg-slate-900 shadow-xl rounded-2xl p-4 w-64 border border-border animate-fadeInUp">
          <h3 className="font-semibold text-sm mb-2">
            Need Help?
          </h3>

          <p className="text-xs text-muted-foreground mb-4">
            Chat with our assistant on WhatsApp for quick support.
          </p>

          <button
            onClick={openWhatsApp}
            className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-2 text-sm font-medium"
          >
            Open WhatsApp
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-xl flex items-center justify-center transition-all duration-300"
      >
        {open ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-7 h-7" />
        )}
      </button>
    </div>
  )
}