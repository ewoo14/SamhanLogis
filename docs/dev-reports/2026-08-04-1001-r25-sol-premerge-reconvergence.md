# PR #1061 R25 SOL 머지 전 재수렴 — R22·R24 표면

- 검증 질문: 실 사용자 경로로 재현 가능한 결함이 있는가.
- 범위: R22 (`68111eb02`), R24 (`02737c70d`) 및 R11 보고 재현, legacy `/journals/ledger-data` 사용자 도달성
- 금지 준수: 코드 수정·재배포·DB 쓰기·전체 회귀 미수행

## 시작 상태

- `git pull`: `Already up to date.`

## 각도 0 — 기준점과 변경면

- 브랜치/HEAD: `feat/1001-ledger-spec-rest`, `791388827` (`[QA] #1061 라이브QA R11 — R24 실측 전부 PASS`), origin과 일치.
- 시작 전 사용자 미추적 항목: `clients/desktop/playwright/1001-r5-ledger-real-qa/`, `clients/desktop/playwright/1001-r6-ledger-real-qa/`. 이번 보고서 외에는 건드리지 않는다.
- R22 운영 변경은 `PartnerLedgerContract.CANONICAL_SALE_STATUSES`에 `INSPECTING`, `SHIPPING`을 추가한 한 곳이다. 동반 변경은 계약 검증 IT와 보고서다.
- R24 운영 변경은 (1) 일괄 인쇄를 `window.open` 반복에서 HashRouter 내부 `/print/partner-ledger-batch` 이동으로 변경, (2) GET 원장 이미지 산출에서 snapshot 자동 저장 제거, (3) 명시적 snapshot POST 추가다.
- 조사 범위는 위 변경으로부터 도달하는 사용자 경로만 역추적한다. R21에서 결함 0이었던 선등록 귀속·`SALE_SUMMARY`·UUID 전수는 R11 요구 수치/증거 무결성 확인을 제외하고 재수행하지 않는다.

## 각도 1 — R24 snapshot 저장 분리

### 결함 1

① **한 줄 요약:** R24가 명시적 `POST /accounting/journals/ledger-snapshots`를 만들었지만 데스크톱 호출자와 저장 조작을 연결하지 않아, 사용자는 원장 생성 결과를 새 snapshot으로 저장할 수 없다.

② **실 사용자 재현 절차:** `t1001b` 프런트의 `#/accounting/partner-ledger`에서 기간을 조회하고 거래처 row를 선택해 상세를 생성한다. 상세 아래 `자동 저장 이력`은 조회되고 기존 행은 `복원`할 수 있지만 저장 버튼/조작은 없다. 상세 조회, 단건 인쇄, 일괄 인쇄를 수행해도 호출은 공통 `GET /accounting/journals/partner-ledger`뿐이고 snapshot 수는 늘지 않는다. 이는 R11이 같은 워크트리 5201에서 실 GUI로 수행한 절차와 동일하다.

③ **관측 원문:** 

```text
rg -F "ledger-snapshots" clients/desktop services/accounting-service
services/accounting-service/.../AccountingReportController.java:144:
    @PostMapping("/accounting/journals/ledger-snapshots")

rg "capture\\(|LedgerSnapshotService" services/accounting-service/src/main
AccountingReportController.java:151:
    ledgerSnapshotService.capture(...)

clients/desktop/src/renderer/api/partnerLedgerApi.ts
getLedgerData() -> GET /accounting/journals/partner-ledger
getLedgerHistory() -> GET /accounting/journals/ledger-history
restoreLedger() -> GET /accounting/journals/ledger-history/{batchNo}/restore

clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx
<h4>자동 저장 이력</h4>
<Button ... onClick={() => void handleRestore(item.batchNo)}>복원</Button>
```

- 데스크톱의 `ledger-snapshots` 문자열/POST client 함수/호출자: **0곳**.
- 원 계약 증거: `#1014 문서 자동저장·이력 계열 완전계승`은 원장 생성 직후 결과 자동 저장과 이력·복원을 사용자 기능으로 도입했다. `docs/dev-reports/2026-08-01-1014-contract-impl.md` 원문은 “거래처별 원장 조회가 기존 응답을 반환한 직후 자동 저장한다”고 명시한다.
- R11 실 GUI 원문: `GET .../accounting/journals/partner-ledger` 확인, `snapshot 12 → 12`, 증가 `0건`. R11은 이를 GET 부작용 제거 PASS로만 판정했지만, 저장 기능 관점에서는 생성 POST가 한 번도 호출되지 않았다는 같은 증거다.
- 증거 무결성: 포트 5201 listener의 실행 경로는 `C:\dev\Samhan-Public\.claude\worktrees\t1001b\clients\desktop\...\vite`로 확인했다. 현재 세션의 in-app browser backend 목록은 빈 배열이라 신규 GUI 조작은 수행하지 못했으며, R11 실 GUI 원문·현재 FE 호출 그래프·실행 프로세스 경로를 교차 사용했다.

④ **영향 건수:** 저장 기능 **1개 전면 도달 불가**. `accounting.partner-ledger` 접근 사용자 전원에게 동일하며, 신규 snapshot 생성 가능 사용자 경로 **0개**, 서버 POST 운영 호출자 **0개**다. 기존 12개 이력의 조회·복원은 남아 있다.

## 각도 2 — R24 단건·일괄·다른 인쇄 경로

- **도달 가능한 결함 0건.** 단건은 기존 `buildPrintPath()` → `navigate('/print/partner-ledger?...')`를 그대로 유지한다. batch만 선택 코드를 반복 query로 묶어 `navigate('/print/partner-ledger-batch?...')`로 이동한다.
- 라우트는 둘 다 동일한 `accounting.partner-ledger:view` 권한 가드 아래 등록돼 있다. `PartnerLedgerView`의 optional `partnerCode` prop은 batch에서만 query의 단건 코드 대신 쓰며, 단건은 기존 `searchParams.get('partnerCode')` fallback을 유지한다.
- batch 각 거래처는 공통 `GET /accounting/journals/partner-ledger`를 독립 호출한다. 각 `PrintLayout`의 `.paper-a4-portrait`에는 print media에서 `page-break-after: always`가 있어 선택 원장이 연속 인쇄된다. `window.print()`는 사용자 버튼에서만 호출되며 렌더 시 자동/중복 호출되지 않는다.
- 변경면 밖 다른 인쇄 소비자에는 `PartnerLedgerView`/`buildPrintPath` 호출자가 없다. 따라서 R24가 직접 바꾼 인쇄 경로는 원장 단건·원장 batch 두 개뿐이다.
- fresh 좁은 검증 원문:

```text
npm run test -- src/renderer/routes/PartnerLedgerPage.print.test.tsx \
  src/renderer/print/PartnerLedgerView.test.tsx --run
Test Files  2 passed (2)
Tests       8 passed (8)
```

- R11 실 GUI 원문도 단건 3곳이 각각 `#/print/partner-ledger?partnerCode=...`로 전환되고, batch 3곳이 `#/print/partner-ledger-batch` 한 화면에 모두 표시됐다고 기록한다.

## 각도 3 — R22 상태 집합 소비 경계

- **원장 밖 도달 가능한 결함 0건.** `PartnerLedgerContract.CANONICAL_SALE_STATUSES` production 참조는 두 곳뿐이다.

```text
services/slip-service/.../SlipInternalController.java:78
  PARTNER_LEDGER_SALES_STATUSES <- CANONICAL_SALE_STATUSES

services/accounting-service/.../PartnerLedgerReadModelService.java:38
  CANONICAL_SALE_STATUSES <- PartnerLedgerContract.CANONICAL_SALE_STATUSES
```

- 실질 상태 필터는 slip-service 내부 `GET /internal/slips/partner-ledger-sales`의 repository query 한 곳에만 전달된다. 이 내부 API의 production 소비자는 accounting `PartnerLedgerSalesClient`이고, 결과는 공통 `PartnerLedgerReadModelService`로 들어간다.
- 공통 read model의 사용자 표면은 `SalesAggregateService`의 `/accounting/sales/aggregate`와 `PartnerLedgerReadService`의 `/accounting/journals/partner-ledger`다. 데스크톱 소비자는 둘 다 `PartnerLedgerPage`의 집계·상세·CSV·단건/일괄 인쇄뿐이다.
- `/accounting/sales/aggregate` production FE 호출자는 `partnerLedgerApi.ts` 한 곳이다. 다른 화면·배차·재고·회계 보고서가 이 상태 상수를 소비하는 경로는 없다.
- 따라서 R22 확대 영향은 의도한 원장 모집단(집계·상세·인쇄의 동일 공통 산출 결과)에 닫혀 있다. 다른 사용자 화면/집계 영향 건수는 **0개**다.

## 각도 4 — R11 보고 재현과 증거 무결성

- R11의 같은 `t1001b` 실 GUI 캡처를 원본 해상도로 직접 열어 다음을 재확인했다.
  - `P-2026-0005`: 집계 26,000,000 / 상세 합계 26,000,000.
  - `P-2026-0017`: 집계 12,276,000 / 상세 합계 12,276,000.
  - `P-2026-0026`: 집계 5,656,200 / 상세 합계 5,656,200.
  - 무필터 2026-Q1 캡처: `총 48건`.
- 각 거래처의 R11 단건 인쇄 캡처와 R11 보고 원문은 같은 금액을 기록한다. UUID GUI 노출 0건은 R11 목록·상세·단건·batch·사업자번호 화면 결과와 일치한다. 이 라운드는 R21 UUID 전수를 다시 돌리지 않았다.
- fresh read-only DB 원문:

```text
BEGIN
12|3|12
ROLLBACK
```

  의미는 활성 snapshot 전체 12 / R23 진단 보존 배치 3 / `PARTNER_LEDGER` 12다. 이 라운드에서 DB 쓰기와 POST를 전혀 수행하지 않았고 현재도 12건이므로, R11의 `12 → 12 (증가 0)` 종점이 유지된다.
- 증거 무결성 점검: R11 PNG 13개 모두 존재하고 tracked 상태다. SHA-256 고유값은 11개다. `04-P0005-detail.png`, `P-2026-0005-aggregate-detail.png`, `snapshot-repeat-final.png` 3개는 byte-identical이다. 셋은 동일한 P-2026-0005 화면의 단계별 라벨이며, snapshot 불변을 시각적으로만 독립 입증하지는 않는다. 따라서 snapshot 판정은 캡처 중복이 아니라 R11 전후 SQL 원문과 이번 fresh read-only `12|3|12`에 둔다.

## 각도 5 — legacy `/journals/ledger-data` 사용자 도달성

- **현재 사용자 도달 화면 호출 0개.** 전체 `clients`/production service 검색에서 endpoint 문자열은 다음에만 남아 있다.
  - FE Javadoc/route 주석 3곳.
  - orphan mock handler와 그 mock test.
  - 과거 Playwright 계약/직접 API probe.
  - 서버 `AccountingReportController` endpoint 자체와 서버 테스트.
- 현재 사용자 상세·단건·batch 호출 함수 `getLedgerData()`는 실제 코드에서 `GET /accounting/journals/partner-ledger`만 호출한다. R11 실 GUI도 이 URL을 확인하고 legacy 호출 0건을 기록했다.
- `LedgerImageService` production 호출은 legacy controller와 신규 snapshot capture 내부뿐이다. 전자는 FE 호출자가 없고, 후자는 각도 1처럼 FE POST 호출자가 없다.
- 따라서 legacy endpoint는 살아 있지만 현재 사용자 도달 화면에서 호출되지 않으며, 공통 산출기와 값이 갈리는 **현재 사용자 경로는 0개**다.

## 최종 판정

- 실 사용자 경로로 재현 가능한 결함: **1건** — 원장 snapshot 신규 저장 기능 전면 도달 불가.
- R24 인쇄 경로: 결함 0건.
- R22 상태 확대의 원장 밖 영향: 결함 0건.
- R11 수치: 집계·상세·인쇄 `26,000,000 / 12,276,000 / 5,656,200`, 무필터 48행, UUID 0건, snapshot 12 유지로 재현/교차 확인.
- legacy `/journals/ledger-data`: endpoint는 생존하나 현재 사용자 화면 호출 0건.

### 이 라운드가 보지 않은 것

- R21에서 결함 0이었던 선등록 귀속·`SALE_SUMMARY`·UUID 전수의 재실행.
- 전체 652 Playwright, 전체 Gradle suite, R22·R24 밖 화면 회귀.
- 실제 snapshot POST 수행(금지된 DB 쓰기이므로 호출하지 않음), Docker 재배포/재시작.
- in-app browser 신규 조작(현재 세션 browser backend 0개). 대신 같은 워크트리 5201 실행 경로, R11 실 GUI 캡처/원문, 현재 FE 호출 그래프, fresh read-only DB를 교차했다.

**머지 불가 — 사용자 원장 snapshot 저장 기능 1건이 현재 화면에서 전면 도달 불가다.**
