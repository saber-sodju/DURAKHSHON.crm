import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setAccessToken, tryRefresh } from '../lib/api'
import type { Me } from '../lib/types'

interface AuthState {
  user: Me | null
  loading: boolean
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // restore session from the httpOnly refresh cookie on page load
    ;(async () => {
      const token = await tryRefresh()
      if (token) {
        try {
          const res = await api.get<Me>('/auth/me')
          setUser(res.data)
        } catch {
          setUser(null)
        }
      }
      setLoading(false)
    })()

    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  async function login(username: string, password: string, rememberMe = false) {
    const res = await api.post('/auth/login', { username, password, remember_me: rememberMe })
    setAccessToken(res.data.access_token)
    const me = await api.get<Me>('/auth/me')
    setUser(me.data)
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
