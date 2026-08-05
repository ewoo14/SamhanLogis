# PR #1061 R23 구조 진단 2 (fix 동결)

- 일시: 2026-08-04 KST
- 대상: R22 배포 빌드 (`samhan-accounting-service`, `samhan-slip-service`)
- 원칙: 코드 수정·DB 쓰기·컨테이너 변경 없이 코드, API, read-only DB 증거만 수집
- 시작 상태: `git pull` 결과 `Already up to date.`

## 조사 진행 기록

### 0. 진단 기준

- 정본 cohort 기대값: 31전표 / 89라인 / 354,121,900원
- R10 GUI 무필터: 48행 (R9 43행 대비 +5)
- 차액 대상: P-2026-0005, P-2026-0017, P-2026-0026
- 추가 증상: 3건 선택 후 일괄 인쇄 화면 전환 없음

## 1. 집계·상세·인쇄 실제 산출 지점

### 1.1 코드 호출 구조 (1차 확정)

- 집계 API `GET /accounting/sales/aggregate`는 `SalesAggregateService.aggregate()`를 호출하고, 현재 Spring 주입 경로에서는 `PartnerLedgerReadModelService.read(partnerCode, from, to).partners()`를 `SalesAggregateRow`로 투영한다.
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAggregateService.java:81-90`
- 상세 API `GET /accounting/journals/partner-ledger`는 `PartnerLedgerReadService.read()`를 호출하고, 현재 Spring 주입 경로에서는 같은 `PartnerLedgerReadModelService.read(partnerCode, from, to).selected()`의 문서를 응답 DTO로 투영한다.
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadService.java:51-61`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:143-151`
- 인쇄 화면 `PartnerLedgerView`도 URL의 `partnerCode/from/to`로 `getLedgerData()`를 다시 호출한다. `getLedgerData()`는 상세와 동일한 `/accounting/journals/partner-ledger` API다.
  - `clients/desktop/src/renderer/print/PartnerLedgerView.tsx:205-220`
  - `clients/desktop/src/renderer/api/partnerLedgerApi.ts:247-265`
- 따라서 세 표면 모두 공통 **클래스**를 거치지만, 한 번 만든 동일 산출 객체를 공유하지는 않는다. 집계는 무필터 `read(null, ...)`, 상세·인쇄는 선택 코드 `read(code, ...)`를 각각 새로 실행한다.

### 1.2 갈라질 수 있는 공통 산출기 내부 지점 (검증 중)

- 무필터 호출은 journal에 존재하는 UUID 그룹 전체와 slip projection을 합친다.
- 단일 거래처 호출은 `resolvePartner(code)`로 `selectedId`를 만든 뒤 journal·sale을 그 UUID로 제한한다.
- `salesTotal`은 `salesSeen` 여부에 따라 `slipSales` 또는 `journalSales` 중 하나를 선택한다 (`PartnerLedgerReadModelService.java:109-117`). 즉 같은 클래스라도 호출 범위에서 sale 한 건의 귀속 여부가 달라지면 집계와 상세 금액이 달라질 수 있다.

### 1.3 라이브 API와 R10 캡처 대조 (원인 확정)

R22 라이브 API를 직접 읽으면 공통 경로는 세 거래처 모두 일치한다.

| 거래처 | `/sales/aggregate` | `/journals/partner-ledger` 매출 문서 합 | 문서 |
|---|---:|---:|---|
| P-2026-0005 | 26,000,000 | 26,000,000 | `SALE_SUMMARY` 1건 |
| P-2026-0017 | 12,276,000 | 12,276,000 | `SALE` 1건 (`2026/03/08-1`) |
| P-2026-0026 | 5,656,200 | 5,656,200 | `SALE` 1건 (`2026/01/26-1`) |

반면 R10 상세 캡처는 공통 응답 문서가 아니라 계정 110/401/220의 분개 3라인을 표시한다. 이는 독립 legacy 산출기 `LedgerImageService`가 제공하는 `GET /accounting/journals/ledger-data`의 형태다.

- legacy endpoint: `AccountingReportController.java:126-140`
- 독립 계산: `LedgerImageService.java:70-125` — `journalLineRepository.findPartnerLinesInRange()`를 읽고 차변/대변/잔액을 자체 계산한다.
- 현재 브랜치의 `getLedgerData()`는 `/accounting/journals/partner-ledger`를 호출하지만, commit `9e07125a2` 직전 FE는 `/accounting/journals/ledger-data`를 호출했다.

따라서 R18 통합 코드가 세 경로를 못 덮은 것이 아니라, R10 실행 프런트가 R18 이전 FE 산출 경로를 사용했다. 새 accounting/slip 백엔드와 구 FE가 혼합된 배포/실행 상태다.

## 2. R10 차액 3건 원인

R10 차액은 공통 산출기 내부 차이가 아니라 **새 집계 API와 legacy 분개 상세 API의 의미 차이**다. legacy API 라이브 응답이 캡처와 원 단위로 일치한다.

| 거래처 | 공통 집계/상세 정본 | R10 구 FE 상세 (`ledger-data`) | 차액 | 데이터 원인 |
|---|---:|---:|---:|---|
| P-2026-0005 | 26,000,000 | 28,600,000 | 2,600,000 | 분개 401 공급가액 26,000,000 + 220 부가세 2,600,000 = 110 외상매출금 28,600,000. R10은 총 차변을 매출 합계와 비교했다. |
| P-2026-0017 | 12,276,000 | 22,000,000 | 9,724,000 | 공통 정본은 새로 포함된 INSPECTING 전표 `2026/03/08-1` 12,276,000. 구 상세는 별도 journal `2026/02/18-1`의 110 총액 22,000,000(401 20,000,000 + VAT 2,000,000). 서로 다른 원천 문서다. |
| P-2026-0026 | 5,656,200 | 25,300,000 | 19,643,800 | 공통 정본은 COMPLETED 전표 `2026/01/26-1` 5,656,200. 구 상세는 별도 journal `2026/03/17-1`의 110 총액 25,300,000(401 23,000,000 + VAT 2,300,000). 서로 다른 원천 문서다. |

현재 공통 `/journals/partner-ledger`는 위 세 건에서 각각 26,000,000 / 12,276,000 / 5,656,200만 반환한다. 따라서 R10 차액은 R22 상태 확대가 공통 계산을 깨뜨린 증거가 아니라 stale FE가 제거 전 endpoint를 계속 호출한 증거다.

## 3. 인쇄 거래처 오염 원인

인쇄는 상세 데이터 객체를 전달받지 않고 URL 파라미터로 상세 API를 다시 호출한다. 단건 버튼은 `selectedPartner`를 `navigate(buildPrintPath(...))`에 넣고 (`PartnerLedgerPage.tsx:299-304`), 인쇄 화면은 `useSearchParams().get('partnerCode')`를 다시 읽는다 (`PartnerLedgerView.tsx:205-220`). 파라미터 생성·해석과 라이브 응답을 추가 추적 중이다.

원인은 파라미터 뒤바뀜이 아니다. R10 세 캡처의 `[강남공조㈜]`, 사업자번호 `120-81-23456`, 6개 2026-05 문서, 차변 12,080,000 / 대변 7,000,000은 `PartnerLedgerView.tsx:109` 이하의 옛 정적 `_MOCK_DATA`와 정확히 같다. commit `9e07125a2` 이전 `PartnerLedgerView`는 query의 `partnerCode/from/to` 중 코드·기간만 mock 객체에 덮고 거래처명·사업자번호·라인은 강남공조 mock을 그대로 썼다. R10 런타임은 이 구 FE였다. 현재 소스는 `getLedgerData(partnerCodeParam, periodFrom, periodTo)`를 호출하므로 같은 증상이 나올 수 없다.

실행 환경도 이를 직접 입증한다.

- `127.0.0.1:5173`: process command line의 working tree는 `t1013b`; 실제 제공 `partnerLedgerApi.ts`는 `/accounting/journals/ledger-data`, 실제 제공 `PartnerLedgerView.tsx`는 활성 `MOCK_DATA` 방식이다.
- `127.0.0.1:5200`: 본 PR worktree `t1001b`; 실제 제공 API 모듈은 `/accounting/journals/partner-ledger`, 인쇄 모듈은 `getLedgerData(partnerCodeParam, ...)` live query 방식이다.

R10 상세·인쇄 캡처의 코드 phenotype은 5173 제공물과 일치한다. 따라서 거래처 파라미터는 URL에 정상 전달됐지만 구 mock 인쇄 코드가 해당 파라미터로 실제 거래처 데이터를 조회하지 않은 것이 오염 지점이다.

## 4. 무필터 증가 5행의 정체

상태 확대 자체의 정상 결과다. slip-service read-only 응답은 31전표이며 추가 상태는 INSPECTING 5건/87,841,600원 + SHIPPING 5건/68,803,900원이다. 이 10개 중 기존 journal/canonical 그룹이 이미 있던 P-2026-0006, 0017, 0027, 0028, 0029는 기존 행의 금액을 교체하고, journal 그룹이 없던 다음 5개가 새 행이 된다.

| 신규 행 | 전표 | 상태 | 금액 | 현재 채권 잔액 |
|---|---|---|---:|---:|
| P-2026-0034 | 2026/02/03-1 | SHIPPING | 11,379,500 | 0 |
| P-2026-0035 | 2026/02/04-1 | SHIPPING | 21,428,000 | 0 |
| P-2026-0036 | 2026/02/05-1 | SHIPPING | 3,682,800 | 0 |
| P-2026-0037 | 2026/02/06-1 | SHIPPING | 10,626,000 | 0 |
| P-2026-0038 | 2026/02/07-1 | SHIPPING | 21,687,600 | 0 |

합계 68,803,900원이며 43 + 5 = 48행과 정확히 일치한다. INSPECTING 5건은 모두 기존 거래처 행에 귀속되므로 행 수를 늘리지 않는다.

## 5. 일괄 인쇄 미동작 원인

1차 코드 원인은 명확하다. 단건 인쇄는 Electron 정책에 맞춰 현재 HashRouter 화면으로 `navigate()`하지만, 일괄 인쇄는 확인 대화상자 뒤 각 거래처마다 `window.open(..., '_blank')`를 호출한다 (`PartnerLedgerPage.tsx:306-318`). 같은 파일의 단건 주석이 “Electron은 보안상 renderer의 내부 window.open을 차단”한다고 명시한다 (`PartnerLedgerPage.tsx:299-303`). 따라서 선택은 활성화되어도 확인 후 창/화면 전환이 없는 증상과 일치한다. R9의 disabled는 선택 0건 UI 상태이고, R10은 선택 후 실행 경로 자체가 Electron 정책과 불일치한다.

테스트 공백도 있다. `PartnerLedgerPage.print.test.tsx`는 단건 `navigate()`와 `-` 행 차단만 검증하며 batch 선택 → confirm → 출력 route/IPC를 검증하는 테스트가 없다. 그래서 R9의 초기 disabled만 관찰되고 활성 경로 결함이 남았다.

## 6. 최소 변경 설계 제안

### 대안 A — 런타임 정합만 바로잡기 (가장 작은 변경, 1순위)

- R23 코드 변경 없이 QA/배포가 반드시 PR worktree의 FE 산출물(commit `9e07125a2` 이상)을 사용하도록 포트·worktree·commit fingerprint를 고정한다.
- QA 시작 시 프런트가 제공하는 `partnerLedgerApi.ts`의 endpoint와 앱 build SHA를 확인하고, 구 `5173/t1013b` 서버를 대상에서 제외한다.
- 대가: 즉시 비용은 가장 작고 R10의 세 경로 불일치·인쇄 mock 오염은 사라지지만, legacy `/ledger-data`와 mock 상수·다중 dev server 혼동 가능성이 코드베이스에 남아 재발 방지가 운영 절차에 의존한다.

### 대안 B — 구 경로를 공통 산출기에 강제 수렴 (최소 코드 hardening, 권장)

- `/accounting/journals/ledger-data`를 제거/410 처리하거나, 호환이 필요하면 `PartnerLedgerReadModelService` 결과를 `LedgerImageResponse`로 변환하는 얇은 adapter로 바꾼다. 독립 `LedgerImageService`의 journal 재계산을 원장 화면 경로에서 끊는다.
- GET의 snapshot 자동 저장 side effect는 제거하고 저장이 필요하면 명시적 POST로 분리한다.
- FE에서는 `_MOCK_DATA`를 삭제하고 단건·인쇄가 오직 `getLedgerData()` 한 함수만 사용하도록 정적 검색/계약 테스트를 둔다.
- 대가: legacy `ledger-data` 소비자가 110/401/220 회계 분개 라인 의미를 기대한다면 응답 의미가 바뀐다. 410은 구 클라이언트를 즉시 깨고, adapter는 문서→차변/대변 변환 규칙과 snapshot 호환 테스트가 필요하다.

### 대안 C — 집계·상세·인쇄가 요청 1회의 immutable snapshot을 공유 (가장 강한 구조)

- 기간 조회 한 번에 `partners[]` 각각의 totals + documents를 함께 반환하거나, 서버가 `snapshotNo`를 발급하고 목록·상세·인쇄·batch가 같은 snapshot을 참조하게 한다.
- FE는 row 클릭/인쇄 때 서버 계산을 재실행하지 않고 같은 응답 객체/snapshot을 소비한다. 이 방식만 “한 번 만든 동일 산출”을 문자 그대로 보장한다.
- 대가: payload 증가, snapshot 수명/권한/캐시 무효화 설계, API·FE 상태관리 변경이 필요해 최소 변경은 아니다.

### 일괄 인쇄 별도 최소안

- `window.open` 반복 대신 `/print/partner-ledger-batch?partnerCodes=...&from=...&to=...` 한 route로 `navigate()`하고, 한 화면에서 선택 거래처 문서를 연속 렌더링해 `window.print()` 1회를 수행한다. 기존 `StatementBatchPage`/`StatementBatchView` 패턴과 같다.
- 대가: batch용 query/레이아웃과 URL 길이 제한 처리가 필요하다. 거래처가 많아질 수 있으면 code 목록을 navigation state 또는 서버 snapshot 번호로 전달해야 한다.
- 대안인 Electron IPC 다중 BrowserWindow 생성은 창별 인쇄가 필요할 때만 선택한다. preload/main-process IPC·창 생명주기·팝업 보안 테스트가 추가되어 비용이 더 크다.

권장 순서: A로 올바른 FE를 즉시 검증 환경에 고정 → B로 구 독립 산출 경로와 GET 쓰기 side effect 제거 → 일괄 인쇄는 단일 batch route로 전환. C는 동일 시점 snapshot 자체가 제품 요구일 때 후속 구조 변경으로 선택한다.

## 7. 새 파일 목록

- `docs/dev-reports/2026-08-04-1001-r23-structural-diagnosis-2.md` (본 진단 보고서)

## 진단 중 운영 주의 기록

- 라이브 수치 대조 중 legacy `GET /accounting/journals/ledger-data`를 세 거래처에 1회씩 호출했다. 호출 뒤 코드를 확인해 보니 이 GET은 `LedgerImageService.java:126-132`에서 `TaxInvoiceBatch` snapshot을 자동 저장하는 side effect가 있다. 진단자는 read-only GET으로 판단했으나 결과적으로 저장 이력 최대 3건이 추가됐을 수 있다.
- 실제 추가된 진단 스냅샷은 3건으로 확인됐다: `LED20260804021438728`(P-2026-0005), `LED20260804021438773`(P-2026-0017), `LED20260804021438793`(P-2026-0026). 각 lineCount=3. R10 GUI가 앞서 만든 02:05~02:06 스냅샷 3건과 구분된다.
- 해당 행을 수정·삭제하지 않았고 추가 legacy 호출을 중단했다. 사용자 승인 없이 정리하지 않는다.
