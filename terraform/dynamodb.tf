# DynamoDB Configuration for Document Converter

# DynamoDB Table for Conversions
resource "aws_dynamodb_table" "conversions_table" {
  name           = var.dynamodb_conversions_table_name
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  
  attribute {
    name = "id"
    type = "S"
  }
  
  attribute {
    name = "status"
    type = "S"
  }
  
  attribute {
    name = "timestamp"
    type = "S"
  }
  
  attribute {
    name = "userId"
    type = "S"
  }
  
  global_secondary_index {
    name               = "timestamp-index"
    hash_key           = "status"
    range_key          = "timestamp"
    projection_type    = "ALL"
  }
  
  global_secondary_index {
    name               = "userId-index"
    hash_key           = "userId"
    range_key          = "timestamp"
    projection_type    = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-conversions-table"
  })
}

# DynamoDB Table for Users
resource "aws_dynamodb_table" "users_table" {
  name           = var.dynamodb_users_table_name
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  
  attribute {
    name = "id"
    type = "S"
  }
  
  attribute {
    name = "email"
    type = "S"
  }
  
  global_secondary_index {
    name               = "email-index"
    hash_key           = "email"
    projection_type    = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-users-table"
  })
}
