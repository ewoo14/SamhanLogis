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
