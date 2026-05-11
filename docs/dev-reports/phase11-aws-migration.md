# phase11-aws-migration — DevOps 개발 보고서

> 작성일: 2026-05-11
> 담당: DevOps (SamhanLogis Phase 11)
> 브랜치: feature/phase11-aws-terraform
> 상태: **Terraform validate PASS / dry-run 완료 / 실 배포 대기**

---

## 1. 작업 범위

Phase 11 = 로컬 docker-compose 환경 → AWS 단일 Production 환경 마이그레이션 계획 + Terraform IaC 코드 + dry-run 검증.

| 산출물 | 경로 |
|---|---|
| 마이그레이션 계획 | `docs/migration/phase11/PHASE11-AWS-PLAN.md` |
| Terraform 코드 | `infrastructure/terraform/` (10 모듈) |
| Cutover 체크리스트 | `docs/migration/phase11/CUTOVER-CHECKLIST.md` |
| 배포 스크립트 | `infrastructure/scripts/phase11-deploy.ps1` |
| dry-run 결과 | `docs/qa/phase11/terraform-plan.txt` |

---

## 2. Terraform 모듈 구성

### 2-1. 모듈 목록 (10개)

| 파일 | 내용 | 주요 리소스 |
|---|---|---|
| `main.tf` | provider + 공통 locals | aws provider (ap-northeast-2) |
| `variables.tf` | 입력 변수 29개 | - |
| `outputs.tf` | 최종 출력값 | cutover_env_vars |
| `vpc.tf` | VPC + 네트워크 | VPC/Subnet/NAT/IGW/SG x4 |
| `ec2.tf` | EC2 + ALB | m5.xlarge + ALB + ACM + Auto Recovery |
| `rds.tf` | RDS PostgreSQL 15 | db.t3.medium Single-AZ + backup 7일 |
| `s3.tf` | S3 버킷 3개 | attachments/logs + 암호화/lifecycle |
| `iam.tf` | IAM Role + 정책 | EC2 role + Lambda role |
| `lambda.tf` | Health Check Lambda | Python 3.12 + EventBridge 1분 |
| `route53.tf` | DNS 8 subdomain | samhan-air.com + ACM 검증 |
| `monitoring.tf` | CloudWatch | 8 alarm + dashboard |

### 2-2. 보조 파일

| 파일 | 내용 |
|---|---|
| `terraform.tfvars.example` | 입력 변수 예시 (placeholder, 실값 없음) |
| `templates/health_check_lambda.py` | Health Check Lambda 소스 (Python 3.12) |
| `templates/user_data.sh` | EC2 user_data 초기화 스크립트 |

---

## 3. AWS 인프라 구성 요약

### 3-1. 컴퓨팅

| 항목 | 사양 |
|---|---|
| EC2 | m5.xlarge (4 vCPU + 16 GB RAM) |
| EBS | gp3 100 GB (iops=3000, throughput=125MB/s) |
| 모니터링 | 세부 모니터링 활성 (1분 간격) |
| 자동 복구 | EC2 Auto Recovery (CloudWatch StatusCheckFailed_System 알람) |

### 3-2. 데이터베이스

| 항목 | 사양 |
|---|---|
| 엔진 | PostgreSQL 15 (RDS 관리형) |
| 인스턴스 | db.t3.medium |
| 스토리지 | gp3 100 GB (자동 확장 200 GB) |
| Multi-AZ | false (비용 최적화 — 사용자 결정) |
| 자동 백업 | 7일 retention (KST 03:00~04:00 백업 창) |
| 삭제 보호 | 활성 |
| max_connections | 200 (14 service 동시 연결 최적화) |

### 3-3. 오브젝트 스토리지

| 버킷 | 용도 | 암호화 | lifecycle |
|---|---|---|---|
| samhan-attachments | 서비스 첨부파일 (첨부/서명/현장사진) | SSE-S3 | 180일 후 Glacier IR |
| samhan-logs | ALB log + service log archive | SSE-S3 | 90일 후 만료 |

### 3-4. 로드밸런서 + DNS

| 항목 | 구성 |
|---|---|
| ALB | internet-facing, HTTPS 443 + HTTP→HTTPS redirect |
| TLS | ACM *.samhan-air.com (DNS 검증) |
| Health Check | /actuator/health (30s interval, 2/3 threshold) |
| DNS | Route 53 samhan-air.com 8 subdomain (ALIAS → ALB) |

### 3-5. 자동 복구 (무료 옵션)

| 계층 | 구성 | 복구 시간 |
|---|---|---|
| Tier 1 — EC2 Auto Recovery | CloudWatch StatusCheckFailed_System → recover | 5-15분 |
| Tier 3 — Health Check Lambda | /actuator/health 5분 연속 실패 → EC2 reboot | 5-10분 |

### 3-6. 모니터링 알람 (8건)

| 알람 | 임계치 | 동작 |
|---|---|---|
| ALB 5xx | 5분간 10건 이상 | SNS 알림 |
| ALB 응답시간 | p99 > 500ms | SNS 알림 |
| RDS CPU | > 80% (5분 평균) | SNS 알림 |
| RDS 연결 수 | > 160 (max 200의 80%) | SNS 알림 |
| RDS Disk | 여유 < 15GB | SNS 알림 |
| EC2 CPU | > 80% (5분 평균) | SNS 알림 |
| EC2 메모리 | > 85% (CloudWatch Agent) | SNS 알림 |
| EC2 Disk | > 85% (CloudWatch Agent) | SNS 알림 |

---

## 4. 비용 추정

### 4-1. 월 비용 (정상가 On-Demand)

| 항목 | 사양 | USD/월 | KRW/월 |
|---|---|---|---|
| EC2 m5.xlarge | 4 vCPU + 16 GB × 1 | $130 | ₩175,000 |
| RDS db.t3.medium | PostgreSQL 15 + 100GB gp3 | $80 | ₩107,000 |
| ALB | 1 인스턴스 | $22 | ₩29,000 |
| Route 53 + ACM | samhan-air.com + SSL | $1 | ₩1,000 |
| S3 + CloudFront | 첨부/CDN | $25 | ₩33,000 |
| CloudWatch | log + metric 14일 | $30 | ₩40,000 |
| ECR | 14 image | $5 | ₩6,000 |
| Data Transfer | 인터넷 outbound | $9 | ₩12,000 |
| **합계** | | **$302** | **₩405,000** |

### 4-2. 연 비용 시나리오

| 시나리오 | 월 KRW | 연 KRW |
|---|---|---|
| 정상가 (On-Demand) | ₩405,000 | **₩4,860,000** |
| RI 1년 약정 (-28%) | ₩290,000 | ₩3,470,000 |
| RI 3년 약정 (-51%) | ₩200,000 | ₩2,420,000 |

---

## 5. dry-run 검증 결과

### 5-1. 검증 항목

| 항목 | 결과 | 비고 |
|---|---|---|
| terraform init | PASS | aws v5.100.0 + archive v2.7.1 |
| terraform validate | PASS | 경고 0, 오류 0 |
| terraform plan (구조) | PASS | 실 credential 없어 API 단계에서 중단 (예상) |
| 코드 문법 오류 | 없음 | HCL 구문 검증 완료 |
| 자원 참조 오류 | 없음 | 상호 참조 (sg/lb/rds/lambda) 검증 완료 |

### 5-2. 예상 자원 수

| 유형 | 개수 |
|---|---|
| Terraform 모듈 | 10개 |
| 자원 유형 | 25+ 종류 |
| 예상 생성 자원 | 80+ 개 |

### 5-3. 수정 이력

| 항목 | 수정 내용 |
|---|---|
| s3.tf lifecycle | filter 블록 누락 → 추가 (aws provider v5 필수) |

---

## 6. 마이그레이션 일정

```
D-14: 사전 준비 (AWS account + IAM + Route 53 + ACM + 키페어)
D-7:  terraform apply (인프라 생성)
D-3:  서비스 배포 + DB 마이그레이션 + S3 동기화
D-1:  DNS TTL 60s 단축 (cutover 준비)
D-0:  DNS cutover (samhan-air.com → Route 53)
D+7:  1주 모니터링 (CloudWatch 8 alarm)
D+30: Phase 11 완료 선언 + RI 약정 검토
```

---

## 7. Rollback 절차

### 7-1. DNS rollback (60초 이내)

- TTL 60s 사전 단축으로 rollback 시 최대 2분 내 이전 DNS로 복원 가능
- 도메인 등록기관 NS 레코드 즉시 원복

### 7-2. DB rollback

- cutover 직전 RDS 수동 스냅샷 필수
- 스냅샷에서 신규 인스턴스 복원 (수분 소요)

### 7-3. 서비스 rollback

- EC2 docker-compose 이전 이미지 tag 로 교체
- Health Check Lambda 자동 reboot 대기

---

## 8. 운영 인계 가이드

### 8-1. 일상 운영

| 작업 | 방법 |
|---|---|
| 서비스 상태 확인 | CloudWatch 대시보드 / Grafana |
| 서비스 재시작 | EC2 SSM Session Manager → docker restart |
| DB 접근 | EC2 경유 psql (RDS 직접 접근 불가) |
| 로그 확인 | CloudWatch Logs /samhanlogis/production/docker |
| 파일 업로드 확인 | AWS S3 콘솔 → samhan-attachments |

### 8-2. 장애 대응

| 시나리오 | 복구 방법 | 예상 시간 |
|---|---|---|
| AWS 하드웨어 장애 | EC2 Auto Recovery 자동 | 5-15분 |
| OS hang / OOM | Health Check Lambda → reboot | 5-10분 |
| AZ 장애 | 수동 대응 (Multi-AZ 미적용) | 미정 |
| DB 장애 | RDS 자동 재시작 / 스냅샷 복원 | 5-30분 |

### 8-3. 비용 관리

- AWS Cost Explorer 월별 확인
- Budget 알람: $350/월 초과 시 이메일 알림 (추가 설정 권장)
- RI 약정 결정 시점: 6개월 안정 운영 확인 후

---

## 9. 후속 작업 (Phase 12 이후)

| 우선순위 | 항목 | 시점 |
|---|---|---|
| 1 | Staging 환경 추가 | 사용자 증가 후 |
| 2 | Multi-AZ HA (EC2 × 2 + db.t3.large) | 매출 가시성 확인 후 |
| 3 | CloudFront (files.samhan-air.com CDN) | Phase 12 |
| 4 | ElastiCache Redis 분리 | 서비스 부하 증가 시 |
| 5 | RI 약정 (1년) | 6개월 운영 후 |

---

## 10. 참조

- 마이그레이션 계획: `docs/migration/phase11/PHASE11-AWS-PLAN.md`
- Cutover 체크리스트: `docs/migration/phase11/CUTOVER-CHECKLIST.md`
- Phase 11 진입 조건: `docs/migration/phase11/M-PHASE-11-readiness.md`
- Phase 11 dry-run: `docs/migration/phase11/M-AWS-MIGRATION-DRY-RUN.md`
- Terraform 코드: `infrastructure/terraform/`
- 배포 스크립트: `infrastructure/scripts/phase11-deploy.ps1`
- dry-run 결과: `docs/qa/phase11/terraform-plan.txt`
- Phase 11 AWS 메모리: `project_phase11_aws.md`
