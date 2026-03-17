import { usePlatform } from '@/hooks/usePlatform'
import { BottomSheet } from './BottomSheet'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface PlatformSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function PlatformSheet({ isOpen, onClose, title, children }: PlatformSheetProps) {
  const { isDesktop } = usePlatform()

  if (!isDesktop) {
    return <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>{children}</BottomSheet>
  }

  // Desktop: centered dialog using Radix Dialog primitive
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            {/* Backdrop */}
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            {/* Panel */}
            <Dialog.Content asChild>
              <motion.div
                className="fixed top-1/2 left-1/2 z-50 w-[480px] max-w-[calc(100vw-32px)] max-h-[85vh] overflow-y-auto bg-[#0f0f12] border border-white/10 rounded-[16px] shadow-2xl"
                initial={{ opacity: 0, scale: 0.96, x: '-50%', y: '-48%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.96, x: '-50%', y: '-48%' }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.08]">
                  <Dialog.Title className="text-base font-semibold text-text-primary">
                    {title}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/[0.08] transition-colors"
                      aria-label="Close"
                    >
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </div>
                {/* Body */}
                <div className="px-6 py-5">
                  {children}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
