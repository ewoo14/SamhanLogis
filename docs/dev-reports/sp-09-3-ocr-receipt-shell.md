# SP-09-3 Naver Clova OCR 영수증 발급 shell — dev report

## 1. 슬라이스 개요

| 항목 | 내용 |
|---|---|
| 슬라이스 | SP-09-3 |
| 서비스 | slip-service |
| 목표 | 매입 영수증 이미지 업로드 → OCR 파싱 → 매입 전표 DRAFT 자동 생성 shell |
| 날짜 | 2026-05-18 |
| 브랜치 | feat/sp-09-3-ocr-receipt-shell (base 7d55b878 main) |

---

## 2. BE 아키텍처 (shell 범위)

### 2-1. 신규 엔드포인트

| method | path | 역할 | 권한 |
|---|---|---|---|
| POST | /slips/receipt-ocr | 영수증 이미지 → OCR 파싱 + INBOUND DRAFT 자동 생성 | WAREHOUSE / MANAGER / MASTER |

### 2-2. ReceiptOcrClient 계약

```java
// ReceiptOcrClient.java (interface)
ReceiptOcrResult submit(byte[] imageBytes, String filename, String submitMethod);

// ReceiptOcrResult record
String vendorName       // OCR 추출 가게명
BigDecimal totalAmount  // OCR 추출 총 결제금액
BigDecimal vatAmount    // OCR 추출 부가세 금액
LocalDate issuedAt      // OCR 추출 발행일
String rawJson          // OCR 원본 응답 요약 JSON
boolean success
String message
```

- **DRY_RUN** (기본): 즉시 mock 성공 — 가게명 "테스트마트", 총액 12345, 부가세 1234, 발행일 today
- **CLOVA** (Phase 11): Naver Clova OCR 실 API — placeholder 런타임 차단 후 OCR_SUBMIT_FAILED
- IT 격리: `@MockBean ReceiptOcrClient` + `lenient().when(...)` stub 필수

### 2-3. 신규 파일 목록

| 파일 | 역할 |
|---|---|
| `client/ReceiptOcrClient.java` | OCR client interface |
| `client/ReceiptOcrClientImpl.java` | DRY_RUN / CLOVA 분기 구현체 |
| `client/ReceiptOcrResult.java` | OCR 파싱 결과 record |
| `service/ReceiptOcrParseService.java` | OCR 파싱 + DRAFT 전표 생성 서비스 |
| `service/ReceiptOcrAuditRecorder.java` | REQUIRES_NEW audit log 기록 |
| `web/ReceiptOcrController.java` | POST /slips/receipt-ocr |
| `web/dto/ReceiptParseRequest.java` | 요청 DTO (submitMethod 패턴 검증) |
| `web/dto/ReceiptParseResponse.java` | 응답 DTO (slipNo + OCR 결과) |

### 2-4. 신규 ErrorCode (shared/common)

| 코드 | HTTP | 설명 |
|---|---|---|
| `OCR_SUBMIT_FAILED` | 502 | Clova OCR API 오류 또는 placeholder 키 차단 |
| `RECEIPT_FILE_INVALID` | 422 | 빈 파일 / 10MB 초과 / 비지원 포맷(jpg/png 외) |

---

## 3. 검증 결과

```
./gradlew :services:slip-service:compileJava       → BUILD SUCCESSFUL
./gradlew :services:slip-service:compileTestJava   → BUILD SUCCESSFUL
./gradlew :shared:common:compileJava               → BUILD SUCCESSFUL
```

---

## 4. IT 커버리지 (8 case)

| # | 케이스 | 결과 |
|---|---|---|
| 1 | DRY_RUN 성공 (WAREHOUSE) | 201 + slipNo |
| 2 | SALES 역할 → 403 | Forbidden |
| 3 | 빈 파일 → 422 | RECEIPT_FILE_INVALID |
| 4 | 10MB 초과 → 422 | RECEIPT_FILE_INVALID |
| 5 | PDF 포맷 → 422 | RECEIPT_FILE_INVALID |
| 6 | CLOVA + placeholder → 502 | OCR_SUBMIT_FAILED |
| 7 | DRY_RUN 후 INBOUND DRAFT 생성 확인 | DB 상태 검증 |
| 8 | audit log 기록 확인 (REQUIRES_NEW) | SlipAuditLogRepository 조회 |

---

## 5. 설계 결정 사항

- **도메인 메서드**: DRAFT 전표 생성 시 `Slip.createInbound` 정적 factory 활용 (직접 setter 금지)
- **destinationWarehouseId**: OCR shell 단계는 창고 미확정 → nil UUID (`00000000-...`) 임시 사용. 후속 수정 시 실 창고 UUID 채움
- **audit 패턴**: SP-09-1 TaxInvoiceEmitAuditRecorder 와 동일한 REQUIRES_NEW 별도 트랜잭션
- **UUID 비공개**: 응답 ReceiptParseResponse 에 slipNo (비즈니스 식별자) 만 노출. slipId UUID 미포함
- **placeholder 차단**: PLACEHOLDER_DEV_ONLY / CHANGE_ME_LOCAL_ONLY / changeme / dummy (대소문자 무시)
- **multipart 한도**: 기존 5MB → 12MB 상향 (OCR 10MB 지원), Controller 레이어 endpoint 별 가드 유지

---

## 6. 환경변수 / property

| 변수 | 기본값 | 설명 |
|---|---|---|
| `OCR_SUBMIT_METHOD` | `DRY_RUN` | OCR 전송 방식 |
| `CLOVA_OCR_API_KEY` | (공백) | Naver Clova API 키 (CLOVA 모드 필수) |
| `CLOVA_OCR_SECRET_KEY` | (공백) | Naver Clova Secret 키 |
| `CLOVA_OCR_INVOKE_URL` | (공백) | Clova OCR Invoke URL |

---

## 7. 미구현 (Phase 11 예정)

- Clova OCR 실 API RestClient 호출 구현
- OCR 파싱 결과 → SlipLine 자동 생성 (상품 매핑 포함)
- 영수증 이미지 MinIO/S3 저장 (slip_attachments bucket 연동)

---

## 8. QA 섹션 — Playwright 스펙 (5건)

파일: `clients/desktop/playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts`

### 8-1. TC 구조

```
test.describe('SP-09-3 OCR 영수증 발급 shell QA')
  ├── T1: 드롭존 빈 상태 + DRY_RUN 안내 + Phase 11 CLOVA 안내
  │     step 1: /#/purchases/receipt-ocr WAREHOUSE 권한 진입
  │     step 2: receipt-ocr-drop-zone 드롭존 표시
  │     step 3: DRY_RUN 처리 방식 안내 섹션 확인
  │     step 4: Phase 11 Naver Clova OCR 안내 확인
  │     step 5: submit 버튼 초기 disabled 확인
  ├── T2: 파일 선택 → DRY_RUN 업로드 → OCR 결과 카드 + slipNo 링크
  │     step 1: /slips/receipt-ocr DRY_RUN mock 등록
  │     step 2: WAREHOUSE 권한 진입
  │     step 3: PNG 파일 선택 → submit 버튼 활성화
  │     step 4: 업로드 → receipt-ocr-result 카드 표시
  │     step 5: 결과 카드 — 가게명/금액/부가세/날짜 검증
  │     step 6: receipt-ocr-slip-badge + receipt-ocr-slip-link slipNo 링크
  │     step 7: UUID 비공개 — slipId UUID 텍스트 미노출
  ├── T3: 10MB+ 파일 거부 422 한국어 메시지 + role="alert"
  │     step 1: /slips/receipt-ocr 422 mock 등록
  │     step 2: WAREHOUSE 권한 진입
  │     step 3: 10MB 초과 PNG → FE 즉시 에러 + role="alert"
  │     step 4: 서버 422 → receipt-ocr-error 또는 role="alert"
  ├── T4: PDF 비지원 포맷 선택 → 한국어 에러 메시지 + role="alert"
  │     step 1: /slips/receipt-ocr 422 mock 등록
  │     step 2: WAREHOUSE 권한 진입
  │     step 3: .pdf 파일 선택 → FE 즉시 에러 배너
  │     step 4: 비지원 포맷 에러 후 submit 버튼 비활성화
  └── T5: 권한 가드
        step 1: WAREHOUSE 허용 — receipt-ocr-drop-zone 표시
        step 2: MANAGER 허용
        step 3: MASTER 허용
        step 4: SALES 차단 — 드롭존 미표시 또는 403
        step 5: ACCOUNTANT 차단 — 드롭존 미표시 또는 403
```

### 8-2. URL 상수 (HashRouter)

```
BASE_URL/#/purchases/receipt-ocr?mockRole=WAREHOUSE
BASE_URL/#/purchases/receipt-ocr?mockRole=MANAGER
BASE_URL/#/purchases/receipt-ocr?mockRole=MASTER
BASE_URL/#/purchases/receipt-ocr?mockRole=SALES
BASE_URL/#/purchases/receipt-ocr?mockRole=ACCOUNTANT
```

### 8-3. 핵심 data-testid 매핑

| data-testid | 컴포넌트 위치 | 검증 TC |
|---|---|---|
| `receipt-ocr-drop-zone` | 파일 드롭존 영역 | T1, T5 |
| `receipt-ocr-file-input` | 숨김 file input | T2, T3, T4 |
| `receipt-ocr-submit-btn` | 영수증 분석 시작 버튼 | T1(disabled), T2, T3 |
| `receipt-ocr-result` | OCR 결과 카드 | T2 |
| `receipt-ocr-slip-badge` | 매입 슬립 자동 생성 배지 | T2 |
| `receipt-ocr-slip-link` | 슬립 링크 (slipNo 표시) | T2 |
| `receipt-ocr-error` | API 에러 배너 (422/502) | T3 |

### 8-4. false green 가드

| 금지 패턴 | 대안 적용 |
|---|---|
| `test.skip(!ok)` | `expect(ok, '...').toBe(true)` — FAIL 처리 |
| `page.setContent()` fallback | 실제 data-testid `toBeVisible()` 기반 assertion |
| `|| true` shortcut | 명시적 boolean 변수 + 의미 있는 오류 메시지 |
| bodyText OR fallback | 제목(`h3`) `toBeVisible()` 우선, bodyText 는 내용 검증에만 사용 |

### 8-5. 스크린샷 저장 경로

| TC | 파일 |
|---|---|
| T1 | `docs/qa/sp-09-3-ocr-receipt-shell/screenshots/T1-dropzone-dry-run-notice.png` |
| T2 | `docs/qa/sp-09-3-ocr-receipt-shell/screenshots/T2-ocr-result-card.png` |
| T3 | `docs/qa/sp-09-3-ocr-receipt-shell/screenshots/T3-10mb-oversize-alert.png` |
| T4 | `docs/qa/sp-09-3-ocr-receipt-shell/screenshots/T4-unsupported-format-alert.png` |
| T5 | `docs/qa/sp-09-3-ocr-receipt-shell/screenshots/T5-role-guard-warehouse-allowed.png` |
| T5 | `docs/qa/sp-09-3-ocr-receipt-shell/screenshots/T5-role-guard-sales-403.png` |

---

## 9. 권한 매트릭스

| 역할 | POST /slips/receipt-ocr | /#/purchases/receipt-ocr |
|---|---|---|
| MASTER | 허용 | 허용 |
| MANAGER | 허용 | 허용 |
| WAREHOUSE | 허용 | 허용 |
| SALES | 403 | RoleGuard 차단 |
| ACCOUNTANT | 403 | RoleGuard 차단 |
| INVENTORY | 403 | RoleGuard 차단 |
| DISPATCH | 403 | RoleGuard 차단 |

---

## 10. 보안 — vendor key 빈 값 가드

| 항목 | 값 | 결과 |
|---|---|---|
| `ocr.clova-api-key` | blank | OCR_SUBMIT_FAILED (502) |
| `ocr.clova-secret-key` | blank | OCR_SUBMIT_FAILED |
| `ocr.clova-invoke-url` | blank | OCR_SUBMIT_FAILED |
| `ocr.clova-api-key` = `placeholder_dev_only` | placeholder | OCR_SUBMIT_FAILED |
| `ocr.clova-api-key` = `changeme` | placeholder | OCR_SUBMIT_FAILED |
| 운영 설정 위치 | AWS SSM Parameter Store / `.env` | 코드 하드코딩 금지 |

shell 단계 권장 설정: `ocr.clova-api-key=`, `ocr.clova-secret-key=`, `ocr.clova-invoke-url=` 모두 blank.

---

## 11. 회귀 영향

### 11-1. slip-service 회귀

| 컴포넌트 | 변경 | 영향 |
|---|---|---|
| `Slip.createInbound()` | 기존 도메인 메서드 활용 | 무영향 |
| `SlipNumberService.next()` | 기존 채번 로직 활용 | 무영향 |
| `SlipAuditLog.record()` | 기존 audit 패턴 활용 | 무영향 |
| `/slips/receipt-ocr` | 신규 정적 경로 추가 | `/slips/{id}` 경로 무영향 |

### 11-2. FE 회귀

- `/purchases/receipt-ocr` 정적 경로가 `/purchases/:id` 보다 선등록 (routes/index.tsx 라인 488~494 확인)
- 기존 `SlipListPage` (INBOUND mode), `PurchaseSlipEditPage` 경로 영향 없음

### 11-3. SP-09-2 회귀

T5 권한 가드 패턴 동일 적용 — SALES/ACCOUNTANT 차단 일관성 확인.

---

## 12. Phase 11 이관 체크리스트

- [ ] CLOVA API 자격증명 AWS SSM Parameter Store 등록 (`ocr.clova-api-key` 등)
- [ ] `ReceiptOcrClientImpl.submitClova()` RestClient 실 구현 (TODO 주석 → 구현)
- [ ] FE `PurchaseSlipOcrUploadPage` submitMethod 선택 UI 활성화 (현재 DRY_RUN 고정)
- [ ] CLOVA 실 호출 IT 케이스 추가 (Clova sandbox → 전표 자동 생성)
- [ ] CI `grep placeholder` 가드 추가 (SP-08-8 패턴 일관)
- [ ] OCR 파싱 결과 → SlipLine 자동 생성 (상품 UUID 매핑 포함)
- [ ] 영수증 이미지 MinIO/S3 저장 (slip_attachments bucket)

---

## 검증 명령어

```powershell
# TypeScript 타입 체크
cd clients/desktop
npm run typecheck

# Playwright 스펙 실행 (dev server 필요)
# 별도 터미널: $env:VITE_MOCK_MODE=1; npx vite --port 5173
npx playwright test playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts --reporter=line

# IT 실행 (Docker 필요)
cd ../..
./gradlew :services:slip-service:test --tests "*ReceiptOcr*"

# dev server 미가용 시 SKIP
$env:PLAYWRIGHT_SKIP_UI = "1"
npx playwright test playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts --reporter=line
```
