resource "aws_dynamodb_table" "filelog" {
  name         = "document-conversions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"
  attribute {
    name = "id"
    type = "S"
  }
  tags = {
    Name = "document-conversions"
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "document-converter-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"
  attribute {
    name = "id"
    type = "S"
  }
  tags = {
    Name = "document-converter-users"
  }
}
