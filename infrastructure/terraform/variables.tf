################################################################################
# variables.tf — SamhanLogis Phase 11 AWS 인프라 입력 변수
# Region: ap-northeast-2 (Seoul)
# 단일 Production 환경 (환경 분리 없음 — 개발책임자 결정 2026-05-08)
################################################################################

variable "aws_region" {
  description = "AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "프로젝트 이름 (리소스 태그 prefix)"
  type        = string
  default     = "samhanlogis"
}

variable "environment" {
  description = "배포 환경 (production 단일)"
  type        = string
  default     = "production"
}

# ─── VPC / 네트워크 ───────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "VPC CIDR 블록"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public Subnet CIDR 목록 (AZ 분산)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private Subnet CIDR 목록 (AZ 분산)"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "availability_zones" {
  description = "사용할 AZ 목록"
  type        = list(string)
  default     = ["ap-northeast-2a", "ap-northeast-2c"]
}

# ─── EC2 ─────────────────────────────────────────────────────────────────────

variable "ec2_instance_type" {
  description = "EC2 인스턴스 타입 (17 service docker-compose + RabbitMQ + Elasticsearch)"
  type        = string
  default     = "m5.xlarge"
}

variable "ec2_ami_id" {
  description = "EC2 AMI ID (Amazon Linux 2023)"
  type        = string
  # ap-northeast-2 Amazon Linux 2023 최신 AMI — 실 배포 전 확인 필요
  default     = "ami-0c9c942bd7bf113a2"
}

variable "ec2_volume_size" {
  description = "EC2 EBS 볼륨 크기 (GB)"
  type        = number
  default     = 100
}

variable "ec2_key_pair_name" {
  description = "선택 EC2 키페어 이름. 기본 운영 접속은 SSM Session Manager 이므로 null 권장."
  type        = string
  default     = null
  nullable    = true
}

# ─── RDS ─────────────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  description = "RDS 인스턴스 클래스"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_engine_version" {
  description = "PostgreSQL 엔진 버전"
  type        = string
  default     = "15.7"
}

variable "rds_allocated_storage" {
  description = "RDS 스토리지 크기 (GB)"
  type        = number
  default     = 100
}

variable "rds_db_name" {
  description = "RDS 기본 DB 이름"
  type        = string
  default     = "samhanlogis"
}

variable "rds_username" {
  description = "RDS 마스터 사용자 이름"
  type        = string
  default     = "samhan"
  sensitive   = true
}

variable "rds_password" {
  description = "RDS 마스터 비밀번호. samhan/production/db-password Secrets Manager 시크릿과 RDS password 에 동일 값으로 주입."
  type        = string
  sensitive   = true
}

variable "rds_backup_retention_days" {
  description = "RDS automated backup retention 기간 (일)"
  type        = number
  default     = 7
}

# ─── S3 ──────────────────────────────────────────────────────────────────────

variable "s3_attachments_bucket" {
  description = "첨부파일 S3 버킷 이름"
  type        = string
  default     = "samhan-attachments"
}

variable "s3_logs_bucket" {
  description = "로그 아카이브 S3 버킷 이름"
  type        = string
  default     = "samhan-logs"
}

variable "s3_terraform_state_bucket" {
  description = "Terraform state S3 버킷 이름"
  type        = string
  default     = "samhan-terraform-state"
}

# ─── Lambda / 알림 ───────────────────────────────────────────────────────────

variable "slack_webhook_url" {
  description = "Slack Webhook URL (Health Check Lambda 알림)"
  type        = string
  sensitive   = true
  # terraform.tfvars 에서 주입
}

variable "alert_email" {
  description = "SNS 알림 이메일"
  type        = string
  default     = "ewoo2821@gmail.com"
}

# ─── Route 53 / 도메인 ───────────────────────────────────────────────────────

variable "domain_name" {
  description = "기본 도메인 이름"
  type        = string
  default     = "samhan-air.com"
}

variable "route53_zone_id" {
  description = "Route 53 Hosted Zone ID (사전 생성 필요)"
  type        = string
  default     = "PLACEHOLDER_ZONE_ID"
}

# ─── 태그 ─────────────────────────────────────────────────────────────────────

variable "common_tags" {
  description = "공통 리소스 태그"
  type        = map(string)
  default = {
    Project     = "SamhanLogis"
    Environment = "production"
    ManagedBy   = "terraform"
    Owner       = "devops"
    Phase       = "11"
  }
}
