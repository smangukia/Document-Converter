
resource "aws_s3_bucket" "doc_converter" {
  bucket        = "documment-convertter-files"
  force_destroy = true
  tags = {
    Name = "documment-convertter-files"
  }
}