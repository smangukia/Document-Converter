import { convertDocument } from "./converter"
import { updateConversionStatus } from "./database"
import fs from "fs"

interface QueueItem {
  id: string
  inputPath: string
  outputPath: string
  outputFormat: string
}

// Simple in-memory queue for local development
// In AWS, this would be replaced with SQS
const queue: QueueItem[] = []
let isProcessing = false

export function addToQueue(item: QueueItem): void {
  queue.push(item)

  // Start processing if not already running
  if (!isProcessing) {
    processQueue()
  }
}

// Update the processQueue function to include error messages
export async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0) {
    return
  }

  isProcessing = true

  try {
    const item = queue.shift()
    if (!item) {
      isProcessing = false
      return
    }

    console.log(`Processing conversion: ${item.id}`)
    console.log(`Input path: ${item.inputPath}`)
    console.log(`Output path: ${item.outputPath}`)
    console.log(`Output format: ${item.outputFormat}`)

    // Check if input file exists
    if (!fs.existsSync(item.inputPath)) {
      console.error(`Input file does not exist: ${item.inputPath}`)
      await updateConversionStatus(item.id, "failed", "Input file not found")
      isProcessing = false
      return
    }

    try {
      const success = await convertDocument({
        inputPath: item.inputPath,
        outputPath: item.outputPath,
        outputFormat: item.outputFormat,
      })

      // Update conversion status in database
      await updateConversionStatus(
        item.id,
        success ? "completed" : "failed",
        success ? undefined : "Conversion process failed",
      )

      console.log(`Conversion ${item.id} ${success ? "completed" : "failed"}`)

      if (!success) {
        console.error(`Conversion failed for ${item.id}. Check if the output file exists at ${item.outputPath}`)
        try {
          const fileExists = fs.existsSync(item.outputPath)
          console.log(`Output file exists: ${fileExists}`)
        } catch (err) {
          console.error(`Error checking output file: ${err}`)
        }
      }
    } catch (error) {
      console.error(`Error during conversion: ${error}`)
      await updateConversionStatus(
        item.id,
        "failed",
        error instanceof Error ? error.message : "Unknown error during conversion",
      )
    }
  } catch (error) {
    console.error("Error processing queue item:", error)
  } finally {
    isProcessing = false

    // Process next item if available
    if (queue.length > 0) {
      processQueue()
    }
  }
}
