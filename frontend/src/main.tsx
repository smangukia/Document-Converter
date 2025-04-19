import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.tsx"
import "./index.css"
import { ThemeProvider } from "./components/theme-provider"
import { AuthProvider } from "./components/auth-context.tsx"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider defaultTheme="light" storageKey="document-converter-theme">
        <App />
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
