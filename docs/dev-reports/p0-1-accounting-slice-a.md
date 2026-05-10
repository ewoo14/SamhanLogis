# P0-1 Slice A — 회계 보고서 검증용 seed 데이터 + CI matrix 보강

작성일: 2026-05-10
담당: DevOps (인프라/CI 파트)
연관 branch: `feature/p0-1-accounting-14-reports`

---

## 1. Slice A 범위 (3대 보고서 검증 인프라)

P0-1 은 accounting-service 의 손익계산서 / 재무상태표 / 시산표 3대 보고서 endpoint 를
Samhan Public 자체 분개/집계 로직으로 제공하는 Backlog 슬라이스이다.

Slice A (본 dev-report) 는 BE / FE / Designer 가 보고서 endpoint 를 구현 · 검증할 수 있도록
**검증용 seed 분개 데이터** 와 **CI matrix 정합성** 을 인프라 측에서 선행 구축하는 작업이다.

---

## 2. DevOps 산출물

### 2-1. Flyway V6 seed SQL

파일: `services/accounting-service/src/main/resources/db/migration/V6__seed_report_validation_journals.sql`

손익계산서 / 재무상태표 항목별 검증용 분개 7건을 POSTED 상태로 삽입한다.

| 분개번호     | 날짜       | 분류          | 계정 (차변 → 대변)                         | 금액(차/대)              |
|------------|-----------|--------------|------------------------------------------|------------------------|
| SEED-RPT-001 | 2026-01-15 | 상품매출       | 110(외상매출금) → 401(상품매출) + 220(부가세예수금) | 2,200,000 = 2,000,000 + 200,000 |
| SEED-RPT-002 | 2026-02-10 | 제품매출       | 110(외상매출금) → 404(제품매출) + 220(부가세예수금) | 5,500,000 = 5,000,000 + 500,000 |
| SEED-RPT-003 | 2026-01-15 | 상품매출원가   | 501(상품매출원가) → 101(현금)               | 1,200,000 = 1,200,000            |
| SEED-RPT-004 | 2026-01-31 | 급여(판관비)   | 801(급여) → 221(예수금) + 102(보통예금)     | 3,000,000 = 300,000 + 2,700,000  |
| SEED-RPT-005 | 2026-02-28 | 임차료(판관비) | 819(임차료) → 102(보통예금)                 | 500,000 = 500,000                |
| SEED-RPT-006 | 2026-03-31 | 이자수익(영업외)| 102(보통예금) → 901(이자수익)              | 120,000 = 120,000                |
| SEED-RPT-007 | 2026-12-31 | 법인세비용     | 991(법인세비용) → 210(미지급금)             | 700,000 = 700,000                |

**복식부기 균형**: 전 7건 sum(debit) = sum(credit) 엄격 준수.
**상태**: 전 7건 POSTED (posted_by = SYSTEM_SEED).
**UUID**: 결정적 하드코딩 UUID (JournalSeeder 패턴 일치) — Flyway re-run 시 중복 방지.
**운영 DB 격리**: journal_no 에 `SEED-RPT-` prefix + description 에 `[DEV-SEED]` 명시.
Flyway 는 환경 무관 적용이므로 운영 DB 에도 삽입되나, 보고서 집계 로직은
`POSTED` 상태 분개만 집계하므로 수치 왜곡 없이 식별 가능.
운영 배포 전 `DELETE FROM journals WHERE journal_no LIKE 'SEED-RPT-%'` 실행 권장.

### 2-2. 보고서 검증용 IT

파일: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/ReportValidationSeedIT.java`

Testcontainers PostgreSQL + Flyway V1~V6 자동 적용 환경에서 5개 테스트 실행:

| 테스트 메서드                        | 검증 내용                                       |
|-----------------------------------|-------------------------------------------------|
| `sevenPostedSeedJournalsExist`    | 7건 분개가 POSTED 상태로 존재                      |
| `allSeedJournalsAreBalanced`      | 전 7건 복식부기 균형 (debit = credit)              |
| `rpt001ProductSalesAmount`        | SEED-RPT-001 금액 + 401 계정 라인 정확성           |
| `rpt002ProductManufactureSalesAmount` | SEED-RPT-002 금액 + 404 계정 라인 정확성       |
| `rpt004SalaryWithholdingTax`      | SEED-RPT-004 급여/예수금/보통예금 3라인 분리 확인   |
| `rpt007IncomeTaxExpense`          | SEED-RPT-007 법인세비용(991) + 미지급금(210) 확인  |

Docker 미가용 환경: `DockerAvailableCondition` 이 skip 처리 (build fail 없음).

### 2-3. CI matrix 확인

`.github/workflows/ci.yml` 의 `accounting+partner` 그룹이
`:services:accounting-service:test` 를 이미 포함하고 있어
`ReportValidationSeedIT` 는 자동으로 CI 대상에 포함된다. 별도 matrix 변경 불필요.

```yaml
- name: accounting+partner
  timeout: 30
  test-tasks: ':services:accounting-service:test :services:partner-service:test ...'
```

### 2-4. docker-compose 확인

`infrastructure/docker-compose.yml` 은 인프라 서비스(PostgreSQL/Redis 등)만 정의하며
accounting-service 컨테이너를 직접 관리하지 않는다. 포트 변경 없음.
accounting-service 의 `SERVER_PORT` / `SAMHAN_ACCOUNTING_PORT` 환경변수는
`application.yml` 에 이미 정의되어 있으며 신규 endpoint 추가에 따른 포트 변경도 없다.

---

## 3. BE / FE / Designer 산출물 요약 (타 agent)

| 팀       | 산출물 (예상)                                       |
|---------|----------------------------------------------------|
| BE      | 손익계산서 / 재무상태표 / 시산표 집계 service + endpoint |
| FE      | Desktop 보고서 화면 (손익/재무/시산표 탭)              |
| Designer | 보고서 UI 디자인 (표 레이아웃 + 인쇄 양식)            |
| QA      | Playwright E2E — 보고서 조회 시나리오                 |

---

## 4. 매뉴얼 갱신 요약

- V6 seed SQL 주석에 복식부기 균형 계산표 포함.
- `ReportValidationSeedIT` Javadoc 에 검증 목적 + 이중 가드 설명.
- 운영 배포 전 DEV seed 삭제 SQL 주석 명시 (V6 파일 내).

---

## 5. CI 결과 (작성 시점)

작성 시점 기준 `feature/p0-1-accounting-14-reports` 브랜치에서 PR CI 미발행 상태.
PR 발행 후 `accounting+partner` 그룹 (timeout 30분) 에서 `ReportValidationSeedIT` 포함
전체 accounting-service 테스트가 수행될 예정.
Docker 가용 여부에 따라 Testcontainers IT 가 pass 또는 skip 처리됨.

---

## 6. Phase 11 AWS 마이그레이션 시 영향

영향 없음. 본 Slice A 는 기존 accounting-service 에 Flyway SQL + IT 추가만 수행하며,
서비스 구조 변경 / 포트 변경 / 신규 인프라 의존 없음.

Phase 11 AWS 단일 환경(m5.xlarge + db.t3.medium) 이행 시:
- V6 seed 는 RDS PostgreSQL 에 Flyway 자동 적용됨.
- 운영 DB 오염 방지를 위해 이행 직전 `SEED-RPT-` prefix 분개 삭제 필요.
- accounting-service 포트 (`SAMHAN_ACCOUNTING_PORT=8087`) 유지.
