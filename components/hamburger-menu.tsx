"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"

export function HamburgerMenu() {
  const { user, signOut } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  if (!user) return null

  const handleSignOut = () => {
    signOut()
    setIsOpen(false)
  }

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex flex-col justify-center items-center gap-1.5 p-2 rounded-md hover:bg-accent transition-colors"
        aria-label="Open menu"
        aria-expanded={isOpen}
      >
        <span className="block w-6 h-0.5 bg-primary rounded-full" />
        <span className="block w-6 h-0.5 bg-primary rounded-full" />
        <span className="block w-6 h-0.5 bg-primary rounded-full" />
      </button>

      {/* Backdrop Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-background shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="User menu"
      >
        {/* Close Button */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Close menu"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Drawer Content */}
        <div className="flex flex-col items-center pt-16 px-6">
          {/* User Avatar */}
          <div className="w-12 h-12 rounded-full overflow-hidden bg-accent">
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="User avatar"
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-lg font-medium">
                {user.email?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* User Email */}
          <p className="mt-3 text-sm text-muted-foreground text-center break-all">
            {user.email}
          </p>

          {/* Sign Out Button */}
          <Button
            onClick={handleSignOut}
            className="mt-8 w-full bg-accent text-foreground hover:bg-accent-hover"
          >
            Sign out
          </Button>
        </div>
      </div>
    </>
  )
}
