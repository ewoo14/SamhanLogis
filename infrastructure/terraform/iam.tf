################################################################################
# iam.tf — EC2 Instance Role + 정책
#
# 부여 권한:
#   - S3: samhan-attachments / samhan-logs (GetObject, PutObject, DeleteObject)
#   - CloudWatch: 로그 + 메트릭 전송
#   - Secrets Manager: samhan/ prefix 시크릿 읽기
#   - ECR: 컨테이너 이미지 pull
#   - EC2: DescribeInstances (Health Check Lambda 용)
#   - SSM: Session Manager (SSH 대체)
################################################################################

# ─── EC2 Instance Role ───────────────────────────────────────────────────────

resource "aws_iam_role" "ec2_app_role" {
  name = "${local.name_prefix}-ec2-app-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = {
    Name = "${local.name_prefix}-ec2-app-role"
  }
}

# ─── S3 접근 정책 (최소 권한) ─────────────────────────────────────────────────

resource "aws_iam_policy" "ec2_s3_policy" {
  name        = "${local.name_prefix}-ec2-s3-policy"
  description = "EC2 S3 접근 정책 (첨부파일 버킷 최소 권한)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AttachmentsBucketAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.attachments.arn,
          "${aws_s3_bucket.attachments.arn}/*"
        ]
      },
      {
        Sid    = "LogsBucketWrite"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.logs.arn,
          "${aws_s3_bucket.logs.arn}/*"
        ]
      }
    ]
  })
}

# ─── Secrets Manager 읽기 정책 ───────────────────────────────────────────────

resource "aws_iam_policy" "ec2_secrets_policy" {
  name        = "${local.name_prefix}-ec2-secrets-policy"
  description = "EC2 Secrets Manager 읽기 정책 (samhan/ prefix)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsManagerRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${local.account_id}:secret:samhan/*"
      }
    ]
  })
}

# ─── CloudWatch 정책 ──────────────────────────────────────────────────────────

resource "aws_iam_policy" "ec2_cloudwatch_policy" {
  name        = "${local.name_prefix}-ec2-cloudwatch-policy"
  description = "EC2 CloudWatch 로그/메트릭 전송 정책"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
          "logs:DescribeLogGroups"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${local.account_id}:*"
      },
      {
        Sid    = "CloudWatchMetrics"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics"
        ]
        Resource = "*"
      },
      {
        Sid    = "EC2Describe"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeTags"
        ]
        Resource = "*"
      }
    ]
  })
}

# ─── 정책 연결 ────────────────────────────────────────────────────────────────

resource "aws_iam_role_policy_attachment" "ec2_s3" {
  role       = aws_iam_role.ec2_app_role.name
  policy_arn = aws_iam_policy.ec2_s3_policy.arn
}

resource "aws_iam_role_policy_attachment" "ec2_secrets" {
  role       = aws_iam_role.ec2_app_role.name
  policy_arn = aws_iam_policy.ec2_secrets_policy.arn
}

resource "aws_iam_role_policy_attachment" "ec2_cloudwatch" {
  role       = aws_iam_role.ec2_app_role.name
  policy_arn = aws_iam_policy.ec2_cloudwatch_policy.arn
}

# SSM Session Manager (SSH 대체 — 키 없이 콘솔 접속 가능)
resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2_app_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# ECR read (컨테이너 이미지 pull)
resource "aws_iam_role_policy_attachment" "ec2_ecr" {
  role       = aws_iam_role.ec2_app_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# ─── Instance Profile ─────────────────────────────────────────────────────────

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${local.name_prefix}-ec2-profile"
  role = aws_iam_role.ec2_app_role.name
}

# ─── Lambda Execution Role (Health Check Lambda) ──────────────────────────────

resource "aws_iam_role" "lambda_health_check" {
  name = "${local.name_prefix}-lambda-health-check-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = {
    Name = "${local.name_prefix}-lambda-health-check-role"
  }
}

resource "aws_iam_policy" "lambda_health_check_policy" {
  name        = "${local.name_prefix}-lambda-health-check-policy"
  description = "Health Check Lambda 정책 (EC2 reboot + SNS 발행)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EC2Reboot"
        Effect = "Allow"
        Action = [
          "ec2:RebootInstances",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus"
        ]
        Resource = "*"
      },
      {
        Sid    = "SNSPublish"
        Effect = "Allow"
        Action = ["sns:Publish"]
        Resource = aws_sns_topic.alerts.arn
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${local.account_id}:*"
      },
      {
        Sid    = "VPCAccess"
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_health_check" {
  role       = aws_iam_role.lambda_health_check.name
  policy_arn = aws_iam_policy.lambda_health_check_policy.arn
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "ec2_instance_profile_name" {
  description = "EC2 Instance Profile 이름"
  value       = aws_iam_instance_profile.ec2_profile.name
}

output "lambda_health_check_role_arn" {
  description = "Health Check Lambda Execution Role ARN"
  value       = aws_iam_role.lambda_health_check.arn
}
