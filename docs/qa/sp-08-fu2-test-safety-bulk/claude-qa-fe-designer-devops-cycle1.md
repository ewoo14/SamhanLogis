# SP-08-FU2 QA + FE + Designer + DevOps 통합 리뷰 — Cycle 1

**HEAD**: `233b40c8`
**PR**: #250

## QA — FIX 요청 (2건)

### Q1~Q5 시나리오 완성도: 정상
- Q1 (P2-2 warehouse) 4 시나리오 / Q2 (P2-3 partner) 4 시나리오 / Q3 (P2-4 accountName) 4 시나리오 / Q4 (P2-5 path) / Q5 (회귀)

### domain-integrity SQL: 정상
- Q1-C (V26 idempotency) / Q2-A/B (cross-DB partnerId UUID 일관) / Q3-C (복식부기 invariant)

### @MockBean WarehouseInternalClient 일관성
- 32+ IT 파일 전체 일괄 적용 확인 (SP-08-FU1 패턴 일관)
- AbstractPostgresIT / SlipRealtimeBrokerConcurrencyIT 제외 정합

### LedgerControllerIT 회귀: FIX 필요 (P2)
- 파일 미존재. Q3-1~3 시나리오는 "신규 작성 예정" 표기되었으나 PR #250 변경 파일에 없음
- LedgerImageServiceTest (기존 변경) 가 단위 수준 회귀 커버

### PartnerInternalControllerIT 신규 케이스: 정상
- `get_summary_by_partner_id_returns_200()` + `get_summary_by_missing_partner_id_returns_404()` 충분

### JournalControllerIT @MockBean PartnerLookupClient 누락: FIX 필요 (P1)
- LedgerService / LedgerImageService 가 PartnerLookupClient (RestClient) 주입
- Eureka 비활성 IT 환경에서 5xx / 컨텍스트 로드 실패 위험
- SliceBValidationIT / SliceCValidationIT 등 다른 8 IT 는 @MockBean 선언 있으나 JournalControllerIT 만 누락

## FE — APPROVE

- `git diff origin/main...HEAD -- clients/` 변경 0 확인
- P2-5 8 endpoint FE-BE path 100% 정합 정적 검증 완료 (`p2-5-path-verification.md`)
- TaxInvoiceListPage.tsx + index.tsx route + AccountingReportController 모두 일치

## Designer — APPROVE

- impact-analysis.md 7 영역 (사이드바 / PermissionMatrix / 인쇄 / 모바일 / 데스크탑 / 토큰 / 컴포넌트) 모두 영향 0 명시

## DevOps — APPROVE

- V26 번호 안전성: V25 다음 V26, 충돌 없음
- V26 SQL: `ADD COLUMN IF NOT EXISTS destination_warehouse_name VARCHAR(100)` NULLable + idempotent + Hibernate validate 호환
- `infrastructure/` / `.github/workflows/` 변경 0
- Testcontainers Flyway 자동 적용

## 최종 종합 판정: FIX 필요

| 팀 | 판정 | 결함 |
|---|---|---|
| QA | FIX | JournalControllerIT @MockBean / LedgerControllerIT 미작성 |
| FE | APPROVE | 0 |
| Designer | APPROVE | 0 |
| DevOps | APPROVE | 0 |

조치 사항 (BE):
1. `JournalControllerIT.java` `@MockBean PartnerLookupClient` + lenient stub 추가
2. `LedgerControllerIT.java` 신규 작성 — Q3-1/Q3-2/Q3-3 3 케이스

Claude QA+ — 2026-05-19
