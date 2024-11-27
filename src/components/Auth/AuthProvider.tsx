// src/components/Auth/AuthProvider.tsx
import React, { useEffect, useState } from "react"
import { AuthService } from "../../lib/auth"
import { supabase } from "../../lib/supabase"
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)
  const auth = AuthService.getInstance()

  useEffect(() => {
    // Check if we have a session in the auth service
    const session = auth.getSession()
    if (session) {
      setIsAuthenticated(true)
      auth.checkSubscription().then((hasSub) => {
        setHasSubscription(hasSub)
        setIsLoading(false)
      })
    } else {
      setIsAuthenticated(false)
      setHasSubscription(false)
      setIsLoading(false)
    }

    // Listen for auth changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setIsAuthenticated(true)
        const hasActiveSub = await auth.checkSubscription()
        setHasSubscription(hasActiveSub)
      } else {
        setIsAuthenticated(false)
        setHasSubscription(false)
      }
      setIsLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black/60 backdrop-blur-md">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-black/60 backdrop-blur-md">
        <button
          onClick={() => auth.signInWithGoogle()}
          className="bg-white text-black px-4 py-2 rounded-lg hover:bg-white/90"
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  if (!hasSubscription) {
    return (
      <div className="flex items-center justify-center h-screen bg-black/60 backdrop-blur-md">
        <div className="text-white">Subscription required</div>
      </div>
    )
  }

  return <>{children}</>
}
