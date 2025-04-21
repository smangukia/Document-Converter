terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.2.0"

  # Uncomment this block to use Terraform Cloud for state management
  # backend "s3" {
  #   bucket = "document-converter-terraform-state"
  #   key    = "terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region
}

# Local variables
locals {
  common_tags = {
    Project     = "DocumentConverter"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
  
  # Add the missing name_prefix local variable
  name_prefix = "${var.project_name}-${var.environment}"
}

# Keep only the provider configuration and locals in main.tf
# All resources should be defined in their respective module files
