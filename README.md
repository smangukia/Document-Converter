# Document Converter Service

A service that converts documents between common formats (e.g., Markdown to HTML, HTML to PDF).

## Project Overview

This project implements a document conversion service with a modern microservices architecture. It allows users to upload documents in various formats and convert them to different formats.

### Features

- Upload documents in supported formats (Markdown, HTML, DOCX, TXT)
- Convert to various output formats (HTML, PDF, Markdown, TXT)
- Download converted documents
- View conversion history
- Basic conversion options

## Architecture

The project follows a microservices architecture with the following layers:

1. **User-facing Layer**
   - React-based web interface for document upload/download
   - API endpoints for programmatic access

2. **Processing Layer**
   - Document validation and sanitization
   - Format detection and routing
   - Conversion pipeline orchestration

3. **Storage Layer**
   - Document persistence and retrieval
   - Metadata management

4. **Analytics Layer**
   - Usage tracking
   - Conversion metrics

## AWS Services Used

- **Compute:** AWS Lambda, Amazon EC2
- **Storage:** Amazon S3 (for document storage)
- **Networking:** Amazon API Gateway
- **Database:** Amazon DynamoDB (for conversion history)
- **Application Integration:** Amazon SQS (for processing queue)
- **Management:** AWS Systems Manager

## Local Development Setup

### Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)

### Installation

1. Clone the repository:
   \`\`\`
   git clone https://github.com/smangukia/Document-Converter.git
   cd document-converter
   \`\`\`

2. Install dependencies:
   \`\`\`
   npm run install:all
   \`\`\`

3. Start the development servers:
   \`\`\`
   npm start
   \`\`\`

This will start both the frontend and backend servers:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## AWS Deployment

The project uses Terraform for Infrastructure as Code (IaC) to provision all required AWS resources in a single step.

### Prerequisites

- Terraform (v1.0 or higher)
- AWS CLI configured with appropriate credentials

### Deployment Steps

1. Navigate to the terraform directory:
   \`\`\`
   cd terraform
   \`\`\`

2. Initialize Terraform:
   \`\`\`
   terraform init
   \`\`\`

3. Review the deployment plan:
   \`\`\`
   terraform plan
   \`\`\`

4. Apply the configuration:
   \`\`\`
   terraform apply
   \`\`\`

5. Confirm the deployment by typing `yes` when prompted.

## Supported Conversions

- Markdown to HTML
- HTML to PDF
- HTML to Markdown
- DOCX to HTML
- HTML to TXT
- Markdown to TXT
- DOCX to TXT
- TXT to HTML
- TXT to Markdown

## License

This project is licensed under the MIT License - see the LICENSE file for details.
