"use client"

import { useState } from "react"
import { API_URL } from "../config"

interface ConversionHistoryProps {
  history: Array<{
    id: string
    originalFilename: string
    outputFormat: string
    timestamp: string
    status: string
  }>
  onDelete?: (id: string) => void
  pagination?: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  onPageChange?: (page: number) => void
}

export function ConversionHistory({ history, onDelete, pagination, onPageChange }: ConversionHistoryProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Handle download of converted files
  const handleDownload = async (id: string, outputFormat: string, originalFilename: string) => {
    try {
      console.log(`Attempting to download conversion ${id} with format ${outputFormat}`)

      const response = await fetch(`${API_URL}/download/${id}`)
      if (!response.ok) {
        throw new Error(`Download failed with status: ${response.status}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${originalFilename.split(".")[0]}.${outputFormat}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error downloading file:", error)
      alert(`Error downloading file: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  // Handle deletion of conversion records
  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id)
      const response = await fetch(`${API_URL}/conversions/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error(`Delete failed with status: ${response.status}`)
      }

      // Call the onDelete callback to refresh the list
      if (onDelete) {
        // Check if this is the last item on the page and not the first page
        const isLastItemOnPage = history.length === 1 && pagination && pagination.page > 1

        if (isLastItemOnPage) {
          // If it's the last item on the page and not the first page, go to the previous page
          onPageChange && onPageChange(pagination.page - 1)
        } else {
          // Otherwise, refresh the current page
          onDelete(id)
        }
      }
    } catch (error) {
      console.error("Error deleting conversion:", error)
      alert(`Error deleting conversion: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm">
      <div className="p-6 border-b flex justify-between items-center">
        <h3 className="text-lg font-semibold">Conversion History</h3>
        <button
          onClick={() => onPageChange && onPageChange(pagination?.page || 1)}
          className="px-3 py-1 text-sm border rounded hover:bg-gray-50 flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-refresh-cw"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          Refresh
        </button>
      </div>
      <div className="p-6">
        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No conversion history found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Original Filename
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Output Format
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.originalFilename}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.outputFormat.toUpperCase()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            item.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : item.status === "failed"
                                ? "bg-red-100 text-red-800"
                                : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          {item.status === "completed" && (
                            <button
                              className="text-blue-600 hover:text-blue-900 px-2 py-1 rounded hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                              onClick={() => handleDownload(item.id, item.outputFormat, item.originalFilename)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4 inline mr-1"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                />
                              </svg>
                              Download
                            </button>
                          )}
                          <button
                            className="text-red-600 hover:text-red-900 px-2 py-1 rounded hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 inline mr-1"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                            {deletingId === item.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    className={`px-2 py-1 rounded text-sm ${
                      pagination.page <= 1 ? "text-gray-400 cursor-not-allowed" : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => onPageChange && onPageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {/* Page numbers */}
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                      .filter((pageNum) => {
                        // Show first page, last page, current page, and pages around current page
                        return (
                          pageNum === 1 || pageNum === pagination.totalPages || Math.abs(pageNum - pagination.page) <= 1
                        )
                      })
                      .map((pageNum, index, array) => {
                        // Add ellipsis between non-consecutive page numbers
                        const showEllipsisBefore = index > 0 && pageNum - array[index - 1] > 1

                        return (
                          <div key={pageNum} className="flex items-center">
                            {showEllipsisBefore && <span className="px-2 text-gray-400">...</span>}
                            <button
                              className={`w-8 h-8 flex items-center justify-center rounded text-sm ${
                                pageNum === pagination.page
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-700 hover:bg-gray-100"
                              }`}
                              onClick={() => onPageChange && onPageChange(pageNum)}
                            >
                              {pageNum}
                            </button>
                          </div>
                        )
                      })}
                  </div>

                  <button
                    className={`px-2 py-1 rounded text-sm ${
                      pagination.page >= pagination.totalPages
                        ? "text-gray-400 cursor-not-allowed"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => onPageChange && onPageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
