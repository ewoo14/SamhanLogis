# PR #1156 R8 — read 축과 거래처코드/사업자번호 타입 경계

## 범위와 판정

이번 라운드는 `partnerCode`를 쓰는 곳이 아니라 읽은 뒤 어떤 의미로 소비하는지를 production Java/TypeScript에서 전수 조사했다. 모집단은 `services/**/*.java`와 `clients/desktop/src/renderer/**/*.ts(x)`이며 test/mock/build 산출물은 제외했다.

판정은 다음과 같다.

- 홈택스 역방향 소비자는 2곳이었다. 둘 다 `partnerCode`를 등록번호로 숫자화하던 동일 결함이며 수정했다.
- 사업자번호를 거래처코드 슬롯으로 fallback하던 write 지점은 R7이 지적한 3곳 모두 수정했다.
- 타입 경계는 전 저장소가 아니라 전표/입출금 거래처 선택과 현금영수증 거래처 선택에 한정해 도입했다.
- 기존 문자열의 런타임 값은 변경하지 않았다.
- 기존 발행 전표 소급 처리, 보정 endpoint, 거래처 `1068689215` 조작, DB 직접 INSERT/UPDATE, commit/push는 모두 하지 않았다.

## RED 원문 — fix 전

### RED-A①/RED-B① 홈택스

fix 전 두 매퍼는 다음과 같았다.

```java
String partnerCode = safeStr(raw.get("partnerCode"));
String buyerRegNo  = partnerCode.replaceAll("[^0-9]", "");
```

R7 표본 원문:

```text
partnerCode=P-2026-0001
businessNumber=113-07-10031
fix 전 buyerRegNo=20260001
정상 buyerRegNo=1130710031
```

사업자번호 필드가 없는 입력에서는 위 식이 거래처코드를 숫자화해 가짜 등록번호를 만들었다. `HometaxExportServiceTest`와 `TaxInvoiceBatchServiceTest`에 각각 정상/누락 테스트를 먼저 추가해 RED를 확인했고, 수정 후 모두 GREEN이 되었다.

### RED-A② write 3지점

fix 전 원문:

```text
BankTransactionPage.tsx:136
partnerCode: row.matchedPartnerCode ?? row.matchedBizNo ?? ''

CashReceiptFormPage.model.ts:105
partnerCode: state.partnerCode || state.bizNo || state.partnerName

CashReceiptFormPage.tsx:383
partnerCode: line.partnerCode || line.partnerName
```

수정 전 TS RED 원문:

```text
CashReceiptForm.model: expected partnerCode '' but received '113-07-10031'
BankTransaction: partnerValueOf is not a function (RED 테스트를 위해 export 경계 추가 전)
```

첫 번째 assertion은 사업자번호가 거래처코드 슬롯으로 복사되는 실제 값을 확인했고, 두 번째는 helper 경계를 검증하기 위해 테스트 가능한 export를 추가한 뒤 동일 동작을 고정했다.

## read 축 전수 표

| 지점 | 읽은 값 | 읽어서 쓰는 값/소비처 | 판정 |
|---|---|---|---|
| `services/accounting-service/.../HometaxExportService.java:553` | `businessNumber` (수정 전 `partnerCode`) | 홈택스 `HomtaxRow.buyerRegNo` — 숫자만 추출 | 수정. 사업자번호 없으면 빈 문자열 |
| `services/accounting-service/.../TaxInvoiceBatchService.java:368` | `businessNumber` (수정 전 `partnerCode`) | 배치 홈택스 `HomtaxRow.buyerRegNo` — 숫자만 추출 | 수정. 사업자번호 없으면 빈 문자열 |
| `services/accounting-service/.../SalesAggregateService.java:86` | `partner.businessNumber()` | 매출집계 row의 사업자번호 열 | 정상. `partnerCode` 슬롯에 쓰지 않음 |
| `services/accounting-service/.../PartnerLookupClient.java:644,699,743` | `partnerCode`, `bizNo/businessNo/businessRegistrationNumber` | `PartnerSummary.partnerCode`와 `PartnerSummary.businessNo` 별도 필드 | 정상. 혼합 대입 없음 |
| `services/slip-service/.../PartnerInternalClient.java:121` | `businessRegistrationNo` | partnerId로 사업자번호를 resolve하는 반환값 | 정상. 거래처코드로 쓰지 않음 |
| `services/slip-service/.../SlipDuplicateService.java:141` | partnerId에서 `businessNumber`와 `partnerCode`를 각각 resolve | 복제 전표의 두 snapshot 필드 | 정상. 두 resolve 결과를 분리 저장 |
| `services/partner-auth-service/.../PartnerAuthService.java:144,326` | 자가등록 요청의 검증된 `bizNo` | legacy `PartnerAuth.partnerCode` 파생값 | **예외/미수정**. 자가등록 인증 계약이 partnerCode를 아직 사업자번호 mirror로 정의한다. 임의 `P-*` 전환은 기존 로그인·계정 계약 변경이므로 별도 도메인 결정 필요 |
| `services/inventory-service/.../SlipClient.java:147` | `businessNumber` 별칭 | `SlipLineDetail`/전표 상세 business number | 정상. partnerCode 슬롯 아님 |
| `clients/desktop/src/renderer/routes/BankTransactionPage.tsx:136` | `matchedPartnerCode`, `matchedBizNo` | PartnerAutocomplete 선택값의 각각 `partnerCode`, `bizNo` | 수정. code가 없을 때 bizNo fallback 제거 |
| `clients/desktop/src/renderer/routes/CashReceiptFormPage.model.ts:105` | `state.partnerCode`, `state.bizNo`, `state.partnerName` | 거래처 선택 option의 code/name/bizNo | 수정. code가 없을 때 bizNo/name fallback 제거 |
| `clients/desktop/src/renderer/routes/CashReceiptFormPage.tsx:383` | line의 code/name/bizNo | 행 PartnerAutocomplete value | 수정. name fallback 제거 |
| `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:2900` | `code`, `bizNo` 별도 변수 | 상세 거래처 option의 `partnerCode`, `bizNo` | 정상. 병렬 필드로 전달 |
| `clients/desktop/src/renderer/routes/accounting/print/PartnerAgingPrintLayout.tsx:250`, `DailyClosingPage.tsx:604`, `GeneralLedgerPage.tsx:202` 등 | `bizNo` | 인쇄/전표의 사업자번호 표시·숫자 정규화 | 정상. `partnerCode`로 재대입하지 않음 |

반대 방향인 `businessNumber/bizNo → partnerCode`에서는 위 자가등록 legacy 예외가 추가로 발견되었다. 이 지점은 이번 R8의 전표/거래처 선택/내보내기 read 축 결함과 달리 인증 저장 계약 자체의 변경이므로 소급·임의 변경하지 않았다. 단순히 같은 응답/DTO에 두 필드가 함께 선언된 지점은 대입 결함으로 세지 않고, 실제 소비 흐름까지 확인했다.

## 타입 도입 범위

신규 `partnerIdentity.ts`에 다음 nominal 타입을 추가했다.

```ts
type PartnerCode = string & { readonly __brand: 'PartnerCode' }
type BusinessNumber = string & { readonly __brand: 'BusinessNumber' }
```

`PartnerSelectionOption`을 전표/입출금 거래처 선택 경계의 반환 타입으로 사용하고, 외부 문자열 경계에서만 `asPartnerCode`/`asBusinessNumber`를 호출한다. 변환 함수는 cast만 수행하므로 런타임 문자열 값은 그대로다.

| 적용 범위 | 덮은 것 | 아직 안 덮은 범위 |
|---|---|---|
| desktop renderer 거래처 선택 | 입출금 매칭 helper, 현금영수증 header/line 선택 option | design-system의 전역 `PartnerOption`, 모든 accounting API DTO |
| desktop 전표 소비 | 이번 라운드에서 실제 fallback이 있던 write/read 경계 | 458 production renderer 전체의 모든 문자열 필드 |
| Java | 홈택스 매퍼 회귀 테스트와 명시적 `businessNumber` 읽기 | Java 전역 `String` nominal 타입 |

Java nominal 타입은 이번 라운드에 넣지 않았다. 현재 DTO/Map/Rest JSON/JPA 경계가 모두 `String`이고, 값 객체로 바꾸면 여러 service의 wire contract·생성자·repository projection을 함께 변경해야 한다. 사고가 발생한 홈택스 매퍼를 먼저 명시 필드로 고정하는 것이 범위 대비 안전하다.

## 타입으로 새로 드러난 지점

타입 경계를 추가하면서 새 production fallback 지점은 추가로 드러나지 않았다. 대신 기존 grep가 놓쳤던 세 write 지점이 테스트 가능한 함수 경계에서 명시적으로 고정되었고, `partnerCode`와 `bizNo`가 같은 문자열 타입이던 선택 option의 경계가 분리되었다.

## fix 전/후 검증

### 자동 검증

```text
fix 전 Java RED: compile 보정 후 buyerRegNo assertion 실패(기대 1130710031, 실제 20260001)
fix 후 accounting targeted Gradle: BUILD SUCCESSFUL
fix 후 desktop targeted Vitest: 3 files, 32 tests passed
fix 후 desktop web typecheck: exit 0
```

기존 테스트 출력에 있던 jsdom `navigation` 경고는 변경과 무관한 기존 BankTransactionPage 테스트 경로의 stderr이며, 테스트 결과는 23/23 포함 전체 32/32 통과했다.

### 라이브 확인

이번 코드 라운드에서는 새 R8 HEAD accounting JAR을 기동하고 `CONFIRMED` R8 표본을 새로 만드는 라이브 검증까지 완료하지 못했다. 따라서 라이브 fix 전/후 판정은 미완료로 남긴다. R7의 기존 라이브 표본을 소급 처리하지 않았고, 이번 라운드에는 공유 DB write도 없었다.

## 신규 파일 목록

- `clients/desktop/src/renderer/types/partnerIdentity.ts`
- `clients/desktop/src/renderer/types/partnerIdentity.test.ts`
- `docs/dev-reports/2026-08-10-1156-r8-read-axis-and-types.md`

기존 파일 수정 목록은 `git status`와 diff에 남아 있으며, commit/push는 하지 않았다.

## 못 한 것

- 새 R8 표본 생성 → 실제 상태 `CONFIRMED` 전이 → 새 accounting JAR의 홈택스 preview/export 호출 및 Playwright 캡처.
- `docs/qa/2026-08-10-1156-r8/` 캡처. 따라서 `_local` 경로도 생성하지 않았다.
- Java 전 저장소 nominal 타입 도입. 위 표의 비용·범위 근거로 다음 라운드로 보류했다.
- `partner-auth-service`의 `bizNo → partnerCode` legacy mirror 계약 변경. 기존 인증 계정 호환성 영향이 있어 별도 설계/마이그레이션 없이는 변경하지 않았다.
- 기존 발행 전표의 소급 보정. 업무 판단 대상이므로 실행하지 않았다.
