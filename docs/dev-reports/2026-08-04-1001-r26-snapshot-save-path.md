# PR #1061 R26 — 원장 snapshot 저장 경로

## 1. 시작 기록

- 시작 전 `git pull`: `Already up to date.`
- 대상: `#/accounting/partner-ledger`의 원장 snapshot 명시적 저장 경로 복구.
- 금지 준수: `git commit`, `git push`, Docker build/up/restart, 기존 snapshot 삭제·수정, 전체 652 Playwright 및 전체 Gradle suite는 수행하지 않는다.

## 2. 저장의 업무 의미 확인 — 조사 중

R24 이전 GET 자동 저장은 기간·거래처 원장 조회 결과를 당시의 거래처 정보와 원장 line으로 남겨, 이후 `자동 저장 이력`에서 저장 시점 결과를 확인하고 `복원`하는 업무 기록이었다. R24는 조회의 쓰기 부작용을 제거하고 같은 업무 기록을 명시적 POST로 분리했다.

근거 파일과 확인 내용은 조사 완료 후 이 절에 원문으로 append 한다.

### 조사 근거

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LedgerImageService.java`는 원장 조회만 담당하고, snapshot 저장은 `LedgerSnapshotService.capture`가 명시적으로 수행한다고 설명한다.
- `LedgerSnapshotService.capture`는 `ledgerImageService.getLedger(...)` 결과를 `TaxInvoiceBatch`의 `PARTNER_LEDGER` 문서 snapshot으로 압축 저장한다. 즉 저장 대상은 조회 당시의 원장 결과이며, 단순 조회와 분리된 업무 기록이다.
- `AccountingReportController`의 `POST /accounting/journals/ledger-snapshots`는 PRINT 권한으로 명시적 저장을 받고, `GET /accounting/journals/ledger-history`는 기간·거래처별 이력, `GET .../{batchNo}/restore`는 저장 시점 원장을 복원한다.
- 데스크톱 `PartnerLedgerPage`에는 선택 원장 아래 `자동 저장 이력` 표와 각 행의 `복원`이 이미 있어 저장 결과를 관리하는 업무 표면이 이 영역에 존재한다.
- R24 이후 `getLedgerData`는 `GET /accounting/journals/partner-ledger`만 호출하고, 현재 데스크톱 API에는 snapshot POST 함수와 호출자가 0곳이었다.

### 저장 조작 위치 판정

저장 조작은 선택 원장이 표시되는 Step 2의 `자동 저장 이력` 제목 옆에 둔다. 사용자가 기간 조회와 거래처 선택으로 만든 현재 결과를 보존하는 행위이고, 이력·복원과 같은 대상(동일 거래처·동일 기간)을 다루므로 업무 의미와 화면 발견성이 가장 직접적으로 맞는다. 조회 버튼이나 단건·일괄 인쇄에 결합하지 않아 GET의 쓰기 부작용과 인쇄의 부수효과를 재도입하지 않는다.

## 3. RED-first 실행 기록

### RED-A

사용자 저장 조작 → snapshot 건수 `+1`을 증명하는 테스트를 먼저 추가한다.

### RED-B

조회 반복 → snapshot 건수 증가 `0`을 증명하는 기존 R24 불변식을 유지·검증한다.

## 4. 구현·검증 기록

진행 단계별 결과를 즉시 append 한다.

## 5. RED 원문과 GREEN 결과

### RED-A 원문

```text
사용자 조작으로 snapshot 이 생성된다 (조작 → 건수 +1)
```

추가한 FE API 테스트는 최초 실행에서 `captureLedger is not a function`, 화면 테스트는
`Unable to find ... partner-ledger-save-snapshot`으로 실패했다. 즉 사용자가 누를 저장 조작과 POST 호출자가 실제로 없던 결함을 재현했다.

### RED-B 원문

```text
조회 반복해도 snapshot 이 늘지 않는다 (R24 의 성과 유지)
```

반복 조회 회귀 테스트는 `getSalesAggregate`를 두 번 호출해도 `captureLedger`가 호출되지 않는지 확인한다. 구현 경로는 조회 query와 명시적 저장 handler를 분리해 GET 반복에 POST가 섞이지 않도록 했다.

### 두 RED 동시 GREEN 원문

```text
RED-A GREEN — 저장 버튼 조작 → captureLedger(partnerCode, from, to) 1회 → POST /accounting/journals/ledger-snapshots → 서버 capture가 새 PARTNER_LEDGER batch를 저장한다.
RED-B GREEN — 조회 2회 → GET 집계/원장만 반복 → captureLedger 0회 → snapshot 증가 0건.
```

검증 원문:

```text
npm run test -- src/renderer/api/partnerLedgerHistory.test.ts src/renderer/routes/PartnerLedgerPage.print.test.tsx --run
Test Files 2 passed (2)
Tests 8 passed (8)

gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest
BUILD SUCCESSFUL
```

## 6. 변경 내용

- 데스크톱 `captureLedger` API client를 추가해 기존 POST 계약을 `partnerCode/from/to` query로 호출한다.
- `PartnerLedgerPage`의 `자동 저장 이력` 제목 옆에 `현재 원장 저장` 버튼을 배치했다.
- 저장 성공 후 이력 query를 refetch해 새 이력을 같은 화면에 반영한다. 저장 중 중복 클릭은 막는다.
- 조회·단건 인쇄·일괄 인쇄 함수에는 snapshot 저장을 추가하지 않았다.

## 7. 반대급부 확인

- 금액: 기존 R11/R25 기준 집계·상세·인쇄 `26,000,000 / 12,276,000 / 5,656,200` 계약을 바꾸지 않았다. 대상 인쇄 테스트 5개가 GREEN이다.
- 무필터: 48행 계약 및 UUID 사용자 노출 0건 관련 렌더링 코드는 변경하지 않았다.
- 인쇄: R25 실측의 단건 인쇄 3곳·일괄 인쇄 3건 동작과 `window.open` 제거 계약을 변경하지 않았다. 대상 인쇄 회귀 테스트 5개가 GREEN이다.
- legacy: `getLedgerData`의 `/accounting/journals/partner-ledger` 호출만 유지했고 `/journals/ledger-data`를 되살리지 않았다. 변경 후 데스크톱 호출 그래프에 legacy 호출은 0곳이다.
- snapshot 12건: 기존 실 DB snapshot은 조회·삭제·수정하지 않았다. 이번 세션에 실제 POST/DB 쓰기는 수행하지 않았다.

## 8. 검증 한계

- `npx tsc -p tsconfig.node.json --noEmit` 및 `npx tsc -p tsconfig.web.json --noEmit`: 통과.
- 대상 ESLint 4파일: 통과.
- `npm run typecheck` 전체 게이트는 기존 미추적 Playwright 파일
  `clients/desktop/playwright/1001-r6-ledger-real-qa/1001-r6-ledger-real-qa.spec.ts` 때문에 real-QA 집합 일치 테스트 1건에서 중단됐다. 해당 파일은 사용자 기존 항목이며 건드리지 않았다.
- Docker build/up/restart와 전체 Playwright/Gradle suite는 지시대로 수행하지 않았다.

## 9. 새 파일 목록

- `docs/dev-reports/2026-08-04-1001-r26-snapshot-save-path.md`

수정 파일:

- `clients/desktop/src/renderer/api/partnerLedgerApi.ts`
- `clients/desktop/src/renderer/api/partnerLedgerHistory.test.ts`
- `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx`
- `clients/desktop/src/renderer/routes/PartnerLedgerPage.print.test.tsx`
