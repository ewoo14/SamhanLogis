################################################################################
# ecr.tf — ECR 리포지토리 (17 Spring service Docker image registry)
#
# 네이밍 규칙: samhanlogis-production-<service-name>
# 정책:
#   - 이미지 스캔 (푸시 시 자동)
#   - lifecycle: untagged 이미지 30일 후 자동 삭제, tagged 최대 10개 보존
#   - 불변성(image_tag_mutability = MUTABLE) — CI 반복 배포 허용
#
# CI/CD 연계:
#   - GitHub Actions 에서 aws-actions/amazon-ecr-login 후 push
#   - EC2 IAM Role (AmazonEC2ContainerRegistryReadOnly) 로 pull
################################################################################

locals {
  # 17 service ECR 리포지토리 이름 목록 (services/ 디렉토리 일관)
  ecr_services = [
    "eureka-server",
    "api-gateway",
    "auth-service",
    "logging-service",
    "user-service",
    "product-service",
    "inventory-service",
    "slip-service",
    "accounting-service",
    "partner-order-service",
    "dc-config-service",
    "partner-auth-service",
    "groupware-service",
    "notification-service",
    "dashboard-service",
    "partner-service",
    "arologis-service",
  ]
}

# ─── ECR 리포지토리 (17 서비스) ───────────────────────────────────────────────

resource "aws_ecr_repository" "services" {
  for_each = toset(local.ecr_services)

  name                 = "${local.name_prefix}-${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "${local.name_prefix}-${each.key}"
    Service = each.key
  }
}

# ─── ECR Lifecycle Policy (각 리포지토리 공통) ─────────────────────────────────

resource "aws_ecr_lifecycle_policy" "services" {
  for_each   = aws_ecr_repository.services
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "untagged 이미지 30일 후 자동 삭제"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 30
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "tagged 이미지 최대 10개 보존 (최신 10 keep)"
        selection = {
          tagStatus   = "tagged"
          tagPrefixList = ["v", "latest", "main", "release"]
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ─── ECR 리포지토리 URL 출력 (CI/CD 환경변수 주입용) ─────────────────────────

output "ecr_registry" {
  description = "ECR 리포지토리 prefix (docker-compose.prod.yml 의 ECR_REGISTRY 에 사용)"
  value       = "${local.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "ecr_repositories" {
  description = "17 서비스 ECR 리포지토리 URL 목록"
  value = {
    for svc, repo in aws_ecr_repository.services :
    svc => repo.repository_url
  }
}

output "ecr_login_command" {
  description = "ECR 로그인 명령 (EC2 배포 시 사용)"
  value       = "aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${local.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}
