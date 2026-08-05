# 2026-08-03-1013 Scope A — 표시·복사만

## 시작 확인

- 작업 디렉터리: `.claude/worktrees/t1013b`
- 기준 HEAD: `492815f64` (`#1013 R10`)
- 시작 상태: 지정 보고서 신규 파일만 미추적이며 코드 변경은 없음.
- 개발책임자 결정: 자동 SMS 발송은 계승 범위에서 제거하고, 레거시의 하차일별 section 그룹화·문구 생성·화면 표시·편집·복사만 보존한다.
- 검토 설계: 자동 발송에만 쓰이는 API 호출·설정·스케줄·큐·권한·화면 버튼과 전용 테스트/fixture를 제거하되, 공용 `notification-service` 경로는 소비자 전수 확인 후 다른 소비자가 있으면 유지한다. 레거시 원문과 구현을 대조하고 표시·복사 경로의 RED 테스트를 먼저 작성한다.

## 레거시 대조 후 제거·보존 목록

### 제거 대상

- FE `/send` API 호출, `buildSendEntries`의 2,000자 자동 분할, 발송 확인/결과 상태와 발송 버튼.
- BE `POST /admin/notifications/dispatch-batch/send`, `DispatchBatchSendService` 및 배차 전용 send DTO/응답/발송 단위 테스트.
- 자동 발송 결과에만 필요한 `SEND_AUDIT` 생성·복원 UI 경로와 해당 전용 fixture/문서 계약(기존 적용 migration 파일은 수정하지 않음).
- 배차 자동 발송에만 필요한 permission/설정/스케줄/큐가 발견될 경우 해당 전용 항목만 제거한다.

### 보존 대상

- `DispatchBatchPreviewService`와 `/preview` — 실 전표 조회, blocked 양방향 6/6, slip-service 8086, compose URL 주입, 중복 0·그룹화.
- 하차일별 section 문구 조립, 단톡방/인수자번호 그룹 키, 화면 표시·편집·클립보드 복사.
- 미리보기 자동/수동 저장내역과 공용 `notification-service`의 일반 Notification/SMS/Push/Email adapter·gateway 및 다른 소비자의 경로.

## RED-1 — 자동 발송 표면 제거 계약

- [DEV-SEED/단위 fixture] 신규 `clients/desktop/src/renderer/routes/scopeADisplayOnly.contract.test.ts`가 화면/FE API source에서 `sendDispatchBatch`, SMS 발송 버튼, `/dispatch-batch/send`가 사라지고 편집·복사·저장 함수는 남는지 검사한다.
- 실행: `npm test -- --run src/renderer/routes/scopeADisplayOnly.contract.test.ts`
- RED 원문: `2 tests | 1 failed`; `화면은 자동 SMS 발송 API와 발송 버튼을 제공하지 않는다`에서 `expected ... not to contain 'sendDispatchBatch'`.
- 실패 원인: 현재 구현에 자동 발송 전용 FE 호출·분할·확인 UI가 아직 남아 있음. 보존 assertion은 통과했다.

## GREEN-1 — 자동 발송 표면 제거

- [DEV-SEED/단위 fixture] FE 계약 테스트를 통과시키도록 `/send` 호출·발송 버튼·발송 감사 라우트/사이드바를 제거했다.
- [DEV-SEED/단위 fixture] `DispatchSmsPage.test.ts`는 발송 모집단/2,000자 분할 테스트 대신 편집된 안내 문구가 클립보드 복사 텍스트에 보존되는 표시·복사 테스트로 교체했다.
- [DEV-SEED/단위 fixture] BE 배차 전용 send controller method/service/DTO 및 send 관련 단위·IT를 제거했다. 공용 `NotificationService`, `SmsAdapter`, `AligoSmsAdapter`는 다른 소비자 보호를 위해 유지했다.
- 실행: `npm test -- --run src/renderer/routes/scopeADisplayOnly.contract.test.ts src/renderer/routes/DispatchSmsPage.test.ts`
- GREEN 원문: `2 test files / 4 tests passed`.

## 최종 검증 및 범위 판정

- [DEV-SEED/단위 fixture] `npm test -- --run src/renderer/routes/scopeADisplayOnly.contract.test.ts src/renderer/routes/DispatchSmsPage.test.ts` — 2 files / 4 tests passed.
- [DEV-SEED/단위 fixture] `:services:notification-service:test --tests NotificationPermissionControllerIT --tests DispatchSmsSaveHistoryServiceTest --no-daemon` — `BUILD SUCCESSFUL`.
- [DEV-SEED/단위 fixture] `:services:auth-service:test --tests PageCodeTest --no-daemon` — `BUILD SUCCESSFUL`.
- [DEV-SEED/단위 fixture] `npm run typecheck` — TypeScript 및 real-QA scope 하네스 50/50 passed. 기존 real-QA 신선도 경고 출력은 있었으나 실패 없음.
- [실데이터/로컬 read-only] 공유 DB SELECT·DDL·Docker 이미지 재빌드·실제 SMS 호출은 실행하지 않았다. 새 V91은 작성만 했고 적용하지 않았다.
- `git diff --check` — whitespace 오류 없음.

### 최종 보존/제거 판정

- 보존: 하차일별 section 문구 구성, 단톡방/인수자번호 그룹화, blocked 양방향 6/6, slip-service 8086, compose URL 주입, 중복 0·그룹화, 화면 편집·선택 복사·미리보기 저장내역.
- 제거: 자동 SMS `/send` API/FE 호출, 2,000자 자동 분할, 발송 확인/결과 UI, SEND_AUDIT 전용 화면·사이드바·mock send handler, 배차 전용 send service/DTO/테스트, 감사 전용 page code runtime 정의.
- 보존(공용/역호환): `NotificationService`·`AligoSmsAdapter`·공용 알림 경로, 과거 `SEND_AUDIT` 저장 enum/migration/이력 fixture. 자동 생성 경로는 제거했고, V91이 기존 감사 권한 row를 soft-delete한다.

### 신규 파일

1. `clients/desktop/src/renderer/routes/scopeADisplayOnly.contract.test.ts`
2. `docs/dev-reports/2026-08-03-1013-scope-a-display-only.md`
3. `services/auth-service/src/main/resources/db/migration/V91__retire_dispatch_sms_send_audit_permission.sql`
