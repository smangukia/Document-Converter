# Output the public IP of the EC2 instance
output "ec2_public_ip" {
  value       = aws_eip.app_server_eip.public_ip
  description = "The public IP address of the EC2 instance"
}

# Output the ECR repository URLs
output "frontend_ecr_repository_url" {
  value       = aws_ecr_repository.frontend_repo.repository_url
  description = "The URL of the ECR repository for the frontend"
}

output "backend_ecr_repository_url" {
  value       = aws_ecr_repository.backend_repo.repository_url
  description = "The URL of the ECR repository for the backend"
}

# Output the S3 bucket name
output "s3_bucket_name" {
  value       = aws_s3_bucket.document_bucket.bucket
  description = "The name of the S3 bucket for document storage"
}

# Output the DynamoDB table names
output "dynamodb_conversions_table_name" {
  value       = aws_dynamodb_table.conversions_table.name
  description = "The name of the DynamoDB table for conversions"
}

output "dynamodb_users_table_name" {
  value       = aws_dynamodb_table.users_table.name
  description = "The name of the DynamoDB table for users"
}

# Output the SQS queue URL
output "sqs_queue_url" {
  value       = aws_sqs_queue.conversion_queue.url
  description = "The URL of the SQS queue for conversions"
}

# Output the application URLs
output "frontend_url" {
  value       = "http://${aws_eip.app_server_eip.public_ip}:5173"
  description = "The URL to access the frontend application"
}

output "backend_api_url" {
  value       = "http://${aws_eip.app_server_eip.public_ip}:3001/api"
  description = "The URL to access the backend API"
}

# Output SSH command for convenience
output "ssh_command" {
  value       = "ssh -i ${var.ec2_key_name}.pem ec2-user@${aws_eip.app_server_eip.public_ip}"
  description = "SSH command to connect to the EC2 instance"
}
