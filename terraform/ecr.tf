# ECR Configuration for Document Converter

# ECR Repository for Frontend
resource "aws_ecr_repository" "frontend_repo" {
  name                 = "${var.project_name}-frontend"
  image_tag_mutability = "MUTABLE"
  force_delete = true
  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

# ECR Repository for Backend
resource "aws_ecr_repository" "backend_repo" {
  name                 = "${var.project_name}-backend"
  image_tag_mutability = "MUTABLE"
  force_delete = true
  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

# ECR Lifecycle Policy for Frontend
resource "aws_ecr_lifecycle_policy" "frontend_lifecycle_policy" {
  repository = aws_ecr_repository.frontend_repo.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 images"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ECR Lifecycle Policy for Backend
resource "aws_ecr_lifecycle_policy" "backend_lifecycle_policy" {
  repository = aws_ecr_repository.backend_repo.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 images"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Build and push Frontend Docker image to ECR
resource "null_resource" "frontend_docker_build_push" {
  depends_on = [aws_ecr_repository.frontend_repo]

  triggers = {
    ecr_repository_url = aws_ecr_repository.frontend_repo.repository_url
    # Force rebuild on every apply
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      # Get AWS account ID
      AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
      AWS_REGION=${var.aws_region}
      
      # Log in to ECR
      aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
      
      # Build and push the frontend Docker image
      cd ../frontend
      docker build --platform linux/amd64 -t ${aws_ecr_repository.frontend_repo.repository_url}:latest .
      docker push ${aws_ecr_repository.frontend_repo.repository_url}:latest
      
      echo "Successfully built and pushed Frontend Docker image to ${aws_ecr_repository.frontend_repo.repository_url}:latest"
    EOT
  }
}

# Build and push Backend Docker image to ECR
resource "null_resource" "backend_docker_build_push" {
  depends_on = [aws_ecr_repository.backend_repo]

  triggers = {
    ecr_repository_url = aws_ecr_repository.backend_repo.repository_url
    # Force rebuild on every apply
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      # Get AWS account ID
      AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
      AWS_REGION=${var.aws_region}
      
      # Log in to ECR
      aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
      
      # Build and push the backend Docker image
      cd ../backend
      docker build --platform linux/amd64 -t ${aws_ecr_repository.backend_repo.repository_url}:latest .
      docker push ${aws_ecr_repository.backend_repo.repository_url}:latest
      
      echo "Successfully built and pushed Backend Docker image to ${aws_ecr_repository.backend_repo.repository_url}:latest"
    EOT
  }
}

# Data source to get current AWS region
data "aws_region" "current" {
}
