# SQS Configuration for Document Converter

# SQS Queue for document conversion jobs
resource "aws_sqs_queue" "conversion_queue" {
  name                      = var.sqs_queue_name
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 86400
  receive_wait_time_seconds = 10
  visibility_timeout_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.conversion_dlq.arn
    maxReceiveCount     = 5
  })

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-queue"
  })
}

# SQS Dead Letter Queue
resource "aws_sqs_queue" "conversion_dlq" {
  name                      = "${var.sqs_queue_name}-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-dlq"
  })
}

# SQS Queue Policy
resource "aws_sqs_queue_policy" "conversion_queue_policy" {
  queue_url = aws_sqs_queue.conversion_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ec2_role.arn
        }
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.conversion_queue.arn
      }
    ]
  })
}
