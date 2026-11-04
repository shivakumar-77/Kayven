'use client'
import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { CheckIcon, FireIcon, BoltIcon, InfoIcon } from '@/lib/icons'

type ToastType = 'success' | 'error' | 'warning' | 'info'
interface ToastItem { id: string; message: string; type: ToastType; emoji?: string }
interface ToastCtx { show: (msg: string, type?: ToastType, emoji?: string) => void }

const ToastContext = createContext<ToastCtx>({ show: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((message: string, type: ToastType = 'success', emoji?: string) => {
    const id = Date.now().toString()
    setToasts(p => [...p.slice(-2), { id, message, type, emoji }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2800)
  }, [])

  const colors: Record<ToastType, { bg: string; color: string }> = {
    success: { bg: 'var(--green-bg)', color: 'var(--green)' },
    error:   { bg: 'var(--red-bg)', color: 'var(--red)' },
    warning: { bg: 'var(--orange-bg)', color: 'var(--orange)' },
    info:    { bg: 'var(--blue-bg)', color: 'var(--blue)' },
  }

  const icons = {
    success: <CheckIcon size={14} color="var(--green)"/>,
    error: <CheckIcon size={14} color="var(--red)"/>,
    warning: <BoltIcon size={14} color="var(--orange)"/>,
    info: <InfoIcon size={14} color="var(--blue)"/>,
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top,0px) + 12px)', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id}
            style={{ background: colors[t.type].bg, color: colors[t.type].color, padding: '11px 18px', borderRadius: 99, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', animation: 'slideDown 0.3s cubic-bezier(0.32,0.72,0,1) both', whiteSpace: 'nowrap' }}>
            {t.emoji ? <span>{t.emoji}</span> : icons[t.type]}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() { return useContext(ToastContext) }
