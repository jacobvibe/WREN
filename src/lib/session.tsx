import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type SessionContextType = {
  session: Session | null
  loading: boolean
}

const SessionContext = createContext<SessionContextType>({
  session: null,
  loading: true,
})

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  )
}

export const useSession = () => useContext(SessionContext)
