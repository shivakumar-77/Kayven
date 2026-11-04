'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { HomeIcon, NutritionIcon, PlusIcon, StarIcon, WorkoutIcon } from '@/lib/icons'

const NAV = [
  { href:'/dashboard', label:'Home', Icon:HomeIcon },
  { href:'/log', label:'Nutrition', Icon:NutritionIcon },
  { href:'#quick-log', label:'Quick Log', Icon:PlusIcon, action:true },
  { href:'/workout', label:'Workout', Icon:WorkoutIcon },
  { href:'/subscription', label:'Plans', Icon:StarIcon },
]

function isActive(href, path) {
  return href === '/dashboard'
    ? path === '/' || path === '/dashboard' || path.startsWith('/dashboard')
    : path === href || path.startsWith(href)
}

function NavPortal({ children }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return mounted ? createPortal(children, document.body) : children
}

export default function BottomNav() {
  const router = useRouter()
  const path = usePathname() || '/'
  const [quickLogOpen, setQuickLogOpen] = useState(false)
  const dialogRef = useRef<HTMLElement | null>(null)
  const quickLogButtonRef = useRef<HTMLButtonElement | null>(null)

  function activate(item) {
    if (item.action) {
      setQuickLogOpen(true)
      return
    }
    router.push(item.href)
  }

  useEffect(() => {
    if (!quickLogOpen) return
    const quickLogButton = quickLogButtonRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex]:not([tabindex="-1"])')
    focusable()?.[0]?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setQuickLogOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items?.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
      else quickLogButton?.focus()
    }
  }, [quickLogOpen])

  function openQuickLogAction(href) {
    setQuickLogOpen(false)
    router.push(href)
  }

  const activeIdx = NAV.findIndex(item => !item.action && isActive(item.href, path))
  return (
    <NavPortal><nav aria-label="Bottom navigation" className="kayven-bottom-nav"
      onPointerMove={event => {
        const navBounds = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.setProperty('--nav-light-x', `${event.clientX - navBounds.left}px`)
        event.currentTarget.style.setProperty('--nav-light-y', `${event.clientY - navBounds.top}px`)
        if (!(event.target instanceof Element)) return
        const item = event.target.closest<HTMLButtonElement>('.kayven-bottom-nav__item')
        if (!item) return
        const itemBounds = item.getBoundingClientRect()
        item.style.setProperty('--nav-pointer-x', `${event.clientX - itemBounds.left}px`)
        item.style.setProperty('--nav-pointer-y', `${event.clientY - itemBounds.top}px`)
      }}
      onPointerLeave={event => {
        event.currentTarget.style.removeProperty('--nav-light-x')
        event.currentTarget.style.removeProperty('--nav-light-y')
        event.currentTarget.querySelectorAll<HTMLButtonElement>('.kayven-bottom-nav__item').forEach(item => {
          item.style.removeProperty('--nav-pointer-x')
          item.style.removeProperty('--nav-pointer-y')
        })
      }}>
      {activeIdx >= 0 && (
        <span aria-hidden="true" className="kayven-bottom-nav__active" style={{ transform:`translateX(${activeIdx * 100}%)` }}/>
      )}
      {NAV.map(({ href, label, Icon, action }) => {
        const active = isActive(href, path)
        return (
          <button key={href} ref={action ? quickLogButtonRef : undefined} className={`kayven-bottom-nav__item${action ? ' kayven-bottom-nav__item--action' : ''}`} onClick={() => activate({ href, action })}
            aria-label={label} aria-haspopup={action ? 'dialog' : undefined} aria-expanded={action ? quickLogOpen : undefined} aria-current={active ? 'page' : undefined}>
            <span className="kayven-bottom-nav__icon">
              <Icon size={action ? 23 : 20} strokeWidth={active || action ? 2.1 : 1.8}/>
            </span>
            <span className="kayven-bottom-nav__label">{action ? 'Log' : label}</span>
          </button>
        )
      })}
    </nav>
    {quickLogOpen && <QuickLogDialog dialogRef={dialogRef} onClose={() => setQuickLogOpen(false)} onSelect={openQuickLogAction}/>}
    </NavPortal>
  )
}

const QUICK_LOG_ACTIONS = [
  { label: 'Food / Meal', href: '/log', icon: '🍽️' },
  { label: 'Workout', href: '/workout/active?quick=1', icon: '🏋️' },
  { label: 'Activity', href: '/activity', icon: '🚶' },
  { label: 'Water', href: '/water', icon: '💧' },
  { label: 'Supplement', href: '/supplements', icon: '💊' },
  { label: 'Weight', href: '/weight', icon: '⚖️' },
  { label: 'Sleep', href: '/sleep', icon: '🌙' },
  { label: 'Blood reports', href: '/blood', icon: '🧪' },
]

function QuickLogDialog({ dialogRef, onClose, onSelect }) {
  return (
    <div onMouseDown={event => event.target === event.currentTarget && onClose()} style={{ position:'fixed', inset:0, zIndex:1100, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16, background:'rgba(15, 23, 42, 0.48)' }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-log-title" style={{ width:'100%', maxWidth:430, maxHeight:'min(80dvh, 560px)', overflowY:'auto', padding:'20px 18px calc(18px + env(safe-area-inset-bottom, 0px))', borderRadius:24, background:'var(--card)', boxShadow:'0 18px 60px rgba(0,0,0,0.24)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <h2 id="quick-log-title" style={{ margin:0, color:'var(--text)', fontSize:20, fontWeight:800 }}>Quick Log</h2>
            <p style={{ margin:'4px 0 0', color:'var(--muted)', fontSize:13 }}>Choose a Kayven log or health record.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Quick Log" style={{ width:36, height:36, border:0, borderRadius:18, background:'var(--card2)', color:'var(--text)', fontSize:22, cursor:'pointer' }}>×</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:10 }}>
          {QUICK_LOG_ACTIONS.map(action => (
            <button key={action.href} type="button" onClick={() => onSelect(action.href)} style={{ display:'flex', alignItems:'center', gap:11, minHeight:58, padding:'12px 13px', border:'1px solid var(--border)', borderRadius:15, background:'var(--surface)', color:'var(--text)', font:'inherit', fontSize:14, fontWeight:700, textAlign:'left', cursor:'pointer' }}>
              <span aria-hidden="true" style={{ fontSize:21 }}>{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
