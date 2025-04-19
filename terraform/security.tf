# Security Group for Web Server
resource "aws_security_group" "web_server" {
  name        = "${local.name_prefix}-web-server-sg"
  description = "Security group for web server"
  vpc_id      = aws_vpc.main.id

  # HTTP
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_cidr_blocks
  }

  # Add this new rule for port 3000  
  ingress {
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow backend traffic on port 3001"
  }

  # Outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-web-server-sg"
    }
  )
}

# Security Group for Private Backend EC2
resource "aws_security_group" "private_backend" {
  name        = "${local.name_prefix}-private-backend-sg"
  description = "Allow traffic from web server only"
  vpc_id      = aws_vpc.main.id

  # Allow port 3001 from public EC2 security group
  ingress {
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.web_server.id]
    description     = "Allow port 3001 from web server"
  }

  # Allow SSH from public EC2 only
  ingress {
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.web_server.id]
    description     = "Allow SSH from web server"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-private-backend-sg"
  })
}

# IAM Role for Public EC2
resource "aws_iam_role" "public_ec2_role" {
  name = "${local.name_prefix}-public-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# Attach policies to Public EC2 Role
resource "aws_iam_role_policy_attachment" "public_cloudwatch_full_access" {
  role       = aws_iam_role.public_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess"
}

resource "aws_iam_role_policy_attachment" "public_ecr_full_access" {
  role       = aws_iam_role.public_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess"
}

# Instance profile for Public EC2
resource "aws_iam_instance_profile" "public_ec2_profile" {
  name = "${local.name_prefix}-public-ec2-profile"
  role = aws_iam_role.public_ec2_role.name
}

# Attach policies for Public EC2 Role (SSM + CloudWatch)
resource "aws_iam_role_policy_attachment" "public_ssm" {
  role       = aws_iam_role.public_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "public_cloudwatch" {
  role       = aws_iam_role.public_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# IAM Role for Private EC2
resource "aws_iam_role" "private_ec2_role" {
  name = "${local.name_prefix}-private-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# Attach policies to Private EC2 Role
resource "aws_iam_role_policy_attachment" "private_s3_full_access" {
  role       = aws_iam_role.private_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

resource "aws_iam_role_policy_attachment" "private_dynamodb_full_access" {
  role       = aws_iam_role.private_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role_policy_attachment" "private_sqs_full_access" {
  role       = aws_iam_role.private_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSQSFullAccess"
}

resource "aws_iam_role_policy_attachment" "private_cloudwatch_full_access" {
  role       = aws_iam_role.private_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess"
}

resource "aws_iam_role_policy_attachment" "private_ecr_full_access" {
  role       = aws_iam_role.private_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess"
}

# Instance profile for Private EC2
resource "aws_iam_instance_profile" "private_ec2_profile" {
  name = "${local.name_prefix}-private-ec2-profile"
  role = aws_iam_role.private_ec2_role.name
}

# Attach policies for Private EC2 Role (SSM + CloudWatch)
resource "aws_iam_role_policy_attachment" "private_ssm" {
  role       = aws_iam_role.private_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "private_cloudwatch" {
  role       = aws_iam_role.private_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}