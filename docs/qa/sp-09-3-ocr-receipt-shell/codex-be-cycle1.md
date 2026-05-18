# Codex BE Review — SP-09-3 OCR Receipt Shell cycle 1

## Verdict

cycle 2 진입 권고. BE 자체 구조는 `ReceiptOcrAuditRecorder` 별도 bean + `REQUIRES_NEW` 적용, `Slip.createInbound(...)` 도메인 factory 사용, 422/502 ErrorCode 매핑은 큰 방향이 맞다. 다만 FE와의 응답 계약이 현재 깨져 있어 PR merge blocker 이다.

## Findings

### Blocker — ReceiptParseResponse 계약이 FE/QA 계약과 불일치

- 위치:
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/ReceiptParseResponse.java:22-28`
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/service/ReceiptOcrParseService.java:110-119`
  - `clients/desktop/src/renderer/api/receiptOcrApi.ts:54-76`
- BE 응답 필드는 `slipNo`, `vendorName`, `totalAmount`, `vatAmount`, `issuedAt`, `submitMethod`, `parseRawJson` 이다.
- FE/Playwright/mock은 `receiptDate`, `ocrText`, `slipId` 를 기대한다.
- 실제 BE 연결 시 `PurchaseSlipOcrUploadPage`는 `formatDate(result.receiptDate)` 에서 `undefined.split(...)` 런타임 오류가 난다.
- 수정 권고:
  - UUID 비공개 원칙을 유지하려면 FE 타입/화면을 BE 계약(`issuedAt`, `parseRawJson`, `slipNo`)에 맞춘다.
  - 전표 상세 이동이 필요하면 UUID를 화면 텍스트로 노출하지 않는 별도 lookup route/API를 설계하거나, 내부 state 전용 `slipId` 포함 여부를 TM이 명확히 결정한다.

### Major — `CLOVA_OCR_INVOKE_URL` placeholder runtime guard 누락

- 위치: `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ReceiptOcrClientImpl.java:128-145`, `:163-168`
- `clovaApiKey`, `clovaSecretKey` 는 `isPlaceholderKey(...)` 검사하지만 `clovaInvokeUrl` 은 blank만 검사한다.
- cross-check의 4 키워드(`PLACEHOLDER_DEV_ONLY`, `CHANGE_ME_LOCAL_ONLY`, `changeme`, `dummy`) case-insensitive runtime guard가 3개 Clova 설정에 일관 적용되지 않는다.
- 수정 권고: `clovaInvokeUrl` 에도 동일 placeholder 판정을 적용한다.

### Major — nil UUID 창고 임시 처리 cutover 기준이 약함

- 위치: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/ReceiptOcrParseService.java:85-93`, `docs/dev-reports/sp-09-3-ocr-receipt-shell.md:91-95`, `:254-262`
- OCR DRAFT 전용으로 `00000000-0000-0000-0000-000000000000` 를 `destinationWarehouseId` 에 넣는다.
- 후속 체크리스트는 있으나 "언제/어떤 화면에서 nil UUID DRAFT를 차단하거나 실 창고로 전환하는지"가 명확하지 않다.
- 수정 권고: cycle 2에서 최소한 dev-report와 코드 주석에 운영 cutover 조건을 명시하고, 후속 편집/검수 진입 전 실 창고 선택이 필요한지 정책을 확정한다.

### Minor — `ReceiptParseRequest` 검증 DTO가 컨트롤러에서 사용되지 않음

- 위치: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/ReceiptParseRequest.java:15-18`, `services/slip-service/src/main/java/com/samhanair/logis/slip/web/ReceiptOcrController.java:100-111`
- `@Pattern("DRY_RUN|CLOVA")` 는 선언돼 있지만 multipart controller는 `@RequestParam String submitMethod` 를 직접 받는다.
- 현재 client 구현은 알 수 없는 method를 DRY_RUN으로 fallback 한다.
- 수정 권고: 의도한 계약이 strict면 controller/service에서 명시 422 처리하거나 DTO를 제거해 문서 불일치를 없앤다.

## Cross-check

- `REQUIRES_NEW` self-invocation 회귀: 별도 `ReceiptOcrAuditRecorder` bean 사용으로 통과.
- 422/502 status: `RECEIPT_FILE_INVALID=422`, `OCR_SUBMIT_FAILED=502` 매핑 통과.
- 권한: BE `WAREHOUSE/MANAGER/MASTER` 허용, SALES/ACCOUNTANT 403 의도 통과.
- 도메인 method chain: `Slip.createInbound(...)` 사용, 직접 setter 없음.
- UUID 사용자 비공개: BE 응답은 `slipNo`만 노출. 단 FE가 `slipId`를 요구해 계약 재결정 필요.
