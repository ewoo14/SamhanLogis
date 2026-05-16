# SP-08-2 DPS legacy GAS DB/API parity dev-report

> 작성일: 2026-05-16  
> 범위: legacy GAS DPS 비교/품목별 DPS의 저장내역(history) 탭을 Samhan Public DB/API로 이식

## 구현 요약

- `inventory-service`에 `DpsSaveHistory` entity, `DpsProgramType`, `DpsSaveMode`, repository, service, controller, DTO를 추가했다.
- Flyway `V11__add_dps_save_history.sql`은 BaseEntity 실제 컬럼명(`created_at`, `created_by`, `modified_at`, `modified_by`, `deleted_at`, `deleted_by`, `is_deleted`)과 JSONB payload를 사용한다.
- API는 `POST /warehouse/audit/dps-history`, `GET /warehouse/audit/dps-history`, `GET /warehouse/audit/dps-history/{id}`, `GET /warehouse/audit/dps-history/latest` 4개다.
- desktop `/warehouse/dps-compare`, `/warehouse/dps-compare/by-product`에 `실행 / 저장내역` 2탭, latest 자동 복원 배너, 명시 저장 dialog, row click 복원 UX를 추가했다.
- QA mock PNG 7장을 `docs/qa/sp-08-2-dps-history/screenshots/`에 생성한다.

## Backend 계약

| 항목 | 내용 |
|---|---|
| 저장소 | `inventory_db.dps_save_history` |
| 프로그램 | `DPS_COMPARE`, `DPS_BY_PRODUCT` |
| 저장 방식 | `AUTO_LATEST`, `MANUAL_NAMED` |
| 자동 저장 | 사용자+프로그램별 active 1건만 유지, 이전 row는 soft-delete |
| 명시 저장 | topic 필수, append-only |
| payload 제한 | `responsePayload` UTF-8 직렬화 100KB 초과 시 422 |
| 사용자 격리 | `createdBy` 기준 list/latest/detail 제한, 타 사용자 detail 직접 접근은 403 |

## Frontend 계약

| 요소 | testid |
|---|---|
| 실행 탭 | `dps-history-tab-run` |
| 저장내역 탭 | `dps-history-tab-list` |
| 복원 배너 | `dps-history-restored-banner` |
| 저장 버튼 | `dps-history-save-button` |
| 저장주제 입력 | `dps-history-topic-input` |
| 저장내역 행 | `dps-history-row-{i}` |
| 저장내역 작성시각 cell | `dps-history-row-{i}-created-at` |

UUID는 API path param과 내부 상태에만 사용하고, 화면 텍스트와 `data-testid`에는 노출하지 않는다.

## 검증 항목

| 항목 | 결과 |
|---|---|
| Backend targeted | PASS — `DpsSaveHistory`, `DpsCompare`, `DpsByProduct` XML 집계 36 tests / skipped 0 |
| Desktop typecheck/lint/build | PASS — lint 기존 warning 2건, error 0 |
| Playwright parity bundle | PASS — 29 passed / skipped 0 |
| QA mock PNG | PASS — 7 PNG / 1280x900 / non-zero |
| `git diff --check` | PASS — CRLF 안내 warning만 출력 |
| secret-like artifact scan | PASS — `docs/`, `clients/desktop/playwright/`, 신규 diff 0 matches |
| UUID regex scan | PASS — 신규 DPS history FE components 0 matches |
| Notion runtime call scan | PASS — inventory main + desktop renderer 0 matches |
