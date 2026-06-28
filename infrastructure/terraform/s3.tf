################################################################################
# s3.tf — S3 버킷 구성
#
# 버킷 목록:
#   1. samhan-attachments  — 첨부파일 (범용: 입고검수/배송완료/영업방문 현장사진)
#   2. samhan-logs         — ALB access log + service log archive
#   3. samhan-terraform-state — Terraform state (실 배포 시 사전 생성 필요)
#
# 공통 보안 설정:
#   - 퍼블릭 액세스 차단 (4항목 모두 ON)
#   - SSE-S3 서버사이드 암호화
#   - 버전 관리 활성 (우발적 삭제 방지)
#   - Lifecycle: 180일 후 Glacier Instant Retrieval
################################################################################

# ─── samhan-attachments ───────────────────────────────────────────────────────

resource "aws_s3_bucket" "attachments" {
  bucket = var.s3_attachments_bucket

  tags = {
    Name    = "${local.name_prefix}-attachments"
    Purpose = "서비스 첨부파일 (입고검수/배송/영업 현장사진, 서명 PNG)"
  }
}

resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    id     = "glacier-transition"
    status = "Enabled"

    filter {
      prefix = "" # 모든 객체에 적용
    }

    transition {
      days          = 180
      storage_class = "GLACIER_IR" # Glacier Instant Retrieval — 즉시 복구 가능
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "GLACIER_IR"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }
}

# CORS 설정 (presigned URL 브라우저 업로드 지원)
resource "aws_s3_bucket_cors_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = ["https://*.samhan-air.com"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# EC2 user_data 최초 기동에 필요한 배포 산출물.
# Terraform apply 단계에서 첨부 버킷에 먼저 업로드되어야 EC2 첫 부팅이 fail-fast 되지 않는다.
resource "aws_s3_object" "init_rds" {
  bucket = aws_s3_bucket.attachments.id
  key    = "deploy/init-rds.sql"
  source = "${path.module}/templates/init-rds.sql"
  etag   = filemd5("${path.module}/templates/init-rds.sql")
}

resource "aws_s3_object" "compose" {
  bucket = aws_s3_bucket.attachments.id
  key    = "deploy/docker-compose.prod.yml"
  source = "${path.module}/../docker-compose.prod.yml"
  etag   = filemd5("${path.module}/../docker-compose.prod.yml")
}

# ─── samhan-logs ─────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "logs" {
  bucket = var.s3_logs_bucket

  tags = {
    Name    = "${local.name_prefix}-logs"
    Purpose = "ALB access log + service log archive"
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "log-retention"
    status = "Enabled"

    filter {
      prefix = "" # 모든 객체에 적용
    }

    expiration {
      days = 90
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# ALB access log delivery 허용 (AWS 로드밸런서 서비스 계정)
resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::600734575887:root" } # ap-northeast-2 ALB 계정
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.logs.arn}/alb-logs/*"
      },
      {
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.logs.arn}/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
        }
      },
      {
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.logs.arn
      }
    ]
  })
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "s3_attachments_bucket_name" {
  description = "첨부파일 S3 버킷 이름 (SAMHAN_S3_BUCKET 환경변수에 사용)"
  value       = aws_s3_bucket.attachments.bucket
}

output "s3_attachments_bucket_arn" {
  description = "첨부파일 S3 버킷 ARN"
  value       = aws_s3_bucket.attachments.arn
}

output "s3_logs_bucket_name" {
  description = "로그 S3 버킷 이름"
  value       = aws_s3_bucket.logs.bucket
}
