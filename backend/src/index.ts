import express from "express"
import cors from "cors"
import multer from "multer"
import { v4 as uuidv4 } from "uuid"
import path from "path"
import fs from "fs"
import os from "os"
import { PORT } from "./config"
import { convertDocument } from "./services/converter"
import {
  getPaginatedConversions,
  getConversionById,
  saveConversion,
  deleteConversion,
  updateConversionStatus,
  getConversionsByUserId,
} from "./services/database"
import { uploadFile, getTempFilePath, deleteFile } from "./services/storage"
// Add this import near the top with other imports
import userRoutes from "./routes/users"

// Create Express app
const app = express()

// Configure middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-"))
      cb(null, tempDir)
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname)
    },
  }),
})

// Create uploads and outputs directories if they don't exist
const uploadsDir = path.join(__dirname, "../uploads")
const outputsDir = path.join(__dirname, "../outputs")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true })
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" })
})

// Convert document endpoint
app.post("/api/convert", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const outputFormat = req.body.outputFormat
    if (!outputFormat) {
      return res.status(400).json({ error: "Output format is required" })
    }

    const createRecordOnly = req.body.createRecordOnly === "true"
    const useExistingRecord = req.body.useExistingRecord === "true"
    const conversionId = req.body.conversionId || uuidv4()
    const userId = req.body.userId // Add this line to get userId from request

    // Get file details
    const originalFilename = req.file.originalname
    const inputPath = req.file.path
    const fileExtension = path.extname(originalFilename).toLowerCase()
    const inputExtension = fileExtension.substring(1) // Remove the dot

    // Define S3 keys
    const inputKey = `uploads/${conversionId}${fileExtension}`
    const outputKey = `outputs/${conversionId}.${outputFormat}`

    // Upload input file to S3
    await uploadFile(inputPath, inputKey, req.file.mimetype)

    // If we're just creating a record, save it and return
    if (createRecordOnly) {
      await saveConversion({
        id: conversionId,
        originalFilename,
        outputFormat,
        timestamp: new Date().toISOString(),
        status: "processing",
        inputKey,
        outputKey,
        userId, // Add this line to include userId
      })

      return res.status(200).json({ id: conversionId })
    }

    // If we're using an existing record, we don't need to create a new one
    if (!useExistingRecord) {
      // Save conversion record to database
      await saveConversion({
        id: conversionId,
        originalFilename,
        outputFormat,
        timestamp: new Date().toISOString(),
        status: "processing",
        inputKey,
        outputKey,
        userId, // Add this line to include userId
      })
    }

    // Create temporary output path
    const tempOutputPath = getTempFilePath("output-", outputFormat)

    // Convert the document
    const success = await convertDocument({
      inputPath,
      outputPath: tempOutputPath,
      outputFormat,
    })

    if (success) {
      // Upload the converted file to S3
      await uploadFile(tempOutputPath, outputKey)

      // Update conversion status
      // Update conversion status with all required fields to ensure it appears in history
      const conversion = await getConversionById(conversionId)
      if (conversion) {
        // Only update the status if we found the conversion
        await updateConversionStatus(conversionId, "completed")
        console.log(`Successfully updated conversion status for ${conversionId} to completed`)
      } else {
        // If the conversion doesn't exist, create a new record
        console.log(`Creating new conversion record for ${conversionId}`)
        await saveConversion({
          id: conversionId,
          originalFilename,
          outputFormat,
          timestamp: new Date().toISOString(),
          status: "completed",
          inputKey,
          outputKey,
        })
      }

      // Send the file as a response
      res.download(tempOutputPath, `${path.basename(originalFilename, fileExtension)}.${outputFormat}`, (err) => {
        if (err) {
          console.error("Error sending file:", err)
        }

        // Clean up temporary files
        try {
          fs.unlinkSync(inputPath)
          fs.unlinkSync(tempOutputPath)
        } catch (cleanupError) {
          console.error("Error cleaning up temporary files:", cleanupError)
        }
      })
    } else {
      // Update conversion status to failed
      await updateConversionStatus(conversionId, "failed", "Conversion failed")

      // Clean up temporary files
      try {
        fs.unlinkSync(inputPath)
        if (fs.existsSync(tempOutputPath)) {
          fs.unlinkSync(tempOutputPath)
        }
      } catch (cleanupError) {
        console.error("Error cleaning up temporary files:", cleanupError)
      }

      res.status(500).json({ error: "Conversion failed" })
    }
  } catch (error) {
    console.error("Error in /api/convert:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get conversions endpoint
app.get("/api/conversions", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page as string) || 1
    const limit = Number.parseInt(req.query.limit as string) || 10
    const userId = req.query.userId as string // Add this line to get userId from query

    // Add cache busting to prevent stale data
    const cacheBuster = req.query._ ? true : false
    console.log(
      `Fetching conversions page ${page}, limit ${limit}${cacheBuster ? " (cache busting)" : ""}${userId ? ` for user ${userId}` : ""}`,
    )

    let result
    if (userId) {
      // If userId is provided, get conversions for that user
      result = await getConversionsByUserId(userId, page, limit)
    } else {
      // Otherwise, get all conversions
      result = await getPaginatedConversions(page, limit)
    }

    res.status(200).json({
      conversions: result.conversions,
      pagination: {
        total: result.total,
        page,
        limit,
        totalPages: result.totalPages,
      },
    })
  } catch (error) {
    console.error("Error in /api/conversions:", error)
    res.status(500).json({ error: "Failed to fetch conversions" })
  }
})

// Delete conversion endpoint
app.delete("/api/conversions/:id", async (req, res) => {
  try {
    const id = req.params.id

    // Get the conversion to find the file keys
    const conversion = await getConversionById(id)
    if (!conversion) {
      return res.status(404).json({ error: "Conversion not found" })
    }

    // Delete the files from S3
    if (conversion.inputKey) {
      await deleteFile(conversion.inputKey)
    }
    if (conversion.outputKey) {
      await deleteFile(conversion.outputKey)
    }

    // Delete the conversion record
    const success = await deleteConversion(id)
    if (success) {
      res.status(200).json({ message: "Conversion deleted successfully" })
    } else {
      res.status(500).json({ error: "Failed to delete conversion" })
    }
  } catch (error) {
    console.error("Error in DELETE /api/conversions/:id:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Download converted file endpoint
app.get("/api/download/:id", async (req, res) => {
  try {
    const id = req.params.id

    // Get the conversion
    const conversion = await getConversionById(id)
    if (!conversion) {
      return res.status(404).json({ error: "Conversion not found" })
    }

    if (conversion.status !== "completed") {
      return res.status(400).json({ error: "Conversion not completed" })
    }

    // Import the getFileAsBuffer function
    const { getFileAsBuffer } = require("./services/storage")

    try {
      // Get the file content as a buffer
      const fileBuffer = await getFileAsBuffer(conversion.outputKey)

      // Set appropriate headers
      const filename = `${path.basename(conversion.originalFilename, path.extname(conversion.originalFilename))}.${conversion.outputFormat}`

      // Determine content type based on output format
      let contentType = "application/octet-stream"
      if (conversion.outputFormat === "html") {
        contentType = "text/html"
      } else if (conversion.outputFormat === "pdf") {
        contentType = "application/pdf"
      } else if (conversion.outputFormat === "md") {
        contentType = "text/markdown"
      } else if (conversion.outputFormat === "txt") {
        contentType = "text/plain"
      } else if (conversion.outputFormat === "docx") {
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }

      res.setHeader("Content-Type", contentType)
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`)
      res.setHeader("Content-Length", fileBuffer.length)

      // Send the file
      res.send(fileBuffer)
    } catch (error) {
      console.error("Error downloading file from S3:", error)
      res.status(500).json({ error: "Failed to download file" })
    }
  } catch (error) {
    console.error("Error in /api/download/:id:", error)
    res.status(500).json({ error: "Failed to download file" })
  }
})

// Update conversion status endpoint
app.post("/api/update-status/:id", async (req, res) => {
  try {
    const id = req.params.id
    const { status, errorMessage } = req.body

    if (!status || !["processing", "completed", "failed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" })
    }

    const success = await updateConversionStatus(id, status, errorMessage)
    if (success) {
      res.status(200).json({ message: "Status updated successfully" })
    } else {
      res.status(500).json({ error: "Failed to update status" })
    }
  } catch (error) {
    console.error("Error in /api/update-status/:id:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Word to PDF conversion endpoint
app.post("/api/word-to-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const conversionId = req.body.conversionId || uuidv4()
    const originalFilename = req.file.originalname
    const inputPath = req.file.path
    const fileExtension = path.extname(originalFilename).toLowerCase()
    const outputFormat = "pdf"

    // Define S3 keys
    const inputKey = `uploads/${conversionId}${fileExtension}`
    const outputKey = `outputs/${conversionId}.${outputFormat}`

    // Upload input file to S3
    await uploadFile(inputPath, inputKey, req.file.mimetype)

    // If conversionId was provided, we're using an existing record
    if (!req.body.conversionId) {
      // Save conversion record to database
      await saveConversion({
        id: conversionId,
        originalFilename,
        outputFormat,
        timestamp: new Date().toISOString(),
        status: "processing",
        inputKey,
        outputKey,
      })
    }

    // Create temporary output path
    const tempOutputPath = getTempFilePath("output-", outputFormat)

    // First convert to HTML, then to PDF
    const tempHtmlPath = getTempFilePath("html-", "html")

    const inputExtension = fileExtension.substring(1).toLowerCase()
    let htmlConversionSuccess = false

    if (inputExtension === "docx" || inputExtension === "doc") {
      htmlConversionSuccess = await convertDocument({
        inputPath,
        outputPath: tempHtmlPath,
        outputFormat: "html",
      })
    }

    if (!htmlConversionSuccess) {
      await updateConversionStatus(conversionId, "failed", "HTML conversion failed")
      return res.status(500).json({ error: "HTML conversion failed" })
    }

    // Convert HTML to PDF
    const success = await convertDocument({
      inputPath: tempHtmlPath,
      outputPath: tempOutputPath,
      outputFormat: "pdf",
    })

    if (success) {
      // Upload the converted file to S3
      await uploadFile(tempOutputPath, outputKey, "application/pdf")

      // Update conversion status
      await updateConversionStatus(conversionId, "completed")

      // Send the file as a response
      res.download(tempOutputPath, `${path.basename(originalFilename, fileExtension)}.pdf`, (err) => {
        if (err) {
          console.error("Error sending file:", err)
        }

        // Clean up temporary files
        try {
          fs.unlinkSync(inputPath)
          fs.unlinkSync(tempHtmlPath)
          fs.unlinkSync(tempOutputPath)
        } catch (cleanupError) {
          console.error("Error cleaning up temporary files:", cleanupError)
        }
      })
    } else {
      // Update conversion status to failed
      await updateConversionStatus(conversionId, "failed", "PDF conversion failed")

      // Clean up temporary files
      try {
        fs.unlinkSync(inputPath)
        fs.unlinkSync(tempHtmlPath)
        if (fs.existsSync(tempOutputPath)) {
          fs.unlinkSync(tempOutputPath)
        }
      } catch (cleanupError) {
        console.error("Error cleaning up temporary files:", cleanupError)
      }

      res.status(500).json({ error: "PDF conversion failed" })
    }
  } catch (error) {
    console.error("Error in /api/word-to-pdf:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// HTML to PDF conversion endpoint
app.post("/api/html-to-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const conversionId = req.body.conversionId || uuidv4()
    const originalFilename = req.file.originalname
    const inputPath = req.file.path
    const fileExtension = path.extname(originalFilename).toLowerCase()
    const outputFormat = "pdf"

    // Define S3 keys
    const inputKey = `uploads/${conversionId}${fileExtension}`
    const outputKey = `outputs/${conversionId}.${outputFormat}`

    // Upload input file to S3
    await uploadFile(inputPath, inputKey, req.file.mimetype)

    // If conversionId was provided, we're using an existing record
    if (!req.body.conversionId) {
      // Save conversion record to database
      await saveConversion({
        id: conversionId,
        originalFilename,
        outputFormat,
        timestamp: new Date().toISOString(),
        status: "processing",
        inputKey,
        outputKey,
      })
    }

    // Create temporary output path
    const tempOutputPath = getTempFilePath("output-", outputFormat)

    // Convert HTML to PDF
    const success = await convertDocument({
      inputPath,
      outputPath: tempOutputPath,
      outputFormat: "pdf",
    })

    if (success) {
      // Upload the converted file to S3
      await uploadFile(tempOutputPath, outputKey, "application/pdf")

      // Update conversion status
      await updateConversionStatus(conversionId, "completed")

      // Send the file as a response
      res.download(tempOutputPath, `${path.basename(originalFilename, fileExtension)}.pdf`, (err) => {
        if (err) {
          console.error("Error sending file:", err)
        }

        // Clean up temporary files
        try {
          fs.unlinkSync(inputPath)
          fs.unlinkSync(tempOutputPath)
        } catch (cleanupError) {
          console.error("Error cleaning up temporary files:", cleanupError)
        }
      })
    } else {
      // Update conversion status to failed
      await updateConversionStatus(conversionId, "failed", "PDF conversion failed")

      // Clean up temporary files
      try {
        fs.unlinkSync(inputPath)
        if (fs.existsSync(tempOutputPath)) {
          fs.unlinkSync(tempOutputPath)
        }
      } catch (cleanupError) {
        console.error("Error cleaning up temporary files:", cleanupError)
      }

      res.status(500).json({ error: "PDF conversion failed" })
    }
  } catch (error) {
    console.error("Error in /api/html-to-pdf:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Markdown to PDF conversion endpoint
app.post("/api/markdown-to-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const conversionId = req.body.conversionId || uuidv4()
    const originalFilename = req.file.originalname
    const inputPath = req.file.path
    const fileExtension = path.extname(originalFilename).toLowerCase()
    const outputFormat = "pdf"

    // Define S3 keys
    const inputKey = `uploads/${conversionId}${fileExtension}`
    const outputKey = `outputs/${conversionId}.${outputFormat}`

    // Upload input file to S3
    await uploadFile(inputPath, inputKey, req.file.mimetype)

    // If conversionId was provided, we're using an existing record
    if (!req.body.conversionId) {
      // Save conversion record to database
      await saveConversion({
        id: conversionId,
        originalFilename,
        outputFormat,
        timestamp: new Date().toISOString(),
        status: "processing",
        inputKey,
        outputKey,
      })
    }

    // Create temporary output paths
    const tempHtmlPath = getTempFilePath("html-", "html")
    const tempOutputPath = getTempFilePath("output-", outputFormat)

    // First convert Markdown to HTML
    const htmlConversionSuccess = await convertDocument({
      inputPath,
      outputPath: tempHtmlPath,
      outputFormat: "html",
    })

    if (!htmlConversionSuccess) {
      await updateConversionStatus(conversionId, "failed", "HTML conversion failed")
      return res.status(500).json({ error: "HTML conversion failed" })
    }

    // Then convert HTML to PDF
    const success = await convertDocument({
      inputPath: tempHtmlPath,
      outputPath: tempOutputPath,
      outputFormat: "pdf",
    })

    if (success) {
      // Upload the converted file to S3
      await uploadFile(tempOutputPath, outputKey, "application/pdf")

      // Update conversion status
      await updateConversionStatus(conversionId, "completed")

      // Send the file as a response
      res.download(tempOutputPath, `${path.basename(originalFilename, fileExtension)}.pdf`, (err) => {
        if (err) {
          console.error("Error sending file:", err)
        }

        // Clean up temporary files
        try {
          fs.unlinkSync(inputPath)
          fs.unlinkSync(tempHtmlPath)
          fs.unlinkSync(tempOutputPath)
        } catch (cleanupError) {
          console.error("Error cleaning up temporary files:", cleanupError)
        }
      })
    } else {
      // Update conversion status to failed
      await updateConversionStatus(conversionId, "failed", "PDF conversion failed")

      // Clean up temporary files
      try {
        fs.unlinkSync(inputPath)
        fs.unlinkSync(tempHtmlPath)
        if (fs.existsSync(tempOutputPath)) {
          fs.unlinkSync(tempOutputPath)
        }
      } catch (cleanupError) {
        console.error("Error cleaning up temporary files:", cleanupError)
      }

      res.status(500).json({ error: "PDF conversion failed" })
    }
  } catch (error) {
    console.error("Error in /api/markdown-to-pdf:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Add a new endpoint for debugging Puppeteer issues
app.get("/api/debug-puppeteer", async (req, res) => {
  try {
    console.log("Testing Puppeteer setup...")

    const puppeteer = require("puppeteer")
    const { getPuppeteerLaunchOptions } = require("./services/converter")

    console.log("Puppeteer launch options:", JSON.stringify(getPuppeteerLaunchOptions()))

    console.log("Launching browser...")
    const browser = await puppeteer.launch(getPuppeteerLaunchOptions())

    console.log("Creating new page...")
    const page = await browser.newPage()

    console.log("Setting content...")
    await page.setContent("<html><body><h1>Test Page</h1></body></html>")

    console.log("Creating temp file path...")
    const tempPdfPath = path.join(os.tmpdir(), `test-${Date.now()}.pdf`)

    console.log("Generating PDF...")
    await page.pdf({
      path: tempPdfPath,
      format: "A4",
    })

    console.log("Closing browser...")
    await browser.close()

    console.log("Checking if PDF was created...")
    if (fs.existsSync(tempPdfPath)) {
      const stats = fs.statSync(tempPdfPath)
      console.log(`PDF created successfully: ${tempPdfPath} (${stats.size} bytes)`)

      res.status(200).json({
        success: true,
        message: "Puppeteer test successful",
        pdfSize: stats.size,
      })

      // Clean up
      fs.unlinkSync(tempPdfPath)
    } else {
      console.error("PDF file was not created")
      res.status(500).json({
        success: false,
        message: "PDF file was not created",
      })
    }
  } catch (error) {
    console.error("Error testing Puppeteer:", error)
    res.status(500).json({
      success: false,
      message: "Puppeteer test failed",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

// Add a new debug endpoint for PDF generation
app.get("/api/debug-pdf", async (req, res) => {
  try {
    console.log("Testing PDF generation...")

    // Create a simple HTML file
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "debug-pdf-"))
    const htmlPath = path.join(tempDir, "test.html")
    const pdfPath = path.join(tempDir, "test.pdf")

    // Create a simple HTML file
    fs.writeFileSync(
      htmlPath,
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>PDF Test</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #2563eb; }
        </style>
      </head>
      <body>
        <h1>PDF Generation Test</h1>
        <p>This is a test document to verify PDF generation is working correctly.</p>
        <p>Generated at: ${new Date().toISOString()}</p>
      </body>
      </html>
    `,
    )

    // Import the converter function
    const { convertHtmlToPdf } = require("./services/converter")

    // Try to convert the HTML to PDF
    console.log("Converting HTML to PDF...")
    const success = await convertHtmlToPdf(htmlPath, pdfPath)

    if (success && fs.existsSync(pdfPath)) {
      console.log("PDF generated successfully")

      // Send the PDF file
      res.sendFile(pdfPath, {}, (err) => {
        if (err) {
          console.error("Error sending PDF file:", err)
        }

        // Clean up
        try {
          fs.unlinkSync(htmlPath)
          fs.unlinkSync(pdfPath)
          fs.rmdirSync(tempDir)
        } catch (cleanupErr) {
          console.error("Error cleaning up:", cleanupErr)
        }
      })
    } else {
      console.error("Failed to generate PDF")
      res.status(500).json({ error: "Failed to generate PDF" })

      // Clean up
      try {
        fs.unlinkSync(htmlPath)
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath)
        }
        fs.rmdirSync(tempDir)
      } catch (cleanupErr) {
        console.error("Error cleaning up:", cleanupErr)
      }
    }
  } catch (error) {
    console.error("Error in debug-pdf endpoint:", error)
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

// Add this line after other app.use() statements but before the routes
app.use(userRoutes)

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
