import { supabase } from "./supabase"
import { Session } from "@supabase/supabase-js"

export class AuthService {
  private static instance: AuthService | null = null
  private session: Session | null = null

  private constructor() {
    // Retrieve the session from electron-store via IPC
    window.electronAPI.getSession().then((savedSession) => {
      if (savedSession?.access_token && savedSession?.refresh_token) {
        supabase.auth.setSession({
          access_token: savedSession.access_token,
          refresh_token: savedSession.refresh_token
        })
        this.session = savedSession
      }
    })

    // Listen for auth changes and update the session
    supabase.auth.onAuthStateChange((_event, session) => {
      this.session = session
      if (session) {
        window.electronAPI.storeSession(session) // Save the session
      } else {
        window.electronAPI.clearSession() // Clear the session
      }
    })
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  async signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          skipBrowserRedirect: true
        }
      })

      if (error) throw error

      if (data.url) {
        await window.electronAPI.openAuthWindow(data.url)
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (session) {
          window.electronAPI.storeSession(session) // Store the session
          this.session = session
        }

        return session
      }
    } catch (error) {
      console.error("Auth error:", error)
      throw error
    }
  }

  async signOut() {
    await supabase.auth.signOut()
    window.electronAPI.clearSession() // Clear the session
    this.session = null
  }

  getSession() {
    return this.session
  }
}
