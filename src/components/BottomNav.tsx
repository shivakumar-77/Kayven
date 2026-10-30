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
  const [platform, setPlatform] = useState('ios') // default: iOS glass style until detected otherwise
  const [ripples, setRipples] = useState({})
  const [quickLogOpen, setQuickLogOpen] = useState(false)
  const dialogRef = useRef<HTMLElement | null>(null)
  const quickLogButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const ua = navigator.userAgent || ''
    if (/Android/i.test(ua)) setPlatform('android')
    else if (/iPhone|iPad|iPod/i.test(ua)) setPlatform('ios')
  }, [])

  function addRipple(e, href) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const id = Date.now() + Math.random()
    setRipples(r => ({ ...r, [href]: [...(r[href] || []), { id, x, y }] }))
    setTimeout(() => {
      setRipples(r => ({ ...r, [href]: (r[href] || []).filter(rp => rp.id !== id) }))
    }, 500)
  }

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
  const isAndroid = platform === 'android'

  const wrapStyle: React.CSSProperties = {
    position: 'fixed', left: '50%', bottom: 'calc(env(safe-area-inset-bottom,0px) + 14px)',
    transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: 400, zIndex: 1000,
  }

  if (isAndroid) {
    return (
      <NavPortal><nav aria-label="Bottom navigation" style={{ ...wrapStyle, display:'flex', padding:'4px 5px', borderRadius:28, background:'var(--card)', border:'1px solid var(--border)', boxShadow:'0 6px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)' }}>
        <style jsx>{`
          @keyframes mdRipple { from { transform: scale(0); opacity: 0.35; } to { transform: scale(22); opacity: 0; } }
          .md-tap { transition: transform 0.12s ease; }
          .md-tap:active { transform: scale(0.95); }
        `}</style>
        {NAV.map(({ href, label, Icon, action }) => {
          const active = isActive(href, path)
          const itemRipples = ripples[href] || []
          return (
            <button key={href} ref={action ? quickLogButtonRef : undefined} className="md-tap" onClick={() => activate({ href, action })} onPointerDown={(e) => addRipple(e, href)}
              aria-label={label} aria-haspopup={action ? 'dialog' : undefined} aria-expanded={action ? quickLogOpen : undefined} aria-current={active ? 'page' : undefined}
              style={{ position:'relative', overflow:'hidden', flex:1, minHeight:44, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1, background:'none', border:'none', cursor:'pointer', padding:'2px 1px', borderRadius:16, WebkitTapHighlightColor:'transparent' }}>
              {itemRipples.map(rp => (
                <span key={rp.id} style={{ position:'absolute', left:rp.x, top:rp.y, width:8, height:8, marginLeft:-4, marginTop:-4, borderRadius:'50%', background:'var(--primary)', opacity:0.25, animation:'mdRipple 0.5s ease-out forwards', pointerEvents:'none' }}/>
              ))}
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'min(48px, 100%)', height:27, borderRadius:14, background: action ? 'var(--primary)' : active ? 'var(--primary-bg)' : 'transparent', transition:'background 0.25s ease' }}>
                <Icon size={19} strokeWidth={active || action ? 2.2 : 1.8} color={action ? '#fff' : active ? 'var(--primary)' : 'var(--muted)'}/>
              </span>
              <span style={{ fontSize:9, lineHeight:1, whiteSpace:'nowrap', fontWeight: active || action ? 700 : 500, color: active || action ? 'var(--primary)' : 'var(--muted)', letterSpacing:'0.01em' }}>{action ? 'Log' : label}</span>
            </button>
          )
        })}
      </nav>
      {quickLogOpen && <QuickLogDialog dialogRef={dialogRef} onClose={() => setQuickLogOpen(false)} onSelect={openQuickLogAction}/>}
      </NavPortal>
    )
  }

  return (
    <NavPortal><nav aria-label="Bottom navigation" style={{ ...wrapStyle, position:'fixed', display:'flex', padding:4, borderRadius:999, background:'color-mix(in srgb, var(--surface) 72%, transparent)', backdropFilter:'blur(24px) saturate(180%)', WebkitBackdropFilter:'blur(24px) saturate(180%)', border:'1px solid color-mix(in srgb, var(--border) 70%, transparent)', boxShadow:'0 10px 30px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.06)' }}>
      <style jsx>{`
        .ios-tap { transition: transform 0.15s ease; }
        .ios-tap:active { transform: scale(0.92); }
      `}</style>
      {activeIdx >= 0 && (
        <span style={{ position:'absolute', top:4, bottom:4, left:4, width:`calc((100% - 8px) / ${NAV.length})`, transform:`translateX(calc(${activeIdx} * 100%))`, borderRadius:999, background:'var(--primary-bg)', transition:'transform 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}/>
      )}
      {NAV.map(({ href, label, Icon, action }) => {
        const active = isActive(href, path)
        return (
          <button key={href} ref={action ? quickLogButtonRef : undefined} className="ios-tap" onClick={() => activate({ href, action })} aria-label={label} aria-haspopup={action ? 'dialog' : undefined} aria-expanded={action ? quickLogOpen : undefined} aria-current={active ? 'page' : undefined}
            style={{ position:'relative', zIndex:1, flex:1, minWidth:0, minHeight:44, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1, background:'none', border:'none', cursor:'pointer', padding:'2px 0', WebkitTapHighlightColor:'transparent' }}>
            <span style={{ display:'grid', placeItems:'center', width:28, height:28, borderRadius:14, background:action?'var(--primary)':'transparent' }}>
              <Icon size={19} strokeWidth={active || action ? 2.2 : 1.8} color={action?'#fff':active?'var(--primary)':'var(--muted)'}/>
            </span>
            <span style={{ fontSize:9, lineHeight:1, whiteSpace:'nowrap', fontWeight: active || action ? 700 : 500, letterSpacing:'0.01em', color: active || action ? 'var(--primary)' : 'var(--muted)' }}>{action ? 'Log' : label}</span>
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
]

function QuickLogDialog({ dialogRef, onClose, onSelect }) {
  return (
    <div onMouseDown={event => event.target === event.currentTarget && onClose()} style={{ position:'fixed', inset:0, zIndex:1100, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16, background:'rgba(15, 23, 42, 0.48)' }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-log-title" style={{ width:'100%', maxWidth:430, maxHeight:'min(80dvh, 560px)', overflowY:'auto', padding:'20px 18px calc(18px + env(safe-area-inset-bottom, 0px))', borderRadius:24, background:'var(--card)', boxShadow:'0 18px 60px rgba(0,0,0,0.24)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <h2 id="quick-log-title" style={{ margin:0, color:'var(--text)', fontSize:20, fontWeight:800 }}>Quick Log</h2>
            <p style={{ margin:'4px 0 0', color:'var(--muted)', fontSize:13 }}>Choose what you want to record.</p>
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
