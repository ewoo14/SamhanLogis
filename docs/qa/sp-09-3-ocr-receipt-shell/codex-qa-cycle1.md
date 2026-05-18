# Codex QA Review — SP-09-3 OCR Receipt Shell cycle 1

## Verdict

cycle 2 진입 권고. Playwright 스펙은 구조적으로 잘 나뉘어 있지만, 가장 중요한 BE/FE 계약 불일치를 자체 mock으로 덮고 있어 false green 위험이 있다.

## Findings

### Blocker — T2가 실제 BE 응답이 아닌 잘못된 FE 계약 shape을 mock함

- 위치:
  - `clients/desktop/playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts:118-135`
  - `clients/desktop/playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts:269-274`
  - 실제 BE: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/ReceiptParseResponse.java:22-28`
- Playwright `buildDryRunResponse()`는 `receiptDate`, `slipId`, `ocrText` 를 반환한다.
- BE는 `issuedAt`, `parseRawJson` 를 반환하고 `slipId`는 없다.
- 이 때문에 T2가 green이어도 실제 BE 연결 성공 화면은 깨질 수 있다.
- 수정 권고: T2 mock을 BE DTO와 동일하게 바꾸고, pageerror 검사가 실패하도록 만든다.

### Major — 422 서버 검증이 조건부 실행이라 false green 가능

- 위치: `clients/desktop/playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts:490-529`
- T3의 서버 422 검증은 `if (isEnabled) { ... }` 안에서만 수행된다.
- 버튼이 비활성화되면 서버 422 mock 검증 없이 테스트가 통과한다.
- 수정 권고: FE 즉시 reject 케이스와 서버 422 케이스를 별도 테스트로 분리하고, 서버 422는 유효 파일 + 강제 click + `receipt-ocr-error` assertion을 무조건 수행한다.

### Major — T4는 서버 422 mock을 등록하지만 실제 호출 검증을 하지 않음

- 위치: `clients/desktop/playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts:556-623`
- PDF 선택 시 FE 즉시 reject만 확인하고, 등록한 `/slips/receipt-ocr` 422 route가 호출되는지는 검증하지 않는다.
- 수정 권고: "FE 확장자 reject"와 "서버 content-type 422"를 분리한다.

### Major — `PLAYWRIGHT_SKIP_UI` 경로가 dev-report에 안내되어 false green 운영 위험

- 위치:
  - `clients/desktop/playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts:97-98`, `:146`
  - `docs/dev-reports/sp-09-3-ocr-receipt-shell.md:281-284`
- 스펙 자체는 dev server 미가용 시 fail하도록 되어 있지만, 환경변수 하나로 전체 UI 테스트가 skip된다.
- 이번 cross-check의 "false green 0건" 기준과 충돌한다.
- 수정 권고: CI/PR 검증 문서에서는 skip 경로를 제거하거나, 로컬 수동 회피용이라고 명시하고 PR 검증 명령에서는 사용 금지한다.

### Minor — bodyText OR fallback 금지 규칙과 일부 assertion이 충돌

- 위치: `clients/desktop/playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts:197-219`, `:700-744`
- T1/T5에서 body text OR 조건으로 통과시키는 부분이 있다.
- 수정 권고: DRY_RUN 안내, Phase 11 안내, 403 화면도 명시 locator/data-testid 기반으로 좁힌다.

## Cross-check

- 권한 매트릭스: T5가 WAREHOUSE/MANAGER/MASTER 허용, SALES/ACCOUNTANT 차단을 다룬다.
- HashRouter URL: `/#/purchases/receipt-ocr` 확인.
- data-testid 정합: 스펙과 페이지 기본 id는 일치.
- false green: BE/FE contract mock 불일치와 조건부 서버 422 검증 때문에 미통과.
