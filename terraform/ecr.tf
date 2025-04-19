resource "aws_ecr_repository" "frontend" {
  name = "doc-converter-frontend"
  force_delete = true
  tags = {
    Name = "frontend"
  }
}

resource "aws_ecr_repository" "backend" {
  name = "doc-converter-backend"
  force_delete = true
  tags = {
    Name = "backend"
  }
}