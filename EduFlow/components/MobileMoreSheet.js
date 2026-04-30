'use client'

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/ui/drawer'
import { motion } from 'framer-motion'

/**
 * Bottom sheet for the "Mehr" tab. Shows the full nav grouped by section
 * plus account actions. Pure UI — parent owns state.
 */
export default function MobileMoreSheet({
  open,
  onOpenChange,
  navGroups,
  activeView,
  onSelect,
  onSettings,
  onLogout,
  user,
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="max-h-[85vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <DrawerHeader className="px-5 text-left">
          <DrawerTitle>Navigation</DrawerTitle>
          <DrawerDescription className="text-xs">
            {user?.name ? `Angemeldet als ${user.name}` : 'EduFlow'}
            {user?.subscription_tier === 'premium' ? ' · Premium' : user?.worksheets_used_this_month != null ? ` · Free (${user.worksheets_used_this_month}/5)` : ''}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 overflow-y-auto space-y-5">
          {navGroups.map((group, gi) => (
            <motion.div
              key={group.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + gi * 0.05 }}
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = activeView === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelect?.(item.id)
                        onOpenChange?.(false)
                      }}
                      className={`relative flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium min-h-[48px] active:scale-[0.98] transition-all ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className="text-left flex-1 truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          ))}

          <div className="pt-2 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  onSettings?.()
                  onOpenChange?.(false)
                }}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium bg-gray-50 hover:bg-gray-100 text-gray-700 min-h-[48px]"
              >
                Einstellungen
              </button>
              <button
                onClick={() => {
                  onLogout?.()
                  onOpenChange?.(false)
                }}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium bg-red-50 hover:bg-red-100 text-red-600 min-h-[48px]"
              >
                Abmelden
              </button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
