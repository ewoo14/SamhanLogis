# SP-08-3-4 배차문자 저장내역 구현 리포트

## 범위

- `notification-service`에 `dispatch_sms_save_history` JSONB 저장내역 도메인과 `/admin/notifications/dispatch-sms/history` API 4종을 추가했다.
- desktop 배차문자 화면에 `실행 / 저장내역` 2탭, latest preview 자동 복원, 명시 저장, 실발송 후 `SEND_AUDIT` append 저장을 연결했다.
- 내부 UUID는 상세 path param과 React 상태에서만 사용하고, row `data-testid`는 `dispatch-sms-history-row-{i}` index 기반으로 둔다.
- 목록 응답의 `id`는 상세 조회 path key 전용이며 FE 화면에는 노출하지 않는다. 사용자-facing 식별은 저장주제/작성시각/건수만 사용한다.

## Backend

- Entity: `DispatchSmsSaveHistory`
  - `BaseEntity` 7 audit 상속
  - `@SQLRestriction("is_deleted = false")`
  - `programType=DISPATCH_SMS`, `saveMode=AUTO_LATEST|MANUAL_NAMED|SEND_AUDIT`, `topic`, `requestParams`, `responsePayload`
- Migration: `V4__add_dispatch_sms_save_history.sql`
  - `JSONB` request/response payload
  - `ux_dispatch_sms_save_history_auto_latest_per_user_program`
  - active `AUTO_LATEST` row partial unique index
- Service 정책:
  - `AUTO_LATEST`: 사용자+프로그램 active 1건, 기존 row soft-delete 후 신규 insert
  - partial unique race 시 3회 retry + `REQUIRES_NEW` `TransactionTemplate`
  - `MANUAL_NAMED`: topic 필수 append-only
  - `SEND_AUDIT`: 실발송 감사 append-only, latest 자동 복원 대상 제외
  - response payload 100KB 초과 시 422 `DISPATCH_SMS_HISTORY_PAYLOAD_TOO_LARGE`
  - from/to 역전 시 내부 range swap
  - 상세 조회는 `findByIdAndCreatedBy`로 사용자 격리
- 권한:
  - 기존 dispatch-batch controller와 동일한 `DISPATCH / MANAGER / MASTER`

## Frontend

- API: `dispatchSmsSaveHistoryApi.ts`
- 컴포넌트:
  - `DispatchSmsHistoryTab.tsx`
  - `DispatchSmsRestoredBanner.tsx`
  - `DispatchSmsSaveDialog.tsx`
- 화면:
  - 배차문자 화면에 `Tabs` 기반 `실행 / 저장내역` UX 추가
  - preview 성공 시 `AUTO_LATEST` 자동 저장, 명시 버튼으로 `MANUAL_NAMED` 저장
  - 실발송 버튼은 design-system `warning` variant와 이중 confirm을 사용
  - send 성공 후 사용자 조작 없이 `SEND_AUDIT` 저장
  - 복원 배너의 `createdBy`는 `maskCreatedBy` 재사용
  - 저장 payload는 `{ preview, edited }` 형태로 운영자 편집 본문을 보존하고, 기존 preview-only payload도 복원 호환한다.

## SP-08-3-3 회고 반영

- `SlipCleanupSaveDialog`와 신규 `DispatchSmsSaveDialog` 모두 저장 중 `closeOnEsc={!isSaving}` / `closeOnBackdropClick={!isSaving}` guard를 적용했다.
- 신규 저장 dialog topic 입력에 `autoFocus`를 적용했다.
- QA 실행 수치는 placeholder가 아니라 최종 로컬 실행 수치로 본 문서에 고정했다.
- mock route broad matcher가 `/slips/cleanup`을 먼저 잡던 회귀를 함께 보정해 SP-08-3-3 Playwright mock route를 다시 green으로 만들었다.

## QA

- Playwright static/mock contract:
  - `clients/desktop/playwright/sp-08-3-4-dispatch-sms-history/sp-08-3-4-dispatch-sms-history.spec.ts`
- Mock PNG generator:
  - `scripts/generate-sp-08-3-4-dispatch-sms-history-screenshots.ps1`
  - output: `docs/qa/sp-08-3-4-dispatch-sms-history/screenshots/`
- QA mock PNG 생성 스크립트는 Windows System.Drawing 전용이며 Linux CI에서는 실행하지 않는다.

## §7 예외 catalog

| code | HTTP | message | IT 케이스 |
|---|---:|---|---|
| `DISPATCH_SMS_HISTORY_NOT_FOUND` | 404 | `자동 저장 내역이 없습니다.` / `해당 저장 내역을 찾을 수 없습니다.` | `latestNotFoundReturns404`, `otherUserDetailAccessHidden`, `restoreDeletedHistoryReturns404` |
| `DISPATCH_SMS_HISTORY_PAYLOAD_TOO_LARGE` | 422 | `배차문자 결과가 너무 큽니다. 기간을 좁혀 다시 시도하세요.` | `oversizedPayloadReturns422` |
| `INVALID_INPUT` | 400 | `명시 저장과 발송 감사는 저장주제가 필수입니다.` | `sendAuditBlankTopicReturns400` |

## Verification

| 항목 | 결과 |
|---|---|
| `.\gradlew.bat :services:notification-service:test --tests "*DispatchSmsSaveHistory*" --no-daemon --rerun-tasks` | PASS — 20 tests / skipped 0 / failures 0 / errors 0 |
| `clients/desktop npm run typecheck` | PASS |
| `clients/desktop npm run lint` | PASS — 기존 warning 2건 / error 0 |
| `clients/desktop npm run build` | PASS |
| 지정 Playwright 묶음 | PASS — 57 passed / skipped 0 |
| QA mock PNG 생성 | PASS — 7 PNG / non-zero |
