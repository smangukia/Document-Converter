# Get latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# EC2 Instance
resource "aws_instance" "app_server" {
  ami                    = coalesce(var.ec2_ami_id, data.aws_ami.amazon_linux_2.id)
  instance_type          = var.ec2_instance_type
  key_name               = var.ec2_key_name
  subnet_id              = aws_subnet.public_subnet.id
  vpc_security_group_ids = [aws_security_group.ec2_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-EOF
    #!/bin/bash -xe
    # Redirect all output to a log file
    exec > >(tee /var/log/user-data.log) 2>&1
    
    echo "Starting EC2 initialization at $(date)"
    
    # Update the system
    echo "Updating system packages..."
    yum update -y
    
    # Install Docker
    echo "Installing Docker..."
    amazon-linux-extras install docker -y
    systemctl start docker
    systemctl enable docker
    usermod -a -G docker ec2-user
    
    # Install AWS CLI
    echo "Installing AWS CLI..."
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    ./aws/install
    
    # Wait for everything to be ready
    echo "Waiting for services to be fully available..."
    sleep 30
    
    # Login to ECR
    echo "Logging in to ECR..."
    aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.${var.aws_region}.amazonaws.com
    
    # Create app directories
    echo "Creating app directories..."
    mkdir -p /home/ec2-user/document-converter/uploads
    mkdir -p /home/ec2-user/document-converter/outputs
    mkdir -p /home/ec2-user/document-converter/data
    
    # Pull the images
    echo "Pulling Docker images..."
    docker pull ${aws_ecr_repository.backend_repo.repository_url}:latest
    docker pull ${aws_ecr_repository.frontend_repo.repository_url}:latest
    
    # Get the public IP address - Use the Elastic IP instead of instance metadata
    PUBLIC_IP="${aws_eip.app_server_eip.public_ip}"
    
    # Run the backend container with direct environment variables
    echo "Starting backend container..."
    docker run -d -p 3001:3001 \
      --name document-converter-backend \
      --restart always \
      -e PORT=3001 \
      -e NODE_ENV=production \
      -e AWS_REGION=${var.aws_region} \
      -e S3_BUCKET_NAME=${aws_s3_bucket.document_bucket.bucket} \
      -e DYNAMODB_TABLE=${aws_dynamodb_table.conversions_table.name} \
      -e USERS_TABLE=${aws_dynamodb_table.users_table.name} \
      -e SQS_QUEUE_URL=${aws_sqs_queue.conversion_queue.id} \
      -e PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
      -e PUPPETEER_DISABLE_GPU=true \
      -e CHROMIUM_FLAGS="--disable-gpu --no-sandbox --disable-dev-shm-usage --disable-setuid-sandbox --no-zygote --single-process --disable-accelerated-2d-canvas --disable-software-rasterizer --disable-3d-apis --disable-webgl" \
      -e DISPLAY=:99 \
      -v /home/ec2-user/document-converter/uploads:/app/uploads \
      -v /home/ec2-user/document-converter/outputs:/app/outputs \
      -v /home/ec2-user/document-converter/data:/app/data \
      -v /dev/shm:/dev/shm \
      ${aws_ecr_repository.backend_repo.repository_url}:latest
    
    # Create a .env file for the frontend with the correct values
    # echo "Creating frontend environment variables..."
    # cat > /home/ec2-user/frontend.env <<EOL
    # VITE_API_URL=http://$PUBLIC_IP:3001/api
    # VITE_SUPABASE_URL=${var.supabase_url}
    # VITE_SUPABASE_ANON_KEY=${var.supabase_anon_key}
    # EOL
    
    # Run the frontend container with environment variables from file
    echo "Starting frontend container..."
    docker run -d -p 5173:5173 \
      --name document-converter-frontend \
      --restart always \
      --env-file /home/ec2-user/frontend.env \
      ${aws_ecr_repository.frontend_repo.repository_url}:latest
    
    # Verify containers are running
    echo "Verifying container status..."
    docker ps -a
    echo "Backend logs:"
    docker logs document-converter-backend
    echo "Frontend logs:"
    docker logs document-converter-frontend
    
    # Create a marker file to indicate completion
    echo "EC2 initialization completed at $(date)" > /home/ec2-user/initialization-complete.txt
  EOF

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-server"
  })

  depends_on = [
    aws_internet_gateway.igw,
    aws_ecr_repository.frontend_repo,
    aws_ecr_repository.backend_repo,
    aws_s3_bucket.document_bucket,
    aws_dynamodb_table.conversions_table,
    aws_dynamodb_table.users_table,
    aws_sqs_queue.conversion_queue,
    null_resource.frontend_docker_build_push,
    null_resource.backend_docker_build_push
  ]
}

# Elastic IP - Remove the direct instance association to break the cycle
resource "aws_eip" "app_server_eip" {
  domain = "vpc"
  # Remove the instance attribute to break the dependency cycle
  # instance = aws_instance.app_server.id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-eip"
  })

  depends_on = [aws_internet_gateway.igw]
}

# Add a separate EIP association resource to attach the EIP to the instance
resource "aws_eip_association" "eip_assoc" {
  instance_id   = aws_instance.app_server.id
  allocation_id = aws_eip.app_server_eip.id
}

# Add a null_resource to check if the EC2 instance is ready
resource "null_resource" "check_ec2_ready" {
  depends_on = [aws_instance.app_server, aws_eip_association.eip_assoc]
  
  # This will force the provisioner to run on every apply
  triggers = {
    instance_id = aws_instance.app_server.id
  }
  
  provisioner "local-exec" {
    command = <<-EOT
      echo "Waiting for EC2 instance to be ready..."
      aws ec2 wait instance-status-ok --instance-ids ${aws_instance.app_server.id} --region ${var.aws_region}
      echo "EC2 instance is ready! You can SSH into it with:"
      echo "ssh -i ${var.ec2_key_name}.pem ec2-user@${aws_eip.app_server_eip.public_ip}"
      echo "To check the user data script logs:"
      echo "ssh -i ${var.ec2_key_name}.pem ec2-user@${aws_eip.app_server_eip.public_ip} 'sudo cat /var/log/user-data.log'"
      echo "To check if the containers are running:"
      echo "ssh -i ${var.ec2_key_name}.pem ec2-user@${aws_eip.app_server_eip.public_ip} 'sudo docker ps -a'"
      echo "Application URLs:"
      echo "Frontend: http://${aws_eip.app_server_eip.public_ip}:5173"
      echo "Backend API: http://${aws_eip.app_server_eip.public_ip}:3001/api"
    EOT
  }
}
