# Codex FE Review — SP-09-3 OCR Receipt Shell cycle 1

## Verdict

cycle 2 진입 권고. HashRouter 경로, RoleGuard 권한, data-testid 기본 매핑은 맞다. 그러나 API 타입과 mock이 BE `ReceiptParseResponse`와 다르며, 실제 BE 연결 시 성공 결과 화면이 깨진다.

## Findings

### Blocker — FE 타입이 BE 응답과 1:1이 아님

- 위치:
  - `clients/desktop/src/renderer/api/receiptOcrApi.ts:54-76`
  - `clients/desktop/src/renderer/routes/PurchaseSlipOcrUploadPage.tsx:164`, `:187`
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/ReceiptParseResponse.java:22-28`
- FE는 `receiptDate`, `slipId`, `ocrText` 를 필수처럼 사용한다.
- BE는 `issuedAt`, `parseRawJson` 를 반환하고 `slipId`는 반환하지 않는다.
- 실제 API 성공 응답을 받으면 날짜 렌더링에서 pageerror가 발생하고, 전표 링크는 `#/purchases/undefined` 가 된다.
- 수정 권고: FE 타입과 `ResultCard`를 BE 필드명으로 맞춘다. 전표 상세 링크는 UUID 비공개 정책과 충돌하므로 `slipNo` 기반 조회/상세 진입 정책을 먼저 정한다.

### Major — mock API가 실제 BE 계약 대신 FE의 잘못된 계약을 고정함

- 위치: `clients/desktop/src/renderer/api/mock.ts:3958-3994`
- mock 정상 응답은 `receiptDate`, `slipId`, `ocrText` 를 반환한다.
- 이 때문에 VITE_MOCK_MODE QA는 BE 계약 불일치를 발견하지 못한다.
- 수정 권고: mock 응답을 BE `ReceiptParseResponse`와 동일하게 맞추거나, BE 계약 변경이 승인되면 BE DTO를 같이 수정한다.

### Major — UUID 비공개 정책과 상세 링크 설계가 충돌함

- 위치: `clients/desktop/src/renderer/routes/PurchaseSlipOcrUploadPage.tsx:187-199`
- 화면 텍스트에는 UUID를 렌더하지 않지만 href path param으로 `slipId`를 요구한다.
- BE/dev-report는 "응답에 slipId UUID 미포함"이라고 명시한다.
- 수정 권고: 현재 slice에서는 링크를 비활성/후속 조회로 바꾸거나, 내부 UUID 전달을 허용하는 정책을 문서화한다. "slipNo만 노출"과 "UUID path link 필수"를 동시에 둘 수 없다.

### Minor — mock error code가 shared ErrorCode와 불일치

- 위치: `clients/desktop/src/renderer/api/mock.ts:3968-3982`
- mock은 `RECEIPT_EMPTY_FILE`, `RECEIPT_FILE_TOO_LARGE`, `OCR_GATEWAY_ERROR` 를 반환한다.
- BE canonical code는 `RECEIPT_FILE_INVALID`, `OCR_SUBMIT_FAILED` 다.
- UI가 status 기반으로만 분기해 즉시 장애는 아니지만 QA 메시지와 운영 모니터링 용어가 갈라진다.
- 수정 권고: mock code도 BE ErrorCode와 동일하게 맞춘다.

## Cross-check

- URL HashRouter: `/purchases/receipt-ocr` 사용 확인.
- 권한 매트릭스: `RECEIPT_OCR_ROLES = ['WAREHOUSE', 'MANAGER', 'MASTER']` 확인.
- data-testid: 요청된 핵심 id는 페이지에 존재.
- UUID 사용자 비공개: visible text 검사는 가능하나, FE가 BE에 없는 `slipId`를 요구하므로 계약 재정리 필요.
