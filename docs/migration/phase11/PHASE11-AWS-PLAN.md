# PHASE11-AWS-PLAN — Phase 11 AWS 마이그레이션 계획

> 작성일: 2026-05-11
> 담당: DevOps (SamhanLogis Phase 11)
> 상태: **Terraform dry-run PASS / 실 배포 대기 (개발책임자 승인)**

---

## 1. 마이그레이션 범위

Phase 11 = 로컬 docker-compose 환경 → AWS 단일 Production 환경 전환.

| 항목 | 현재 (로컬) | Phase 11 (AWS) |
|---|---|---|
| 컴퓨팅 | Docker Desktop (개발자 PC) | EC2 m5.xlarge (4 vCPU + 16 GB) |
| 데이터베이스 | PostgreSQL 16-alpine (docker) | RDS db.t3.medium PostgreSQL 15 |
| 오브젝트 스토리지 | MinIO (docker) | S3 (samhan-attachments) |
| 로드밸런서 | Nginx 1.27 (docker) | ALB + ACM |
| 도메인/DNS | Cloudflare 임시 | Route 53 (samhan-air.com) |
| 모니터링 | Grafana + Prometheus (docker) | CloudWatch + Grafana (EC2) |
| 메시지큐 | RabbitMQ (docker) | RabbitMQ (EC2 docker-compose 유지) |
| 캐시 | Redis (docker) | Redis (EC2 docker-compose 유지) |

**결정 근거** (개발책임자, 2026-05-08):
- 환경 분리 없음 — production 단일 (dev/staging 미운영)
- Multi-AZ HA 보류 — 사용자 증가 + 매출 가시성 확인 후 단계적 추가
- 자동 복구 무료 옵션 적용: EC2 Auto Recovery + Health Check Lambda

---

## 2. 일정 (D-day 기준)

```
D-14  사전 준비 시작
       - AWS account + IAM baseline 정의
       - Route 53 Hosted Zone 생성 + NS 등록
       - ACM 인증서 발급 (*.samhan-air.com)
       - EC2 키페어 생성
       - terraform.tfvars 작성 (실 값 주입)

D-7   인프라 Terraform apply
       - VPC + Subnet + NAT + IGW
       - EC2 m5.xlarge + EBS gp3 100GB
       - RDS db.t3.medium + 자동 백업 7일
       - S3 버킷 3개 생성
       - ALB + Target Group + Health Check
       - Health Check Lambda 배포
       - CloudWatch 알람 8건 설정

D-3   서비스 배포 + DB 마이그레이션
       - EC2 에 docker-compose.prod.yml 복사
       - 14 service docker pull + 기동
       - RDS 14 DB schema 생성 (Flyway auto)
       - 로컬 → RDS pg_dump → restore
       - S3 첨부파일 동기화 (MinIO → S3)
       - 전체 health check 통과 확인

D-1   DNS cutover 준비
       - Route 53 A record 8 subdomain 등록 (alias → ALB)
       - 현재 DNS TTL 60s 로 단축 (도메인 등록기관)

D-0   DNS cutover (실 전환)
       - 도메인 등록기관 NS → Route 53 NS 변경
       - 트래픽 전환 모니터링 (30분)
       - 5xx < 1% / p99 < 500ms 확인
       - 이상 없으면 rollback 준비물 보존 유지

D+7   1주일 모니터링
       - CloudWatch 알람 8건 점검
       - RDS 백업 1회 발생 확인
       - EC2 Auto Recovery alarm 정상 동작
       - Health Check Lambda 1분 polling 로그 확인
       - ₩405,000/월 비용 확인 (AWS Billing)

D+30  Phase 11 완료 선언
       - 운영 안정화 확인 후 완료
       - RI 약정 여부 결정 (6개월 후 권장)
```

---

## 3. AWS 리소스 사전 준비 체크리스트

### 3-1. 계정 + IAM

```
[ ] AWS account 생성 (신규) 또는 기존 계정 사용
[ ] IAM 사용자 생성 (terraform용 — AdministratorAccess, 작업 완료 후 권한 축소)
[ ] IAM access key 발급 (환경변수: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
[ ] MFA 활성화 (root account)
[ ] AWS Budget 알람 설정 ($400/월 임계치)
```

### 3-2. 사전 생성 리소스 (Terraform 외)

```
[ ] EC2 키페어 생성 (samhanlogis-prod-key) — 다운로드 후 보관
[ ] S3 버킷 생성: samhan-terraform-state (Terraform state용)
    - 버전 관리 활성
    - AES256 암호화
[ ] DynamoDB 테이블 생성: samhan-terraform-locks (lock용, LockID PK)
[ ] Route 53 Hosted Zone 생성: samhan-air.com
    - Zone ID 메모 → terraform.tfvars에 입력
[ ] Slack Webhook URL 준비 → terraform.tfvars에 입력
```

### 3-3. Terraform 실행 준비

```
[ ] Terraform v1.6+ 설치
[ ] terraform.tfvars 작성 (terraform.tfvars.example 복사 후 실값 교체)
[ ] terraform init
[ ] terraform validate
[ ] terraform plan -var-file=terraform.tfvars (실 자원 생성 X — 계획만)
[ ] 계획 검토 후 terraform apply (개발책임자 승인 후)
```

---

## 4. DB 마이그레이션 절차 (로컬 → RDS)

### 4-1. 사전 조건

- RDS 인스턴스 기동 확인 (terraform apply 완료)
- EC2 에서 RDS endpoint 접근 가능 확인 (`psql -h <rds-endpoint> -U samhan`)
- 14 service Flyway 마이그레이션 파일 검증 완료

### 4-2. 14 DB 생성 (RDS init script)

```bash
# EC2 에서 실행
psql -h <RDS_ENDPOINT> -U samhan -d samhanlogis << 'SQL'
CREATE DATABASE auth_db;
CREATE DATABASE user_db;
CREATE DATABASE product_db;
CREATE DATABASE inventory_db;
CREATE DATABASE slip_db;
CREATE DATABASE accounting_db;
CREATE DATABASE logging_db;
CREATE DATABASE partner_db;
CREATE DATABASE partner_auth_db;
CREATE DATABASE dc_config_db;
CREATE DATABASE partner_order_db;
CREATE DATABASE notification_db;
CREATE DATABASE groupware_db;
CREATE DATABASE dashboard_db;
CREATE DATABASE arologis_db;
SQL
```

### 4-3. 로컬 데이터 dump (선택 — 운영 데이터 이전 시)

```bash
# 로컬 PostgreSQL에서 각 service DB dump
pg_dump -h localhost -U samhan -d auth_db -F c -f auth_db.dump
pg_dump -h localhost -U samhan -d user_db -F c -f user_db.dump
# ... 14 DB 반복

# S3 업로드
aws s3 cp *.dump s3://samhan-attachments/migration/dumps/ --region ap-northeast-2

# EC2 에서 S3 다운로드 + RDS restore
aws s3 cp s3://samhan-attachments/migration/dumps/ . --recursive
pg_restore -h <RDS_ENDPOINT> -U samhan -d auth_db auth_db.dump
# ... 14 DB 반복
```

### 4-4. Flyway 자동 마이그레이션

- 각 service 기동 시 `spring.flyway.enabled=true` (기본) → 자동 schema 생성
- V1~VN baseline 자동 적용 확인
- `SELECT version, success FROM flyway_schema_history` 검증

### 4-5. 검증

```
[ ] 14 service Flyway baseline PASS (success=true)
[ ] accounting_db 65 row 한국 일반기업회계기준 시드 확인
[ ] user_db 사원 16 row 시드 확인 (개발 시드 — 실 운영 데이터로 교체 필요)
[ ] RDS 백업 창 확인 (backup_window = 03:00~04:00 KST)
```

---

## 5. DNS cutover 전략 (samhan-air.com)

### 5-1. 사전 조건

- Route 53 Hosted Zone 생성 + NS 레코드 보유
- ACM 인증서 발급 완료 (DNS 검증)
- ALB 기동 + 14 service health check PASS

### 5-2. cutover 절차

```
1. D-1 day: 도메인 등록기관에서 DNS TTL 60s 로 단축
   → 변경 반영 시간 최소화 (최대 1시간)

2. D-0 morning: 최종 서비스 검증 (EC2 직접 접근)
   curl http://<EC2_PUBLIC_IP>:8080/actuator/health

3. D-0: Route 53 A record 8 subdomain 등록 (Terraform apply — route53.tf)
   api.samhan-air.com  → ALB alias
   app.samhan-air.com  → ALB alias
   order.samhan-air.com → ALB alias
   sign.samhan-air.com  → ALB alias
   chat.samhan-air.com  → ALB alias
   files.samhan-air.com → ALB alias
   monitor.samhan-air.com → ALB alias
   quote.samhan-air.com → ALB alias

4. 도메인 등록기관 NS 레코드 → Route 53 NS 4개 로 교체

5. DNS 전파 대기 (TTL 60s → 최대 2분)

6. 전환 확인:
   curl https://api.samhan-air.com/actuator/health
   → {"status":"UP"} 확인

7. 30분 모니터링:
   CloudWatch ALB 5xx < 1%
   CloudWatch ALB p99 < 500ms
```

### 5-3. 8 subdomain 엔드포인트 매핑

| subdomain | 대상 서비스 | 포트 |
|---|---|---|
| api.samhan-air.com | api-gateway | 8080 |
| app.samhan-air.com | desktop 다운로드 page | 8080 |
| order.samhan-air.com | partner-order 웹앱 | 8080 |
| sign.samhan-air.com | slip-service signature | 8080 |
| chat.samhan-air.com | groupware-service | 8080 |
| files.samhan-air.com | 파일 CDN (Phase 12 CloudFront 예정) | 8080 |
| monitor.samhan-air.com | Grafana | 8080 |
| quote.samhan-air.com | estimate-app | 8080 |

---

## 6. Rollback 절차

### 6-1. DNS rollback (TTL 60s 활용)

```
트리거: cutover 후 30분 내 5xx > 5% 또는 서비스 불통

1. 도메인 등록기관 NS 레코드 → 이전 DNS (Cloudflare 등) 로 원복
2. DNS 전파 대기 (TTL 60s → 최대 2분)
3. 이전 인프라에서 서비스 재확인
4. 장애 원인 분석 후 재배포 계획 수립
```

### 6-2. DB rollback

```
트리거: Flyway 마이그레이션 실패 또는 데이터 정합성 오류

1. RDS 수동 스냅샷 (cutover 직전 생성)
   aws rds create-db-snapshot --db-instance-identifier samhanlogis-production-rds \
     --db-snapshot-identifier pre-cutover-snapshot

2. 스냅샷 복원 (새 인스턴스로)
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier samhanlogis-rollback-rds \
     --db-snapshot-identifier pre-cutover-snapshot
```

### 6-3. 서비스 rollback

```
트리거: 서비스 기동 실패 또는 심각한 버그

1. EC2 에서 이전 docker image 로 교체
   docker-compose pull  # 이전 태그 지정
   docker-compose up -d

2. 또는 EC2 Auto Recovery 대기 (하드웨어 장애 시)
   → 5-15분 자동 복구

3. Health Check Lambda 모니터링
   → 연속 5분 실패 시 자동 reboot
```

---

## 7. 비용 요약

| 항목 | 사양 | 월 비용 (USD) | 월 비용 (KRW) |
|---|---|---|---|
| EC2 m5.xlarge | 4 vCPU + 16 GB × 1 | $130 | ₩175,000 |
| RDS db.t3.medium | PostgreSQL 15 + 100GB gp3 | $80 | ₩107,000 |
| ALB | 1 인스턴스 | $22 | ₩29,000 |
| Route 53 + ACM | samhan-air.com | $1 | ₩1,000 |
| S3 + CloudFront | 첨부/CDN | $25 | ₩33,000 |
| CloudWatch | log + metric 14일 | $30 | ₩40,000 |
| ECR | 14 image (~7GB) | $5 | ₩6,000 |
| Data Transfer | 인터넷 outbound | $9 | ₩12,000 |
| **합계** | | **$302** | **₩405,000** |

**Reserved Instance 1년 약정 시**: ₩290,000/월 (-28%)
**Reserved Instance 3년 약정 시**: ₩200,000/월 (-51%)
RI 약정 권장 시점: 6개월 안정 운영 검증 후

---

## 8. 참조

- Terraform 코드: `infrastructure/terraform/`
- Cutover 체크리스트: `docs/migration/phase11/CUTOVER-CHECKLIST.md`
- Phase 11 진입 조건: `docs/migration/phase11/M-PHASE-11-readiness.md`
- dry-run 절차: `docs/migration/phase11/M-AWS-MIGRATION-DRY-RUN.md`
- dev-report: `docs/dev-reports/phase11-aws-migration.md`
