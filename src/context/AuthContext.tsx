import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthUser, FacialProfileState } from '../types/auth'
import {
  fetchMe,
  loginUser,
  logoutUser,
  registerUser,
  getAuthErrorMessage,
  supabase,
  mapSupabaseUser,
} from '../lib/auth/authClient'

interface AuthContextType {
  user: AuthUser | null
  facialProfile: FacialProfileState
  isLoggedIn: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
  setFacialProfile: (profile: FacialProfileState) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [facialProfile, setFacialProfile] = useState<FacialProfileState>({ hasProfile: false })
  const [loading, setLoading] = useState(true)

  const refreshAuth = useCallback(async () => {
    try {
      const data = await fetchMe()
      setUser(data.user)
      setFacialProfile(data.facialProfile)
    } catch {
      setUser(null)
      setFacialProfile({ hasProfile: false })
    }
  }, [])

  useEffect(() => {
    void refreshAuth().finally(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(mapSupabaseUser(session.user))
        void refreshAuth()
      } else {
        setUser(null)
        setFacialProfile({ hasProfile: false })
      }
    })

    return () => subscription.unsubscribe()
  }, [refreshAuth])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginUser(email, password)
    if (!result.ok) {
      return { ok: false, error: getAuthErrorMessage(result.error.code, result.error.message) }
    }
    await refreshAuth()
    return { ok: true }
  }, [refreshAuth])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await registerUser(name, email, password)
    if (!result.ok) {
      return { ok: false, error: getAuthErrorMessage(result.error.code, result.error.message) }
    }
    await refreshAuth()
    return { ok: true }
  }, [refreshAuth])

  const logout = useCallback(async () => {
    try {
      await logoutUser()
    } finally {
      setUser(null)
      setFacialProfile({ hasProfile: false })
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        facialProfile,
        isLoggedIn: !!user,
        loading,
        login,
        register,
        logout,
        refreshAuth,
        setFacialProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
