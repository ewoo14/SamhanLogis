# SP-09-5 Phase 9 Vendor 통합 검증 BE 보고서

## 개요

SP-09-1~4 (NTS e-Tax / Aligo SMS / Naver Clova OCR / KFTC 오픈뱅킹) 4 vendor client 패턴 일관성 회귀 가드 단위 테스트 및 문서화.

---

## 1. 신규 테스트 파일 목록

| 파일 | 서비스 | 검증 범위 |
|---|---|---|
| `accounting/vendor/Phase9VendorPlaceholderGuardConsistencyTest.java` | accounting-service | ETaxClientImpl + KftcClientImpl placeholder 가드, REQUIRES_NEW 어노테이션, HTTP 상태 매트릭스 |
| `notification/adapter/sms/Phase9AligoPlaceholderGuardConsistencyTest.java` | notification-service | AligoSmsAdapter.isPlaceholder() 4 키워드, false-positive 가드, DispatchSmsSaveHistoryService 구조 |
| `slip/vendor/Phase9OcrPlaceholderGuardConsistencyTest.java` | slip-service | ReceiptOcrClientImpl placeholder 3 키 검증, ReceiptOcrAuditRecorder REQUIRES_NEW, DRY_RUN stub 일관성 |

---

## 2. Placeholder 가드 키워드 일관성 현황

| Keyword | ETaxClientImpl (SP-09-1) | AligoSmsAdapter (SP-09-2) | ReceiptOcrClientImpl (SP-09-3) | KftcClientImpl (SP-09-4) |
|---|:---:|:---:|:---:|:---:|
| `PLACEHOLDER_DEV_ONLY` | 차단 | 차단 | 차단 | 차단 |
| `CHANGE_ME_LOCAL_ONLY` | **누락** (버그) | 차단 | 차단 | 차단 |
| `changeme` | 차단 | 차단 | 차단 | 차단 |
| `dummy` | 차단 | 차단 | 차단 | 차단 |

### 회귀 가드 주석

`Phase9VendorPlaceholderGuardConsistencyTest.ntsApiKey_changeMeLocalOnly_regressionGuard()` 테스트가 현재 ETaxClientImpl 의 `CHANGE_ME_LOCAL_ONLY` 누락을 문서화한다. ETaxClientImpl 수정 후 해당 테스트의 assertion 을 `contains("placeholder")` 로 변경해야 한다.

---

## 3. REQUIRES_NEW Audit Recorder 패턴 검증

| Vendor | Audit Recorder Bean | 별도 클래스 분리 | REQUIRES_NEW 어노테이션 | 검증 테스트 |
|---|---|:---:|:---:|---|
| NTS (SP-09-1) | TaxInvoiceEmitAuditRecorder | O | O | `Phase9VendorPlaceholderGuardConsistencyTest.AuditRecorderSeparateBeanPattern` |
| Aligo (SP-09-2) | DispatchSmsSaveHistoryService (TransactionTemplate PROPAGATION_REQUIRES_NEW) | O | O (via TransactionTemplate) | `Phase9AligoPlaceholderGuardConsistencyTest.DispatchSmsSaveHistoryServiceAuditPattern` |
| Clova (SP-09-3) | ReceiptOcrAuditRecorder | O | O | `Phase9OcrPlaceholderGuardConsistencyTest.ReceiptOcrAuditRecorderPattern` |
| KFTC (SP-09-4) | DepositMatchAuditRecorder | O | O | `Phase9VendorPlaceholderGuardConsistencyTest.AuditRecorderSeparateBeanPattern` |

self-invocation 우회 패턴 일관: 모든 4 vendor 가 main service bean 에서 audit recorder bean 을 주입받아 호출 (Spring AOP proxy 정상 적용).

---

## 4. HTTP 상태 코드 매트릭스

| ErrorCode | HTTP Status | 발생 상황 |
|---|---|---|
| `TAX_INVOICE_NOT_EMITTABLE` | 422 Unprocessable Entity | ISSUED 아닌 상태에서 emit-nts 호출 |
| `TAX_INVOICE_ALREADY_EMITTED` | 409 Conflict | 이미 전송된 세금계산서 중복 전송 |
| `ETAX_SUBMIT_FAILED` | 502 Bad Gateway | NTS API 키 미설정·placeholder·API 오류 |
| `OCR_SUBMIT_FAILED` | 502 Bad Gateway | Clova API 키 미설정·placeholder·API 오류 |
| `RECEIPT_FILE_INVALID` | 422 Unprocessable Entity | 빈 파일·10MB 초과·비지원 포맷 |
| `KFTC_SUBMIT_FAILED` | 502 Bad Gateway | KFTC API 키 미설정·placeholder·API 오류 |
| `DEPOSIT_DATE_RANGE_INVALID` | 422 Unprocessable Entity | from > to 날짜 역순 |

---

## 5. 권한 매트릭스 (7 역할 × 4 vendor)

| 역할 | NTS e-Tax 발행 | Aligo SMS 배차 발송 | Clova OCR 영수증 | KFTC 입금 매칭 |
|---|:---:|:---:|:---:|:---:|
| MASTER | O | O | O | O |
| MANAGER | X (403) | O | O | O |
| ACCOUNTANT | O | X (403) | O | O |
| SALES | X (403) | X (403) | X (403) | X (403) |
| WAREHOUSE | X (403) | X (403) | O | X (403) |
| DISPATCH | X (403) | O | X (403) | X (403) |
| DRIVER | X (403) | X (403) | X (403) | X (403) |

### 근거

- **NTS e-Tax**: `@PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")` — `TaxInvoiceController`
- **Aligo SMS**: `@PreAuthorize("hasAnyRole('DISPATCH','MANAGER','MASTER')")` — `DispatchBatchAdminController`
- **Clova OCR**: `@PreAuthorize("hasAnyRole('WAREHOUSE','ACCOUNTANT','MANAGER','MASTER')")` — `ReceiptOcrController`
- **KFTC 입금 매칭**: `@PreAuthorize("hasAnyRole('ACCOUNTANT', 'MANAGER', 'MASTER')")` — `DepositMatchController`

---

## 6. 컴파일 검증 결과

```
./gradlew :services:accounting-service:compileTestJava   → BUILD SUCCESSFUL
./gradlew :services:notification-service:compileTestJava → BUILD SUCCESSFUL
./gradlew :services:slip-service:compileTestJava         → BUILD SUCCESSFUL
```

---

## 7. Phase 11 이관 항목

- ETaxClientImpl `isPlaceholderApiKey()` 에 `CHANGE_ME_LOCAL_ONLY` 추가 (4 vendor 일관성 수정)
- 4 vendor 실 API 구현 (RestClient 구조만 준비 완료)
- DRY_RUN → NTS/ALIGO/CLOVA/KFTC 전환 시 ENV 주입 절차 문서화
