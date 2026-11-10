import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'photowall-theme'
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null)
function preference(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch { return null }
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState(preference)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const theme: Theme = saved || (systemDark ? 'dark' : 'light')
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const systemChanged = () => setSystemDark(query.matches)
    const storageChanged = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) setSaved(preference()) }
    query.addEventListener('change', systemChanged)
    window.addEventListener('storage', storageChanged)
    return () => { query.removeEventListener('change', systemChanged); window.removeEventListener('storage', storageChanged) }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141b19' : '#f8f7f2')
  }, [theme])
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setSaved(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* Still allow switching if storage is unavailable. */ }
  }
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('ThemeProvider is required')
  return context
}
export function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme()
  return <button type="button" className="theme-toggle" role="switch" aria-checked={theme === 'dark'} aria-label="夜间模式" title={theme === 'dark' ? '切换为日间模式' : '切换为夜间模式'} onClick={toggleTheme}>
    <span className="theme-toggle-track" aria-hidden="true">
      <span className={`theme-icon${theme === 'light' ? ' selected' : ''}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="4" /><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg></span>
      <span className={`theme-icon${theme === 'dark' ? ' selected' : ''}`}><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.9 14.1A9 9 0 0 1 9.9 3.1a9 9 0 1 0 11 11Z" /></svg></span>
    </span><span className="theme-toggle-label">{theme === 'dark' ? '夜间' : '日间'}</span>
  </button>
}
