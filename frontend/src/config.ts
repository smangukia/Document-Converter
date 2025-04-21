// Get environment variables with fallback to window.ENV for runtime injection
const getEnvVariable = (key: string): string => {
  // Check if we're in the browser and if window.ENV exists
  if (typeof window !== "undefined" && window.ENV) {
    // Use type-safe property access
    if (key === "VITE_API_URL") return window.ENV.VITE_API_URL || ""
    if (key === "VITE_SUPABASE_URL") return window.ENV.VITE_SUPABASE_URL || ""
    if (key === "VITE_SUPABASE_ANON_KEY") return window.ENV.VITE_SUPABASE_ANON_KEY || ""
  }
  // Otherwise use import.meta.env (which works during build time)
  return (import.meta.env as any)[key] || ""
}

// API URL configuration
export const API_URL = getEnvVariable("VITE_API_URL") || "http://44.206.167.8:3001/api"

// Add this to the file to make TypeScript happy with our window.ENV
declare global {
  interface Window {
    ENV?: {
      VITE_API_URL?: string
      VITE_SUPABASE_URL?: string
      VITE_SUPABASE_ANON_KEY?: string
    }
  }
}
