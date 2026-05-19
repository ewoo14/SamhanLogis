# SP-SAS-1 SalesAccountingSlip — dev-report

> 작성일: 2026-05-19
> 슬라이스: SP-SAS (Sales/Purchase Accounting Slip) PR 1/5
> branch: `spec/2026-05-19-sales-purchase-accounting-slip`
> spec: [`docs/superpowers/specs/2026-05-19-sales-purchase-accounting-slip-design.md`](../superpowers/specs/2026-05-19-sales-purchase-accounting-slip-design.md)
> plan: [`docs/superpowers/plans/2026-05-19-sas-1-sales-accounting-slip.md`](../superpowers/plans/2026-05-19-sas-1-sales-accounting-slip.md)

## 1. 산출 요약

| 항목 | 결과 |
|---|---|
| ErrorCode | 9건 신규 (`SAS_*`, NOT_FOUND/UNPROCESSABLE_ENTITY/CONFLICT 매핑) |
| 도메인 | SalesAccountingSlip + SlipLine + Allocation (BaseEntity 7 audit + @SQLRestriction) |
| Flyway | V18 — 3 테이블 + 7 partial index + 2 CHECK constraint + v_outbound_slip_allocation view |
| Service | SalesAccountingSlipService — createDraft (VAT 분리 + over-allocation + source CONFIRMED 가드) / post |
| VatCalculator | RoundingMode.FLOOR 절사, TAXABLE/ZERO_RATED/EXEMPT 3 분기 |
| Controller | POST /admin/sales-slips + /:slipNo/post (ACCOUNTANT/MASTER) |
| Repository | findBy* 4 + @Query 잔여 SUM 2 |
| Feign Client | SlipServiceClient → slip-service internal endpoint (VAT-inclusive snapshot) |
| slip-service 변경 | SlipInternalController 2 endpoint 추가 (`/internal/slips/{id}/lines`, `/lines/{lineId}`) + SlipLineSnapshot record |
| auth-service 변경 | PageCode.ACCOUNTING_SALES_SLIP_LIST + V11 role_page_permissions seed (4 roles) |
| 단위 테스트 | 4 PASS (createDraft / over-allocation / source not CONFIRMED / post 전이) |
| IT (Docker postgres) | 1 PASS (POST /admin/sales-slips E2E + Flyway 자동 적용 + VAT 분리 검증) |

## 2. 핵심 결정 (D-SAS-01 ~ D-SAS-07 + VAT) — spec §1

(spec §1 참조 — 7 결정 + VAT-inclusive 단가 분리 공식)

## 3. 워크플로우 정정 회고 (사용자 명시 2026-05-19)

본 슬라이스 진행 중 사용자 정정 4회:

| # | 정정 사항 | 적용 |
|---|---|---|
| 1 | "원래 워크플로우 = Claude 기획 → Codex 개발 → Claude review/fix → Codex review/fix → PM 머지" | Task 1~7 = Claude subagent (잘못된 패턴, 유지 — 매 단계 review PASS). Task 8~10 = Codex 개발 전환 |
| 2 | "리뷰는 5-agents 리뷰 및 TM 통합 방식" | 매 task 별 single Claude reviewer 패턴 무효. 전체 implementation 완료 후 5-team review cycle 진행 |
| 3 | "테스트는 반드시 Docker 활용 로컬 실서버에서 진행" | Task 10 IT = samhan-postgres + Testcontainers + Spring boot E2E |
| 4 | "리뷰 시 QA 에이전트는 Docker 로 직접 테스트" | 5-agent review 단계에서 QA agent 가 코드 read 만이 아니라 Docker 실 검증 의무 |

→ [feedback_dual_5agent_review.md] 7회차 갱신 + MEMORY.md 인덱스 갱신.

## 4. 실 검증 결과 (Docker postgres)

```
./gradlew :services:accounting-service:test \
  --tests "*SalesAccountingSlipServiceTest" \
  --tests "*SalesAccountingSlipControllerIT*"
→ BUILD SUCCESSFUL
```

samhan-postgres (`postgres:16-alpine`) 컨테이너 사용:
- Flyway V15-V18 자동 순차 적용 검증 (이전 docker exec 수동 schema cleanup 완료)
- VAT-inclusive 단가 → 공급가액 1,363,636 + 부가세 136,364 = 합계 1,500,000 (FLOOR 절사 정확)
- @MockBean 외부 client 4종 격리 (SlipServiceClient/ETaxClient/KftcClient/DynamicPermissionClient)

## 5. 회귀 가드

- 기존 TaxInvoice (SP-09-1) / DailyClosing (SP-08-6-5) 흐름 무변경 — accounting-service 내부 신규 도메인 추가만
- slip-service 변경 = internal endpoint 2건 추가 + SlipLineSnapshot record. 기존 Slip/SlipLine 도메인 / Service / Controller 무수정
- auth-service 변경 = PageCode + permission seed 추가. 기존 13 회계 메뉴 권한 무변경
- 컴파일/단위/IT 전 영역 PASS

## 6. 후속 (SP-SAS 시리즈)

- **SP-SAS-2** PurchaseAccountingSlip (입고 → 매입 100% 대칭) — 다음 진입
- **SP-SAS-3** TaxInvoice N:1 묶음 발행 (매출전표 → 세금계산서)
- **SP-SAS-4** TaxInvoice 수신 (NTS 또는 수동 등록)
- **SP-SAS-5** Admin UI 4 페이지 + 일마감 개정 + 회계 메뉴 17건 통합

## 7. AWS / 비용 변경

0 (accounting-service 기존 그대로, 신규 schema 는 accounting_db 내 추가).
