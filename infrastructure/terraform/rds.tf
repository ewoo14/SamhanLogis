################################################################################
# rds.tf — RDS PostgreSQL 15 (db.t3.medium, Single-AZ)
#
# 구성:
#   - 인스턴스: db.t3.medium
#   - 엔진: PostgreSQL 15 (AWS RDS 지원 최신 안정 버전)
#   - 스토리지: gp3 100 GB
#   - Multi-AZ: false (비용 최적화 — 사용자 결정 2026-05-08)
#   - Automated Backup: retention 7일 (무료 — ✅ 적용)
#   - 15 DB schema 분리 (logging_db 제외, 각 service 별 별도 database + migration_db)
#   - Private Subnet 배치 (EC2 SG 에서만 접근)
################################################################################

# ─── DB Subnet Group ──────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-rds-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${local.name_prefix}-rds-subnet-group"
  }
}

# ─── RDS Parameter Group (PostgreSQL 15) ─────────────────────────────────────

resource "aws_db_parameter_group" "main" {
  name   = "${local.name_prefix}-pg15-params"
  family = "postgres15"

  # 17 service 동시 연결 최적화 (17 × Hikari default 10 = 170, +RabbitMQ/ES 여유 포함)
  parameter {
    name  = "max_connections"
    value = "300"
  }

  # 로그 설정 (슬로우 쿼리 감지)
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  # 타임존 (KST)
  parameter {
    name  = "timezone"
    value = "Asia/Seoul"
  }

  # 문자셋 (UTF-8 기본값 — 명시)
  parameter {
    name  = "client_encoding"
    value = "UTF8"
  }

  tags = {
    Name = "${local.name_prefix}-pg15-params"
  }
}

# ─── RDS Instance ──────────────────────────────────────────────────────────────

resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-rds"

  engine         = "postgres"
  engine_version = var.rds_engine_version

  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = 200
  storage_type          = "gp3"
  storage_encrypted     = true

  # 기본 DB (각 service DB 는 flyway/init 스크립트로 별도 생성)
  db_name                     = var.rds_db_name
  username                    = var.rds_username
  manage_master_user_password = true

  # 네트워크
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # 파라미터 그룹
  parameter_group_name = aws_db_parameter_group.main.name

  # ── 백업 설정 (✅ RDS automated backup retention 7일 — 무료) ──────────────
  backup_retention_period = var.rds_backup_retention_days
  backup_window           = "18:00-19:00"  # UTC 18:00 = KST 03:00 (저트래픽 구간)
  maintenance_window      = "sun:19:00-sun:20:00"  # UTC 일 19:00 = KST 월 04:00

  # ── Single-AZ (사용자 결정 — Multi-AZ 보류) ───────────────────────────────
  multi_az = false

  # ── 삭제 보호 ─────────────────────────────────────────────────────────────
  deletion_protection = true

  # ── 스냅샷 (인스턴스 삭제 시 final snapshot 보존) ─────────────────────────
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name_prefix}-rds-final-snapshot"

  # ── 자동 마이너 버전 업그레이드 ───────────────────────────────────────────
  auto_minor_version_upgrade = true

  # ── Performance Insights ─────────────────────────────────────────────────
  performance_insights_enabled = true

  # ── Enhanced Monitoring ──────────────────────────────────────────────────
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  # ── CloudWatch 로그 export ───────────────────────────────────────────────
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Name = "${local.name_prefix}-rds"
  }
}

# ─── RDS Enhanced Monitoring Role ────────────────────────────────────────────

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name_prefix}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ─── 17 service DB 초기화 (user_data.sh 내 init-rds.sql 실행 위임) ──────────
# EC2 user_data 최초 부팅 시 templates/init-rds.sql 을 실행하여 15개 DB 생성.
# 이후 각 서비스 Flyway 마이그레이션이 각 DB schema 를 자동 구성.
# Terraform 에서는 RDS 엔드포인트만 관리 (DB/schema 는 init-rds.sql + Flyway 위임).

# ─── Outputs ──────────────────────────────────────────────────────────────────

output "rds_endpoint" {
  description = "RDS 엔드포인트 (service 환경변수 SAMHAN_DB_URL에 사용)"
  value       = aws_db_instance.main.address
  sensitive   = false
}

output "rds_port" {
  description = "RDS 포트"
  value       = aws_db_instance.main.port
}

output "rds_db_name" {
  description = "RDS 기본 DB 이름"
  value       = aws_db_instance.main.db_name
}

output "rds_master_user_secret_arn" {
  description = "RDS managed master user secret ARN (EC2 user_data 에서 비밀번호 조회)"
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
  sensitive   = true
}
