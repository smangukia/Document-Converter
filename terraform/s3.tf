# S3 Configuration for Document Converter

# S3 Bucket for document storage
resource "aws_s3_bucket" "document_bucket" {
  bucket = var.s3_bucket_name

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-bucket"
  })
}

# S3 Bucket Ownership Controls
resource "aws_s3_bucket_ownership_controls" "document_bucket_ownership" {
  bucket = aws_s3_bucket.document_bucket.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# S3 Bucket ACL
resource "aws_s3_bucket_acl" "document_bucket_acl" {
  depends_on = [aws_s3_bucket_ownership_controls.document_bucket_ownership]
  bucket     = aws_s3_bucket.document_bucket.id
  acl        = "private"
}

# S3 Bucket Versioning
resource "aws_s3_bucket_versioning" "document_bucket_versioning" {
  bucket = aws_s3_bucket.document_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket Server-Side Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "document_bucket_encryption" {
  bucket = aws_s3_bucket.document_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 Bucket Lifecycle Configuration
resource "aws_s3_bucket_lifecycle_configuration" "document_bucket_lifecycle" {
  bucket = aws_s3_bucket.document_bucket.id

  rule {
    id     = "cleanup-old-files"
    status = "Enabled"

    filter {
      prefix = ""  # Apply to all objects in the bucket
    }

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

# S3 Bucket CORS Configuration
resource "aws_s3_bucket_cors_configuration" "document_bucket_cors" {
  bucket = aws_s3_bucket.document_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag", "Content-Length", "Content-Type", "Content-Disposition"]
    max_age_seconds = 3000
  }
}
