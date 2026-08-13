# D-G1 S3 SOL 5.6 재검토 2 — 그룹웨어 정산서 참조

> 대상: PR #1168, HEAD `a057e08cdff1b9b94fe6548aa163980e63338ffc`  
> 검토일: 2026-08-11  
> 판정: **차단 — 사용자에게 검색 후보가 보이지 않는 결함 1건**  
> 공유 DB: 조회·write 모두 0건. V19 검증은 일회용 PostgreSQL에서만 수행  
> git 조작: 없음

## 1. 판정 요약

R-1의 transport 원인은 닫혔다. 문서 참조 분모는 **7개 업무 유형 / 6개 고유 검색 URL**이며,
출고·입고가 `/admin/slips/search` 하나를 공유하므로 누락된 7번째 URL은 없다.
`VITE_API_BASE_URL=http://127.0.0.1:1` 격리 상태에서 7유형의 실제 `searchByType()` 호출까지 모두 검색됐다.

R-2도 값 계약은 닫혔다. 기존 6종의 인쇄 라벨·상세 라벨·상세 href는 fix 전후 동일했고,
정산서는 상세·인쇄에서 `영업수수료 정산서`로 표시된다. S4 route가 없는 동안 정산서 번호를
plain text로 두는 것은 S3 결함이 아니라 **S4 미완**이다.

그러나 라이브 캡처를 육안 확인한 뒤 사용자 가시성을 계측하자 새 차단 결함이 드러났다.
검색 후보는 DOM에 생성되지만 picker의 overflow에 완전히 잘린다. 기존 Playwright는
`toContainText()`만 검사하고, 이후 `click()`이 내부 scroll을 자동 수행해 false-green을 냈다.
따라서 보고된 `2 passed`와 “검색 결과 캡처”는 사용자에게 후보가 보인다는 증거가 아니다.

## 2. 차단 결함 F-1 — 검색 후보가 picker 밖에서 완전히 잘린다

### 불변식

사용자가 문서 유형과 검색어를 입력하면, 후보 행은 클릭 전에 화면에서 읽을 수 있어야 한다.
DOM 존재·텍스트 보유만으로는 부족하다. 후보 중앙점이 실제 hit-test 가능한 영역이어야 하며,
키보드 포커스와 마우스 클릭 모두 자동 스크롤에 의존하지 않아야 한다.

### 전수 좌표

- `clients/desktop/src/renderer/components/groupware/DocumentReferencePicker.tsx:337`
  - picker inline style에 `overflowX: 'hidden'`이 있다.
- `clients/desktop/src/renderer/components/groupware/DocumentReferencePicker.module.css:1-4`
  - `.picker`도 `overflow-x: hidden`이다.
- 같은 CSS `:7-16`
  - `.dropdown`은 `position: absolute; top: 100%`이고 자체 `overflow-y: auto`다.
- `clients/desktop/src/renderer/components/groupware/DocumentReferencePicker.tsx:387-412`
  - 후보 `<ul>/<li>`는 위 picker의 절대배치 자식이다.
- `clients/desktop/playwright/2026-08-11-dg1-s3-fix-real-qa/s3-fix-real-qa.spec.ts:56-59`
  - `toContainText()` → full-page 캡처 → `click()` 순서다. 후보의 가시성·viewport·hit-test를 단언하지 않는다.
- 같은 spec `:90-91`
  - 두 번째 흐름도 텍스트만 확인한 뒤 바로 클릭한다.

CSS 계산 규칙상 한 축이 `hidden`이고 다른 축이 `visible`이면 다른 축은 `auto`로 계산된다.
실제 Chromium에서도 picker의 `overflowY`가 `auto`였고, 아래로 절대배치된 후보가 picker 높이 밖에서 잘렸다.

### 재현 데이터

```text
브라우저   C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
버전       147.0.7727.15
화면       #/groupware/approvals/new?mockRole=MASTER
결재 유형  지출결의서
문서 유형  SALES_COMMISSION_SETTLEMENT
검색어     2026/08/11
API base   http://127.0.0.1:1
fixture    settlementNo=2026/08/11-1
```

기존 spec 2건은 `2 passed (4.1s)`였지만, 별도 사용자 가시성 probe는 다음 원문으로 실패했다.

```text
SOL_R2_VISIBILITY={
  "optionRect":{"top":730.5625,"bottom":767.5625,"height":37},
  "pickerRect":{"top":668.5625,"bottom":725.5625,"height":57},
  "pickerOverflowX":"hidden",
  "pickerOverflowY":"auto",
  "pickerClientHeight":57,
  "pickerScrollHeight":100,
  "pickerScrollTop":0,
  "hitTag":null,
  "hitTestId":null,
  "optionContainsHit":false
}

Expected: true
Received: false
1 failed
```

즉 후보 top `730.56`은 picker bottom `725.56`보다 아래이고, hit-test 결과도 `null`이다.
[01 검색 결과 캡처](../qa/2026-08-11-dg1-s3-r2/01-settlement-search-result.png)는
검색어만 보이고 후보 행은 보이지 않는다. SHA-256도 구현자가 제출한 첫 캡처와 같은
`A5F8832C4B895A5123FA9E2991B5CE485F69D0AFF5771AA861C0D58E531E9EBA`다.

### 구현자 지시서

1. 후보가 picker 밖에 정상 표시되도록 overflow/배치 경계를 고친다. 특정 정산서 fixture만
   강제 노출하거나 Playwright에 `force: true`, 수동 `scrollTop`, `scrollIntoViewIfNeeded()`를 넣어
   테스트만 통과시키면 안 된다.
2. 기존 가로 overflow 방지 목적을 잃지 않는다. 긴 문서번호·거래처명에서도 페이지 전체 가로
   스크롤이나 필드 폭 붕괴가 생기면 안 된다.
3. 기존 Playwright의 `toContainText()`를 사용자 가시성 gate로 보강한다. 최소 계약은 다음과 같다.
   - 후보가 `toBeVisible()`일 것
   - 후보가 viewport 안에 있고 clipping ancestor 밖으로 밀려나지 않을 것
   - 클릭 전 후보 중앙 hit-test가 후보 자신/자손일 것
   - **클릭 전** 검색 결과가 실제 캡처에 보일 것
4. **제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 `overflow-x:hidden`이 실제 clipping
   원인이 아니라면 임의 CSS 변경을 하지 말고, 동일 좌표 probe로 반증 원문을 제출하십시오.

### RED-A 표적

- Chromium-1217, desktop viewport에서 정산서 후보 `2026/08/11-1`이 클릭 전에 보이고 hit-test 가능하다.
- `01-settlement-search-result.png`에 후보 번호·상태/요약·금액·일자가 실제로 보인다.
- Playwright가 후보를 자동 스크롤하기 전 가시성을 단언한다.
- `VITE_API_BASE_URL=http://127.0.0.1:1`에서 실제 API 누출 0건을 유지한다.

### RED-B 표적

- 기존 6종의 검색 후보도 같은 picker에서 계속 보이고 선택된다.
- 아래 §4의 기존 6종 인쇄·상세 라벨과 href가 한 글자도 바뀌지 않는다.
- 기존 지출결의서 직접 생성 경로, picker 12건, 전체 desktop Vitest, typecheck를 유지한다.
- accounting 1,867 / groupware 254와 S1·S2·S3, V19 기존행, refDocNo mutation을 유지한다.
- S4 route를 이번 fix에 당겨 만들지 않는다. 정산서 번호는 S4 전까지 plain text를 유지한다.

### 새 조합 전수

| 축 | 반드시 확인할 조합 |
|---|---|
| 문서 유형 | 출고·입고·분개장·세금계산서·거래명세서·거래처원장·정산서 7종 |
| 후보 상태 | 1건 / 여러 건 / 0건 / 로딩 / 오류 |
| 조작 | 마우스 hover·click / ArrowDown·Enter / blur 후 재진입 |
| 폭 | 현재 Chromium desktop 폭 / 긴 문서번호·긴 요약 / 480px responsive 경계 |
| 레이어 | 결재 신규 작성 / 결재 상세의 문서 참조 추가 |
| transport | Axios `config.params` / URL query string / API base 격리 |

## 3. R-1 재검토 — 7유형 / 6 URL 전수표

| 업무 유형 | 실제 API URL | 실제 params | mock query 소비 |
|---|---|---|---|
| `OUTBOUND_SLIP` | `/admin/slips/search` | `q, limit, slipType=OUTBOUND` | `mock.ts:4514 mockQueryParams(config)` |
| `INBOUND_SLIP` | `/admin/slips/search` | `q, limit, slipType=INBOUND` | 동일 handler |
| `JOURNAL` | `/admin/accounting/journals/search` | `q, limit` | `mock.ts:4551 mockQueryParams(config)` |
| `TAX_INVOICE` | `/admin/accounting/tax-invoices/search` | `q, limit` | 동일 accounting handler |
| `STATEMENT` | `/admin/accounting/statements/search` | `q, limit` | 동일 accounting handler |
| `PARTNER_LEDGER` | `/admin/accounting/ledgers/partners/search` | `q, limit` | 동일 accounting handler |
| `SALES_COMMISSION_SETTLEMENT` | `/admin/accounting/sales-commission-settlements/search` | `q, limit` | 동일 accounting handler |

독립 추출 결과 `ApprovalReferenceDocType`은 7개, endpoint 문자열은 6개다. 7번째 endpoint는 없다.
리뷰용 임시 test에서 7유형의 실제 `searchByType()`을 모두 호출하고 제거했다.

```text
VITE_MOCK_MODE=1
VITE_API_BASE_URL=http://127.0.0.1:1
2 files / 15 passed / exit 0
```

처음 입고 fixture를 `MOCK_COMPENSATION_FAILURES`에서 잘못 골라 1건이 실패했으나,
실제 `MOCK_SLIPS`의 `2026/05/03-7`로 바로잡은 뒤 7/7 통과했다. 구현 결함이 아니라 리뷰 fixture 전제 오류였다.

## 4. R-2 재검토 — 기존 6종 fix 전후 값

fix 전 `b1740e1e`의 상세 helper와 인쇄의 `APPROVAL_ATTACHMENT_TYPE_LABEL`, 현재
`approvalAttachmentPresentation.ts`, 표 기반 테스트를 직접 대조했다.

| `refDocType` | fix 전 인쇄 = 현재 | fix 전 상세 = 현재 | fix 전 href = 현재 |
|---|---|---|---|
| `OUTBOUND_SLIP` | `전표 참조` | `출고전표` | `#/sales?slipNo={encoded refDocNo/refSlipNo}` |
| `INBOUND_SLIP` | `전표 참조` | `입고전표` | `#/purchases?slipNo={encoded refDocNo/refSlipNo}` |
| `JOURNAL` | `전표 참조` | `분개장` | `#/accounting/journals?journalNo={encoded refDocNo}` |
| `TAX_INVOICE` | `전표 참조` | `세금계산서` | `#/accounting/tax-invoices?taxInvoiceNo={encoded refDocNo}` |
| `STATEMENT` | `전표 참조` | `거래명세서` | `#/accounting/statement-batch?statementNo={encoded refDocNo}` |
| `PARTNER_LEDGER` | `거래처원장 참조` | `거래처원장` | `#/accounting/ledgers?partnerCode={encoded code}&period={encoded period}` |

현재 fixture 값 `2026/08/11-1`, `P-001`, `2026-08`로 계산한 exact href도 각각
`2026%2F08%2F11-1`, `P-001`, `2026-08`로 일치했다. 렌더/상세 targeted 결과는
`2 files / 10 passed`다. legacy `refDocType=null` fallback도 통과했다.

## 5. 정산서 plain text와 S4 판정

현재 그룹웨어 상세에서 정산서 번호는 사용자가 클릭할 수 없는 **막다른 표면이 맞다**.
그러나 현재 저장소에는 정산서 화면/route가 없으므로 정상 목적지를 만들 수 없다. `href="#"`를
보여 주는 것보다 plain text가 정확하고, S3 계획은 화면·연결 버튼을 S4로 명시적으로 제외했다.
따라서 이 라운드에서는 결함이 아니라 **미완**으로 판정한다.

다만 S4 계획의 “정산 화면·연결 버튼”만 구현하면 #1094가 자동으로 닫힌다고 가정해서는 안 된다.
S4 완료 조건에 다음을 명시해야 한다.

```text
그룹웨어 결재 첨부의 정산서 문서번호 클릭
→ S4 정산 상세 route
→ 상세에는 뒤로 가기
→ 표시값은 문서번호, UUID 비공개
```

S4 이후에도 plain text로 남으면 그때는 개발책임자의 #1094 공통 규약 위반 결함이다.

## 6. Backend·RED-B 실측

### 전체 suite

| 모듈 | genuine 명령 결과 | fresh XML 합계 |
|---|---|---|
| accounting | `BUILD SUCCESSFUL in 7m 55s` | 223 files / **1,867 tests** / failures 0 / errors 0 / skipped 10 |
| groupware | `BUILD SUCCESSFUL in 1m 21s` | 33 files / **254 tests** / failures 0 / errors 0 / skipped 0 |

accounting 뒤 XML을 PowerShell `[xml]`로 읽는 첫 집계는 Windows 기본 인코딩 때문에 한국어 testcase에서
실패했지만 Gradle은 이미 성공했다. `<testsuite>` header를 UTF-8로 다시 읽어 위 합계를 얻었다.

### V19 기존 데이터 상태

공유 DB 대신 `postgres:16-alpine` 일회용 컨테이너에 V19 전 6종 행을 먼저 저장했다.
그 상태에서 실제 V19 SQL을 적용한 뒤 다음을 확인했다.

```text
pre-V19 기존 6행 생존                    6/6
post-V19 기존 6종 신규 저장              6/6
SALES_COMMISSION_SETTLEMENT 신규 저장     1/1
ref_doc_type CHECK                        기존 6종 + 정산서
attachment_type CHECK                     SLIP_REF + PARTNER_LEDGER_REF + FILE
partial index                             (ref_doc_type, ref_doc_no) WHERE is_deleted=false
```

검증 후 컨테이너는 `--rm`으로 제거했다.

### refDocNo 왕복 mutation

`ApprovalAttachment.documentRef()`의 다음 한 줄만 임시 제거했다.

```java
attachment.refDocNo = refDocNo.trim();
```

결과:

```text
ApprovalTemplateAttachmentIT.salesCommissionSettlementReference_roundTripsFromAttachmentToApprovals
ApprovalTemplateAttachmentIT.java:323
1 test completed, 1 failed
BUILD FAILED in 42s
```

원복 후 같은 실제 POST→GET IT는 `BUILD SUCCESSFUL in 43s`였다. fixture가 `refDocNo`를 직접 심어
false-green을 내는 구조가 아니다.

## 7. Desktop 검증·라이브 QA

| 검증 | 결과 |
|---|---|
| isolated params gate + 7유형 실제 API | 15 passed |
| 기존 6종 라벨·href + 정산서 상세/인쇄 | 10 passed |
| 전체 `npm test -- --reporter=dot` 기본 환경 | exit 0 |
| `npm run typecheck` | exit 0 |
| 기존 Chromium live spec | 2 passed (4.1s), 단 후보 가시성 false-green |
| 신규 사용자 가시성 probe | **1 failed** — F-1 재현 |

전체 Vitest에 mock 격리 env를 전역 강제한 첫 시도는 `AppVersionGate` 등 비관련 27건을 mock 모드로
바꾸어 실패했다. 격리는 검색 gate에만 적용했고, 전체 suite는 기본 환경으로 재실행해 exit 0을 확인했다.

캡처:

| 파일 | 크기 | SHA-256 | 판정 |
|---|---:|---|---|
| `01-settlement-search-result.png` | 75,606 | `A5F8832C4B895A5123FA9E2991B5CE485F69D0AFF5771AA861C0D58E531E9EBA` | **FAIL 증거: 후보가 안 보임** |
| `02-settlement-selected.png` | 72,741 | `2C1AB31A70AACA5E214895FB27F8FF646F1DCCD4154DB4B886F1B5CD17896538` | 선택 chip 표시 |
| `03-settlement-detail.png` | 95,724 | `64ECDEF1E422D567EB134ADCD9F480E490322DC226D9756205A124131224280E` | 정산서 라벨·번호 plain text |
| `04-settlement-print.png` | 70,359 | `6BC6EFFE26D05B1CD6B5A26CA51812E05D7F798BF7C4721CB19C2362E0E27DC7` | 정산서 인쇄 라벨 |

첫 orchestration은 5193 포트 충돌로 preflight 중단했고, 5293 hidden wrapper는 readiness timeout이 났다.
다른 프로세스를 건드리지 않고 foreground Vite와 Playwright를 분리해 제품 흐름을 실행했다.
검증 후 이 워크트리의 5293 Vite child PID만 명령행 확인 후 종료했으며 포트와 임시 컨테이너는 남지 않았다.

## 8. 이번 라운드에서 결함으로 올리지 않은 것

- 7번째 검색 URL: 없음. 7유형 중 출고·입고가 한 URL을 공유한다.
- 기존 6종 라벨·링크: exact 값 불변.
- 정산서 plain text: S4 route 부재에 따른 미완. S4에서 #1094 링크를 명시적으로 닫아야 한다.
- backend 미실행 보고: 이번 리뷰에서 accounting/groupware 전체를 실제 재실행해 기준선과 일치했다.
- 배포 groupware-service V19: 이번 라운드도 **배포 후 확인** 표면이다. 공유 DB write 금지로 배포본 POST는 하지 않았다.

## 9. 구현자 재제출 조건

1. F-1의 RED 원문과 수정 후 동일 probe GREEN 원문.
2. 후보가 실제로 보이는 새 `01-settlement-search-result.png`.
3. 7유형 × 검색/선택 가시성 전수 결과와 기존 6종 라벨·href 표.
4. Chromium-1217 2개 기존 흐름 + 신규 가시성 gate 통과, API 누출 0건.
5. picker 12건, 전체 desktop Vitest, typecheck, accounting 1,867, groupware 254 재실행.
6. refDocNo mutation 감도와 V19 기존행 probe 유지.

위 조건 충족 후 SOL 재검토가 필요하다. 현재 HEAD는 머지하면 안 된다.
