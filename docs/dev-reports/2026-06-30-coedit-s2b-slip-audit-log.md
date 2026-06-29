# 2026-06-30 협업 코-에디팅 S2b — slip 문서전역 수정/버전 로그

## 범위

- S2b는 slip 전표의 헤더 필드와 품목 셀 변경을 버전 이력에 기록·표시하는 범위다.
- 저장 방식은 S2a의 save-PUT 흐름을 유지한다.
- 수정 카운트(B)와 레드라인(D)은 S2c/S2d 후속 범위로 남겼다.

## 핵심 결정

- 신규 테이블/Flyway 없이 기존 `slip_revisions` 스냅샷을 진실원으로 사용한다.
- 입고·출고 direct PUT 수정 경로는 실제 값이 바뀐 경우 `SlipRevisionType.EDIT` revision 을 capture 한다.
- `SlipRevisionResponse.fieldChanges`는 인접 revision snapshot diff 로 산출한다.
- diff 필드는 `fieldPath`, `label`, `beforeValue`, `afterValue`, `actorName`, `actorColor`, `changedAt` 이다.
- `actorColor`는 저장값이 있으면 보존하고, 없으면 `PresenceColor.fromUserId`로 계산해 presence/coedit/audit 단일색상 정책을 맞춘다.
- 사용자 화면에는 displayName과 색상만 노출하고 UUID/connectedId/actorId는 노출하지 않는다.

## 구현

- `SlipRevisionService.listWithSummary`에서 이전 버전 snapshot 과 현재 snapshot 을 비교해 헤더 필드/품목 셀 단위 변경 목록을 구성한다.
- `SlipUpdateService`, `SalesSlipUpdateService`가 direct PUT 변경 후 기존 감사 로그와 함께 EDIT revision 을 남긴다.
- desktop `SlipVersionHistoryPanel`은 버전별 변경 필드 목록을 한국어 라벨과 이전값→새값 형식으로 표시한다.
- mock revision 데이터와 FE 단위 테스트를 S2b fieldChanges 계약에 맞췄다.

## 검증

- `:services:slip-service:test --tests "com.samhanair.logis.slip.revision.service.SlipRevisionServiceTest"` 통과.
- `:services:slip-service:test --tests "com.samhanair.logis.slip.it.SlipUpdateIT.testUpdateAppendsRevisionFieldChanges"` 통과.
- `:services:slip-service:test --tests "com.samhanair.logis.slip.it.SlipSalesUpdateIT.testUpdateSalesAppendsRevisionFieldChanges"` 통과.
- `npm run test -- SlipVersionHistoryPanel.test.tsx` 통과.
- `:services:slip-service:test` 전체 통과.
- `clients/desktop npm run typecheck` 통과.
- `clients/desktop npm run test` 전체 통과(57 files / 404 tests).
- `npx playwright test playwright/slip-version-history --reporter=line` 통과.
- QA 캡처: `docs/qa/coedit-s2b-audit-log/screenshots/slip-version-history-field-changes.png`.

## 리스크

- fieldChanges는 현재 revision list 조회 시 스냅샷 간 diff 로 산출한다. 스냅샷 필드가 늘어나면 label spec 을 추가해야 사용자 친화적인 변경명이 나온다.
- 품목 셀 diff 는 현재 활성 라인 순서 기준이다. 라인 재정렬·삭제·삽입의 더 정밀한 식별은 S2d 레드라인 또는 후속 라인키 정책에서 보강할 수 있다.
