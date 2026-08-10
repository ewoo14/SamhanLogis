# PR #1156 R10 — 홈택스 결과표 필드 계약 수정

## 판정

R10 결함은 수정했다. 원인은 백엔드 export 매퍼가 반환하는 `HomtaxRow` 필드명과 desktop 결과표가 읽던 구형 필드명이 달랐던 것이다. 추가 조사에서 `partnerCode`는 구형 화면 타입에만 있고 백엔드 DTO에는 없다는 셋째 불일치도 확인했다.

수정 후 포트 5330 실 renderer에서 자기 R10 표본 `2026/08/10-25`, `2026/08/10-26`을 `CONFIRMED`로 읽어 결과표 전 열을 DTO 값과 대조했다. 사업자번호가 있는 표본은 `1130710031`, 없는 표본은 빈 값으로 표시됐다. 실제 XLSX도 사업자번호 있는 행은 `1130710031`, 없는 행은 빈 셀을 유지했다.

## 원인 확정 — 파일:줄

| 층 | 수정 전 계약 | 정본/근거 |
|---|---|---|
| 백엔드 DTO | `HomtaxRow`가 `writeDate`, `supplierRegNo`, `buyerName`, `buyerRegNo`, `itemName1`, `itemSpec1`, `itemQty1`, `itemPrice1` 등을 반환 | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/HomtaxRow.java:11-94` |
| 백엔드 매퍼 | `businessNumber` → `buyerRegNo`, `partnerName` → `buyerName`, `itemName` → `itemName1`, `slipNo` → `slipNo`; export용 59컬럼은 기존대로 유지 | `HometaxExportService.java:553-582`, `TaxInvoiceBatchService.java:368-421` |
| 수정 전 desktop 타입 | `issueDate`, `supplierBusinessNo`, `recipientName`, `recipientBusinessNo`, `recipientEmail`, `itemName`, `specification`, `quantity`, `unitPrice`, `partnerCode`를 선언 | HEAD `clients/desktop/src/renderer/api/hometaxExportApi.ts:36-78` |
| 수정 전 결과표 | 위 구형 이름을 그대로 읽었으므로 DTO의 실제 키가 모두 `undefined`가 됨 | HEAD `clients/desktop/src/renderer/routes/HometaxExportPage.tsx:710-744` |
| 추가 결함 | `partnerCode`는 수정 전 화면 타입에는 있었지만 `HomtaxRow`에는 없었음 | 수정 전 DTO 전체 필드 전수와 R10 direct preview 응답 확인 |

## 결과표 전 열 ↔ DTO 대조

결과표의 실제 17개 열을 전수 대조했다. `번호`와 `합계금액`만 화면 파생값이고, 나머지는 DTO 정본 필드를 직접 사용한다.

| 결과표 열 | DTO 정본 필드/계산 | 수정 후 화면 위치 |
|---|---|---|
| 번호 | `rowNo` — rows index + 1 | `HometaxExportPage.tsx:708` |
| 전표번호 | `slipNo` | `:710` |
| 작성일자 | `writeDate` | `:712` |
| 공급자 상호 | `supplierName` | `:714` |
| 공급자 사업자번호 | `supplierRegNo` | `:716` |
| 공급받는자 상호 | `buyerName` | `:718` |
| 공급받는자 사업자번호 | `buyerRegNo` | `:720` |
| 공급받는자 이메일 | `buyerEmail1` | `:723` |
| 공급가액 | `supplyAmount` | `:726` |
| 세액 | `vatAmount` | `:729` |
| 합계 | `supplyAmount + vatAmount` → `totalAmount` 파생 | `hometaxExportApi.ts:102-108`, 화면 `:732` |
| 품목명 | `itemName1` | `:734` |
| 규격 | `itemSpec1` | `:735` |
| 수량 | `itemQty1` | `:736` |
| 단가 | `itemPrice1` | `:738` |
| 거래처 코드 | `partnerCode` — DTO 내부용 필드로 추가, XLSX에는 미포함 | `:741`; DTO `HomtaxRow.java:94` |
| 비고 | `remark` | `:744` |

DataGrid도 동일한 `HometaxResultRow`와 동일 17개 키를 사용한다(`HometaxExportPage.tsx:478-498`, `:627`). 구형 식별자 grep 결과는 결과표/API 대상 production 경로에서 0건이다.

## 이름 대응 계약 고정

- 프론트 `HometaxPreviewRow`를 백엔드 `HomtaxRow` wire 필드 전체와 동일하게 재정의했다: `hometaxExportApi.ts:36-98`.
- 화면 파생 필드는 `HometaxResultRow = HometaxPreviewRow & { rowNo, totalAmount }`로 제한했다.
- `toHometaxResultRow()`가 DTO를 spread하고 합계만 계산하므로, 필드명을 별도 문자열 매핑표에서 중복 선언하지 않는다: `hometaxExportApi.ts:102-108`.
- `hometaxExportApi.test.ts`에서 실제 wire row 전체를 넣고 결과표 전 열의 값 보존을 검증한다.
- `partnerCode`는 두 backend 매퍼에서 raw 값을 DTO 내부 필드로 전달한다. XLSX writer는 기존 `invoiceType`~`receiptType` 59컬럼만 쓰므로 export payload/파일 열은 바뀌지 않는다.

## RED 원문과 라이브 증거

### RED-A/B — 수정 전

R10 자기 표본을 실제 생성해 `CONFIRMED`까지 전이하고, 수정 전 renderer 5330에서 캡처했다.

- 원문 JSON: [`r10-before-fix-evidence.json`](../qa/2026-08-10-1156-r10/r10-before-fix-evidence.json)
- 수정 전 캡처: [`01-hometax-before-fix.png`](../qa/2026-08-10-1156-r10/01-hometax-before-fix.png)
- `2026/08/10-25` DTO는 `writeDate=20260809`, `supplierRegNo=2148720659`, `buyerName=(주)서울에어컨`, `buyerRegNo=1130710031`인데 UI cells는 작성일자 `—`, 공급자 사업자번호 ``, 공급받는자 상호 ``, 사업자번호 ``, 거래처코드 ``였다.
- `2026/08/10-26` DTO는 `buyerName=이상덕기사님`, `buyerRegNo=''`인데 UI도 구형 키 불일치 열을 빈 칸/대시로 표시했다.

### GREEN — 수정 후

- 원문 JSON: [`r10-after-fix-evidence.json`](../qa/2026-08-10-1156-r10/r10-after-fix-evidence.json)
- 수정 후 캡처: [`02-hometax-after-fix.png`](../qa/2026-08-10-1156-r10/02-hometax-after-fix.png)
- 결과표 정상 표본: `20260809 / 2148720659 / (주)서울에어컨 / 1130710031 / P-2026-0001 / 한경희 선풍기`
- 결과표 사업자번호 누락 표본: 공급받는자 `이상덕기사님`, `buyerRegNo=''`, 거래처코드 `-` (가짜 등록번호 생성 없음)

## RED-C — 실제 내보내기 불변

- 다운로드 산출물: [`r10-hometax-after-fix.xlsx`](../qa/2026-08-10-1156-r10/r10-hometax-after-fix.xlsx)
- 실제 workbook의 7행부터 5행을 read-only 파싱했다.
- 사업자번호 있는 행: `buyerRegNo=1130710031`.
- 사업자번호 없는 행: `buyerRegNo=''`.
- `HometaxExportService`/`TaxInvoiceBatchService`의 59컬럼 writer 호출 인자는 변경하지 않았고, 새 `partnerCode`는 workbook에 쓰지 않는다.

## RED-D — R8 타입 경계

R8에서 변경하지 않은 입출금·현금영수증 화면 및 타입 경계는 이번 수정에서 건드리지 않았다. R9의 실검증 증거와 동일하게 `PartnerAuthService.java:144,326`도 변경하지 않았다.

## 검증

- RED 프론트 테스트: `toHometaxResultRow is not a function`으로 실패 확인.
- GREEN 프론트: `npm test -- --run src/renderer/api/hometaxExportApi.test.ts` — 1 file / 1 test 통과.
- GREEN 백엔드: `:services:accounting-service:test --tests HometaxExportServiceTest --tests TaxInvoiceBatchServiceTest` — BUILD SUCCESSFUL.
- frontend `tsc -p tsconfig.node.json --noEmit`, `tsc -p tsconfig.web.json --noEmit` 및 lint — 통과.
- 대상 파일 참조 단위 프론트 테스트 `hometaxExportApi.test.ts` — 1 passed.
- R10 실제 renderer 5330 + accounting 28208 단일 Playwright 스펙 — 1 passed.
- accounting JAR host/container SHA-256: `844c1b229c978a7ed957164d7922391f97fe044e5b6d4dc323e199a44df2b336` 동일, `/actuator/health` `{"status":"UP"}`.
- 공식 전체 real-QA scope 검사는 신규 미추적 R10 스펙을 발견해 실패했다. 커밋/스테이징은 금지되어 있어 `REAL_QA_ALLOW_UNTRACKED=1` 명시 단일 스펙으로만 실행했다.
- frontend 전체 `npm test`는 기존 `harness-false-green-guard` 2건에서 실패했다(미추적/동적 evidence writer 집합 검증). 홈택스 대상 테스트는 통과했다.
- accounting 전체 `:services:accounting-service:test`는 Gradle test-results lock으로 304초 timeout되어 전체 수치를 확정하지 못했다. 대상 두 테스트는 별도 BUILD SUCCESSFUL로 확인했다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-10-1156-r10-hometax-view-fields.md`
- `clients/desktop/src/renderer/api/hometaxExportApi.test.ts`
- `clients/desktop/playwright/1156-r10-hometax-fields-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1156-r10-hometax-fields-real-qa/1156-r10-hometax-fields-real-qa.spec.ts`
- `docs/qa/2026-08-10-1156-r10/01-hometax-before-fix.png`
- `docs/qa/2026-08-10-1156-r10/02-hometax-after-fix.png`
- `docs/qa/2026-08-10-1156-r10/r10-before-fix-evidence.json`
- `docs/qa/2026-08-10-1156-r10/r10-after-fix-evidence.json`
- `docs/qa/2026-08-10-1156-r10/r10-hometax-after-fix.xlsx`

## 못 한 것

- git commit / push / PR 조작은 하지 않았다.
- `PartnerAuthService.java:144,326`은 요청대로 손대지 않았다.
- 기존 발행 전표 소급 처리, 보정 endpoint, 거래처 `1068689215` 조작, DB 직접 write는 하지 않았다.
- 공식 44/44 전체 real-QA 수치는 신규 R10 스펙 미추적 가드 때문에 실행하지 않았다. 단일 R10 실검증은 예외 모드로 1 passed이며, 새 스펙을 스테이징한 뒤 공식 scope 재실행이 필요하다.
- accounting 전체 테스트의 304초 timeout은 결과 디렉터리 잠금으로 중단되어 후속 공식 실행이 필요하다.
