import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { AWS_REGION } from "../config"

// Initialize DynamoDB clients
const dynamoDbClient = new DynamoDBClient({ region: AWS_REGION })
const docClient = DynamoDBDocumentClient.from(dynamoDbClient)

// Define the users table name
const USERS_TABLE = process.env.USERS_TABLE || "document-converter-users"

// Add a simple in-memory cache to reduce database reads
const userCache = new Map<string, { user: User; timestamp: number }>()
const CACHE_TTL = 300000 // 5 minutes in milliseconds

export interface User {
  id: string // This will be the Supabase user ID
  email: string
  name?: string
  avatar_url?: string
  provider?: string
  last_login: string
  created_at: string
  updated_at: string
}

// Save or update a user in DynamoDB
export async function saveUser(user: User): Promise<boolean> {
  try {
    console.log(`[USERS] Saving user with ID ${user.id} to DynamoDB`)

    const command = new PutCommand({
      TableName: USERS_TABLE,
      Item: user,
    })

    await docClient.send(command)

    // Update cache
    userCache.set(user.id, { user, timestamp: Date.now() })

    console.log(`[USERS] Successfully saved user with ID ${user.id}`)
    return true
  } catch (error) {
    console.error(`[USERS] Error saving user to DynamoDB:`, error)
    return false
  }
}

// Get a user by ID from DynamoDB with caching
export async function getUserById(id: string): Promise<User | null> {
  try {
    // Check cache first
    const cachedData = userCache.get(id)
    const now = Date.now()

    if (cachedData && now - cachedData.timestamp < CACHE_TTL) {
      console.log(`[USERS] Using cached data for user ${id}`)
      return cachedData.user
    }

    console.log(`[USERS] Getting user with ID ${id} from DynamoDB`)

    const command = new GetCommand({
      TableName: USERS_TABLE,
      Key: { id },
    })

    const response = await docClient.send(command)
    const user = response.Item as User

    if (user) {
      // Update cache
      userCache.set(id, { user, timestamp: now })
    }

    return user || null
  } catch (error) {
    console.error(`[USERS] Error getting user by ID ${id} from DynamoDB:`, error)
    return null
  }
}

// Get a user by email from DynamoDB
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    console.log(`[USERS] Getting user with email ${email} from DynamoDB`)

    // Use a GSI (Global Secondary Index) to query by email
    const command = new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: "email-index",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": email,
      },
    })

    const response = await docClient.send(command)

    if (response.Items && response.Items.length > 0) {
      const user = response.Items[0] as User
      // Update cache
      userCache.set(user.id, { user, timestamp: Date.now() })
      return user
    }

    return null
  } catch (error) {
    console.error(`[USERS] Error getting user by email ${email} from DynamoDB:`, error)
    return null
  }
}

// Update user's last login time
export async function updateUserLastLogin(id: string): Promise<boolean> {
  try {
    console.log(`[USERS] Updating last login time for user ${id}`)

    const now = new Date().toISOString()

    const command = new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { id },
      UpdateExpression: "SET last_login = :lastLogin, updated_at = :updatedAt",
      ExpressionAttributeValues: {
        ":lastLogin": now,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    })

    const response = await docClient.send(command)

    if (response.Attributes) {
      // Update cache with the updated user
      userCache.set(id, {
        user: response.Attributes as User,
        timestamp: Date.now(),
      })
    }

    console.log(`[USERS] Successfully updated last login for user ${id}`)
    return true
  } catch (error) {
    console.error(`[USERS] Error updating user last login in DynamoDB:`, error)
    return false
  }
}

// Clear cache for testing or when needed
export function clearUserCache(): void {
  userCache.clear()
  console.log("[USERS] User cache cleared")
}
