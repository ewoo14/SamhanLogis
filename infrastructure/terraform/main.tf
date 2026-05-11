################################################################################
# main.tf — SamhanLogis Phase 11 Terraform 진입점
#
# Provider: AWS (Seoul ap-northeast-2)
# Backend: S3 (samhan-terraform-state) — dry-run 시 local backend 사용
#
# 주의: 실 배포 전 backend 블록의 주석을 해제하고 S3 버킷을 사전 생성할 것.
# dry-run (terraform validate / plan) 은 local backend 로 수행.
################################################################################

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # ── Production 배포 시 아래 backend 블록 주석 해제 ──────────────────────────
  # backend "s3" {
  #   bucket         = "samhan-terraform-state"
  #   key            = "phase11/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   encrypt        = true
  #   dynamodb_table = "samhan-terraform-locks"
  # }
  # ─────────────────────────────────────────────────────────────────────────────
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.common_tags
  }
}

################################################################################
# Data Sources — 계정 정보 / AZ
################################################################################

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

################################################################################
# Local Values — 공통 네이밍 규칙
################################################################################

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id

  # 14 service 포트 매핑 (docker-compose 일관)
  service_ports = {
    eureka-server     = 8761
    api-gateway       = 8080
    auth-service      = 8081
    user-service      = 8082
    product-service   = 8083
    inventory-service = 8084
    slip-service      = 8085
    accounting-service = 8086
    logging-service   = 8087
    partner-service   = 8088
    partner-auth-service  = 8089
    dc-config-service = 8090
    partner-order-service = 8091
    notification-service  = 8092
    groupware-service = 8093
    dashboard-service = 8094
    arologis-service  = 8095
  }

  # samhan-air.com 8 subdomain 목록
  subdomains = {
    api     = "api.${var.domain_name}"
    app     = "app.${var.domain_name}"
    order   = "order.${var.domain_name}"
    sign    = "sign.${var.domain_name}"
    chat    = "chat.${var.domain_name}"
    files   = "files.${var.domain_name}"
    monitor = "monitor.${var.domain_name}"
    quote   = "quote.${var.domain_name}"
  }
}
