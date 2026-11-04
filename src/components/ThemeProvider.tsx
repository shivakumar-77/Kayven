'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'auto'
const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: 'auto', setTheme: () => {} })

function applyTheme(theme: Theme, systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches) {
  const resolvedTheme = theme === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : theme
  const root = document.documentElement
  root.dataset.theme = resolvedTheme
  root.style.colorScheme = resolvedTheme
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    'content',
    resolvedTheme === 'dark' ? '#1A120E' : '#F7F3ED',
  )
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('auto')

  useEffect(() => {
    const stored = localStorage.getItem('Kayven_theme')
    const saved: Theme = stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto'
    setThemeState(saved)
    applyTheme(saved)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = (event: MediaQueryListEvent) => {
      if (theme === 'auto') applyTheme('auto', event.matches)
    }

    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [theme])

  function setTheme(t: Theme) {
    setThemeState(t)
    localStorage.setItem('Kayven_theme', t)
    applyTheme(t)
  }

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>
}

export function useTheme() { return useContext(ThemeCtx) }
