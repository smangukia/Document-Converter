// Server configuration
export const PORT = process.env.PORT || 3001
export const NODE_ENV = process.env.NODE_ENV || "development"

// AWS configuration
export const AWS_REGION = process.env.AWS_REGION || "us-east-1"

// S3 configuration
export const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "documment-convertter-files"

// DynamoDB configuration
export const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || "document-conversions"

// SQS configuration
export const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || ""

// Puppeteer configuration
export const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || ""
