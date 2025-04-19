"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom"
import { FileUploader } from "./components/file-uploader"
import { ConversionHistory } from "./components/conversion-history"
import { API_URL } from "./config"
import LoginPage from "./pages/login"
import { useAuth } from "./components/auth-context"

// Define AppContent as a component that contains your existing UI
function AppContent() {
  const [file, setFile] = useState<File | null>(null)
  const [outputFormat, setOutputFormat] = useState<string>("")
  const [isConverting, setIsConverting] = useState<boolean>(false)
  const [conversionHistory, setConversionHistory] = useState<any[]>([])
  const [toast, setToast] = useState<{
    visible: boolean
    title: string
    message: string
    type: "success" | "error"
  }>({
    visible: false,
    title: "",
    message: "",
    type: "success",
  })
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking")
  const [availableOutputFormats, setAvailableOutputFormats] = useState<string[]>([])
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  })
  const [activeTab, setActiveTab] = useState<"convert" | "history">("convert")
  const [selectOpen, setSelectOpen] = useState(false)
  const navigate = useNavigate()

  // Use the auth context instead of managing auth state here
  const { isAuthenticated, user, signOut } = useAuth()

  useEffect(() => {
    // Check if the API is available
    fetch(`${API_URL}/health`)
      .then((response) => {
        if (response.ok) {
          setApiStatus("online")
          if (user?.id) {
            fetchConversionHistory(1)
          }
        } else {
          setApiStatus("offline")
          showToast("Error", "Backend server is not available", "error")
        }
      })
      .catch(() => {
        setApiStatus("offline")
        showToast("Error", "Backend server is not available", "error")
      })
  }, [user]) // Only run when user changes

  useEffect(() => {
    if (toast.visible) {
      const timer = setTimeout(() => {
        setToast((prev) => ({ ...prev, visible: false }))
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [toast.visible])

  useEffect(() => {
    // Update available output formats based on input file type
    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase() || ""

      switch (extension) {
        case "md":
          setAvailableOutputFormats(["word", "html", "pdf", "txt"])
          break
        case "html":
        case "htm":
          setAvailableOutputFormats(["word", "pdf", "md", "txt"])
          break
        case "docx":
        case "doc":
          setAvailableOutputFormats(["html", "pdf", "txt"])
          break
        case "pdf":
          setAvailableOutputFormats(["word", "txt"])
          break
        case "txt":
          setAvailableOutputFormats(["word", "html", "md", "pdf"])
          break
        default:
          setAvailableOutputFormats([])
      }

      // Reset output format when file changes
      setOutputFormat("")
    } else {
      setAvailableOutputFormats([])
      setOutputFormat("")
    }
  }, [file])

  const showToast = (title: string, message: string, type: "success" | "error") => {
    setToast({
      visible: true,
      title,
      message,
      type,
    })
  }

  const fetchConversionHistory = useCallback(
    async (page = 1) => {
      if (!user?.id) {
        console.log("No user ID available, skipping conversion history fetch")
        return
      }

      try {
        // Add a cache-busting parameter to ensure we get fresh data
        const timestamp = new Date().getTime()
        let url = `${API_URL}/conversions?page=${page}&limit=10&_=${timestamp}`

        // Add userId to the query if available
        url += `&userId=${user.id}`

        console.log(`Fetching conversion history for user ${user.id}`)
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()

        // Log the data for debugging
        console.log(`Received ${data.conversions?.length || 0} conversions, total: ${data.pagination?.total || 0}`)

        setConversionHistory(data.conversions || [])
        setPagination(data.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 })
      } catch (error) {
        console.error("Error fetching conversions:", error)
        showToast("Error", "Failed to fetch conversion history", "error")
      }
    },
    [user],
  )

  // Refetch history when user changes
  useEffect(() => {
    if (user?.id) {
      fetchConversionHistory(1)
    }
  }, [user, fetchConversionHistory])

  const handleFileChange = (selectedFile: File | null) => {
    setFile(selectedFile)
  }

  const handlePageChange = (page: number) => {
    fetchConversionHistory(page)
  }

  const handleDeleteConversion = (id: string) => {
    // Check if this deletion would leave the current page empty
    const isLastItemOnPage = conversionHistory.length === 1 && pagination.page > 1

    if (isLastItemOnPage) {
      // If it's the last item on the page and not the first page,
      // we'll go to the previous page in the ConversionHistory component
      // No need to do anything here as it's handled in the component
    } else {
      // Refresh the current page
      fetchConversionHistory(pagination.page)
    }

    showToast("Success", "Conversion deleted successfully", "success")
  }

  const handleLogout = async () => {
    try {
      await signOut()
      navigate("/login")
    } catch (error) {
      console.error("Error during logout:", error)
      showToast("Error", "Failed to sign out", "error")
    }
  }

  const handleConvert = async () => {
    if (apiStatus === "offline") {
      showToast("Error", "Backend server is not available", "error")
      return
    }

    if (!file || !outputFormat) {
      showToast("Error", "Please select a file and output format", "error")
      return
    }

    if (!user?.id) {
      showToast("Error", "You must be logged in to convert documents", "error")
      return
    }

    setIsConverting(true)

    try {
      // Map "word" format to "docx" for backend processing
      const backendFormat = outputFormat === "word" ? "docx" : outputFormat
      const inputExtension = file.name.split(".").pop()?.toLowerCase() || ""

      // Special handling for PDF to DOCX conversion to avoid duplicate records
      if (inputExtension === "pdf" && outputFormat === "word") {
        console.log("Using PDF to DOCX conversion endpoint")

        // For PDF to DOCX, we'll use a single request without creating a record first
        const conversionFormData = new FormData()
        conversionFormData.append("file", file)
        conversionFormData.append("outputFormat", "docx")
        conversionFormData.append("singleRequest", "true") // Flag to indicate this is a single request
        conversionFormData.append("userId", user.id)

        const response = await fetch(`${API_URL}/convert`, {
          method: "POST",
          body: conversionFormData,
        })

        if (!response.ok) {
          let errorMessage = "Conversion failed"
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch (e) {
            // If parsing JSON fails, use the default error message
          }
          throw new Error(errorMessage)
        }

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${file.name.split(".")[0]}.docx`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)

        showToast("Success", "Document converted successfully", "success")
        setTimeout(() => fetchConversionHistory(1), 1000)
        setIsConverting(false)
        return
      }

      // For all other conversions, first create a record in the database
      const formData = new FormData()
      formData.append("file", file)
      formData.append("outputFormat", backendFormat)
      formData.append("createRecordOnly", "true")
      formData.append("userId", user.id)

      // Create the conversion record
      const recordResponse = await fetch(`${API_URL}/convert`, {
        method: "POST",
        body: formData,
      })

      let conversionId = null
      if (recordResponse.ok) {
        const recordData = await recordResponse.json()
        conversionId = recordData.id
        console.log(`Created conversion record with ID: ${conversionId}`)
      } else {
        console.error("Failed to create conversion record")
      }

      // Handle Word to PDF conversion
      if ((inputExtension === "docx" || inputExtension === "doc") && outputFormat === "pdf") {
        console.log("Using Word to PDF conversion endpoint")

        const conversionFormData = new FormData()
        conversionFormData.append("file", file)
        if (conversionId) {
          conversionFormData.append("conversionId", conversionId)
        }
        conversionFormData.append("userId", user.id)

        try {
          const response = await fetch(`${API_URL}/word-to-pdf`, {
            method: "POST",
            body: conversionFormData,
          })

          if (!response.ok) {
            let errorMessage = "Conversion failed"
            try {
              const errorData = await response.json()
              errorMessage = errorData.error || errorMessage
            } catch (e) {
              // If parsing JSON fails, use the default error message
            }
            throw new Error(errorMessage)
          }

          // Check if the response is a blob or JSON
          const contentType = response.headers.get("content-type") || ""
          if (contentType.includes("application/json")) {
            // If it's JSON, it's probably an error
            const data = await response.json()
            console.log("Received JSON response:", data)

            if (data.id) {
              // If we got an ID, the conversion is being processed
              showToast("Success", "Document conversion started. Check history for download.", "success")
            } else {
              throw new Error(data.error || "Unknown error")
            }
          } else {
            // It's a blob, download it
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${file.name.split(".")[0]}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)

            showToast("Success", "Document converted successfully", "success")
          }

          // If we have a conversion ID, manually update its status
          if (conversionId) {
            try {
              await fetch(`${API_URL}/update-status/${conversionId}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ status: "completed" }),
              })
            } catch (e) {
              console.error("Failed to update conversion status:", e)
            }
          }

          // Wait a moment and then refresh the conversion history
          setTimeout(() => {
            fetchConversionHistory(1)
          }, 1000)

          setIsConverting(false)
          return
        } catch (error) {
          console.error("Error in Word to PDF conversion:", error)
          showToast(
            "Error",
            `Failed to convert document: ${error instanceof Error ? error.message : "Unknown error"}`,
            "error",
          )
          setIsConverting(false)
          return
        }
      }

      // Handle Markdown to PDF conversion
      if (inputExtension === "md" && outputFormat === "pdf") {
        console.log("Using Markdown to PDF conversion endpoint")

        const conversionFormData = new FormData()
        conversionFormData.append("file", file)
        if (conversionId) {
          conversionFormData.append("conversionId", conversionId)
        }
        conversionFormData.append("userId", user.id)

        try {
          const response = await fetch(`${API_URL}/markdown-to-pdf`, {
            method: "POST",
            body: conversionFormData,
          })

          if (!response.ok) {
            let errorMessage = "Conversion failed"
            try {
              const errorData = await response.json()
              errorMessage = errorData.error || errorMessage
            } catch (e) {
              // If parsing JSON fails, use the default error message
            }
            throw new Error(errorMessage)
          }

          // Check if the response is a blob or JSON
          const contentType = response.headers.get("content-type") || ""
          if (contentType.includes("application/json")) {
            // If it's JSON, it's probably an error
            const data = await response.json()
            console.log("Received JSON response:", data)

            if (data.id) {
              // If we got an ID, the conversion is being processed
              showToast("Success", "Document conversion started. Check history for download.", "success")
            } else {
              throw new Error(data.error || "Unknown error")
            }
          } else {
            // It's a blob, download it
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${file.name.split(".")[0]}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)

            showToast("Success", "Document converted successfully", "success")
          }

          // If we have a conversion ID, manually update its status
          if (conversionId) {
            try {
              await fetch(`${API_URL}/update-status/${conversionId}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ status: "completed" }),
              })
            } catch (e) {
              console.error("Failed to update conversion status:", e)
            }
          }

          // Wait a moment and then refresh the conversion history
          setTimeout(() => {
            fetchConversionHistory(1)
          }, 1000)

          setIsConverting(false)
          return
        } catch (error) {
          console.error("Error in Markdown to PDF conversion:", error)
          showToast(
            "Error",
            `Failed to convert document: ${error instanceof Error ? error.message : "Unknown error"}`,
            "error",
          )
          setIsConverting(false)
          return
        }
      }

      // Special handling for HTML to PDF conversion
      if (inputExtension === "html" && (outputFormat === "pdf" || outputFormat === "word")) {
        console.log(`Using dedicated HTML to ${outputFormat} endpoint`)

        const conversionFormData = new FormData()
        conversionFormData.append("file", file)
        if (conversionId) {
          conversionFormData.append("conversionId", conversionId)
        }
        conversionFormData.append("userId", user.id)

        const endpoint = outputFormat === "pdf" ? "html-to-pdf" : "convert"
        const requestOutputFormat = outputFormat === "pdf" ? undefined : backendFormat

        if (requestOutputFormat) {
          conversionFormData.append("outputFormat", requestOutputFormat)
        }

        const response = await fetch(`${API_URL}/${endpoint}`, {
          method: "POST",
          body: conversionFormData,
        })

        if (!response.ok) {
          throw new Error(`HTML to ${outputFormat} conversion failed`)
        }

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${file.name.split(".")[0]}.${backendFormat}`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)

        showToast("Success", "Document converted successfully", "success")
        setTimeout(() => fetchConversionHistory(1), 1000)
        setIsConverting(false)
        return
      }

      // For other conversions, use the regular endpoint
      const conversionFormData = new FormData()
      conversionFormData.append("file", file)
      conversionFormData.append("outputFormat", backendFormat)
      if (conversionId) {
        conversionFormData.append("conversionId", conversionId)
        conversionFormData.append("useExistingRecord", "true")
      }
      conversionFormData.append("userId", user.id)

      const response = await fetch(`${API_URL}/convert`, {
        method: "POST",
        body: conversionFormData,
      })

      if (!response.ok) {
        let errorMessage = "Conversion failed"
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch (e) {
          // If parsing JSON fails, use the default error message
        }
        throw new Error(errorMessage)
      }

      // Get the blob from the response
      const blob = await response.blob()

      // Create a download link
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${file.name.split(".")[0]}.${backendFormat}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      showToast("Success", "Document converted successfully", "success")

      // Refresh conversion history with a delay to ensure the database is updated
      setTimeout(() => fetchConversionHistory(1), 1000)
    } catch (error) {
      console.error("Error converting document:", error)
      showToast(
        "Error",
        `Failed to convert document: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      )
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center">
            {isAuthenticated && user?.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url || "/placeholder.svg"}
                alt="User profile"
                className="w-10 h-10 rounded-full mr-4 border border-gray-200"
              />
            )}
            {isAuthenticated && user?.email && (
              <span className="text-sm text-gray-600">{user.user_metadata?.name || user.email}</span>
            )}
          </div>
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Document Converter</h1>
            <p className="text-gray-600">Convert documents between common formats</p>
            {apiStatus === "offline" && (
              <div className="mt-2 text-sm text-red-600 bg-red-100 p-2 rounded-md inline-block">
                Backend server is offline. Please start the backend server.
              </div>
            )}
          </div>
          <div>
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
              >
                Sign Out
              </button>
            )}
          </div>
        </header>

        {/* Custom Tabs */}
        <div className="w-full mb-8">
          <div className="grid w-full grid-cols-2 rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setActiveTab("convert")}
              className={`py-2 text-sm font-medium transition-colors rounded-md ${
                activeTab === "convert" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Convert Document
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`py-2 text-sm font-medium transition-colors rounded-md ${
                activeTab === "history" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Conversion History
            </button>
          </div>
        </div>

        {activeTab === "convert" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upload Card */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">Upload Document</h3>
                <p className="text-sm text-gray-500">Select a document to convert</p>
              </div>
              <div className="p-6">
                <FileUploader onFileChange={handleFileChange} />
              </div>
              <div className="px-6 py-4 bg-gray-50 text-sm text-gray-500 rounded-b-lg">
                Supported formats: .md, .html, .docx, .doc, .pdf, .txt
              </div>
            </div>

            {/* Options Card */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">Conversion Options</h3>
                <p className="text-sm text-gray-500">Select your desired output format</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Output Format</label>
                  <div className="relative">
                    <button
                      type="button"
                      className={`relative w-full flex items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ${
                        !file ? "text-gray-400 cursor-not-allowed" : "text-gray-900 cursor-pointer"
                      }`}
                      onClick={() => file && setSelectOpen(!selectOpen)}
                      disabled={!file}
                    >
                      <span>
                        {outputFormat ? formatLabel(outputFormat) : file ? "Select format" : "Upload a file first"}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-5 w-5 transition-transform ${selectOpen ? "rotate-180" : ""}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    {selectOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-md bg-white shadow-lg">
                        <ul className="max-h-60 overflow-auto rounded-md py-1 text-base">
                          {availableOutputFormats.map((format) => (
                            <li
                              key={format}
                              className="text-gray-900 relative cursor-pointer select-none py-2 pl-3 pr-9 hover:bg-blue-50"
                              onClick={() => {
                                setOutputFormat(format)
                                setSelectOpen(false)
                              }}
                            >
                              {formatLabel(format)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-6 border-t">
                <button
                  onClick={handleConvert}
                  disabled={!file || !outputFormat || isConverting || apiStatus === "offline"}
                  className={`w-full py-2 px-4 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
                    !file || !outputFormat || isConverting || apiStatus === "offline"
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isConverting ? "Converting..." : "Convert Document"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <ConversionHistory
            history={conversionHistory}
            onDelete={handleDeleteConversion}
            pagination={pagination}
            onPageChange={handlePageChange}
          />
        )}
      </div>

      {/* Simple Toast Component */}
      {toast.visible && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-md shadow-lg max-w-md z-50 ${
            toast.type === "success" ? "bg-green-100 border-green-500" : "bg-red-100 border-red-500"
          } border-l-4 transition-opacity duration-300`}
        >
          <div className="flex items-start">
            <div className="ml-3">
              <h3 className={`text-sm font-medium ${toast.type === "success" ? "text-green-800" : "text-red-800"}`}>
                {toast.title}
              </h3>
              <div className={`mt-1 text-sm ${toast.type === "success" ? "text-green-700" : "text-red-700"}`}>
                {toast.message}
              </div>
            </div>
            <button
              type="button"
              className={`ml-auto -mx-1.5 -my-1.5 rounded-md p-1.5 focus:outline-none focus:ring-2 ${
                toast.type === "success"
                  ? "text-green-500 hover:bg-green-200 focus:ring-green-600"
                  : "text-red-500 hover:bg-red-200 focus:ring-red-600"
              }`}
              onClick={() => setToast((prev) => ({ ...prev, visible: false }))}
            >
              <span className="sr-only">Close</span>
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Main App component that sets up routing
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppContent />
            </RequireAuth>
          }
        />
      </Routes>
    </Router>
  )
}

// Helper component to handle authentication
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState<boolean>(true)
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    // Check if Supabase is available
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("Supabase credentials missing, bypassing authentication")
      setLoading(false)
      return
    }

    // We're using the auth context now, so we just need to wait for it to be ready
    setLoading(false)
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Helper function to format the output format label
function formatLabel(format: string): string {
  switch (format) {
    case "word":
      return "Word (DOCX)"
    case "html":
      return "HTML"
    case "pdf":
      return "PDF"
    case "md":
      return "Markdown"
    case "txt":
      return "Plain Text"
    default:
      return format.toUpperCase()
  }
}
