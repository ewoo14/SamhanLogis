# SP-09-4 KFTC 오픈뱅킹 입금 매칭 shell — dev report

## 1. 슬라이스 개요

| 항목 | 내용 |
|---|---|
| 슬라이스 | SP-09-4 |
| 서비스 | accounting-service |
| 목표 | KFTC 오픈뱅킹 입금 내역 조회 + 거래처/세금계산서 자동 매칭 + 분개 DRAFT 생성 shell |
| 날짜 | 2026-05-18 |
| 브랜치 | feat/sp-09-4-kftc-shell |
| QA 담당 | QA agent |

---

## 2. BE 아키텍처 (shell 범위)

### 2-1. 신규 엔드포인트

| method | path | 역할 | 권한 |
|---|---|---|---|
| POST | /accounting/deposits/fetch-and-match | KFTC 입금 조회 + 거래처/세금계산서 자동 매칭 + 분개 DRAFT 생성 | ACCOUNTANT / MANAGER / MASTER |

### 2-2. KftcClient 계약

```java
// KftcClient.java (interface)
List<KftcDepositRecord> fetchDeposits(
    LocalDate from, LocalDate to,
    String accountFinNo, String submitMethod);

// KftcDepositRecord record
String depositorName    // 입금자명 (거래처 매칭 기준)
BigDecimal amount       // 입금액 (원 단위)
LocalDate transactionDate
String transactionTime  // HHmmss (KFTC 응답 포맷 그대로)
String bankAccount      // 수신 계좌번호 (마스킹 권장: "***-****-1234")
String memo             // 거래 적요 (선택)
String transactionId    // KFTC 거래 고유 ID (비즈니스 식별자 — 화면 미노출)
```

- **DRY_RUN** (기본): mock 5건 즉시 반환 — 입금자명 / 금액 / 거래일 포함
- **KFTC** (Phase 11): KFTC 오픈뱅킹 실 API — placeholder 런타임 차단 후 KFTC_SUBMIT_FAILED
- IT 격리: `@MockBean KftcClient` + `lenient().when(...)` stub 필수

### 2-3. DepositMatchService 처리 흐름

```
KftcClient.fetchDeposits() → 입금 거래 목록 조회
    ↓
depositorName → PartnerLookupClient.findByPartnerCode() 거래처 매칭
    ↓ (성공)
TaxInvoiceRepository (ISSUED 상태, 금액 일치) 조회
    ↓ (성공)
Journal.create() + JournalLine (차변/대변) 생성 → JournalRepository.save()
    ↓
DepositMatchAuditRecorder.recordFetchAndMatch() (REQUIRES_NEW 별도 트랜잭션)
```

### 2-4. 자동 분개 계정과목 (한국 일반기업회계기준)

| 구분 | 계정코드 | 계정명 | 비고 |
|---|---|---|---|
| 차변 (Debit) | 103 | 보통예금 | 입금액 전액 |
| 대변 (Credit) | 110 | 외상매출금 | 입금액 전액 회수 |

### 2-5. ErrorCode (SP-09-4 신규)

| 코드 | HTTP | 상황 |
|---|---|---|
| `DEPOSIT_DATE_RANGE_INVALID` | 422 | from > to 날짜 범위 역전 |
| `INVALID_INPUT` | 400 | accountFinNo blank |
| `KFTC_SUBMIT_FAILED` | 502 | KFTC 모드 — API 키 미설정·placeholder·API 오류 |

### 2-6. 신규 파일 목록

| 파일 | 역할 |
|---|---|
| `client/KftcClient.java` | KFTC 입금 조회 client interface |
| `client/KftcClientImpl.java` | DRY_RUN / KFTC 분기 구현체 + placeholder 차단 |
| `client/KftcDepositRecord.java` | 입금 거래 단건 record |
| `service/DepositMatchService.java` | 조회 + 거래처 매칭 + 분개 DRAFT 생성 |
| `service/DepositMatchResult.java` | 단건 매칭 결과 (서비스 내부 모델) |
| `service/DepositMatchStatus.java` | MATCHED / UNMATCHED enum |
| `service/DepositMatchAuditRecorder.java` | REQUIRES_NEW audit 기록 |
| `web/DepositMatchController.java` | REST endpoint — POST /deposits/fetch-and-match |
| `web/dto/DepositFetchRequest.java` | 요청 DTO (from/to/accountFinNo/submitMethod) |
| `web/dto/DepositMatchResponse.java` | 응답 DTO (totalCount/matchedCount/unmatchedCount/results) |
| `web/dto/DepositMatchResultDto.java` | 단건 결과 DTO (UUID 비공개) |

---

## 3. KFTC client 패턴

### 3-1. submitMethod 분기 우선순위

```
요청 파라미터 submitMethod (non-blank) → 파라미터 우선
  → null/blank → 서버 ENV kftc.submit-method (기본값 DRY_RUN)
```

### 3-2. DRY_RUN 모드 mock 5건

| depositorName | amount | transactionDate |
|---|---|---|
| (주)삼성상사 | 1,100,000 | from+0일 |
| 한국물류(주) | 550,000 | from+0일 |
| 대한유통 | 3,300,000 | from+1일 |
| 미래운송 | 220,000 | from+1일 |
| 알수없는입금자 | 99,000 | from+2일 |

### 3-3. KFTC 모드 placeholder 차단 키워드 (case-insensitive)

`placeholder_dev_only`, `changeme`, `dummy`, `test`

대상 ENV: `KFTC_API_KEY` / `KFTC_CLIENT_ID` / `KFTC_CLIENT_SECRET` (3개 모두 검증)

---

## 4. FE 흐름 (DepositMatchPage)

### 4-1. depositMatchApi.ts 타입 계약

```typescript
// BE @Pattern(regexp = "DRY_RUN|KFTC") 와 1:1 정합
export type DepositSubmitMethod = 'DRY_RUN' | 'KFTC'

// BE DepositFetchRequest 와 1:1 정합
export interface DepositFetchRequest {
  from: string          // YYYY-MM-DD
  to: string            // YYYY-MM-DD
  accountFinNo: string  // KFTC fintechUseNum
  submitMethod: DepositSubmitMethod
}

// BE DepositMatchResultDto 와 1:1 정합 (journalDraftId 미포함 — UUID 비공개 원칙)
export interface DepositMatchResult {
  depositorName: string
  amount: number
  transactionDate: string       // YYYY-MM-DD
  matchedPartnerCode?: string   // MATCHED 시만 존재 (비즈니스 식별자)
  matchedTaxInvoiceNo?: string  // MATCHED + 세금계산서 연결 시만 존재
  journalDraftId?: string       // 내부 전용 — 화면 미노출 (UUID 비공개)
  status: 'MATCHED' | 'UNMATCHED'
}

// BE DepositMatchResponse 와 1:1 정합
export interface DepositMatchResponse {
  totalCount: number
  matchedCount: number
  unmatchedCount: number
  results: DepositMatchResult[]
}
```

### 4-2. DepositMatchPage 4개 영역

| 영역 | data-testid | 내용 |
|---|---|---|
| 조회 폼 | deposit-match-from/to/account-fin-no/submit-btn/reset-btn | DRY_RUN 안내 배너 + 날짜 + 계좌 핀번호 |
| 결과 요약 | deposit-match-summary | 전체/매칭/미매칭 카운트 Badge 그룹 |
| 결과 테이블 | deposit-match-table / deposit-match-row-{n} | 5건 row — 거래처코드/세금계산서번호 포함 |
| 에러 배너 | deposit-match-error (role="alert") | FE/BE 422/502 한국어 에러 메시지 |

### 4-3. FE HashRouter URL

```
/#/accounting/deposit-match
```

### 4-4. FE 권한 상수

```typescript
export const DEPOSIT_MATCH_ROLES = ['ACCOUNTANT', 'MANAGER', 'MASTER'] as const
// BE @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')") 와 1:1 일치
```

---

## 5. 권한 매트릭스

| 역할 | 접근 | 사유 |
|---|---|---|
| MASTER | 허용 | 전권 |
| MANAGER | 허용 | 입금 매칭 업무 담당 |
| ACCOUNTANT | 허용 | 회계 분개 업무 담당 |
| SALES | 차단 | 회계/재무 미접근 원칙 |
| WAREHOUSE | 차단 | 재무 데이터 미접근 원칙 |
| DISPATCH | 차단 | 재무 데이터 미접근 원칙 |
| DRIVER | 차단 | 재무 데이터 미접근 원칙 |

---

## 6. IT 구현 계획 (10 case)

파일 예정: `services/accounting-service/src/test/java/.../it/DepositMatchControllerIT.java`

```java
// @MockBean 격리 — 외부 client 모두 격리 (feedback_it_mockbean_external_clients)
@MockBean private KftcClient kftcClient;
@MockBean private PartnerLookupClient partnerLookupClient;
@MockBean private SlipServiceClient slipServiceClient;
```

| 번호 | 케이스명 | 검증 내용 |
|---|---|---|
| 1 | testFetchAndMatchDryRunSuccess | DRY_RUN 200 + totalCount=5 / matchedCount ≥ 0 / results[] |
| 2 | testMatchedCaseHasPartnerCodeAndTaxInvoiceNo | MATCHED 결과 — matchedPartnerCode/matchedTaxInvoiceNo 존재 |
| 3 | testUnmatchedCaseNullFields | UNMATCHED 결과 — matchedPartnerCode/matchedTaxInvoiceNo null |
| 4 | testJournalDraftUuidNotInResponse | journalDraftId UUID 응답 DTO 미포함 (UUID 비공개) |
| 5 | testFromAfterToReturns422 | from > to → 422 DEPOSIT_DATE_RANGE_INVALID |
| 6 | testBlankAccountFinNoReturns400 | accountFinNo blank → 400 INVALID_INPUT |
| 7 | testSalesRoleForbidden | SALES 역할 → 403 |
| 8 | testWarehouseRoleForbidden | WAREHOUSE 역할 → 403 |
| 9 | testAuditLogRecorded | KFTC_DEPOSIT_FETCH_AND_MATCH audit 로그 저장 확인 |
| 10 | testKftcClientFailureReturns502 | KftcClient BusinessException(KFTC_SUBMIT_FAILED) → 502 |

---

## 7. Playwright 스펙 (5 case)

파일: `clients/desktop/playwright/sp-09-4-kftc-shell/sp-09-4-kftc-shell.spec.ts`

| TC | 제목 | 핵심 검증 |
|---|---|---|
| T1 | 조회 폼 진입 + DRY_RUN 안내 + Phase 11 KFTC 안내 | h3 제목 + 입력 필드 3종 + DRY_RUN 배너 + Phase 11 안내 |
| T2 | 조회 → 결과 요약 + 테이블 + 거래처코드/세금계산서번호 | 요약 카드 3종 + row 5건 + MATCHED row 비즈니스 식별자 표시 |
| T3 | from > to 422 한국어 에러 + role="alert" | FE 즉시 에러 + 서버 422 에러 + 요약 미표시 |
| T4 | row 클릭 → 상세 modal (분개 차변/대변 미리보기) | modal 표시 + 보통예금 103 차변 + 외상매출금 110 대변 |
| T5 | 권한 가드 ACCOUNTANT/MANAGER/MASTER 허용 + SALES/WAREHOUSE 차단 | 허용 3종 + 차단 2종 |

실행 조건:
```bash
cd clients/desktop
VITE_MOCK_MODE=1 npx vite --port 5173  # 별도 터미널
npx playwright test playwright/sp-09-4-kftc-shell/sp-09-4-kftc-shell.spec.ts --reporter=line
```

### 7-1. T4 QA 발견 사항 (RED 상태 — 기능 미구현)

T4 (row 클릭 → 상세 modal) 테스트는 현 shell 단계에서 FAIL 상태가 정상이다.

- **현상**: `DepositMatchPage.tsx` 에 MATCHED row 클릭 핸들러 및 `deposit-match-detail-modal` 구현 없음.
- **영향**: 차변/대변 분개 미리보기 기능 미확인 (Phase 11 구현 예정).
- **조치**: Phase 11 분개 상세 modal 구현 시 T4 테스트 GREEN 기대.
- **false green 금지**: `|| true` / `test.skip(!ok)` / `page.setContent()` fallback 없이 FAIL 을 정직하게 노출.

---

## 8. 보안 (vendor key 빈 값 가드)

### 8-1. KFTC 키 3종 placeholder 차단 (runtime guard)

```java
// KftcClientImpl.isPlaceholderKey()
private static final List<String> PLACEHOLDER_KEYWORDS =
    List.of("placeholder_dev_only", "changeme", "dummy", "test");

// DRY_RUN 시 키 검증 불필요 (3개 키 모두 미사용)
// KFTC 모드 시 kftcApiKey / kftcClientId / kftcClientSecret 3개 검증
```

### 8-2. ENV 변수 구분

| ENV 키 | 용도 | DRY_RUN | KFTC |
|---|---|---|---|
| `KFTC_API_KEY` | KFTC API 인증키 | 미사용 | 필수 (Phase 11) |
| `KFTC_CLIENT_ID` | KFTC 클라이언트 ID | 미사용 | 필수 (Phase 11) |
| `KFTC_CLIENT_SECRET` | KFTC 클라이언트 시크릿 | 미사용 | 필수 (Phase 11) |
| `KFTC_BASE_URL` | KFTC API 엔드포인트 | 미사용 | 기본값: testapi.openbanking.or.kr |

### 8-3. 평문 비공개 가드 (SP-08-8 패턴 계승)

```bash
# CI grep 체크 — KFTC placeholder 키 소스 코드 잔류 탐지
grep -r "placeholder_dev_only\|changeme" services/accounting-service/src/main/ \
  --include="*.properties" --include="*.yml"
# 결과 0건이어야 함
```

---

## 9. 회귀 영향 평가

| 구성 요소 | 변경 유무 | 회귀 위험 |
|---|---|---|
| DepositMatchController | 신규 (POST /deposits/fetch-and-match) | 없음 — 기존 엔드포인트 무관 |
| DepositMatchService | 신규 (조회+매칭+분개 생성) | 없음 |
| KftcClient / KftcClientImpl | 신규 | 없음 |
| KftcDepositRecord | 신규 record | 없음 |
| DepositMatchResult / DepositMatchStatus | 신규 | 없음 |
| DepositMatchAuditRecorder | 신규 (REQUIRES_NEW audit) | 없음 |
| DepositMatchResponse / DepositMatchResultDto / DepositFetchRequest | 신규 DTO | 없음 |
| JournalSourceType | KFTC_DEPOSIT enum 값 추가 | 낮음 — 기존 JournalSourceType 미변경 |
| JournalRepository | 기존 save() 재사용 | 없음 |
| TaxInvoiceRepository | 기존 findByFiltersWithType() 재사용 | 없음 |
| PartnerLookupClient | 기존 findByPartnerCode() 재사용 | 없음 |
| DepositMatchPage.tsx | 신규 FE 페이지 | 없음 — 신규 라우트 |
| depositMatchApi.ts | 신규 FE API 클라이언트 | 없음 |
| routes/index.tsx | /accounting/deposit-match 라우트 추가 | 낮음 — 기존 라우트 무관 |

---

## 10. Phase 11 이관 항목

| 항목 | 현재 | Phase 11 목표 |
|---|---|---|
| KFTC 모드 활성 | KFTC_SUBMIT_FAILED 즉시 반환 | KFTC 오픈뱅킹 sandbox REST 호출 구현 |
| 분개 상세 modal | 미구현 (T4 RED) | deposit-match-detail-modal + 차변/대변 미리보기 |
| 계좌 핀번호 실 조회 | DRY_RUN mock 고정 | fintechUseNum KFTC 실 API 연동 |
| 매칭 전략 강화 | depositorName == partnerCode 단순 일치 | 부분 일치 + 오타 보정 fuzzy matching |
| DepositMatchLog entity | 미생성 (audit log 만 기록) | 별도 deposit_match_log 테이블 + 이력 조회 UI |
| ENV 키 설정 | .env 미설정 (placeholder 차단) | KFTC sandbox 키 .env 설정 + CI 검증 |

---

## 관련 링크

- BE interface: `services/accounting-service/src/main/java/.../client/KftcClient.java`
- BE record: `services/accounting-service/src/main/java/.../client/KftcDepositRecord.java`
- BE service: `services/accounting-service/src/main/java/.../service/DepositMatchService.java`
- BE controller: `services/accounting-service/src/main/java/.../web/DepositMatchController.java`
- BE response DTO: `services/accounting-service/src/main/java/.../web/dto/DepositMatchResponse.java`
- FE API: `clients/desktop/src/renderer/api/depositMatchApi.ts`
- FE Page: `clients/desktop/src/renderer/routes/DepositMatchPage.tsx`
- Playwright spec: `clients/desktop/playwright/sp-09-4-kftc-shell/sp-09-4-kftc-shell.spec.ts`
- QA PNG: `docs/qa/sp-09-4-kftc-shell/screenshots/`
- 전 슬라이스: `docs/dev-reports/sp-09-3-ocr-receipt-shell.md`
