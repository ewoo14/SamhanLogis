---
name: Phase 11 AWS 마이그레이션 — 단일 환경 + 자동 복구 패턴 (확정)
description: Seoul region 단일 환경 (분리 X), m5.xlarge + db.t3.medium + RDS automated backup + EC2 Auto Recovery + Health Check Lambda. 월 ₩405,000 (정상가), RI 1년 ₩290,000.
type: project
originSessionId: 78cac99d-5dee-47ca-8254-3834a088f393
---
## 사용자 최종 결정 (2026-05-08, 개발책임자)

1. **Korea region**: ap-northeast-2 (Seoul)
2. **환경 분리 없음**: production 1환경만 (dev/staging 미운영)
3. **백업 — 적용 권고만 적용**:
   - ✅ RDS automated backup retention 7일 (무료)
   - ❌ RDS snapshot 매 6시간 (제외)
   - ❌ Cross-region replica (제외)
4. **장애 복구 — 적용 권고만 적용**:
   - ✅ EC2 Auto Recovery (Tier 1, CloudWatch alarm 거의 무료)
   - ✅ Health Check Lambda (Tier 3, app-level health check + 자동 reboot, Lambda 무료 한도)
   - ❌ Multi-AZ HA (Tier 5, 보류)
5. **APM 제외**: DataDog/NewRelic 미사용. CloudWatch 자체 metric + log 만

**Why**: MVP/스타트업 모드 — 비용 우선 + 자동 복구 무료 옵션 활용. 환경 분리 + 완전 HA 는 사용자 증가 + 매출 가시성 후 단계적 추가.

**How to apply**: Phase 11 진입 시 본 메모리의 사양/비용 표를 그대로 사용. RI 약정은 6개월 안정 운영 검증 후 결정.

## 인프라 구성 (단일 환경)

| 항목 | 사양 | 월 비용 |
|---|---|---|
| EC2 | m5.xlarge × 1 (4 vCPU + 16 GB) — 14 service 동시 docker-compose | $130 |
| RDS PostgreSQL | db.t3.medium Single-AZ + 100GB gp3 (14 DB 통합) | $80 |
| ALB × 1 | | $22 |
| Route53 + ACM | samhan-air.com 호스팅 영역 + SSL 무료 | $1 |
| S3 + CloudFront | 서명/인쇄/CDN | $25 |
| CloudWatch | log + metric 14일 retention | $30 |
| ECR | 14 image (~7GB) | $5 |
| Data Transfer | 인터넷 outbound | $9 |
| **총** | | **$302/월 ≈ ₩405,000** |

## 자동 복구 + 백업 (모두 무료 + 무위험)

- **RDS automated backup**: retention 7일, storage 동일 = 무료. 데이터 손실 → 최대 24시간 손실 (점진 복구 가능)
- **EC2 Auto Recovery**: AWS hardware/네트워크/hypervisor fail 자동 감지 → 새 hardware 에서 재기동 (~5-15분)
- **Health Check Lambda**: `/actuator/health` 5분 연속 fail → Lambda 가 EC2 reboot. OS hang / Spring Boot OOM / deadlock 감지

## 운영 시나리오

| 시나리오 | 복구 시간 |
|---|---|
| AWS hardware fail | 5-15분 (Auto Recovery) |
| OS hang / Spring Boot crash | 5-10분 (Health Check Lambda) |
| AZ 전체 장애 | **다운** (Multi-AZ 미적용) — 사용자 증가 후 단계적 검토 |
| 사용자 데이터 손실 | 최대 24시간 (RDS backup 시점까지) |

## 연 비용 시나리오

| 시나리오 | 월 USD | 월 ₩ | 연 ₩ |
|---|---|---|---|
| 정상가 (On-Demand) | $302 | ₩405,000 | **₩4,860,000** |
| Reserved Instance 1년 약정 (-30%) | $215 | ₩290,000 | **₩3,470,000** |
| Reserved Instance 3년 약정 (-50%) | $151 | ₩200,000 | ₩2,420,000 |

## 추후 단계적 보강 (사용자 증가 + 매출 검증 시)

| 우선순위 | 보강 항목 | 추가 월 비용 |
|---|---|---|
| 1 | Staging 환경 (m5.xlarge × 1 + db.t3.medium) | +$240 |
| 2 | Multi-AZ HA (EC2 × 2 + db.t3.large Multi-AZ) | +$370 |
| 3 | DR (snapshot 매 6h + cross-region replica) | +$220 |
| 4 | Dev 환경 추가 | +$145 |

전체 보강 시 = $1,320/월 (이전 환경 분리+DR 안과 동일). 현재 단계는 Tier 0 (단일+자동 복구) 로 시작.

## Free Tier 참고 (Phase 11 진입 직전 가입 시 12개월 활용)

- EC2 t3.micro 750h/월 + RDS db.t3.micro 750h/월 등
- 14 service 풀 운영 불가 (RAM 1GB 부족)
- 활용 가능 = 추가 PoC 또는 dev 환경 보조 (장기 계산 X)

## 구현 진척 (IaC)

- **#660 (2026-06-28 머지, `579835ef`)**: 기존 IaC(#152)를 **17 service 현행화**(service_ports 실포트·17 ECR image·15 DB·max_conn 300) + 이식 준비 산출물(`infrastructure/terraform/ecr.tf`·`infrastructure/docker-compose.prod.yml`·`init-rds.sql`·`CUTOVER.md` 6단계 런북·`user_data.sh` 재작성·Secrets Manager 시크릿 일원화). 0수렴(5 듀얼리뷰). ※ 위 표/구성의 "14 service" 는 #660 에서 17 로 현행화됨.
- **회사 PC terraform 실증 (2026-06-29)**: terraform v1.15.7 로 `init -backend=false`(AWS provider v5.100.0 / archive v2.8.0) → **`validate` ✅ "Success! The configuration is valid."** · `fmt -check` ✅ · `plan` 구조 ready(변수 배선·`data.archive_file` read·Outputs 계산 완료, 유일 차단 = `No valid credential sources` = 실 AWS 자격 = M-1). → main IaC 유효 + #660 머지 건전 실증(handoff "validate 불가" stale 정정).
- **잔여 = 실 이식**: 실 AWS 계정 + tfvars 실값 + `terraform plan`/`apply`(CUTOVER.md 단계 1) + 수동 18항목(M-1~18: AWS 계정·Secrets Manager 시크릿 7종·SSH키·S3 backend 버킷·hosted zone 위임·ACM·로컬 PG→RDS 이관 등). **실 계정 생성·비용(₩405K/월) 동반 → 개발책임자 착수 지시 대기.**
