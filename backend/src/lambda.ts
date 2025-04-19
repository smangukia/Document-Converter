import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { convertDocument } from "./services/converter"
import { v4 as uuidv4 } from "uuid"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

// Initialize AWS clients
const s3Client = new S3Client()
const dynamoDbClient = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(dynamoDbClient)
const sqsClient = new SQSClient()

// Environment variables
const DOCUMENT_BUCKET = process.env.DOCUMENT_BUCKET || ""
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || ""
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || ""

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

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  try {
    // Determine the request type
    const path = event.path
    const method = event.httpMethod

    if (path === "/convert" && method === "POST") {
      return await handleConversion(event)
    } else if (path.startsWith("/conversions") && method === "GET") {
      return await handleGetConversions(event)
    } else if (path.startsWith("/download/") && method === "GET") {
      return await handleDownload(event)
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Not found" }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    }
  } catch (error) {
    console.error("Error handling request:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  }
}

async function handleConversion(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No data provided" }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    }

    // Parse multipart form data
    const boundary = getBoundary(event.headers["content-type"] || "")
    const parts = parseMultipartForm(event.body, boundary)

    const file = parts.find((part) => part.filename)
    const outputFormat = parts.find((part) => part.name === "outputFormat")?.value
    const userId = parts.find((part) => part.name === "userId")?.value // Extract userId from form data

    if (!file || !outputFormat) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "File and output format are required" }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    }

    const conversionId = uuidv4()
    const originalFilename = file.filename || "unknown"

    // Create base paths
    const baseInputKey = `uploads/${conversionId}-${originalFilename}`
    const baseOutputKey = `outputs/${conversionId}.${outputFormat}`

    // Create user-specific paths if userId is provided
    const inputKey = userId ? getUserSpecificKey(baseInputKey, userId) : baseInputKey
    const outputKey = userId ? getUserSpecificKey(baseOutputKey, userId) : baseOutputKey

    // Upload file to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: DOCUMENT_BUCKET,
        Key: inputKey,
        Body: Buffer.from(file.content, "binary"),
        ContentType: file.contentType,
      }),
    )

    // Save conversion record to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          id: conversionId,
          originalFilename,
          outputFormat,
          timestamp: new Date().toISOString(),
          status: "processing",
          inputKey,
          outputKey,
          userId: userId || null, // Store userId in the record
        },
      }),
    )

    // Send message to SQS queue
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MessageBody: JSON.stringify({
          id: conversionId,
          inputKey,
          outputKey,
          outputFormat,
          userId, // Include userId in the message
        }),
      }),
    )

    // For demo purposes, process the conversion immediately
    // In production, this would be handled by a separate worker
    await processConversion(conversionId, inputKey, outputKey, outputFormat, userId)

    // Return the conversion ID
    return {
      statusCode: 200,
      body: JSON.stringify({ id: conversionId }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  } catch (error) {
    console.error("Error handling conversion:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Conversion failed" }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  }
}

async function handleGetConversions(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Get userId from query parameters
    const userId = event.queryStringParameters?.userId

    const queryParams: any = {
      TableName: DYNAMODB_TABLE,
      IndexName: "timestamp-index",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": "completed",
      },
      ScanIndexForward: false, // Sort by timestamp in descending order
      Limit: 50,
    }

    // If userId is provided, filter by userId
    if (userId) {
      queryParams.FilterExpression = "userId = :userId"
      queryParams.ExpressionAttributeValues[":userId"] = userId
    }

    // Query DynamoDB for conversions
    const result = await docClient.send(new QueryCommand(queryParams))

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items || []),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  } catch (error) {
    console.error("Error fetching conversions:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch conversions" }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  }
}

async function handleDownload(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const id = event.pathParameters?.id

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Conversion ID is required" }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    }

    // Get conversion record from DynamoDB
    const result = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { id },
      }),
    )

    const conversion = result.Item

    if (!conversion) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Conversion not found" }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    }

    if (conversion.status !== "completed") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Conversion not completed" }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    }

    // Get file from S3 using the stored outputKey (which already includes the user path)
    const s3Response = await s3Client.send(
      new GetObjectCommand({
        Bucket: DOCUMENT_BUCKET,
        Key: conversion.outputKey,
      }),
    )

    // Stream response body to buffer
    const chunks: Uint8Array[] = []
    for await (const chunk of s3Response.Body as any) {
      chunks.push(chunk)
    }
    const fileContent = Buffer.concat(chunks).toString("base64")

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
    }

    return {
      statusCode: 200,
      body: fileContent,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${conversion.originalFilename.split(".")[0]}.${conversion.outputFormat}"`,
        "Access-Control-Allow-Origin": "*",
      },
      isBase64Encoded: true,
    }
  } catch (error) {
    console.error("Error downloading file:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to download file" }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  }
}

async function processConversion(
  id: string,
  inputKey: string,
  outputKey: string,
  outputFormat: string,
  userId?: string,
): Promise<void> {
  try {
    // Create temporary directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "conversion-"))
    const inputPath = path.join(tempDir, "input")
    const outputPath = path.join(tempDir, "output")

    // Download file from S3
    const s3Response = await s3Client.send(
      new GetObjectCommand({
        Bucket: DOCUMENT_BUCKET,
        Key: inputKey,
      }),
    )

    // Stream response body to file
    const writeStream = fs.createWriteStream(inputPath)
    for await (const chunk of s3Response.Body as any) {
      writeStream.write(chunk)
    }
    writeStream.end()

    // Convert document
    const success = await convertDocument({
      inputPath,
      outputPath,
      outputFormat,
    })

    if (success) {
      // Upload converted file to S3
      const fileContent = fs.readFileSync(outputPath)
      await s3Client.send(
        new PutObjectCommand({
          Bucket: DOCUMENT_BUCKET,
          Key: outputKey,
          Body: fileContent,
        }),
      )

      // Update conversion status in DynamoDB
      await docClient.send(
        new PutCommand({
          TableName: DYNAMODB_TABLE,
          Item: {
            id,
            status: "completed",
          },
        }),
      )
    } else {
      // Update conversion status in DynamoDB
      await docClient.send(
        new PutCommand({
          TableName: DYNAMODB_TABLE,
          Item: {
            id,
            status: "failed",
          },
        }),
      )
    }

    // Clean up temporary files
    fs.unlinkSync(inputPath)
    fs.unlinkSync(outputPath)
    fs.rmdirSync(tempDir)
  } catch (error) {
    console.error("Error processing conversion:", error)

    // Update conversion status in DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          id,
          status: "failed",
        },
      }),
    )
  }
}

// Helper functions for parsing multipart form data
function getBoundary(contentType: string): string {
  const matches = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  if (!matches) {
    throw new Error("No boundary found in content type")
  }
  return matches[1] || matches[2]
}

function parseMultipartForm(
  body: string,
  boundary: string,
): Array<{
  name?: string
  filename?: string
  contentType?: string
  content: string
  value?: string
}> {
  const parts: Array<{
    name?: string
    filename?: string
    contentType?: string
    content: string
    value?: string
  }> = []

  const boundaryDelimiter = `--${boundary}`
  const endDelimiter = `--${boundary}--`

  // Split the body into parts
  const bodyParts = body.split(boundaryDelimiter)

  // Process each part
  for (let i = 1; i < bodyParts.length; i++) {
    const part = bodyParts[i]

    // Skip the end delimiter
    if (part.trim() === "--") {
      continue
    }

    // Split the part into headers and content
    const [headersPart, ...contentParts] = part.split("\r\n\r\n")
    const content = contentParts.join("\r\n\r\n").trim()

    // Parse headers
    const headers: Record<string, string> = {}
    headersPart.split("\r\n").forEach((line) => {
      if (line.includes(":")) {
        const [key, value] = line.split(":")
        headers[key.trim().toLowerCase()] = value.trim()
      }
    })

    // Extract content disposition
    const contentDisposition = headers["content-disposition"] || ""
    const nameMatch = contentDisposition.match(/name="([^"]+)"/)
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)

    const partData: {
      name?: string
      filename?: string
      contentType?: string
      content: string
      value?: string
    } = {
      content,
    }

    if (nameMatch) {
      partData.name = nameMatch[1]
    }

    if (filenameMatch) {
      partData.filename = filenameMatch[1]
      partData.contentType = headers["content-type"]
    } else {
      partData.value = content
    }

    parts.push(partData)
  }

  return parts
}
