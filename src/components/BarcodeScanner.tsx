'use client'
import { useRef, useState, useEffect } from 'react'

export default function BarcodeScanner({ onResult }) {
  const [mode, setMode] = useState('idle')
  const [manualCode, setManualCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanningRef = useRef(false)

  async function startScan() {
    setError(''); setHint('Starting camera...')
    setMode('scanning')
    await new Promise(r => setTimeout(r, 400))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setHint('Align barcode in the frame...')
      scanningRef.current = true
      runScan()
    } catch {
      setError('Camera not available. Use manual entry.')
      setMode('manual')
    }
  }

  async function runScan() {
    if (!scanningRef.current || !videoRef.current) return
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      const result = await reader.decodeOnceFromVideoElement(videoRef.current)
      if (result?.getText()) {
        setHint('Found! Looking up...')
        scanningRef.current = false
        await lookup(result.getText())
      }
    } catch {
      if (scanningRef.current) setTimeout(runScan, 500)
    }
  }

  function stopScan() {
    scanningRef.current = false
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setMode('idle'); setHint('')
  }

  async function lookup(code) {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/barcode?code=' + encodeURIComponent(code.trim()))
      const data = await res.json()
      if (data.result) { stopScan(); onResult(data.result) }
      else { setError('Product not found. Try manual entry.'); setMode('idle') }
    } catch { setError('Lookup failed. Check connection.') }
    finally { setLoading(false) }
  }

  useEffect(() => () => stopScan(), [])

  return (
    <div>
      <style>{`
        @keyframes scanline{0%,100%{top:15%}50%{top:78%}}
        .scan-line{position:absolute;left:8%;right:8%;height:2px;background:var(--primary);animation:scanline 1.8s ease-in-out infinite;pointer-events:none;box-shadow:0 0 8px var(--primary-glow)}
        .scan-corner{position:absolute;width:24px;height:24px;pointer-events:none}
        .sc-tl{top:10%;left:8%;border-top:3px solid var(--primary);border-left:3px solid var(--primary);border-radius:4px 0 0 0}
        .sc-tr{top:10%;right:8%;border-top:3px solid var(--primary);border-right:3px solid var(--primary);border-radius:0 4px 0 0}
        .sc-bl{bottom:10%;left:8%;border-bottom:3px solid var(--primary);border-left:3px solid var(--primary);border-radius:0 0 0 4px}
        .sc-br{bottom:10%;right:8%;border-bottom:3px solid var(--primary);border-right:3px solid var(--primary);border-radius:0 0 4px 0}
      `}</style>

      {mode === 'idle' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ width: 72, height: 72, background: 'var(--primary-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 32 }}>📦</div>
          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Scan product barcode</p>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>Point your camera at any packaged food barcode for instant nutrition info</p>
          <button className="btn btn-primary pulse-primary" style={{ width: '100%', padding: '15px', fontSize: 15, marginBottom: 10 }} onClick={startScan}>
            Start scanning
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', padding: '14px', fontSize: 14 }} onClick={() => setMode('manual')}>
            Enter barcode number
          </button>
          {error && <div style={{ marginTop: 12, background: 'var(--red-bg)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}><p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p></div>}
        </div>
      )}

      {mode === 'scanning' && (
        <div>
          <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#000', marginBottom: 14 }}>
            <video ref={videoRef} muted playsInline style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }} />
            <div className="scan-line" />
            <div className="scan-corner sc-tl" /><div className="scan-corner sc-tr" />
            <div className="scan-corner sc-bl" /><div className="scan-corner sc-br" />
          </div>
          <p style={{ textAlign: 'center', color: loading ? 'var(--primary)' : 'var(--muted)', fontSize: 13, marginBottom: 12, fontWeight: loading ? 600 : 400 }}>
            {loading ? 'Looking up product...' : hint}
          </p>
          {error && <div style={{ background: 'var(--red-bg)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}><p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p></div>}
          <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 14 }} onClick={stopScan}>Cancel</button>
          <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>Or type barcode number</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" placeholder="e.g. 8901058857538" value={manualCode} onChange={e => setManualCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && manualCode && lookup(manualCode)} style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={() => manualCode && lookup(manualCode)} disabled={loading || !manualCode} style={{ flexShrink: 0, padding: '12px 18px' }}>{loading ? '...' : 'Go'}</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'manual' && (
        <div>
          <button onClick={() => setMode('idle')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, marginBottom: 20, padding: 0, fontWeight: 500 }}>← Back</button>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Enter barcode number</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>Find the number printed below the barcode lines on the package</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input type="number" placeholder="e.g. 8901058857538" value={manualCode} onChange={e => setManualCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && manualCode && lookup(manualCode)} style={{ flex: 1 }} autoFocus />
            <button className="btn btn-primary" onClick={() => manualCode && lookup(manualCode)} disabled={loading || !manualCode} style={{ flexShrink: 0, padding: '12px 20px' }}>{loading ? '...' : 'Search'}</button>
          </div>
          {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Looking up product...</p>}
          {error && <div style={{ background: 'var(--red-bg)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}><p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p></div>}
        </div>
      )}
    </div>
  )
}
