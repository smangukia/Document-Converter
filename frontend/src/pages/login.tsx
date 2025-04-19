"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { createClient } from "@supabase/supabase-js"

// Initialize Supabase client with error checking
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Check if Supabase credentials are available
let supabase: any = null
let supabaseInitError: string | null = null

try {
  if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL is not defined")
  if (!supabaseAnonKey) throw new Error("VITE_SUPABASE_ANON_KEY is not defined")

  supabase = createClient(supabaseUrl, supabaseAnonKey)
} catch (error) {
  console.error("Failed to initialize Supabase client:", error)
  supabaseInitError = error instanceof Error ? error.message : "Failed to initialize Supabase"
}

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Check if user is already logged in
  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        navigate("/")
      }
    }

    checkSession()
  }, [navigate])

  // Update the handleGoogleLogin function to check for initialization errors
  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Check if Supabase is properly initialized
      if (!supabase) {
        throw new Error(supabaseInitError || "Supabase is not initialized. Check your environment variables.")
      }

      // Sign in with Google using Supabase
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      })

      if (error) {
        throw error
      }

      // Note: We don't need to navigate here as Supabase will handle the redirect
    } catch (error) {
      console.error("Login failed:", error)
      setError(
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Failed to sign in with Google",
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Document Converter</h1>
          <p className="text-gray-600 mt-2">Sign in to access your document conversion tools</p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>}

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 border border-gray-300 rounded-md py-3 px-4 hover:bg-gray-50 shadow-sm transition-colors"
        >
          {isLoading ? (
            <svg
              className="animate-spin h-5 w-5 text-gray-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.21.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          <span className="font-medium">{isLoading ? "Signing in..." : "Sign in with Google"}</span>
        </button>
      </div>
    </div>
  )
}
