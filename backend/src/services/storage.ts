import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import fs from "fs"
import path from "path"
import os from "os"
import { AWS_REGION, S3_BUCKET_NAME } from "../config"

// Initialize S3 client
const s3Client = new S3Client({ region: AWS_REGION })

// Helper function to create user-specific key path
function getUserSpecificKey(key: string, userId?: string): string {
  if (!userId) {
    return key // If no userId, use the original key
  }

  // Split the key into parts
  const keyParts = key.split("/")

  // If the key already has a folder structure (like uploads/file.txt)
  if (keyParts.length > 1) {
    // Insert userId after the first folder
    // e.g., uploads/file.txt becomes uploads/user123/file.txt
    return `${keyParts[0]}/${userId}/${keyParts.slice(1).join("/")}`
  }

  // If the key is just a filename, add userId folder
  return `${userId}/${key}`
}

// Upload a file to S3
export async function uploadFile(
  filePath: string,
  key: string,
  contentType?: string,
  userId?: string,
): Promise<boolean> {
  try {
    // Create user-specific key
    const userKey = getUserSpecificKey(key, userId)

    console.log(`[STORAGE] Uploading file from ${filePath} to S3 bucket ${S3_BUCKET_NAME} with key ${userKey}`)

    // Read the file
    const fileContent = fs.readFileSync(filePath)

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: userKey,
      Body: fileContent,
      ContentType: contentType,
    })

    await s3Client.send(command)
    console.log(`[STORAGE] Successfully uploaded file to S3: ${userKey}`)
    return true
  } catch (error) {
    console.error(`[STORAGE] Error uploading file to S3:`, error)
    return false
  }
}

// Upload a buffer to S3
export async function uploadBuffer(
  buffer: Buffer,
  key: string,
  contentType?: string,
  userId?: string,
): Promise<boolean> {
  try {
    // Create user-specific key
    const userKey = getUserSpecificKey(key, userId)

    console.log(`[STORAGE] Uploading buffer to S3 bucket ${S3_BUCKET_NAME} with key ${userKey}`)

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: userKey,
      Body: buffer,
      ContentType: contentType,
    })

    await s3Client.send(command)
    console.log(`[STORAGE] Successfully uploaded buffer to S3: ${userKey}`)
    return true
  } catch (error) {
    console.error(`[STORAGE] Error uploading buffer to S3:`, error)
    return false
  }
}

// Download a file from S3 to a local path
export async function downloadFile(key: string, outputPath: string, userId?: string): Promise<boolean> {
  try {
    // Create user-specific key
    const userKey = getUserSpecificKey(key, userId)

    console.log(`[STORAGE] Downloading file from S3 bucket ${S3_BUCKET_NAME} with key ${userKey} to ${outputPath}`)

    // Create the directory if it doesn't exist
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Get the object from S3
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: userKey,
    })

    const response = await s3Client.send(command)

    // Write the file to disk
    const writeStream = fs.createWriteStream(outputPath)

    if (response.Body) {
      // @ts-ignore - TypeScript doesn't recognize the pipe method on the Body
      response.Body.pipe(writeStream)

      return new Promise((resolve, reject) => {
        writeStream.on("finish", () => {
          console.log(`[STORAGE] Successfully downloaded file from S3: ${userKey}`)
          resolve(true)
        })

        writeStream.on("error", (err) => {
          console.error(`[STORAGE] Error writing downloaded file:`, err)
          reject(false)
        })
      })
    } else {
      console.error(`[STORAGE] No body in S3 response for key: ${userKey}`)
      return false
    }
  } catch (error) {
    console.error(`[STORAGE] Error downloading file from S3:`, error)
    return false
  }
}

// Get a temporary file path in the OS temp directory
export function getTempFilePath(prefix: string, extension: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  return path.join(tempDir, `file${extension ? `.${extension}` : ""}`)
}

// Delete a file from S3
export async function deleteFile(key: string, userId?: string): Promise<boolean> {
  try {
    // Create user-specific key
    const userKey = getUserSpecificKey(key, userId)

    console.log(`[STORAGE] Deleting file from S3 bucket ${S3_BUCKET_NAME} with key ${userKey}`)

    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: userKey,
    })

    await s3Client.send(command)
    console.log(`[STORAGE] Successfully deleted file from S3: ${userKey}`)
    return true
  } catch (error) {
    console.error(`[STORAGE] Error deleting file from S3:`, error)
    return false
  }
}

// Generate a pre-signed URL for downloading a file
export async function getDownloadUrl(
  key: string,
  filename: string,
  expiresIn = 3600,
  userId?: string,
): Promise<string> {
  try {
    // Create user-specific key
    const userKey = getUserSpecificKey(key, userId)

    console.log(`[STORAGE] Generating pre-signed URL for S3 bucket ${S3_BUCKET_NAME} with key ${userKey}`)

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: userKey,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    })

    const url = await getSignedUrl(s3Client, command, { expiresIn })
    console.log(`[STORAGE] Successfully generated pre-signed URL for: ${userKey}`)
    return url
  } catch (error) {
    console.error(`[STORAGE] Error generating pre-signed URL:`, error)
    throw error
  }
}

// Get a file from S3 as a buffer
export async function getFileAsBuffer(key: string, userId?: string): Promise<Buffer> {
  try {
    // Create user-specific key
    const userKey = getUserSpecificKey(key, userId)

    console.log(`[STORAGE] Getting file from S3 bucket ${S3_BUCKET_NAME} with key ${userKey} as buffer`)

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: userKey,
    })

    const response = await s3Client.send(command)

    if (!response.Body) {
      throw new Error(`No body in S3 response for key: ${userKey}`)
    }

    // Convert the readable stream to a buffer
    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as any) {
      chunks.push(chunk)
    }

    return Buffer.concat(chunks)
  } catch (error) {
    console.error(`[STORAGE] Error getting file from S3 as buffer:`, error)
    throw error
  }
}
