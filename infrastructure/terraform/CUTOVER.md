# SamhanLogis Phase 11 — AWS Cutover 런북

> 작성 2026-06-29 / 개발책임자 확인 필수  
> terraform validate: CLI 미설치로 코드 검토 갈음 (실 apply 전 `terraform validate` 실행 의무)

---

## Ready / Not-Ready 상태 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| Terraform IaC (vpc/ec2/rds/alb/route53/s3/iam/monitoring/lambda) | READY | 17 service 현행화 완료 |
| ECR 리포지토리 (ecr.tf) | READY | 17 service 신규 생성 |
| docker-compose.prod.yml | READY | RDS/S3 endpoint 반영 |
| init-rds.sql (15 DB) | READY | user_data.sh 자동 실행 (logging_db 제거 — logging-service 는 ES/RabbitMQ 전용) |
| user_data.sh (17 service 기동) | READY | ECR pull + compose up |
| **실 AWS 계정** | NOT-READY | 개발책임자 계정 직접 설정 |
| **Route 53 Hosted Zone** | NOT-READY | 사전 생성 + 도메인 등록기관 NS 위임 후 `route53_zone_id` 입력 |
| **Secrets Manager 시크릿** | NOT-READY | 아래 단계 0 참조 |
| **도메인 등록기관 NS 레코드** | NOT-READY | terraform output route53_name_servers 확인 후 수동 |
| **S3 Terraform state 버킷** | NOT-READY | 단계 0 사전 생성 |
| **ECR 이미지 push** | NOT-READY | 단계 2 수행 |
| **RDS snapshot(데이터 이관)** | NOT-READY | 단계 4 수동 수행 |

---

## 단계 0 — 사전 준비 (terraform apply 전 수동 작업)

### 0-A. AWS 계정 + CLI 설정
```bash
aws configure
# AWS Access Key ID: <발급 키>
# AWS Secret Access Key: <발급 시크릿>
# Default region name: ap-northeast-2
# Default output format: json
```

### 0-B. terraform 설치 (v1.6.0+)
```bash
# Amazon Linux 2023 (로컬이 아닌 EC2 에서는 user_data 가 자동 설치)
# 로컬(개발 PC)에서 plan/validate 용:
# https://developer.hashicorp.com/terraform/downloads
terraform version   # 1.6.0 이상 확인
```

### 0-C. S3 Terraform State 버킷 사전 생성
```bash
aws s3 mb s3://samhan-terraform-state --region ap-northeast-2
aws s3api put-bucket-versioning \
  --bucket samhan-terraform-state \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption \
  --bucket samhan-terraform-state \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
# DynamoDB state lock 테이블 (선택 — 단독 운영이면 생략 가능)
aws dynamodb create-table \
  --table-name samhan-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-2
```

### 0-D. Secrets Manager 시크릿 사전 등록
```bash
# JWT 서명 비밀키 (64자 이상 무작위 문자열)
aws secretsmanager create-secret \
  --name samhan/production/jwt-secret \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-northeast-2

# 내부 서비스 간 인증 토큰
aws secretsmanager create-secret \
  --name samhan/production/internal-token \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-northeast-2

# 아로로지스 별도 JWT 비밀키
aws secretsmanager create-secret \
  --name samhan/production/arologis-jwt-secret \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-northeast-2

# RabbitMQ 운영 비밀번호
aws secretsmanager create-secret \
  --name samhan/production/rabbit-password \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-northeast-2

# S3 호환 MinIO client 용 access/secret key
# 실 키는 cutover 직전 개발책임자가 수동 주입합니다.
aws secretsmanager create-secret \
  --name samhan/production/s3-access-key \
  --secret-string "REPLACE_S3_ACCESS_KEY" \
  --region ap-northeast-2

aws secretsmanager create-secret \
  --name samhan/production/s3-secret-key \
  --secret-string "REPLACE_S3_SECRET_KEY" \
  --region ap-northeast-2
```

> RDS master password 는 `samhan/production/db-password` Secrets Manager 시크릿으로 일원화합니다. 이 시크릿은 Terraform `aws_secretsmanager_secret.db_password`가 생성하고, `terraform.tfvars`의 `rds_password` 값이 RDS password 와 시크릿 버전에 함께 주입됩니다. 따라서 EC2 IAM 의 기존 `samhan/*` 정책으로 조회 가능합니다.

### 0-E. AMI ID 최신 확인
```bash
# Amazon Linux 2023 최신 AMI (ap-northeast-2)
aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=al2023-ami-*-x86_64" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --region ap-northeast-2
# 결과를 terraform.tfvars 의 ec2_ami_id 에 업데이트
```

### 0-F. terraform.tfvars 작성
```bash
cp infrastructure/terraform/terraform.tfvars.example infrastructure/terraform/terraform.tfvars
# 실 값 입력 (Git 커밋 금지 — .gitignore 에 포함됨):
#   - rds_password: RDS master password. Terraform 이 samhan/production/db-password 시크릿도 생성.
#   - route53_zone_id: 0-G 에서 획득
#   - ec2_ami_id: 0-E 결과
#   - slack_webhook_url: Slack 웹훅 URL
#   - ec2_key_pair_name: 기본 null 권장. SSH 없이 SSM Session Manager 로 접속.
```

### 0-G. Route 53 Hosted Zone 사전 생성/위임 확인
```bash
# Hosted Zone 은 terraform apply 전에 이미 존재하고, 도메인 등록기관 NS 위임이 끝나 있어야 합니다.
aws route53 list-hosted-zones --query 'HostedZones[?Name==`samhan-air.com.`].Id'
# → terraform.tfvars 의 route53_zone_id 에 입력 (Z로 시작하는 ID)
```

### 0-H. Terraform backend 주석 해제
`infrastructure/terraform/main.tf` 내 `# backend "s3"` 블록 주석 해제:
```hcl
backend "s3" {
  bucket         = "samhan-terraform-state"
  key            = "phase11/terraform.tfstate"
  region         = "ap-northeast-2"
  encrypt        = true
  dynamodb_table = "samhan-terraform-locks"
}
```

---

## 단계 1 — terraform apply (AWS 인프라 생성)

```bash
cd infrastructure/terraform

# 초기화 (backend 연결)
terraform init -upgrade

# 유효성 검사
terraform validate

# 변경 계획 확인 (PLAN 만 — 실 자원 없음)
terraform plan -var-file=terraform.tfvars -out=tfplan

# 계획 검토 후 apply (월 ₩405,000 비용 발생)
terraform apply tfplan

# 출력값 저장
terraform output -json > /tmp/phase11-outputs.json
cat /tmp/phase11-outputs.json
```

**주요 출력값 확인:**
- `rds_endpoint` → .env.production 의 SAMHAN_DB_HOST
- `ecr_registry` → .env.production 의 ECR_REGISTRY
- `alb_dns_name` → DNS cutover 전 임시 접속 확인
- `route53_name_servers` → 도메인 등록기관 NS 설정

---

## 단계 2 — Docker 이미지 빌드 + ECR push (17 services)

> 로컬 또는 CI/CD (GitHub Actions) 에서 실행

```bash
# ECR 로그인
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=ap-northeast-2
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ECR_REGISTRY

# 서비스 목록 (17)
SERVICES=(
  "eureka-server" "api-gateway" "auth-service" "logging-service"
  "user-service" "product-service" "inventory-service" "slip-service"
  "accounting-service" "partner-order-service" "dc-config-service"
  "partner-auth-service" "groupware-service" "notification-service"
  "dashboard-service" "partner-service" "arologis-service"
)

# 빌드 태그 (배포 날짜 기반 또는 Git SHA)
IMAGE_TAG=$(date +%Y%m%d-%H%M)

# 각 서비스 Gradle 빌드 + Docker 이미지 빌드 + ECR push
for svc in "${SERVICES[@]}"; do
  echo "=== $svc 빌드 ==="

  # Gradle JAR 빌드 (루트에서)
  ./gradlew :services:${svc}:bootJar -x test

  # Docker 이미지 빌드
  docker build \
    -f infrastructure/docker/spring-service.Dockerfile \
    --build-arg JAR_FILE=services/${svc}/build/libs/${svc}.jar \
    -t $ECR_REGISTRY/samhanlogis-production-${svc}:${IMAGE_TAG} \
    -t $ECR_REGISTRY/samhanlogis-production-${svc}:latest \
    .

  # ECR push
  docker push $ECR_REGISTRY/samhanlogis-production-${svc}:${IMAGE_TAG}
  docker push $ECR_REGISTRY/samhanlogis-production-${svc}:latest

  echo "=== $svc push 완료 ==="
done

echo "IMAGE_TAG=${IMAGE_TAG}" >> .env.production.push
```

---

## 단계 3 — EC2 docker-compose.prod.yml 배포 + 서비스 기동

### 3-A. Terraform 자동 업로드 산출물 확인
```bash
# 배포 산출물은 terraform apply 가 aws_s3_object 로 자동 업로드합니다.
# EC2 user_data 는 아래 두 객체를 첫 부팅 시 다운로드합니다.
aws s3 ls s3://samhan-attachments/deploy/docker-compose.prod.yml
aws s3 ls s3://samhan-attachments/deploy/init-rds.sql
```

> user_data.sh 는 EC2 최초 기동 시 자동 실행됨 (단계 1 terraform apply 완료 후).  
> `infrastructure/docker-compose.prod.yml` 또는 `infrastructure/terraform/templates/init-rds.sql` 변경 시 Terraform `source` + `etag` 감지로 S3 객체가 갱신됨.  
> `.env.production` 의 SES/NTS/KFTC/CODEF/Aligo 등 운영 실값 보정은 SSM Session Manager 접속 후 수동 수행.  
> 재배포 시: SSM Session Manager 로 접속 후 수동 실행.

### 3-B. 첫 기동 확인 (EC2 SSM Session Manager)
```bash
# AWS 콘솔 → EC2 → 인스턴스 → "연결" → "Session Manager"
# 또는:
aws ssm start-session --target <INSTANCE_ID> --region ap-northeast-2

# 초기화 로그 확인
tail -f /var/log/user_data.log

# 컨테이너 상태 확인
docker compose -f /opt/samhanlogis/docker-compose.prod.yml ps
```

### 3-C. 재배포 (이미지 업데이트)
```bash
# SSM 세션에서:
cd /opt/samhanlogis

# 새 이미지 pull + 롤링 재시작
docker compose -f docker-compose.prod.yml --env-file .env.production \
  pull && docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d --remove-orphans
```

---

## 단계 4 — RDS Flyway 마이그레이션 검증

각 Spring 서비스는 startup 시 Flyway 마이그레이션을 자동 실행합니다.

```bash
# SSM 세션에서 서비스 로그 확인 (auth-service 예시)
docker logs samhan-auth-service 2>&1 | grep -E "Flyway|migration|Successfully"

# RDS 직접 접속하여 스키마 확인 (psql 필요)
PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${SAMHAN_DB_HOST}" -U samhan -d auth_db \
  -c "\dt" 2>&1 | head -30
```

### 기존 데이터 이관 (로컬 → RDS)
```bash
# 로컬 PostgreSQL 덤프 (각 서비스별)
pg_dump -h localhost -U samhan -d auth_db -F c -f auth_db.dump

# RDS 로 복원
pg_restore -h "${RDS_ENDPOINT}" -U samhan -d auth_db auth_db.dump

# 또는 직접 pg_dump | pg_restore 파이프
pg_dump -h localhost -U samhan -d auth_db -F c \
  | pg_restore -h "${RDS_ENDPOINT}" -U samhan -d auth_db
```

---

## 단계 5 — Route 53 DNS Cutover

### 5-A. cutover D-1: TTL 단축 확인
ALB alias 레코드는 AWS 가 TTL 을 자동 관리(60s). 별도 TTL 단축 불필요.

### 5-B. 도메인 등록기관 NS 레코드 설정
```bash
# terraform output 에서 NS 서버 4개 확인
terraform output route53_name_servers
# → 도메인 등록기관 관리 화면에서 samhan-air.com 의 NS 레코드를 위 4개로 교체
```

### 5-C. DNS 전파 확인 (전파 최대 48시간, 보통 1시간)
```bash
nslookup api.samhan-air.com 8.8.8.8
# → ALB DNS 이름으로 CNAME 또는 A 레코드 확인
```

---

## 단계 6 — /actuator/health 전체 검증

```bash
# ALB DNS HTTPS 임시 헬스체크
# 인증서는 api.samhan-air.com / *.arologis.samhan-air.com 용이라 ALB DNS hostname 과 불일치합니다.
# DNS cutover 전 임시 확인에만 -k 를 사용합니다.
ALB_DNS=$(terraform output -raw alb_dns_name)
curl -k -fs "https://${ALB_DNS}/actuator/health" | python3 -m json.tool

# DNS cutover 완료 후 운영 도메인 직접 확인 (정식 TLS 검증)
curl -fs https://api.samhan-air.com/actuator/health | python3 -m json.tool

# 17 service 전체 health check (SSM Session Manager 세션 내부 localhost curl)
# EC2 에 퍼블릭 IP 없음 — SSM 으로 접속:
#   aws ssm start-session --target <INSTANCE_ID> --region ap-northeast-2
PORTS=(8761 8080 8081 8082 8083 8084 8085 8086 8087 8088 8089 8091 8092 8093 8094 8095 8097)
for port in "${PORTS[@]}"; do
  status=$(curl -s "http://localhost:${port}/actuator/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','N/A'))" 2>/dev/null || echo "FAILED")
  echo "Port ${port}: ${status}"
done
```

**합격 기준:**
- 모든 서비스: `{"status":"UP"}`
- ALB health check: api-gateway:8080/actuator/health 200 OK
- Health Check Lambda: CloudWatch Logs 에서 `[OK] Health check 통과` 확인

---

## 롤백 절차

### R-1. 서비스 중단 (즉시)
```bash
# EC2 SSM 세션에서
docker compose -f /opt/samhanlogis/docker-compose.prod.yml down
```

### R-2. DNS 복구 (Route 53 → 구 서버)
```bash
# Route 53 레코드를 구 서버 IP 로 변경
# ALB alias 레코드 삭제 또는 다른 IP 로 변경
# (DNS 전파: ~60s, ALB alias TTL 자동 관리)
```

### R-3. RDS 롤백
```bash
# RDS 자동 백업에서 Point-in-time 복구
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier samhanlogis-production-rds \
  --target-db-instance-identifier samhanlogis-production-rds-rollback \
  --restore-time <TIMESTAMP> \
  --region ap-northeast-2
```

---

## 미해결 수동 항목 (개발책임자 직접 처리 필요)

| # | 항목 | 수행 시점 |
|---|------|-----------|
| M-1 | AWS 계정 생성 + IAM 사용자 발급 | 단계 0 전 |
| M-2 | samhan-air.com Route 53 Hosted Zone 사전 생성 + 도메인 등록기관 NS 위임 | 단계 0-G |
| M-3 | Secrets Manager 시크릿 실 값 입력 (jwt-secret/internal-token/arologis-jwt/rabbit-password/S3 access/secret key) + terraform.tfvars `rds_password` 입력 | 단계 0-D/0-F |
| M-4 | SMTP 자격증명 (AWS SES SMTP 발급 + 발신 도메인 인증) | 단계 0 후 |
| M-5 | AMI ID 최신 확인 + tfvars 업데이트 | 단계 0-E |
| M-6 | Slack Webhook URL 발급 | 단계 0 |
| M-8 | terraform.tfvars 실 값 작성 + .gitignore 확인 | 단계 0-F |
| M-9 | 도메인 등록기관 NS 레코드 교체 | 단계 5-B |
| M-10 | 기존 로컬 데이터 → RDS 이관 (pg_dump/restore) | 단계 4 |
| M-11 | arologis SAMHAN_INSUNG_QUICK_* 인성데이타 vendor sandbox 키 | 운영 후 |
| M-12 | FCM credentials (notification-service, arologis-service) | 운영 후 |
| M-13 | Aligo SMS 키 (notification-service) | 운영 후 |
| M-14 | NTS/KFTC/CODEF sandbox 키 (accounting-service) | 운영 후 |
| M-15 | .env.production 의 SAMHAN_COMPENSATION_ALERT_RECIPIENT_USER_ID 입력 | 단계 3 |
| M-16 | RabbitMQ 운영 비밀번호 Secrets Manager 주입 (`samhan/production/rabbit-password`) | 단계 0-D |
| M-17 | terraform.tfvars `route53_zone_id` 에 사전 위임된 Hosted Zone ID 입력 | 단계 1 전 |
| M-18 | AWS S3 access/secret key 실값 수동 주입 (`samhan/production/s3-access-key`, `samhan/production/s3-secret-key`) | 단계 0-D |

---

## 참고 파일 경로

| 파일 | 용도 |
|------|------|
| `infrastructure/terraform/main.tf` | Terraform 진입점, 17 service 포트 맵 |
| `infrastructure/terraform/ec2.tf` | EC2 + ALB + ACM + Auto Recovery |
| `infrastructure/terraform/rds.tf` | RDS PostgreSQL 15, 15 DB, backup 7일 |
| `infrastructure/terraform/ecr.tf` | ECR 17 service 리포지토리 |
| `infrastructure/terraform/vpc.tf` | VPC/Subnet/NAT/Security Groups |
| `infrastructure/terraform/route53.tf` | samhan-air.com 8 subdomain |
| `infrastructure/terraform/arologis.tf` | 아로로지스 3 subdomain |
| `infrastructure/terraform/lambda.tf` | Health Check Lambda (Tier 3) |
| `infrastructure/terraform/monitoring.tf` | CloudWatch 알람 8종 + Dashboard |
| `infrastructure/terraform/s3.tf` | samhan-attachments / samhan-logs |
| `infrastructure/terraform/iam.tf` | EC2 Role + Lambda Role |
| `infrastructure/terraform/variables.tf` | 입력 변수 정의 |
| `infrastructure/terraform/outputs.tf` | 배포 후 출력값 |
| `infrastructure/terraform/terraform.tfvars.example` | tfvars 예시 (실 값 없음) |
| `infrastructure/terraform/templates/user_data.sh` | EC2 최초 기동 스크립트 |
| `infrastructure/terraform/templates/init-rds.sql` | RDS 15 DB 초기화 SQL |
| `infrastructure/terraform/templates/health_check_lambda.py` | Health Check Lambda 소스 |
| `infrastructure/docker-compose.prod.yml` | 17 service 운영 docker-compose |
| `infrastructure/scripts/phase11-deploy.ps1` | 배포 자동화 PowerShell |
