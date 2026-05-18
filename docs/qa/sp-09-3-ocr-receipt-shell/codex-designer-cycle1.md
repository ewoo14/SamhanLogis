# Codex Designer Review — SP-09-3 OCR Receipt Shell cycle 1

## Verdict

cycle 2 진입 권고. 디자인 토큰 등록과 HTML 시안 4장은 존재하지만, 실제 React 화면과 시안/decisions 간 구현 차이가 크다. 특히 endpoint 표기와 Clova 토큰 적용이 실제 제품 화면과 다르다.

## Findings

### Major — 디자인 HTML의 endpoint 표기가 실제 API와 다름

- 위치:
  - `docs/qa/sp-09-3-ocr-receipt-shell/screenshots/01-upload-empty.html:10`
  - `docs/qa/sp-09-3-ocr-receipt-shell/screenshots/01-upload-empty.html:271`
  - 실제 FE/BE: `clients/desktop/src/renderer/api/receiptOcrApi.ts:141-143`, `services/slip-service/src/main/java/com/samhanair/logis/slip/web/ReceiptOcrController.java:77`
- HTML 시안은 `POST /api/receipts/ocr` 로 표시한다.
- 실제 endpoint는 `/slips/receipt-ocr` 다.
- 수정 권고: QA HTML/PNG 산출물의 endpoint 텍스트를 실제 계약으로 수정한다.

### Major — Clova 토큰은 등록됐지만 실제 React 화면에는 거의 적용되지 않음

- 위치:
  - 토큰: `clients/web/design-system/src/tokens/tokens.css:68-76`, `clients/web/design-system/src/tokens/index.ts:76-84`
  - 실제 화면: `clients/desktop/src/renderer/routes/PurchaseSlipOcrUploadPage.tsx:123-203`, `:352-405`
- decisions는 드롭존 hover, 버튼, progress, badge에 `--color-clova-*` 적용을 요구한다.
- 실제 React 화면은 주로 `brand`, `success`, `warning`, `neutral` 토큰을 사용하고 Clova 토큰을 사용하지 않는다.
- 수정 권고: 실제 페이지 스타일을 decisions와 맞추거나, "이번 cycle은 토큰 등록 + 시안만, React 적용은 후속"으로 문서 범위를 낮춘다.

### Major — 시안 기능과 실제 화면 기능 범위가 불일치

- 위치:
  - decisions: `docs/design/sp-09-3-ocr-receipt-shell/decisions.md:120-156`
  - 실제 화면: `clients/desktop/src/renderer/routes/PurchaseSlipOcrUploadPage.tsx:123-203`, `:486-496`
- 시안/decisions는 진행 단계, progressbar, confidence 표시, 에러 배너 재시도/닫기 버튼을 정의한다.
- 실제 React 화면에는 해당 상태/컨트롤이 없다.
- 수정 권고: shell 범위에서 제외할 항목은 미결/후속으로 내려 명시하고, 현재 구현 가능한 접근성(`aria-live`, `role=status`)만 맞춘다.

### Minor — slipNo 예시 형식이 도메인 형식과 다름

- 위치:
  - `docs/qa/sp-09-3-ocr-receipt-shell/screenshots/03-ocr-result-success.html:353-354`
  - BE 채번 문서: `docs/dev-reports/sp-09-3-ocr-receipt-shell.md:33`, `:95`
- HTML 시안은 `PUR-2026-05-0042` 를 표시한다.
- BE는 `yyyy/MM/dd-N` 형식 slipNo를 사용한다.
- 수정 권고: 화면 예시는 BE slipNo 형식으로 맞춘다.

## Cross-check

- HTML 산출물 4장과 PNG 4장은 존재.
- `--color-clova-*` 토큰 등록은 확인.
- 실제 화면과 시안 간 차이가 커서 Designer 승인 전 cycle 2 반영 필요.
