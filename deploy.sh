#!/bin/bash

# Exit on error
set -e

# Load environment variables
source .env

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install it first."
    exit 1
fi

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo "Terraform is not installed. Please install it first."
    exit 1
fi

echo "=== Deploying Document Converter Application ==="

# Initialize Terraform
echo "Initializing Terraform..."
cd terraform
terraform init

# Apply Terraform configuration
echo "Applying Terraform configuration..."
terraform apply -auto-approve

# Get ECR repository URLs
FRONTEND_ECR_URL=$(terraform output -raw frontend_ecr_repository_url)
BACKEND_ECR_URL=$(terraform output -raw backend_ecr_repository_url)
EC2_PUBLIC_IP=$(terraform output -raw ec2_public_ip)

cd ..

# Update frontend environment with EC2 public IP
echo "VITE_API_URL=http://$EC2_PUBLIC_IP:3001/api" > frontend/.env

# Build and push Docker images
echo "Building and pushing Docker images..."

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $FRONTEND_ECR_URL

# Build and push frontend image
echo "Building and pushing frontend image..."
cd frontend
docker build -t $FRONTEND_ECR_URL:latest .
docker push $FRONTEND_ECR_URL:latest
cd ..

# Build and push backend image
echo "Building and pushing backend image..."
cd backend
docker build -t $BACKEND_ECR_URL:latest .
docker push $BACKEND_ECR_URL:latest
cd ..

echo "=== Deployment Complete ==="
echo "Application URL: http://$EC2_PUBLIC_IP:5173"
echo "Backend API URL: http://$EC2_PUBLIC_IP:3001/api"
