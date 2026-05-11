#!/bin/bash
################################################################################
# user_data.sh — SamhanLogis Phase 11 EC2 초기화 스크립트
#
# 실행 순서:
#   1. 시스템 업데이트
#   2. Docker + Docker Compose 설치
#   3. CloudWatch Agent 설치 + 설정
#   4. docker-compose.yml 복사 (S3 또는 Git)
#   5. 14 service 기동
#
# 주의: user_data 는 인스턴스 최초 기동 시만 실행됨.
#   이후 설정 변경 = SSM Session Manager 또는 배포 스크립트 사용.
################################################################################

set -euo pipefail
exec > >(tee /var/log/user_data.log) 2>&1

echo "=== SamhanLogis Phase 11 EC2 초기화 시작 $(date) ==="

# ─── 1. 시스템 업데이트 ──────────────────────────────────────────────────────
echo "[1/5] 시스템 업데이트"
dnf update -y

# ─── 2. Docker 설치 ───────────────────────────────────────────────────────────
echo "[2/5] Docker 설치"
dnf install -y docker
systemctl enable docker
systemctl start docker

# Docker Compose v2
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# ec2-user Docker 그룹 추가
usermod -aG docker ec2-user

# ─── 3. CloudWatch Agent 설치 ────────────────────────────────────────────────
echo "[3/5] CloudWatch Agent 설치"
dnf install -y amazon-cloudwatch-agent

# CloudWatch Agent 설정 (컨테이너 로그 수집)
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CW_CONFIG'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/lib/docker/containers/**/*-json.log",
            "log_group_name": "/samhanlogis/production/docker",
            "log_stream_name": "{hostname}/{container_id}",
            "timezone": "Asia/Seoul"
          },
          {
            "file_path": "/var/log/user_data.log",
            "log_group_name": "/samhanlogis/production/user-data",
            "log_stream_name": "{hostname}"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "SamhanLogis/EC2",
    "metrics_collected": {
      "cpu": {
        "measurement": ["cpu_usage_idle", "cpu_usage_user", "cpu_usage_system"],
        "metrics_collection_interval": 60
      },
      "mem": {
        "measurement": ["mem_used_percent", "mem_available_percent"],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": ["disk_used_percent"],
        "metrics_collection_interval": 60,
        "resources": ["/"]
      }
    }
  }
}
CW_CONFIG

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

systemctl enable amazon-cloudwatch-agent
systemctl start amazon-cloudwatch-agent

# ─── 4. 애플리케이션 디렉토리 준비 ───────────────────────────────────────────
echo "[4/5] 애플리케이션 디렉토리 준비"
mkdir -p /opt/samhanlogis
cd /opt/samhanlogis

# Git clone (배포 시 실제 repo URL 교체)
# git clone https://github.com/ewoo14/SamhanLogis.git .

# 또는 S3 에서 docker-compose.yml 다운로드
# aws s3 cp s3://samhan-attachments/deploy/docker-compose.prod.yml ./docker-compose.yml

# ─── 5. 환경변수 설정 ─────────────────────────────────────────────────────────
echo "[5/5] 환경변수 설정"
# RDS 엔드포인트 (Terraform 주입)
RDS_ENDPOINT="${rds_endpoint}"
RDS_USERNAME="${rds_username}"
AWS_REGION="${aws_region}"

# Secrets Manager 에서 DB 비밀번호 조회 (prod 환경)
DB_PASSWORD=$(aws secretsmanager get-secret-value \
    --secret-id samhan/production/db-password \
    --query SecretString \
    --output text \
    --region "$AWS_REGION" 2>/dev/null || echo "${rds_password}")

# .env.production 생성
cat > /opt/samhanlogis/.env.production << EOF
# Phase 11 Production 환경변수 — Terraform user_data 자동 생성
# 생성 시각: $(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- 공통 ---
SPRING_PROFILES_ACTIVE=production
SERVER_PORT_DEFAULT=8080

# --- RDS ---
SAMHAN_DB_HOST=$RDS_ENDPOINT
SAMHAN_DB_PORT=5432
SAMHAN_DB_USERNAME=$RDS_USERNAME
SAMHAN_DB_PASSWORD=$DB_PASSWORD

# --- AWS ---
AWS_DEFAULT_REGION=$AWS_REGION
SAMHAN_AWS_REGION=$AWS_REGION

# --- S3 ---
SAMHAN_S3_ENDPOINT=
SAMHAN_S3_BUCKET=samhan-attachments
SAMHAN_S3_PATH_STYLE_ACCESS=false

# --- 추가 환경변수는 CUTOVER-CHECKLIST.md 참조 ---
EOF

chmod 600 /opt/samhanlogis/.env.production
echo "=== 초기화 완료 $(date) ==="
