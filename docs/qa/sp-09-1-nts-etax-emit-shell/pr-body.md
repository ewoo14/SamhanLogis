## 요약

**Phase 9 vendor 연동 시리즈 첫 슬라이스** — NTS (홈택스) 세금계산서 실 발행 **shell + DRY_RUN 모드** 구현.

- 발행된(ISSUED) 세금계산서를 NTS 로 전송하는 endpoint shell (`POST /accounting/tax-invoices/{id}/emit-nts`)
- `ETaxClient` interface + DRY_RUN/NTS 분기 `ETaxClientImpl` (Phase 11 실 sandbox 대비)
- DRY_RUN 모드: 즉시 성공 + `DRY-{taxInvoiceNo}-{epochMilli}` 형식 가짜 외부 ID 반환
- 도메인 가드: `TaxInvoice.markEmitted(String)` — ISSUED 상태 검증 + 중복 발행 차단
- FE: TaxInvoiceDetailPage NTS 발행 CTA + confirm modal + eTaxExternalId 표시 banner

## 변경 파일

### BE (accounting-service)
- `client/ETaxClient.java` — interface (`submit(TaxInvoice) → ETaxSubmitResult`)
- `client/ETaxClientImpl.java` — @Component, `etax.submit-method` property 분기
- `client/ETaxSubmitResult.java` — record (eTaxExternalId / submittedAt / submitMethod / success / message)
- `service/TaxInvoiceEmitService.java` — emit-nts 비즈니스 흐름 + audit
- `web/TaxInvoiceController.java` — `POST /{id}/emit-nts` endpoint 추가
- `web/dto/EmitNtsRequest.java` — submitMethod `@Pattern(DRY_RUN|NTS)`
- `web/dto/EmitNtsResponse.java` — 5 필드
- `domain/TaxInvoice.java` — `markEmitted(String)` 도메인 메서드
- `resources/application.yml` — `etax.*` property 블록
- `shared/common/.../ErrorCode.java` — TAX_INVOICE_NOT_EMITTABLE(422) / TAX_INVOICE_ALREADY_EMITTED(409) / ETAX_SUBMIT_FAILED(502)

### IT (8 case)
- `it/TaxInvoiceEmitNtsIT.java`

| # | case | 검증 |
|---|---|---|
| 1 | testEmitNtsDryRunSuccess | 200 + eTaxExternalId/submitMethod/submittedAt |
| 2 | testEmitNtsForbiddenForSales | SALES → 403 |
| 3 | testEmitNtsForbiddenForManager | MANAGER → 403 |
| 4 | testEmitDraftReturns422 | DRAFT → 422 + TAX_INVOICE_NOT_EMITTABLE |
| 5 | testEmitCancelledReturns422 | CANCELLED → 422 + TAX_INVOICE_NOT_EMITTABLE |
| 6 | testEmitAlreadyEmittedReturns409 | 중복 → 409 + TAX_INVOICE_ALREADY_EMITTED |
| 7 | testEmitAuditLogRecorded | 성공 후 eTaxExternalId 저장 + 재시도 409 |
| 8 | testEmitNtsClientFailureReturns502 | ETaxClient BusinessException → 502 + ETAX_SUBMIT_FAILED |

### FE (desktop)
- `api/taxInvoiceApi.ts` — `emitTaxInvoiceToNts(id, submitMethod)` + `NtsSubmitMethod` 타입
- `routes/TaxInvoiceDetailPage.tsx` — NTS 발행 CTA + confirm modal + eTaxExternalId banner
- `api/mock.ts` — emit-nts URL handler

### QA (Playwright 5 case)
- `playwright/sp-09-1-nts-etax-emit-shell/sp-09-1-nts-etax-emit-shell.spec.ts` — T1~T5 정적 검증 통과
- `docs/qa/sp-09-1-nts-etax-emit-shell/screenshots/01-04_*.png` — 4 PNG

### Docs
- `docs/dev-reports/sp-09-1-nts-etax-emit-shell.md` — 10 section 220행
- `docs/planning/2026-05-18_phase-9-vendor-integration.md` — Phase 9 master plan
- `docs/handoff/CURRENT-WORK.md` — SP-09-1 진입 이력

## QA 스크린샷

> 캡처 재실행 (2026-05-18 cycle 1.5) — 기존 5KB 빈 PNG → 90~110KB 실 UI 렌더. raw URL 절대 경로 사용.

### 01. ISSUED 상태 — NTS 발행 CTA 표시 (ACCOUNTANT)
![01 ISSUED before emit](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-1-nts-etax-emit-shell/docs/qa/sp-09-1-nts-etax-emit-shell/screenshots/01-nts-emit-before-issued.png)

### 02. confirm modal — DRY_RUN 안내 + 비가역 경고
![02 confirm modal](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-1-nts-etax-emit-shell/docs/qa/sp-09-1-nts-etax-emit-shell/screenshots/02-nts-emit-confirm-modal.png)

### 03. EMITTED — eTaxExternalId banner + audit
![03 emitted banner](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-1-nts-etax-emit-shell/docs/qa/sp-09-1-nts-etax-emit-shell/screenshots/03-nts-emitted-etax-external-id.png)

### 04. SALES 권한 403 — 발행 버튼 미표시 + toast
![04 sales 403](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-1-nts-etax-emit-shell/docs/qa/sp-09-1-nts-etax-emit-shell/screenshots/04-role-guard-sales-403.png)

## 검증

- [x] `./gradlew :services:accounting-service:compileJava :services:accounting-service:compileTestJava` BUILD SUCCESSFUL
- [x] `npm run typecheck` (clients/desktop) PASS
- [x] BaseEntity 7 audit + Soft Delete 준수
- [x] UUID 사용자 비공개 (taxInvoiceNo / eTaxExternalId 비즈니스 식별자만 노출)
- [x] @MockBean 외부 client 격리 (다음 슬라이스 통합 적용 예정)
- [x] credential placeholder 패턴 (sk-/AKIA/secret_ 사용 없음)
- [x] Notion runtime zero 유지

## 권한 (SP-03 §4.2)

| Role | NTS 발행 |
|---|---|
| MASTER | ✅ |
| MANAGER | ❌ (403) |
| ACCOUNTANT | ✅ |
| SALES | ❌ (403) |
| WAREHOUSE | ❌ (403) |
| DRIVER | ❌ (403) |

## Phase 9 후속 슬라이스

- SP-09-2 — Aligo SMS 실 발송
- SP-09-3 — OCR 영수증 (Naver Clova)
- SP-09-4 — 오픈뱅킹 KFTC (Phase 10 분리)
- SP-09-5 — 통합 검증

## 미해결 / Phase 11 이관

- NTS 실 sandbox API 호출 (`ETaxClientImpl.submitNts()`) — 현재 설정 검증 후 BusinessException
- `e_tax_external_id` partial UNIQUE INDEX (DB 레벨 중복 방지 이중 가드) — V16 신규 마이그레이션 가능

연관 Issue: Phase 9 vendor 연동 시리즈 진입 슬라이스

🤖 Generated with [Claude Code](https://claude.com/claude-code)
