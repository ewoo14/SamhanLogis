# SP-09-2 Aligo SMS 실 발송 - Codex QA Review Cycle 1

대상: PR #237, commit `87d1e5f7`

## Findings

### CRITICAL - Playwright spec이 실제 기능 실패를 통과시킬 수 있는 false-green 구조

- 위치:
  - `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts:148-152`
  - `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts:254-260`
  - `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts:277-291`
  - `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts:623-639`
  - `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts:799-813`
- 내용: literal `|| true`는 없지만, 테스트가 dev server 미가용 시 skip되고, 실제 row가 없으면 `page.setContent()`로 정적 HTML을 주입해 통과합니다. 또한 `bodyText.includes('접근')`, `bodyText.includes('로그인')` 같은 fallback을 성공 조건에 포함합니다.
- 영향: 신규 화면 route, API contract, modal 구현이 전부 깨져도 테스트가 skip 또는 정적 fixture로 green이 될 수 있습니다. SP-09-1 cycle 1 H1의 false-green 회귀와 같은 계열입니다.
- 권고: dev server 미가용은 실패로 처리하거나 별도 smoke job에서만 skip하십시오. `page.setContent()` fallback 제거, 실제 route/실제 DOM `data-testid` 기반 assertion으로 고정하십시오.

### HIGH - QA spec의 권한 기대값이 구현과 dev-report 사이에서 충돌

- 위치:
  - `services/notification-service/src/main/java/com/samhanair/logis/notification/controller/DispatchSmsSaveHistoryController.java:45-46`
  - `clients/desktop/src/renderer/routes/index.tsx:805-808`
  - `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts:843-855`
  - `docs/dev-reports/sp-09-2-aligo-sms-real-send.md:225-232`
- 내용: 실제 controller와 FE route는 DISPATCH/MANAGER/MASTER를 허용합니다. 그런데 QA spec/dev-report는 `SEND_AUDIT 발송 감사 = MANAGER+ 제한`이라고 설명합니다.
- 영향: 사용자 cross-check 의무는 "MANAGER/MASTER/DISPATCH 허용, SALES/ACCOUNTANT 403"입니다. 현재 문서/테스트 설명은 이 의무와 충돌해 reviewer가 권한 결정을 잘못 승인할 수 있습니다.
- 권고: T5를 MANAGER/MASTER/DISPATCH 허용, SALES/ACCOUNTANT 차단으로 수정하고, ACCOUNTANT 403 케이스를 추가하십시오.

### HIGH - QA가 실제 신규 route를 검증하지 않음

- 위치:
  - `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts:93-96`
  - `clients/desktop/src/renderer/routes/index.tsx:805`
- 내용: QA는 `/admin/notifications/sms-audit`로 이동하지만 실제 화면 route는 `/arologis/dispatch-sms/send-audit`입니다.
- 영향: QA 스크린샷과 assertion이 실제 메뉴/route와 분리되어 있습니다.
- 권고: route 상수를 실제 HashRouter URL로 교정하고 sidebar entry click 경로도 1회 검증하십시오.

### MEDIUM - dev-report의 검증 명령이 skip 실행을 검증 경로처럼 문서화함

- 위치:
  - `docs/dev-reports/sp-09-2-aligo-sms-real-send.md:266-274`
- 내용: `PLAYWRIGHT_SKIP_UI=1` 실행을 "static 검증"으로 제시하지만, spec 최상단 `test.skip(SKIP_UI, ...)` 때문에 전체 describe가 skip됩니다.
- 영향: CI/리뷰에서 테스트 수행 증거로 오인될 수 있습니다.
- 권고: skip 명령은 "환경 미가용 시 미검증"으로 분리하고, static 검증이 필요하면 별도 spec으로 작성하십시오.

## Cross-check

- false green `|| true`: literal은 target spec에 없음. 그러나 skip/static fallback false-green 위험은 CRITICAL.
- 수신자 마스킹: spec은 검사하지만 fallback 때문에 실 화면 보장이 약함.
- UUID 비공개: visible text UUID 검사 있음.
- 권한 매트릭스: ACCOUNTANT 403 누락, DISPATCH 기대값 문서 충돌.

## Section Decision

QA는 cycle 2 필수입니다. 현재 Playwright 결과는 merge 판단 근거로 사용할 수 없습니다.
