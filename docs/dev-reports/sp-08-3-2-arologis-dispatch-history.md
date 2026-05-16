# SP-08-3-2 아로로지스 배차 저장내역 구현 리포트

## 범위

- `arologis-service`에 `dispatch_save_history` JSONB 저장내역 도메인과 `/admin/arologis/dispatches/history` API 4종을 추가했다.
- `clients/arologis-desktop`의 가배차 권역, 지방가배차, 미배차, 운송사 실배차 비교 화면에 `실행 / 저장내역` 2탭, latest 자동 복원, 명시 저장, row click 복원을 연결했다.
- 내부 UUID는 상세 path param과 React 상태에서만 사용하고, row `data-testid`는 화면별 prefix + index 기반으로 둔다.

## Backend

- Entity: `DispatchSaveHistory`
  - `BaseEntity` 7 audit 상속
  - `@SQLRestriction("is_deleted = false")`
  - `programType`, `saveMode`, `topic`, `requestParams`, `responsePayload`
- Migration: `V12__add_dispatch_save_history.sql`
  - `JSONB` request/response payload
  - `ux_dispatch_save_history_auto_latest_per_user_program`
  - active row partial index
- Service 정책:
  - `AUTO_LATEST`: 사용자+프로그램 active 1건, 기존 row soft-delete 후 신규 insert
  - unique race 시 1회 retry
  - `MANUAL_NAMED`: topic 필수 append-only
  - response payload 100KB 초과 시 422
  - from/to 역전 시 내부 range swap
  - 상세 조회는 `findByIdAndCreatedBy`로 사용자 격리

## Frontend

- API: `dispatchSaveHistoryApi.ts`
- 공통 컴포넌트:
  - `HistoryTab.tsx`
  - `RestoredBanner.tsx`
  - `SaveDialog.tsx`
- 화면별 programType/testid:
  - `PRE_CLASSIFY`: `pre-classify-history-*`
  - `REGIONAL`: `regional-history-*`
  - `UNASSIGNED`: `unassigned-history-*`
  - `RECONCILE`: `dispatch-reconcile-history-*`

## QA

- Playwright static/mock contract:
  - `clients/desktop/playwright/sp-08-3-2-arologis-history/sp-08-3-2-arologis-history.spec.ts`
- Mock PNG generator:
  - `scripts/generate-sp-08-3-2-arologis-history-screenshots.ps1`
  - output: `docs/qa/sp-08-3-2-arologis-history/screenshots/`

## Verification

실행 결과는 최종 PR/커밋 보고에 기록한다.
