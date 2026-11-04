'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import PageHeader from '@/components/PageHeader'
import { BoltIcon, CheckIcon, ChevronRightIcon } from '@/lib/icons'
import { supabase } from '@/lib/supabase'
import UpgradePrompt from '@/components/UpgradePrompt'
import AIUsageMeter from '@/components/AIUsageMeter'
import { fetchMeteredAI } from '@/lib/client/metered-ai-fetch'

type Message = { role: 'user' | 'assistant'; content: string; actions?: string[] }

const SUGGESTIONS = ['How am I doing today?', 'What should I eat for dinner?', 'Help me hit my protein target', 'Review my progress']

export default function CoachPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [upgradeMessage, setUpgradeMessage] = useState('')
  const [suggestedPlan, setSuggestedPlan] = useState<'premium' | 'pro'>('premium')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (!user) router.replace('/auth') })
  }, [router])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function ask(question: string) {
    const trimmed = question.trim()
    if (!trimmed || loading) return
    setInput('')
    setError('')
    const nextMessages = [...messages, { role: 'user' as const, content: trimmed }]
    setMessages(nextMessages)
    setLoading(true)
    try {
      const response = await fetchMeteredAI('/api/coach', { message: trimmed, messages, conversationId })
      const data = await response.json()
      if (data.error === 'AI_USAGE_LIMIT_REACHED') {
        setUpgradeMessage(data.message || 'You have reached your AI Coach limit for this period.')
        if (data.suggestedPlan === 'pro' || data.suggestedPlan === 'premium') setSuggestedPlan(data.suggestedPlan)
        setInput(trimmed)
        setMessages(nextMessages)
        return
      }
      if (!response.ok) throw new Error(data.error || 'Unable to reach the Coach')
      if (data.conversationId) setConversationId(data.conversationId)
      setMessages([...nextMessages, { role: 'assistant', content: data.answer, actions: data.actions }])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The Coach is unavailable right now.')
    } finally { setLoading(false) }
  }

  function submit(event: FormEvent) { event.preventDefault(); ask(input) }

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--surface)', paddingBottom: 105 }}>
      <PageHeader title="KAYVEN Coach" subtitle="Personal guidance from your data" href="/dashboard" />
      <section className="coach-shell">
        {messages.length === 0 && !loading && (
          <div className="coach-welcome">
            <div className="coach-mark"><BoltIcon size={25} color="var(--primary)" strokeWidth={2.2}/></div>
            <h1>What are you working toward today?</h1>
            <p>I’ll use your KAYVEN activity and nutrition context to help with the next decision.</p>
            <div className="coach-suggestions">
              {SUGGESTIONS.map(suggestion => <button key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}
            </div>
          </div>
        )}
        <div className="coach-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`coach-message ${message.role}`}>
              {message.role === 'assistant' && <div className="coach-avatar"><BoltIcon size={15} color="var(--primary)"/></div>}
              <div className="coach-bubble">
                <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                {message.actions?.length ? <div className="coach-actions">{message.actions.map(action => <button key={action} onClick={() => ask(action)}><CheckIcon size={14} color="currentColor"/>{action}</button>)}</div> : null}
              </div>
            </div>
          ))}
          {loading && <div className="coach-message assistant"><div className="coach-avatar"><BoltIcon size={15} color="var(--primary)"/></div><div className="coach-bubble coach-typing"><i/><i/><i/></div></div>}
          {error && <div className="coach-error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
          {upgradeMessage && <div className="coach-upgrade"><UpgradePrompt context="ai_limit" suggestedPlan={suggestedPlan} message={upgradeMessage} /></div>}
          <div ref={endRef}/>
        </div>
        <form className="coach-composer" onSubmit={submit}>
          <input value={input} onChange={event => setInput(event.target.value)} placeholder="Ask your Coach..." maxLength={1200} aria-label="Ask your Coach" disabled={loading}/>
          <button type="submit" aria-label="Send question" disabled={!input.trim() || loading}><ChevronRightIcon size={19} color="currentColor" strokeWidth={2.4}/></button>
        </form>
        <div style={{ marginTop: 10, textAlign: 'center' }}><AIUsageMeter compact /></div>
        <p className="coach-disclaimer">General nutrition and fitness guidance only. Not medical advice.</p>
      </section>
      <BottomNav />
      <style jsx>{`
        .coach-shell { max-width: 680px; min-height: calc(100dvh - 70px); margin: 0 auto; padding: 28px 20px 24px; display: flex; flex-direction: column; }
        .coach-welcome { text-align: center; margin: auto 0 28px; }
        .coach-mark { width: 56px; height: 56px; margin: 0 auto 16px; display: grid; place-items: center; border-radius: 18px; background: var(--primary-bg); border: 1px solid color-mix(in srgb, var(--primary) 22%, transparent); }
        h1 { font-size: clamp(25px, 6vw, 34px); letter-spacing: -0.025em; margin-bottom: 9px; }
        .coach-welcome p { color: var(--muted); font-size: 14px; line-height: 1.5; max-width: 390px; margin: 0 auto; }
        .coach-suggestions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 22px; }
        .coach-suggestions button, .coach-actions button { border: 1px solid var(--border); background: var(--card); color: var(--text-2); border-radius: 999px; padding: 10px 13px; cursor: pointer; font: inherit; font-size: 12px; transition: border-color .2s ease, transform .2s ease; }
        .coach-suggestions button:hover, .coach-actions button:hover { border-color: var(--primary); transform: translateY(-1px); }
        .coach-messages { display: flex; flex-direction: column; gap: 14px; margin-top: auto; }
        .coach-message { display: flex; gap: 8px; align-items: flex-end; }
        .coach-message.user { justify-content: flex-end; }
        .coach-avatar { width: 28px; height: 28px; flex: 0 0 28px; display: grid; place-items: center; border-radius: 10px; background: var(--primary-bg); }
        .coach-bubble { max-width: min(88%, 540px); border-radius: 17px 17px 17px 5px; padding: 13px 15px; background: var(--card); border: 1px solid var(--border); color: var(--text-2); font-size: 14px; line-height: 1.55; box-shadow: var(--shadow-sm); }
        .coach-message.user .coach-bubble { border: none; border-radius: 17px 17px 5px 17px; background: var(--primary); color: var(--primary-contrast); }
        .coach-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 13px; }
        .coach-actions button { display: inline-flex; align-items: center; gap: 5px; padding: 7px 10px; color: var(--primary); background: var(--primary-bg); border-color: transparent; }
        .coach-typing { display: flex; gap: 4px; padding: 17px 16px; }
        .coach-typing i { width: 5px; height: 5px; border-radius: 50%; background: var(--muted); animation: coachPulse 1s infinite ease-in-out; }
        .coach-typing i:nth-child(2) { animation-delay: .15s; }.coach-typing i:nth-child(3) { animation-delay: .3s; }
        .coach-error { margin: 4px 0; padding: 10px 12px; border-radius: 11px; background: var(--red-bg); color: var(--red); font-size: 12px; display: flex; justify-content: space-between; gap: 8px; }
        .coach-error button { border: 0; background: none; color: inherit; font-weight: 700; cursor: pointer; }
        .coach-composer { display: flex; gap: 8px; margin-top: 18px; padding: 7px 7px 7px 15px; border: 1px solid var(--border); border-radius: 18px; background: var(--card); box-shadow: var(--shadow-md); }
        .coach-composer input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--text); background: transparent; font: inherit; font-size: 14px; }
        .coach-composer input::placeholder { color: var(--muted); }.coach-composer button { width: 38px; height: 38px; border: 0; border-radius: 13px; display: grid; place-items: center; background: var(--primary); color: var(--primary-contrast); cursor: pointer; }.coach-composer button:disabled { opacity: .45; cursor: default; }
        .coach-disclaimer { text-align: center; color: var(--muted); font-size: 10px; margin: 9px 0 0; }
        .coach-upgrade { margin-top: 4px; }
        @keyframes coachPulse { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
        @media (max-width: 480px) { .coach-shell { padding-left: 16px; padding-right: 16px; }.coach-welcome { margin-top: 25px; } }
      `}</style>
    </main>
  )
}