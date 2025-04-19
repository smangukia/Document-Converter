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

# EC2: Public Web Server
resource "aws_instance" "web_server" {
  ami                    = data.aws_ami.amazon_linux_2.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.web_server.id]
  subnet_id              = aws_subnet.public[0].id

  iam_instance_profile   = aws_iam_instance_profile.public_ec2_profile.name
  user_data              = file("setup.sh")
  user_data_replace_on_change = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-web-server"
    }
  )
}

# EC2: Private Backend Server
resource "aws_instance" "private_backend" {
  ami                         = data.aws_ami.amazon_linux_2.id
  instance_type               = var.instance_type
  key_name                    = var.key_name
  subnet_id                   = aws_subnet.private[0].id
  vpc_security_group_ids      = [aws_security_group.private_backend.id] # fixed SG for backend
  iam_instance_profile        = aws_iam_instance_profile.private_ec2_profile.name
  associate_public_ip_address = false
  user_data                   = file("setup.sh")
  user_data_replace_on_change = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-private-backend"
    }
  )
}