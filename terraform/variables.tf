# Variables for the Document Converter application

variable "aws_region" {
  description = "The AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "The deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "document-converter"
}

variable "s3_bucket_name" {
  description = "The name of the S3 bucket for document storage"
  type        = string
  default     = "documment-convertter-files"
}

variable "dynamodb_conversions_table_name" {
  description = "The name of the DynamoDB table for conversions"
  type        = string
  default     = "document-conversions"
}

variable "dynamodb_users_table_name" {
  description = "The name of the DynamoDB table for users"
  type        = string
  default     = "document-converter-users"
}

variable "sqs_queue_name" {
  description = "The name of the SQS queue for conversions"
  type        = string
  default     = "document-converter-queue"
}

variable "ec2_instance_type" {
  description = "The instance type for the EC2 instance"
  type        = string
  default     = "t2.medium" # Recommended for running Docker containers
}

variable "ec2_key_name" {
  description = "The key pair name for SSH access to the EC2 instance"
  type        = string
  default     = "cloud"
}

variable "ec2_ami_id" {
  description = "The AMI ID for the EC2 instance (optional, will use latest Amazon Linux 2 if not specified)"
  type        = string
  default     = ""
}

variable "vpc_cidr" {
  description = "The CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "The CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "private_subnet_cidr" {
  description = "The CIDR block for the private subnet"
  type        = string
  default     = "10.0.2.0/24"
}

# Add these variables for Supabase configuration
variable "supabase_url" {
  description = "The URL for Supabase authentication"
  type        = string
  default     = "https://jfrrhmdvkozujnspvdez.supabase.co"
}

variable "supabase_anon_key" {
  description = "The anonymous key for Supabase authentication"
  type        = string
  default     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmcnJobWR2a296dWpuc3B2ZGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMTE4ODgsImV4cCI6MjA2MDU4Nzg4OH0.HFYYFGU5jatsJnJTwym7kI-jAKr4oRhmmL-rY3dvDj8"
}
