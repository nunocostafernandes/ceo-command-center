import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f12] rounded-t-[24px] border-t border-white/10 overflow-y-auto"
            style={{ maxHeight: '90dvh', paddingBottom: 'calc(24px + var(--safe-bottom))' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 80) onClose()
            }}
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-4" />
            {title && (
              <div className="px-5 mb-4">
                <h3 className="text-base font-semibold text-text-primary">{title}</h3>
              </div>
            )}
            <div className="px-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
