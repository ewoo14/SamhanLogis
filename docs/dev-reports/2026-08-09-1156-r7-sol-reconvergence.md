# PR #1156 R7 SOL 5.6 적대검증 재수렴

## 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1155`
- 브랜치/HEAD: `fix/1155-inbound-partner-code` / `19aaaac63f803ab578de1ba3499bee9750f090fe`
- renderer: `vite.renderer.dev.config.ts`, `127.0.0.1:5330`, PID `115096`, 화면 버전 `2026/08/09-1156`
- HEAD slip-service: `sol1156-r7-head-slip`, `127.0.0.1:28206`, 현재 워크트리 HEAD에서 `bootJar`한 `/app/app.jar`; SHA-256 `6a73a4d5b194b611bbf5972871aee3e1c845374ac347c4e3a55cdb88c821f429`
- lookup-timeout 대조군: `sol1156-r7-head-slip-timeout`, `127.0.0.1:28207`, 같은 JAR SHA-256. partner-service URI만 비응답 주소로 바꿨다.
- 최초 떠 있던 `127.0.0.1:28186`은 전제와 달리 HEAD 배포본이 아니었다. 컨테이너 JAR SHA-256은 `d3d056...`였고, HEAD JAR과 달랐다. 따라서 그 런타임의 null 결과는 제품 판정에서 제외하고 28206/28207에 HEAD를 다시 배포했다.
- 실 호출 증거: renderer 요청은 `/admin/partners/search`만 gateway `8080`, `/slips/**`는 HEAD `28206`으로 전달됐다. `POST /slips` 201, `PUT /slips/<redacted-uuid>` 200, `POST /slips/estimates/<redacted-uuid>/convert` 200을 캡처했다. mock 응답은 없다. 원문은 `docs/qa/2026-08-09-1156-r7/*-evidence.json`에 UUID를 가려 저장했다.

## 판정

**실 사용자 경로로 재현 가능한 결함이 1개 있다.** R6의 15지점 표는 전수가 아니다. 표 밖의 혼합 지점이 desktop production 안에서 다시 나왔고, 저장·상세·인쇄·견적 변환 축은 HEAD에서 정상인 반면, 반대 방향인 **홈택스 내보내기가 거래처코드를 사업자번호로 숫자화**한다.

## ① 독립 전수 결과

### 모집단 계산

한 정규식의 결과를 모집단으로 삼지 않았다.

1. `clients/desktop/src/renderer` production `.ts/.tsx` 458파일에서 test와 `api/mock.ts`를 제외하고 `partnerCode:` 대입을 계산했다: **237개**.
2. 같은 237개를 `bizNo/businessNumber/partnerName` 동시 참조로 교차 축소했다: 10줄. 별도 필드 병렬 기입 7줄을 제외하면 실제 혼합 fallback은 **3줄**이다.
3. `PartnerOption`, accounting API 응답 타입에서 `partnerCode`와 `bizNo`가 별도 필드라는 계약을 역추적했다.
4. repo 전체 production Java/TS에서 반대 방향 `partnerCode → businessNumber/buyerRegNo` 대입과 숫자화를 별도로 검색했다: backend **2줄**.
5. API 응답 원천인 `/internal/slips/sales-query`의 `partnerCode`와 `businessNumber`를 라이브 행으로 대조했다.

따라서 R6의 15지점은 모집단이 아니라 선택 목록이다. R6 표에 없는 desktop production 지점은 다음 3개다.

| 파일:줄 | 원문 | 분류 |
|---|---|---|
| `clients/desktop/src/renderer/routes/BankTransactionPage.tsx:136` | `partnerCode: row.matchedPartnerCode ?? row.matchedBizNo ?? ''` | 사업자번호를 거래처코드 slot에 fallback |
| `clients/desktop/src/renderer/routes/CashReceiptFormPage.model.ts:105` | `partnerCode: state.partnerCode || state.bizNo || state.partnerName` | 사업자번호/이름을 거래처코드 slot에 fallback |
| `clients/desktop/src/renderer/routes/CashReceiptFormPage.tsx:383` | `partnerCode: line.partnerCode || line.partnerName` | 이름을 거래처코드 slot에 fallback |

현재 실 accounting DB의 최근 cash-receipt rows는 `partnerCode`와 `bizNo`가 모두 채워져 있어 위 세 fallback의 현재 오염 행은 **0건**이다. 즉 표 누락은 확정이지만 이 세 줄 자체를 이번 라운드의 실 데이터 결함 건수로 부풀리지 않았다.

반대 방향에서 R6 범위 밖의 도달 가능한 결함은 두 구현에 중복돼 있다.

```text
services/accounting-service/.../HometaxExportService.java:553-554
String partnerCode = safeStr(raw.get("partnerCode"));
String buyerRegNo  = partnerCode.replaceAll("[^0-9]", "");

services/accounting-service/.../TaxInvoiceBatchService.java:368-369
String partnerCode = safeStr(raw.get("partnerCode"));
String buyerRegNo = partnerCode.replaceAll("[^0-9]", "");
```

### 결함 R7-1 — 홈택스 공급받는자 등록번호가 거래처코드 숫자로 생성됨

실 사용자 도달 경로:

```text
세금계산서 목록의 홈택스 일괄 양식 버튼
→ /accounting/hometax-export
→ HometaxExportPage.tsx:366-372
→ hometaxExportApi.ts:206-213 POST /accounting/hometax-export/preview
→ AccountingReportController.java:297-303
→ HometaxExportService.java:275-298
→ toHomtaxRow():553-554
```

재현 절차:

1. 실 관리자 API/GUI가 사용하는 HEAD API로 `(주)서울에어컨` OUTBOUND R7 전표를 생성했다.
2. 실제 상태 전이 `save → send → accept → process → complete → inspect → ship → deliver → confirm`을 수행했다. 검수는 실제 결재자 계정으로 통과했다.
3. 홈택스 preview가 읽는 같은 실 endpoint `GET /internal/slips/sales-query`를 호출했다.
4. 응답의 거래처코드와 사업자번호를 현재 변환식에 넣었다.

응답/계산 원문:

```text
HTTP 200  GET /internal/slips/sales-query  mock=false
slipNo=2026/08/10-20
status=CONFIRMED
partnerCode=P-2026-0001
businessNumber=113-07-10031
현재 buyerRegNo=20260001
정상 buyerRegNo=1130710031
```

2026년 전체를 같은 실 endpoint로 읽으면 9행 중 위 조건에 걸리는 행은 **1건**이며, 그것은 이번 R7이 만든 표본 1건이다. 기존 실 데이터 오염 건수는 0건이다. 잘못된 값은 batch 저장/엑셀 생성 전에 `HometaxExportService.java:298,305-315`에서 snapshot으로 저장되는 경로다.

## ④ 실 GUI 저장과 DB SELECT

실 관리자 renderer `5330`에서 새 INBOUND를 만들고 메모에 `R7 GUI persistence HEAD partnerCode axis`를 넣었다. 생성 당시 파인씨엔디 code는 `00`이었다. 상세 편집 모달에서 `(주)서울에어컨`으로 바꾸고 저장했다.

```text
POST /slips                         HTTP 201
PUT  /slips/<redacted-uuid>         HTTP 200
PUT request partnerCode             P-2026-0001
PUT request businessNumber          113-07-10031
GET response partnerCode            P-2026-0001
GET response businessNumber         113-07-10031
```

DB는 공유 `samhan-postgres`가 아니라 이 HEAD QA 컨테이너가 실제로 쓰는 `sol1151r4-liveqa-db/slip_db`에서 읽었다. SELECT와 결과 원문:

```sql
SELECT slip_no, slip_type, status, partner_name,
       partner_code, business_number, memo
  FROM slips
 WHERE memo = 'R7 GUI persistence HEAD partnerCode axis';
```

```text
slip_no      | slip_type | status | partner_name    | partner_code | business_number | memo
2026/08/10-2 | INBOUND   | DRAFT  | (주)서울에어컨 | P-2026-0001  | 113-07-10031    | R7 GUI persistence HEAD partnerCode axis
(1 row)
```

실 데이터 영향: R7 자체 표본 1건 정상 저장, 기존 전표 수정 0건, DB 직접 INSERT/UPDATE 0건, 보정 endpoint 실행 0건.

## ② `businessNumber` 반대급부

- 매입 상세: `113-07-10031` 표시.
- 매입 인쇄 화면: `113-07-10031` 표시.
- 견적 입력: 거래처 선택 뒤 `113-07-10031` 표시.
- 견적 상세: `(113-07-10031)` 표시.
- 최초 HEAD 견적 `2026/08/10-4`의 변환 전표 `2026/08/10-19`와 최종 재검증 견적 `2026/08/10-5`의 변환 전표 `2026/08/10-21`: 모두 `partnerCode=P-2026-0001`, `businessNumber=113-07-10031` 동시 승계.

따라서 상세·매입 인쇄·견적 변환에서 `businessNumber`가 빈 회귀는 재현되지 않았다. PDF binary는 별도로 생성하지 않았고 renderer의 실제 인쇄 route까지 확인했다.

## ③ R2·R3 백엔드 회귀

HEAD 정상 28206과 같은 HEAD JAR의 lookup-timeout 28207을 실 HTTP로 호출했다.

```text
신규 INBOUND                 HTTP 201  partnerCode=00
같은 partnerId 재전송        HTTP 200  partnerCode=00
partnerId 생략               HTTP 200  partnerCode=00
A→B 변경                     HTTP 200  partnerCode=P-2026-0001
timeout send                 HTTP 200  2058ms  SENT       partnerCode=<EMPTY>
timeout confirm              HTTP 200  2067ms  CONFIRMED  partnerCode=<EMPTY>
공백 DRAFT→SENT 정상 backfill HTTP 200  SENT       partnerCode=00
견적 GUI 변환                HTTP 200  partnerCode=P-2026-0001 businessNumber=113-07-10031
```

이 축에서 잘못 저장된 snapshot은 0건이다. timeout fail-open 확인용 공백 CONFIRMED R7 표본 1건은 의도된 QA 표본이다.

## 증거 무결성

- 최초 QA shots 환경변수 경로 오산으로 helper가 금지된 `_local`을 만들었다. 경로를 workspace 내부로 확인한 뒤 `_local` 전체를 삭제했고, 최종 산출물은 `docs/qa/2026-08-09-1156-r7/` 바로 아래에만 남겼다. 최종 `Test-Path .../_local=False`다.
- 증거 JSON의 UUID는 `<redacted-uuid>`, 자격은 `<redacted>` 원칙으로 저장했다. 로그인 token 원문은 산출물에 남기지 않았다.
- 최초 28186 stale JAR 결과와 HEAD 28206 결과를 섞지 않았다.

## R7 표본 목록

모두 격리 QA DB에서 실 API/GUI로 만든 표본이다.

| 번호 | 상태 | 용도 |
|---|---|---|
| 전표 `2026/08/10-1` | DRAFT | 최초 stale runtime GUI 저장 표본 |
| 전표 `2026/08/10-2` | DRAFT | HEAD GUI 생성·거래처 변경 저장 표본 |
| 전표 `2026/08/10-3` | DRAFT | 같은 partner/생략/A→B 회귀 표본 |
| 전표 `2026/08/10-4` | CONFIRMED | timeout send/confirm fail-open 표본 |
| 전표 `2026/08/10-5` | SENT | 공백 DRAFT→SENT backfill 표본 |
| 전표 `2026/08/10-17` | DRAFT | stale runtime 견적 변환 표본, code 공백 |
| 전표 `2026/08/10-18` | DRAFT | stale runtime 연결 재시도 견적 변환 표본, code 공백 |
| 전표 `2026/08/10-19` | SENT | HEAD GUI 견적 변환 표본; 홈택스 탐색 중 재고/결재 경로를 밟음 |
| 전표 `2026/08/10-20` | CONFIRMED | 홈택스 역방향 결함 재현 표본 |
| 전표 `2026/08/10-21` | DRAFT | 최종 fresh GUI 견적 변환 재검증 표본 |
| 견적 `2026/08/09-1` | QUOTE_DRAFT | API 사업자번호 probe |
| 견적 `2026/08/10-1` | QUOTE_DRAFT | GUI 표시 probe |
| 견적 `2026/08/10-2` | QUOTE_CONVERTED | stale runtime 변환 probe |
| 견적 `2026/08/10-3` | QUOTE_CONVERTED | stale runtime 연결 재시도 probe |
| 견적 `2026/08/10-4` | QUOTE_CONVERTED | HEAD GUI 변환 표본 |
| 견적 `2026/08/10-5` | QUOTE_CONVERTED | 최종 fresh GUI 변환 재검증 표본 |

## 신규 파일

- `clients/desktop/playwright/1156-r7-sol-reconvergence-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1156-r7-sol-reconvergence-real-qa/1156-r7-sol-reconvergence-real-qa.spec.ts`
- `clients/desktop/playwright/1156-r7-sol-reconvergence-real-qa/1156-r7-backend-regression-real-qa.spec.ts`
- `clients/desktop/playwright/1156-r7-sol-reconvergence-real-qa/1156-r7-hometax-reverse-real-qa.spec.ts`
- `docs/qa/2026-08-09-1156-r7/` 아래 PNG 8개, evidence JSON 4개
- 본 보고서

## 못 한 것

- 실제 accounting-service의 preview 호출은 batch/history row를 저장하므로, 현재 격리 slip DB를 보지 않는 기존 accounting 컨테이너에 호출하지 않았다. 대신 그 preview의 실 입력 endpoint까지 실제 CONFIRMED R7 행으로 재현하고, 사용자 route→controller→변환 함수의 단일 호출 사슬과 결정적 오변환을 확인했다.
- PDF binary 파일 생성은 하지 않았다. 실제 매입 인쇄 route의 사업자번호 표시는 확인했다.
- 코드 수정, commit, push는 하지 않았다.
