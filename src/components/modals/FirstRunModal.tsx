import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  onBrowse: () => void;
}

export function FirstRunModal({ open, onClose, onCreate, onBrowse }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center backdrop-blur-md bg-bg/70 px-5"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 22, stiffness: 240 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[560px] bg-surface border border-border rounded-2xl px-10 pt-12 pb-8"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 w-7 h-7 rounded-full hover:bg-surface-2 text-text-3 hover:text-text"
            >
              ×
            </button>
            <div className="text-[80px] text-center leading-none mb-6">👋</div>
            <h2 className="text-xl font-bold text-center mb-2.5 tracking-tight">
              看起来是你第一次使用 FableGlitch Studio
            </h2>
            <p className="text-sm text-text-3 text-center mb-9">选一个已有项目加入，或新建一个项目开始</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Button variant="secondary" size="lg" onClick={onBrowse} className="flex-col items-center !h-24 gap-2">
                <span className="text-2xl">📂</span>
                <span>浏览全公司项目树</span>
              </Button>
              <Button variant="gradient" size="lg" onClick={onCreate} className="flex-col items-center !h-24 gap-2">
                <span className="text-2xl">✨</span>
                <span>新建我的第一个剧集</span>
              </Button>
            </div>
            <div className="text-center font-mono text-2xs text-text-4">首次使用引导 · 可关闭</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
