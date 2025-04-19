"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import { createClient, type Session, type User, type AuthChangeEvent } from "@supabase/supabase-js"
import { API_URL } from "../config"

// Initialize Supabase client with error checking
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Check if Supabase credentials are available
let supabase: any = null
try {
  if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL is not defined")
  if (!supabaseAnonKey) throw new Error("VITE_SUPABASE_ANON_KEY is not defined")

  supabase = createClient(supabaseUrl, supabaseAnonKey)
} catch (error) {
  console.error("Failed to initialize Supabase client:", error)
}

interface AuthContextType {
  isAuthenticated: boolean
  user: User | null
  session: Session | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Create a user cache to prevent repeated backend calls
const userCache = new Map<string, { timestamp: number; details: any }>()

// Function to save user to backend with proper error handling
async function saveUserToBackend(user: User) {
  try {
    // Check if we've already saved this user recently (within 5 minutes)
    const cachedUser = userCache.get(user.id)
    const now = Date.now()

    if (cachedUser && now - cachedUser.timestamp < 300000) {
      console.log("Using cached user data - skipping backend call")
      return
    }

    console.log("Saving user to backend")
    const response = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name,
        avatar_url: user.user_metadata?.avatar_url,
        provider: user.app_metadata?.provider || "google",
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to save user: ${response.status}`)
    }

    // Update the cache
    userCache.set(user.id, { timestamp: now, details: user })
    console.log("User saved to backend successfully")
  } catch (error) {
    console.error("Error saving user to backend:", error)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const authCheckComplete = useRef(false)

  // Update the useEffect hook to save user to backend after login
  useEffect(() => {
    if (!supabase || authCheckComplete.current) return

    // Get initial session - only once
    const getInitialSession = async () => {
      try {
        console.log("Checking initial session")
        const {
          data: { session },
        } = await supabase.auth.getSession()

        setSession(session)
        setUser(session?.user ?? null)
        setIsAuthenticated(!!session)

        // If user is authenticated, save to backend
        if (session?.user) {
          await saveUserToBackend(session.user)
        }

        authCheckComplete.current = true
      } catch (error) {
        console.error("Error getting session:", error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      console.log("Auth state changed:", event)

      setSession(session)
      setUser(session?.user ?? null)
      setIsAuthenticated(!!session)

      // If user is authenticated, save to backend
      if (session?.user) {
        await saveUserToBackend(session.user)
      }
    })

    // Clean up subscription
    return () => {
      subscription.unsubscribe()
    }
  }, []) // Empty dependency array to run only once

  const signInWithGoogle = async () => {
    try {
      if (!supabase) throw new Error("Supabase client not initialized")

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      console.error("Error signing in with Google:", error)
      throw error
    }
  }

  const signOut = async () => {
    try {
      if (!supabase) throw new Error("Supabase client not initialized")
      await supabase.auth.signOut()
    } catch (error) {
      console.error("Error signing out:", error)
      throw error
    }
  }

  const value = {
    isAuthenticated,
    user,
    session,
    signInWithGoogle,
    signOut,
  }

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
