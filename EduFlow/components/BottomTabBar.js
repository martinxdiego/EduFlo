'use client'

import { motion } from 'framer-motion'
import { Home, FolderOpen, PlusCircle, Users, MoreHorizontal } from 'lucide-react'

/**
 * Mobile bottom tab bar — shown on screens < sm.
 * Uses safe-area insets so it sits above the iOS home indicator.
 * Layout id pill animates between tabs.
 */
const TABS = [
  { id: 'home', label: 'Start', icon: Home },
  { id: 'library', label: 'Bibliothek', icon: FolderOpen },
  { id: 'create', label: 'Erstellen', icon: PlusCircle, primary: true },
  { id: 'classes', label: 'Klassen', icon: Users },
  { id: 'more', label: 'Mehr', icon: MoreHorizontal },
]

export default function BottomTabBar({ activeView, onSelect, onMore }) {
  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-gray-200/80 shadow-[0_-2px_12px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="navigation"
      aria-label="Hauptnavigation"
    >
      <ul className="flex items-stretch justify-around h-16 px-1">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const creationActive = tab.id === 'create' && ['create', 'upload', 'studio'].includes(activeView)
          const isActive = tab.id === 'more'
            ? !TABS.slice(0, -1).some((t) => t.id === activeView) && !['upload', 'studio'].includes(activeView)
            : activeView === tab.id || creationActive

          return (
            <li key={tab.id} className="flex-1 flex">
              <button
                type="button"
                onClick={() => {
                  if (tab.id === 'more') {
                    onMore?.()
                  } else {
                    onSelect?.(tab.id)
                  }
                }}
                className="relative flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px] active:scale-95 transition-transform"
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
              >
                {isActive && !tab.primary && (
                  <motion.span
                    layoutId="bottom-tab-pill"
                    className="absolute top-1 inset-x-3 h-9 bg-blue-50 rounded-2xl"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}

                {tab.primary ? (
                  <span className="relative -mt-5 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 active:scale-90 transition-transform">
                    <Icon className="h-6 w-6" />
                  </span>
                ) : (
                  <Icon className={`relative h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} strokeWidth={isActive ? 2.4 : 2} />
                )}
                <span className={`relative text-[10px] font-medium ${tab.primary ? 'mt-0.5 text-blue-600' : isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                  {tab.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
