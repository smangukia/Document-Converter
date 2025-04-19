import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb"
import { AWS_REGION, DYNAMODB_TABLE } from "../config"

// Initialize DynamoDB clients
const dynamoDbClient = new DynamoDBClient({ region: AWS_REGION })
const docClient = DynamoDBDocumentClient.from(dynamoDbClient)

// Update the Conversion interface to include userId
export interface Conversion {
  id: string
  originalFilename: string
  outputFormat: string
  timestamp: string
  status: "processing" | "completed" | "failed"
  inputKey: string
  outputKey: string
  errorMessage?: string
  userId?: string // Add this line
}

// Get all conversions from DynamoDB
export async function getConversions(): Promise<Conversion[]> {
  try {
    console.log(`[DATABASE] Getting all conversions from DynamoDB table: ${DYNAMODB_TABLE}`)

    const command = new ScanCommand({
      TableName: DYNAMODB_TABLE,
    })

    const response = await docClient.send(command)
    return (response.Items as Conversion[]) || []
  } catch (error) {
    console.error("[DATABASE] Error reading conversions from DynamoDB:", error)
    return []
  }
}

// Get paginated conversions from DynamoDB
export async function getPaginatedConversions(
  page = 1,
  limit = 10,
): Promise<{ conversions: Conversion[]; total: number; totalPages: number }> {
  try {
    console.log(`[DATABASE] Getting paginated conversions from DynamoDB, page ${page}, limit ${limit}`)

    // First, get the total count of items
    const countCommand = new ScanCommand({
      TableName: DYNAMODB_TABLE,
      Select: "COUNT",
    })

    const countResponse = await docClient.send(countCommand)
    const total = countResponse.Count || 0
    const totalPages = Math.ceil(total / limit)

    // Get all items at once to ensure proper sorting and pagination
    const scanCommand = new ScanCommand({
      TableName: DYNAMODB_TABLE,
    })

    const response = await docClient.send(scanCommand)
    const allItems = (response.Items as Conversion[]) || []

    // Sort conversions by timestamp in descending order (newest first)
    const sortedConversions = [...allItems].sort((a, b) => {
      // Handle missing timestamps by treating them as oldest
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return timeB - timeA
    })

    console.log(`[DATABASE] Found ${sortedConversions.length} conversions, sorted by timestamp`)

    // Calculate the slice for the requested page
    const startIndex = (page - 1) * limit
    const endIndex = page * limit

    // Ensure we don't have duplicate IDs in the returned data
    const uniqueConversions = Array.from(new Map(sortedConversions.map((item) => [item.id, item])).values())

    console.log(`[DATABASE] After removing duplicates, found ${uniqueConversions.length} unique conversions`)

    return {
      conversions: uniqueConversions.slice(startIndex, Math.min(endIndex, uniqueConversions.length)),
      total: uniqueConversions.length,
      totalPages: Math.ceil(uniqueConversions.length / limit),
    }
  } catch (error) {
    console.error("[DATABASE] Error getting paginated conversions from DynamoDB:", error)
    return { conversions: [], total: 0, totalPages: 0 }
  }
}

// Get a specific conversion by ID from DynamoDB
export async function getConversionById(id: string): Promise<Conversion | null> {
  try {
    console.log(`[DATABASE] Getting conversion with ID ${id} from DynamoDB`)

    const command = new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: { id },
    })

    const response = await docClient.send(command)
    return (response.Item as Conversion) || null
  } catch (error) {
    console.error(`[DATABASE] Error getting conversion by ID ${id} from DynamoDB:`, error)
    return null
  }
}

// Update the saveConversion function to accept userId
export async function saveConversion(conversion: Conversion): Promise<void> {
  try {
    console.log(`[DATABASE] Saving conversion with ID ${conversion.id} to DynamoDB`)

    const command = new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: conversion,
      ConditionExpression: "attribute_not_exists(id)", // Prevent overwriting existing items
    })

    await docClient.send(command)
    console.log(`[DATABASE] Successfully saved conversion with ID ${conversion.id}`)
  } catch (error) {
    if ((error as any).name === "ConditionalCheckFailedException") {
      console.warn(`[DATABASE] Conversion with ID ${conversion.id} already exists. Skipping save.`)
    } else {
      console.error(`[DATABASE] Error saving conversion to DynamoDB:`, error)
      throw error
    }
  }
}

// Delete a conversion from DynamoDB
export async function deleteConversion(id: string): Promise<boolean> {
  try {
    console.log(`[DATABASE] Deleting conversion with ID ${id} from DynamoDB`)

    const command = new DeleteCommand({
      TableName: DYNAMODB_TABLE,
      Key: { id },
      ReturnValues: "ALL_OLD",
    })

    const response = await docClient.send(command)

    if (response.Attributes) {
      console.log(`[DATABASE] Successfully deleted conversion with ID ${id}`)
      return true
    } else {
      console.error(`[DATABASE] Conversion with ID ${id} not found for deletion`)
      return false
    }
  } catch (error) {
    console.error(`[DATABASE] Error deleting conversion from DynamoDB:`, error)
    return false
  }
}

// Update conversion status in DynamoDB
export async function updateConversionStatus(
  id: string,
  status: "processing" | "completed" | "failed",
  errorMessage?: string,
): Promise<boolean> {
  try {
    console.log(`[DATABASE] Updating conversion ${id} status to ${status} in DynamoDB`)

    // First, get the existing item to make sure we have all fields
    const getCommand = new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: { id },
    })

    const existingItem = await docClient.send(getCommand)

    if (!existingItem.Item) {
      console.error(`[DATABASE] Conversion ${id} not found for status update`)
      return false
    }

    // Build the update expression and attribute values
    let updateExpression = "SET #status = :status"
    const expressionAttributeValues: Record<string, any> = {
      ":status": status,
    }

    // Add error message if provided
    if (errorMessage) {
      updateExpression += ", errorMessage = :errorMessage"
      expressionAttributeValues[":errorMessage"] = errorMessage
    }

    // Add timestamp if not present
    if (!existingItem.Item.timestamp) {
      updateExpression += ", timestamp = :timestamp"
      expressionAttributeValues[":timestamp"] = new Date().toISOString()
    }

    const command = new UpdateCommand({
      TableName: DYNAMODB_TABLE,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        "#status": "status", // 'status' is a reserved word in DynamoDB
      },
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    })

    const response = await docClient.send(command)

    if (response.Attributes) {
      console.log(`[DATABASE] Successfully updated conversion ${id} status to ${status}`)
      return true
    } else {
      console.error(`[DATABASE] Failed to update status for conversion ${id}`)
      return false
    }
  } catch (error) {
    console.error(`[DATABASE] Error updating conversion status in DynamoDB:`, error)
    return false
  }
}

// Update the output path/key of a conversion in DynamoDB
export async function updateConversionOutputKey(id: string, outputKey: string): Promise<boolean> {
  try {
    console.log(`[DATABASE] Updating output key for conversion ${id} to ${outputKey} in DynamoDB`)

    const command = new UpdateCommand({
      TableName: DYNAMODB_TABLE,
      Key: { id },
      UpdateExpression: "SET outputKey = :outputKey",
      ExpressionAttributeValues: {
        ":outputKey": outputKey,
      },
      ReturnValues: "UPDATED_NEW",
    })

    const response = await docClient.send(command)

    if (response.Attributes) {
      console.log(`[DATABASE] Successfully updated output key for conversion ${id}`)
      return true
    } else {
      console.error(`[DATABASE] Failed to update output key for conversion ${id}`)
      return false
    }
  } catch (error) {
    console.error(`[DATABASE] Error updating conversion output key in DynamoDB:`, error)
    return false
  }
}

// Add a new function to get conversions by user ID
export async function getConversionsByUserId(
  userId: string,
  page = 1,
  limit = 10,
): Promise<{ conversions: Conversion[]; total: number; totalPages: number }> {
  try {
    console.log(`[DATABASE] Getting conversions for user ${userId}, page ${page}, limit ${limit}`)

    // Query using GSI for userId
    const queryCommand = new ScanCommand({
      TableName: DYNAMODB_TABLE,
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    })

    const response = await docClient.send(queryCommand)
    const userConversions = (response.Items as Conversion[]) || []

    // Sort conversions by timestamp in descending order (newest first)
    const sortedConversions = [...userConversions].sort((a, b) => {
      // Handle missing timestamps by treating them as oldest
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return timeB - timeA
    })

    console.log(`[DATABASE] Found ${sortedConversions.length} conversions for user ${userId}`)

    // Calculate the slice for the requested page
    const startIndex = (page - 1) * limit
    const endIndex = page * limit

    return {
      conversions: sortedConversions.slice(startIndex, Math.min(endIndex, sortedConversions.length)),
      total: sortedConversions.length,
      totalPages: Math.ceil(sortedConversions.length / limit),
    }
  } catch (error) {
    console.error(`[DATABASE] Error getting conversions for user ${userId}:`, error)
    return { conversions: [], total: 0, totalPages: 0 }
  }
}
