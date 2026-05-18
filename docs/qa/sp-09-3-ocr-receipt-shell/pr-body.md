## 요약

**Phase 9 vendor 연동 시리즈 3번째 슬라이스** — Naver Clova OCR 영수증 발급 shell + **외부 vendor 키 보안 정책 통합** (사용자 결정 2026-05-18).

- `ReceiptOcrClient` interface + DRY_RUN/CLOVA 분기 `ReceiptOcrClientImpl` (SP-09-1/2 placeholder runtime guard 패턴 일관)
- 매입 영수증 이미지 업로드 → OCR parse → **`Slip.createInbound` INBOUND DRAFT 자동 생성**
- FE 드롭존 + DRY_RUN 안내 + OCR 결과 카드 + slipNo 링크
- **외부 vendor 키 보안 정책 통합** — 5 vendor (NTS/Aligo/Clova/Insung/KFTC) 일관 빈 값 + placeholder 금지

## 변경 파일

### BE (slip-service)
- `client/ReceiptOcrClient.java` interface (submit(byte[], filename, submitMethod))
- `client/ReceiptOcrClientImpl.java` — DRY_RUN mock + CLOVA placeholder runtime guard (4 키워드 case-insensitive)
- `client/ReceiptOcrResult.java` record
- `service/ReceiptOcrParseService.java` — OCR → INBOUND DRAFT 자동 생성
- `service/ReceiptOcrAuditRecorder.java` — REQUIRES_NEW 별도 트랜잭션
- `web/ReceiptOcrController.java` — POST /slips/receipt-ocr (WAREHOUSE/MANAGER/MASTER)
- `web/dto/ReceiptParseRequest.java` / `ReceiptParseResponse.java`
- `application.yml` ocr.* + multipart 12MB
- `shared/common/ErrorCode.java` — OCR_SUBMIT_FAILED(502) + RECEIPT_FILE_INVALID(422)

### IT (8 case)
- `ReceiptOcrShellIT` — DRY_RUN / SALES 403 / 빈 파일 / 10MB+ / PDF 거부 / placeholder 502 / audit / INBOUND DRAFT

### FE (desktop)
- `api/receiptOcrApi.ts` — `parseReceipt(file, submitMethod)` + `ApiErrorEnvelope`
- `routes/PurchaseSlipOcrUploadPage.tsx` — 드롭존 + 결과 카드 + slipNo 링크
- `api/mock.ts` — DRY_RUN / 422 / 502 시나리오

### Designer (design-system 토큰 신규)
- `tokens.css` + `tokens/index.ts` — `--color-clova-*` 6종 (Naver 공식 녹색 `#03C75A`)
- HTML mock 4장 + PNG 4장

### DevOps (보안 정책 통합)
- `infrastructure/env-templates/slip-service.env` — OCR 4 키 빈 값
- `infrastructure/env-templates/arologis-service.env` — `SAMHAN_INSUNG_QUICK_*` `CHANGE_ME_LOCAL_ONLY` → 빈 값 (정책 일관)
- `docs/dev-environment-setup-multi-pc.md` — **외부 vendor 키 보안 정책** 섹션 신규 + 5 vendor 매트릭스
- `scripts/check-credential-plaintext.sh` — `PATTERN_CLOVA` 신규

## QA 스크린샷

> SP-09-1/2 패턴: HTML mock → Playwright headless 캡처 → raw URL absolute.

### 01. 드롭존 빈 상태 + DRY_RUN 안내
![01 upload empty](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-3-ocr-receipt-shell/docs/qa/sp-09-3-ocr-receipt-shell/screenshots/01-upload-empty.png)

### 02. 파일 선택 + 업로드 진행
![02 uploading](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-3-ocr-receipt-shell/docs/qa/sp-09-3-ocr-receipt-shell/screenshots/02-upload-uploading.png)

### 03. OCR 결과 카드 + 매입 슬립 자동 생성됨
![03 result success](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-3-ocr-receipt-shell/docs/qa/sp-09-3-ocr-receipt-shell/screenshots/03-ocr-result-success.png)

### 04. 실패 사례 (10MB 초과 / 502 Clova 오류)
![04 failure](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-3-ocr-receipt-shell/docs/qa/sp-09-3-ocr-receipt-shell/screenshots/04-ocr-failure.png)

## 외부 vendor 키 보안 정책 (사용자 결정 2026-05-18)

본 PR 에 **5 vendor 일관 정책** 통합 commit:

| vendor | 슬라이스 | client | env template | 현재 상태 |
|---|---|---|---|---|
| 국세청 (홈택스) NTS | SP-09-1 | `ETaxClientImpl` | `accounting-service.env` | 빈 값 + DRY_RUN |
| Aligo SMS | SP-09-2 | `AligoSmsAdapter` | `notification-service.env` | 빈 값 + stub |
| **Naver Clova OCR** | **SP-09-3 (본 PR)** | `ReceiptOcrClient` | `slip-service.env` | **빈 값 + DRY_RUN** |
| 인성데이타 퀵프로그램 | Phase 10 W10-2 | `InsungQuickClient` | `arologis-service.env` | 빈 값 (본 PR 일관) |
| 오픈뱅킹 KFTC | SP-09-4 (Phase 10) | (TBD) | (예정) | — |

- env 템플릿 빈 값 commit
- placeholder 4 키워드 (`CHANGE_ME_LOCAL_ONLY/PLACEHOLDER_DEV_ONLY/changeme/dummy`) case-insensitive runtime guard
- 실 키 주입: 운영 PC `.env` (gitignore) 또는 Phase 11 AWS Parameter Store
- CI guard: `Credential Plaintext Guard` job

## 검증

- [x] `./gradlew :services:slip-service:compileJava :services:slip-service:compileTestJava` BUILD SUCCESSFUL
- [x] `npm run typecheck` (clients/desktop) PASS
- [x] `bash scripts/check-credential-plaintext.sh` PASS
- [x] BaseEntity 7 audit + Soft Delete 준수
- [x] UUID 비공개 (slipNo 비즈니스 식별자만)
- [x] 한국어 Javadoc / 에러 메시지
- [x] SP-09-2 회귀 가드 (false green 0건, data-testid 사용, HashRouter URL 정합)

## 권한 (SP-03 §4.2)

| Role | OCR 영수증 발급 |
|---|---|
| MASTER | ✅ |
| MANAGER | ✅ |
| WAREHOUSE | ✅ |
| ACCOUNTANT | ❌ (403) |
| SALES | ❌ (403) |
| DISPATCH | ❌ (403) |

## Phase 9 진행 현황

- ✅ SP-09-1 NTS e-tax (#236)
- ✅ SP-09-2 Aligo SMS (#237)
- 🔄 **SP-09-3 Naver Clova OCR (본 PR)**
- ⏭️ SP-09-4 오픈뱅킹 KFTC (Phase 10)
- ⏭️ SP-09-5 통합 검증

연관 Issue: Phase 9 vendor 연동 시리즈 3번째 슬라이스 + 보안 정책 통합

🤖 Generated with [Claude Code](https://claude.com/claude-code)
