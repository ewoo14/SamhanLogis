# PR #1061 R3 재수렴 — fix 변경면 실사용 결함 조사

## 결론

**실 사용자 경로로 재현 가능한 결함 4건**이다.

이번 라운드는 직전 5건의 해소 여부나 검증 품질을 평가하지 않았다. HEAD `01e7d2363`의 fix가 건드린 상태 집합, 원장 조립·누적잔액, 본문/인쇄 표시, VAT 계약, 데스크톱 타입 표면에서 사용자가 정상 조작으로 받는 결과만 판정했다.

| 관점 | 범위 | 결론 |
|---|---|---|
| Agent 1 | 원장 포함 상태·실 DB 집합·합계 | 결함 1건: 실제 거래처 코드 필터에서 출고전표 전부 탈락 |
| Agent 2 | 누적잔액 순서·페이지 연속성 | 결함 1건: 무패딩 문서번호 문자열 정렬로 같은 날짜의 중간 잔액 귀속 오류 |
| Agent 3 | 인쇄: 주소 없음·음수·대량 라인 | 결함 1건: 다페이지 인쇄의 합계/기말잔액 반복 |
| Agent 4 | 표시 규약·fail-closed·신규 27라인 VAT | 결함 1건: 인쇄 누적/기말 음수 잔액이 검정 |
| Agent 5 | `clients/desktop` 실제 typecheck | 결함 0건, 종료 코드 0 |

## 1순위: 원장에 실리는 집합

### 상태 경계 결론

포함 상태 자체는 코드의 출고 경계와 일치한다.

- `Slip.java:1058-1075`: `ACCEPTED → PROCESSING → INSPECTING`; `complete()`가 `PROCESSING → INSPECTING`을 수행하며 주석이 이를 “출고 완료”로 정의한다.
- `SlipService.java:991-1018`: 같은 `complete()` 직후 OUTBOUND 재고를 실제 차감/출고한다.
- `Slip.java:1087-1142`: 이후 `INSPECTING → COMPLETED → SHIPPING → DELIVERED → CONFIRMED`로 전이한다.
- 따라서 `SENT`·`ACCEPTED`·`PROCESSING`은 아직 출고 전이라 제외되고, `INSPECTING`부터 다섯 상태는 출고 이후라 포함된다. `DRAFT`·`CANCELED`·`REJECTED`도 제외가 맞다.

실행 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT s.status, COUNT(DISTINCT s.id) AS slips, COUNT(l.id) AS lines, COALESCE(SUM(COALESCE(l.supply_amount,0)+COALESCE(l.vat_amount,0)),0) AS amount, CASE WHEN s.status IN ('INSPECTING','COMPLETED','SHIPPING','DELIVERED','CONFIRMED') THEN 'INCLUDED' ELSE 'EXCLUDED' END AS ledger_set FROM slips s LEFT JOIN slip_lines l ON l.slip_id=s.id AND l.is_deleted=false WHERE s.is_deleted=false AND s.slip_type='OUTBOUND' GROUP BY s.status ORDER BY CASE s.status WHEN 'DRAFT' THEN 1 WHEN 'SAVED' THEN 2 WHEN 'SENT' THEN 3 WHEN 'ACCEPTED' THEN 4 WHEN 'PROCESSING' THEN 5 WHEN 'INSPECTING' THEN 6 WHEN 'COMPLETED' THEN 7 WHEN 'SHIPPING' THEN 8 WHEN 'DELIVERED' THEN 9 WHEN 'CONFIRMED' THEN 10 WHEN 'REJECTED' THEN 11 WHEN 'CANCELED' THEN 12 END;"
```

출력 원문:

```text
   status   | slips | lines |    amount     | ledger_set
------------+-------+-------+---------------+------------
 DRAFT      |  2160 |  2369 | 3187398041.60 | EXCLUDED
 SAVED      |    12 |    29 |   99935000.00 | EXCLUDED
 SENT       |    25 |    52 |  145875199.19 | EXCLUDED
 ACCEPTED   |     6 |    22 |   76865800.00 | EXCLUDED
 PROCESSING |     7 |    21 |  105117100.00 | EXCLUDED
 INSPECTING |     5 |    12 |   87841600.00 | INCLUDED
 COMPLETED  |     7 |    17 |   58492500.00 | INCLUDED
 SHIPPING   |     5 |    15 |   68803900.00 | INCLUDED
 DELIVERED  |    10 |    35 |  106845200.00 | INCLUDED
 CONFIRMED  |     4 |    10 |   32138700.00 | INCLUDED
 REJECTED   |     7 |    19 |   42418000.00 | EXCLUDED
 CANCELED   |    55 |    65 |   15551216.00 | EXCLUDED
(12 rows)
```

### 합계 재현 및 금지 상태 혼입

실행 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT COUNT(DISTINCT s.id) AS actual_slips, COUNT(l.id) AS actual_lines, COALESCE(SUM(l.supply_amount+l.vat_amount),0) AS actual_amount, COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('DRAFT','CANCELED')) AS forbidden_draft_canceled FROM slips s JOIN slip_lines l ON l.slip_id=s.id AND l.is_deleted=false WHERE s.is_deleted=false AND s.slip_type='OUTBOUND' AND s.status IN ('CONFIRMED','DELIVERED','COMPLETED','SHIPPING','INSPECTING');"
```

출력 원문:

```text
 actual_slips | actual_lines | actual_amount | forbidden_draft_canceled
--------------+--------------+---------------+--------------------------
           31 |           89 |  354121900.00 |                        0
(1 row)
```

보고서의 `31건·89라인·354,121,900원`은 **partnerCode를 생략한 내부 endpoint 상태 집합**으로 정확히 재현된다. 수치 자체의 증거 무결성 정정은 없다. 다만 아래 D1 때문에 이 수치가 실제 거래처 선택 화면에 실리는 수치는 아니다.

## D1. 실제 거래처 선택 원장에서는 출고전표가 전부 탈락한다

- 위치:
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:415-419`
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java:83-88`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadService.java:37-48`
  - `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx:254-257,278-280`
- 원인: UI는 집계 행의 정상 거래처 코드로 상세 원장을 조회하고, accounting은 그 코드를 slip-service에 그대로 전달한다. slip repository는 `s.partnerCode = :partnerCode`로 필터한다. 그러나 현재 원장 후보 31건 모두 `partner_id`는 있으나 `partner_code`가 비어 있다.
- 사용자 조작: 기간을 `2026-02-01 ~ 2026-03-31`로 조회 → 집계에 표시되는 `P-2026-0017 원주에어컨공업` 행 클릭 → Step 2 원장 확인.
- 잘못된 결과: 같은 거래처 UUID의 신규 포함 대상 `INSPECTING` 출고전표 1건·2라인·12,276,000원이 있어야 하지만 `partnerCode=P-2026-0017` 필터 결과는 0건·0라인·0원이라 판매 라인이 사라진다.

거래처 표시 경로 재현:

```powershell
docker exec samhan-postgres psql -U samhan -d partner_db -P pager=off -c "SELECT id::text,partner_code,name,is_deleted FROM partners WHERE id='0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2'::uuid;"
docker exec samhan-postgres psql -U samhan -d accounting_db -P pager=off -c "SELECT jl.partner_id::text, SUM(jl.credit_amount) FILTER (WHERE jl.account_code='401') AS sales_total, SUM(jl.debit_amount) FILTER (WHERE jl.account_code='110') AS receivable_debit FROM journals j JOIN journal_lines jl ON jl.journal_id=j.id AND jl.is_deleted=false WHERE j.is_deleted=false AND j.status='POSTED' AND j.journal_date BETWEEN DATE '2026-02-01' AND DATE '2026-03-31' AND jl.partner_id='0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2'::uuid GROUP BY jl.partner_id;"
```

출력 원문:

```text
                  id                  | partner_code |      name      | is_deleted
--------------------------------------+--------------+----------------+------------
 0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2 | P-2026-0017  | 원주에어컨공업 | f
(1 row)

              partner_id              | sales_total | receivable_debit
--------------------------------------+-------------+------------------
 0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2 | 20000000.00 |      22000000.00
(1 row)
```

실려야 할 집합 대 실제 코드 필터 재현:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT s.status, COUNT(DISTINCT s.id) AS should_slips, COUNT(l.id) AS should_lines, SUM(l.supply_amount+l.vat_amount) AS should_amount, COUNT(DISTINCT s.id) FILTER (WHERE s.partner_code='P-2026-0017') AS actual_slips_by_ui_code, COUNT(l.id) FILTER (WHERE s.partner_code='P-2026-0017') AS actual_lines_by_ui_code, COALESCE(SUM(l.supply_amount+l.vat_amount) FILTER (WHERE s.partner_code='P-2026-0017'),0) AS actual_amount_by_ui_code FROM slips s JOIN slip_lines l ON l.slip_id=s.id AND l.is_deleted=false WHERE s.is_deleted=false AND s.slip_type='OUTBOUND' AND s.status IN ('INSPECTING','COMPLETED','SHIPPING','DELIVERED','CONFIRMED') AND s.slip_date BETWEEN DATE '2026-02-01' AND DATE '2026-03-31' AND s.partner_id='0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2'::uuid GROUP BY s.status;"
```

출력 원문:

```text
   status   | should_slips | should_lines | should_amount | actual_slips_by_ui_code | actual_lines_by_ui_code | actual_amount_by_ui_code
------------+--------------+--------------+---------------+-------------------------+-------------------------+--------------------------
 INSPECTING |            1 |            2 |   12276000.00 |                       0 |                       0 |                        0
(1 row)
```

## D2. 같은 날짜의 무패딩 문서번호가 문자열 순서로 정렬되어 중간 누적잔액이 잘못 귀속된다

- 위치:
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadService.java:72-75`
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java:80-89`
  - `clients/desktop/src/renderer/api/partnerLedgerApi.ts:130-161`
- 원인: slip의 권위 순서는 `seqNo`지만 accounting이 병합 뒤 `date, documentNo` 문자열로 다시 정렬한다. 무패딩 `...-10`은 `...-2`보다 먼저 온다. FE는 이 문서 순서를 그대로 보존해 누적잔액을 계산한다.
- 사용자 조작: 같은 거래처·같은 날짜에 2번과 10번 출고전표를 만들고 출고 완료(`INSPECTING` 이상)까지 처리 → 해당 기간 거래처 원장 조회.
- 잘못된 결과: 10번 2,760,000원이 2번 750,000원보다 먼저 표시되어 중간 잔액이 `2,760,000 → 3,510,000`으로 귀속된다. 권위 `seqNo` 순서는 `750,000 → 3,510,000`이다.
- 페이지 연속성 자체는 결함이 없다. 신규 read endpoint는 페이지 인자가 없는 전체 documents 응답이고 FE도 단일 배열에서 한 번 누적하므로 데이터 페이지 경계에서 잔액이 리셋되지 않는다.

재현 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "WITH d AS (SELECT s.slip_no AS document_no, s.seq_no, SUM(COALESCE(l.supply_amount,0)+COALESCE(l.vat_amount,0)) AS amount FROM slips s JOIN slip_lines l ON l.slip_id=s.id AND l.is_deleted=false WHERE s.is_deleted=false AND s.slip_type='OUTBOUND' AND s.slip_date=DATE '2026-05-31' AND s.seq_no IN (2,10) GROUP BY s.slip_no,s.seq_no) SELECT document_no,seq_no,amount,SUM(amount) OVER (ORDER BY document_no ROWS UNBOUNDED PRECEDING) AS code_order_balance,SUM(amount) OVER (ORDER BY seq_no ROWS UNBOUNDED PRECEDING) AS sequence_order_balance FROM d ORDER BY document_no;"
```

출력 원문:

```text
  document_no  | seq_no |   amount   | code_order_balance | sequence_order_balance
---------------+--------+------------+--------------------+------------------------
 2026/05/31-10 |     10 | 2760000.00 |         2760000.00 |             3510000.00
 2026/05/31-2  |      2 |  750000.00 |         3510000.00 |              750000.00
(2 rows)
```

## D3. 대량 원장의 합계·기말잔액이 모든 인쇄 페이지에 반복된다

- 위치:
  - `clients/desktop/src/renderer/print/PartnerLedgerView.tsx:335-361`
  - `clients/desktop/src/renderer/styles/global.css:2766-2769`
  - `clients/desktop/src/renderer/print/PartnerLedgerView.module.css:274-303`
- 원인: 합계와 기말잔액이 `<tfoot>`에 있고 전역 인쇄 CSS가 `tfoot { display: table-footer-group; }`를 강제한다. Chromium은 이를 각 페이지의 반복 footer로 취급한다.
- 사용자 조작: 같은 거래처를 장기 기간으로 조회해 원장 라인이 여러 A4 페이지를 넘는 상태에서 인쇄 미리보기 → 인쇄/PDF.
- 잘못된 결과: 합계와 기말잔액이 마지막 페이지에 한 번만 나오는 대신 각 페이지에 반복되어 중간 페이지도 마감된 원장처럼 보인다.

파일을 만들지 않는 Chromium 최소 재현(제품의 `thead/tfoot` 구조와 89행 스트레스 입력):

```powershell
cd clients/desktop
@'
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
(async()=>{
 const browser=await chromium.launch({headless:true}); const page=await browser.newPage();
 const rows=Array.from({length:89},(_,i)=>`<tr><td>2026-08-03</td><td>S-${i+1}</td><td>DELIVERY ADDRESS</td><td>ITEM ${i+1}</td><td>${(i+1)*1000}</td><td>ZERO</td><td>${(i+1)*1000}</td></tr>`).join('');
 await page.setContent(`<style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}table{width:100%;border-collapse:collapse;font-size:9.5pt}td,th{border:1px solid #aaa;padding:1.8mm 2.5mm}tr{page-break-inside:avoid}thead{display:table-header-group}tfoot{display:table-footer-group}</style><table><thead><tr><th>DATE</th><th>DOC</th><th>ADDRESS</th><th>DESC</th><th>DEBIT</th><th>CREDIT</th><th>BAL</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan=4>TOTALMARK</td><td>4,005,000</td><td>ZERO</td><td>ZERO</td></tr><tr><td colspan=6>CLOSINGMARK</td><td>4,005,000</td></tr></tfoot></table>`);
 const pdf=await page.pdf({format:'A4',printBackground:true}); await browser.close();
 const py=`import sys,io,json\nfrom pypdf import PdfReader\nr=PdfReader(io.BytesIO(sys.stdin.buffer.read()))\nt='\\n'.join((p.extract_text() or '') for p in r.pages)\nprint(json.dumps({'pages':len(r.pages),'totalLabels':t.count('TOTALMARK'),'closingLabels':t.count('CLOSINGMARK'),'last':t[-300:]},ensure_ascii=True))`;
 const out=spawnSync('python',['-c',py],{input:pdf,encoding:'utf8'}); console.log(out.stdout); if(out.stderr) console.error(out.stderr);
})().catch(e=>{console.error(e);process.exit(1)})
'@ | node -
```

출력 원문:

```text
{"pages": 4, "totalLabels": 4, "closingLabels": 4, "last": "DELIVERY ADDRESS ITEM 87 87000 ZERO 87000\nTOTALMARK 4,005,000 ZERO ZERO\nCLOSINGMARK 4,005,000\nDATE DOC ADDRESS DESC DEBIT CREDIT BAL\n2026-08-03 S-88 DELIVERY ADDRESS ITEM 88 88000 ZERO 88000\n2026-08-03 S-89 DELIVERY ADDRESS ITEM 89 89000 ZERO 89000\nTOTALMARK 4,005,000 ZERO ZERO\nCLOSINGMARK 4,005,000"}
```

현재 DB의 89라인은 31개 전표 전체 합산이며 단일 거래처 실측이 아니다. 위 89행은 행 제한/페이지네이션 없는 정상 사용자 계약의 다페이지 경계를 재현하는 스트레스 입력이다.

## D4. 인쇄 누적잔액·기말잔액의 음수가 빨강이 아니다

- 위치:
  - `clients/desktop/src/renderer/print/PartnerLedgerView.tsx:200-203,324-331,355-356`
  - `clients/desktop/src/renderer/print/PartnerLedgerView.module.css:185-188`
- 원인: fix는 차변/대변 셀에만 음수 색상 분기를 추가했다. 누적잔액과 기말잔액은 `formatBalance()`로 `-X`는 만들지만 `.balanceCell { color: #111827; }` 고정이라 검정이다.
- 사용자 조작: `P-2026-0005`(대구HVAC솔루션), `2026-07-04 ~ 2026-07-07` 조회 → 집계 행 클릭 → 인쇄 미리보기.
- 잘못된 결과: 확정 수금만 있는 원장의 누적잔액 `-120,000 → -200,000 → -277,000` 및 기말 `-277,000`이 빨강이 아닌 검정으로 표시된다. 본문 원장은 `amountStyle(ln.balance)`로 빨강이라 본문과 인쇄도 불일치한다.

재현 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -P pager=off -c "SELECT transaction_date,slip_no,amount, -SUM(amount) OVER (ORDER BY transaction_date,slip_no ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS expected_ledger_balance FROM cash_receipts WHERE is_deleted=false AND status='CONFIRMED' AND partner_id='8f2bc08a-c6f3-3bc3-af98-7fdd58d2b38e' ORDER BY transaction_date,slip_no;"
rg -n "line\.debit < 0|line\.credit < 0|formatBalance\(line.balance\)|formatBalance\(data.closingBalance\)" clients/desktop/src/renderer/print/PartnerLedgerView.tsx
```

출력 원문:

```text
 transaction_date |    slip_no    |  amount   | expected_ledger_balance
------------------+---------------+-----------+-------------------------
 2026-07-04       | 2026/07/04-11 | 120000.00 |              -120000.00
 2026-07-04       | 2026/07/04-13 |  80000.00 |              -200000.00
 2026-07-07       | 2026/07/07-2  |  77000.00 |              -277000.00
(3 rows)

324: ... style={{ color: line.debit < 0 ? '#DC2626' : undefined }}>
327: ... style={{ color: line.credit < 0 ? '#DC2626' : undefined }}>
331:                    {formatBalance(line.balance)}
356:                  {formatBalance(data.closingBalance)}
```

## 결함이 아닌 것으로 확인한 표면

### 배송주소 없음

현재 대상 31문서·89라인 모두 주소가 null/blank다. `PartnerLedgerView.tsx:322`가 `line.deliveryAddress || '—'`로 표시하므로 행 누락이나 crash가 없다.

### 0·코드 prefix·502 fail-closed

- 본문 `fmtKrw`와 인쇄 `formatBalance`는 0을 모두 `—`로 표시한다.
- 신규 adapter는 `accountCode/accountName`을 빈 문자열로 만들고 화면/인쇄는 코드 prefix를 표시하지 않는다.
- 선택 거래처 조회는 `PartnerLedgerReadService.java:40-43`의 `requireFound`, 수금 표시명은 `:58-64`의 batch 결과 누락 throw를 거친다. `PARTNER_IDENTITY_LOOKUP_UNAVAILABLE`은 `BAD_GATEWAY`로 매핑되어 read report가 502 fail-closed한다.

### VAT 무회귀

`PartnerLedgerSalesResponse.java:78-89`는 저장된 `supplyAmount + vatAmount`를 우선하고 FE는 `lineAmount`를 debit으로 한 번만 사용한다. 신규 `INSPECTING`·`SHIPPING` 27라인의 비권위 fallback 0, 계약 mismatch 0, 합계 156,645,500원이다. 기존 62라인 197,476,400원과 합쳐 354,121,900원이다.

출력 원문:

```text
   status   | source_type | lines | fallback_lines | supply_sum  |  vat_sum   | dto_line_amount_sum | line_supply_mismatch | stored_amount_vs_price_mismatch
 COMPLETED  | MANUAL      |    17 | 0 | 53175000.00 | 5317500.00 | 58492500.00  | 0 | 0
 CONFIRMED  | MANUAL      |    10 | 0 | 29217000.00 | 2921700.00 | 32138700.00  | 0 | 0
 DELIVERED  | MANUAL      |    35 | 0 | 97132000.00 | 9713200.00 | 106845200.00 | 0 | 0
 INSPECTING | MANUAL      |    12 | 0 | 79856000.00 | 7985600.00 | 87841600.00  | 0 | 0
 SHIPPING   | MANUAL      |    15 | 0 | 62549000.00 | 6254900.00 | 68803900.00  | 0 | 0
(5 rows)

  cohort  | lines | non_authoritative_lines | ledger_amount | supply_only  |  vat_only   | dto_vs_stored_contract_mismatch
----------+-------+-------------------------+---------------+--------------+-------------+--------------------------------
 NEW_27   |    27 |                       0 |  156645500.00 | 142405000.00 | 14240500.00 |                              0
 PRIOR_62 |    62 |                       0 |  197476400.00 | 179524000.00 | 17952400.00 |                              0
(2 rows)
```

## 데스크톱 typecheck 실측

실행 명령:

```powershell
cd C:\dev\Samhan-Public\.claude\worktrees\t1001b\clients\desktop
npm.cmd run typecheck
```

출력 원문(종료 코드 포함):

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도] typecheck 대상 확인 완료 — 이 확인은 design-system dist 최신성 · electron-updater 설치 버전 일치만 봅니다. node_modules 의 file: 링크 무결성이나 그 외 일반 의존성 상태는 다루지 않으며, 그런 문제는 이어지는 tsc/vitest 원본 오류로 드러납니다.

> @samhan/desktop@0.1.0 typecheck:real-qa
> node --test scripts/real-qa-cleanup-scope.test.cjs && node --test scripts/real-qa-scope.test.cjs

✔ playwright/869-ds4-real-qa/869-ds4-real-qa.spec.ts keeps cleanup id outside its try block (13.8307ms)
✔ playwright/869-ds4-real-qa/ds4-body-layer-regression-real-qa.spec.ts keeps cleanup id outside its try block (6.2926ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 209.4665
[real-QA 추적 집합 불일치] 공식 공유 하네스 실행을 중단합니다.
디스크에는 있지만 Git 추적 목록에는 없는 스펙(공식 수치에 섞이지 않음):
- clients/desktop/playwright/n1b-native-qa/r2fix-untracked-only-real-qa.spec.ts
의도적으로 미추적 로컬 스펙만 실행하려면 REAL_QA_ALLOW_UNTRACKED=1 을 설정하고 명시 경로를 전달하십시오.
[real-QA 로컬 실행 모드] 위 차집합은 의도 실행으로 허용했으며 공식 수치로 사용하지 마십시오.
✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다(.gitignore 가 허용한 로컬 스펙은 예외) (240.4145ms)
✔ F-2: .gitignore 등재 경로 안의 추적 스펙 2개가 공식 집합에 남는다 (220.2319ms)
✔ 결함6 참고: 구 assert.equal 방식은 추적 스펙이 늘기만 해도 실패했다(합성 173 vs 172, 고정 실측) (1.1792ms)
✔ 결함1: REAL_QA_ALLOW_UNTRACKED 세션 잔존은 명시 경로 없는 전체 실행을 오염시키지 않는다 (970.8491ms)
✔ F-1 RED: playwright/ 전체 위치 인자는 남은 ALLOW_UNTRACKED 로 우회되지 않는다 (778.0679ms)
✔ 결함1 핵심: 집합이 깨끗해도 명시 경로 없는 real-QA 전체 실행은 차단한다 (0.3191ms)
✔ 결함1 U-1: 예외 모드 경고가 stdout 에도 남는다(1> 리다이렉트로도 보여야 함) (872.275ms)
✔ 결함2: allowUntracked 는 집합이 줄어드는 방향(missingFiles)을 절대 덮지 않는다(#864 계열) (772.5542ms)
✔ 결함3: 미추적 로컬 스펙이 있어도 추적 스펙만의 격리 실행은 막지 않는다(플래그 불필요) (729.9019ms)
✔ 결함3 보강: narrow 실행에 미추적 스펙 자신이 포함되면 여전히(플래그 없이는) 막는다 (728.6935ms)
✔ 결함1·3 실측 보강: 워커 프로세스처럼 argv 가 비어도 narrow 실행이 유지된다(부모→자식 전파) (1092.547ms)
✔ 결함8: core.quotepath 8진 이스케이프가 걸려도 비ASCII 추적 real-QA 스펙을 잃지 않는다 (944.5613ms)
✔ 재수렴 결함1: .gitignore 로 커버된 untracked 스펙은 unexpectedUntrackedFiles 에서 빠진다 (753.9177ms)
✔ 재수렴 결함1: .gitignore 로 커버되지 않는 untracked 스펙은 여전히 unexpectedUntrackedFiles 에 남는다(#864 계열 회귀 보존) (791.8841ms)
✔ 재수렴 결함1 단위: listGitignoredUntrackedRealQaFiles 는 .gitignore 로 무시된 untracked 파일만 반환한다 (704.9577ms)
✔ 재수렴 결함1 회귀: compareRealQaScope 의 gitignoredFiles 기본값(생략)은 전부 unexpectedUntrackedFiles 로 취급한다 (0.2483ms)
✔ 재수렴 결함2: 정규식 이스케이프 `\.`(리터럴 점) 인자가 백슬래시 정규화로 깨지지 않는다 (999.6779ms)
✔ 재수렴 결함2: 정규식 이스케이프 `\d`(숫자 클래스) 인자가 과차단되지 않는다 (833.669ms)
✔ 재수렴 결함2: 문자 클래스 `[0-9]` 인자가 과차단되지 않는다 (1089.1565ms)
✔ 재수렴 결함2: 와일드카드 `.*` 인자가 과차단되지 않고 여러 파일에 걸쳐 매치한다 (1081.5954ms)
✔ 재수렴 결함2 회귀: 원시 정규식이 0건일 때만 백슬래시 경로 관용 표기로 폴백한다(과잉 폴백 방지) (1200.8969ms)
✔ 재수렴 결함4: --project 가변인자(공백형 다중값)의 두 번째 값이 위치 인자로 오분류되지 않는다 (0.5284ms)
✔ 재수렴 결함4: --project 가변인자 뒤에 진짜 위치 인자(스펙 경로)가 오면 그것만 후보로 잡는다 (0.2983ms)
✔ 재수렴 결함4: --project 값 1개(단일)는 기존처럼 정상 동작한다(회귀 보존) (0.1555ms)
✔ R2-1 글롭 인자: `<접두사>-*` 형태로 추적 스펙 2개만의 격리 실행이 통과한다 (978.3093ms)
✔ R2-1 조각(fragment) 인자 — 여러 파일에 걸치는 조각(예: 825-s5) (870.1502ms)
✔ R2-1 조각(fragment) 인자 — 파일 하나만 골라내는 조각(예: null-semantics)은 형제 파일을 끌어오지 않는다 (837.6907ms)
✔ R2-1 절대경로(정방향 슬래시) 인자로 추적 스펙 격리 실행이 통과한다 (743.9115ms)
✔ R2-1 I-3: 미추적 스펙 자신을 조각으로 지정 + ALLOW=1 이면 통과한다(R1 에서는 이 형태가 불가능했음) (851.5799ms)
✔ R2-1 U-2: 글롭 인자 + ALLOW=1 실행 시 "명시 경로가 있는 실행에만 적용" 모순 메시지가 더는 나오지 않는다 (703.5145ms)
✔ R2-1 회귀: 백슬래시 상대경로 인자(Windows 관용 표기)는 여전히 격리 실행을 통과한다 (746.1115ms)
✔ R2-1 경계: 알려진 파일 어디에도 없는 단어는 narrow 실행으로 오인되지 않는다 (761.7511ms)
✔ F-2 RED: Playwright 1.62가 제거하는 -- 뒤 토큰은 위치 인자로 보지 않는다 (0.1919ms)
✔ F-3 RED: Playwright가 실제로 매치하지 않는 repo-relative anchored 정규식은 게이트도 선택하지 않는다 (0.5892ms)
✔ F-3 RED: Windows file URL 정규식은 Playwright 후보처럼 게이트도 선택한다 (0.2007ms)
✔ F-4 RED: .git/info/exclude 로 무시한 rogue 스펙은 repo 정책 허용 목록에 들어가지 않는다 (462.7596ms)
✔ F-5 RED: Playwright 1.62 신규 값 옵션 -G 의 값은 위치 인자가 아니다 (0.196ms)
✔ F-5 RED: Playwright 1.62 신규 값 옵션 --last-failed-file 의 값은 위치 인자가 아니다 (0.0536ms)
✔ message: supplied location arguments with zero matches are not reported as no arguments (890.1624ms)
✔ R2-1 경계(신규 발견): 공백형 값 플래그(--reporter line 등)의 값이 실제 파일명 일부와 우연히 겹쳐도 narrow 오인되지 않는다 (0.274ms)
✔ R2-1 경계(신규 발견): 공백형 --workers 2 의 값 "2"도 narrow 오인되지 않는다 (0.1037ms)
✔ R2-2: --reporter=json 실행에서 예외 모드 경고가 stdout 을 오염시키지 않는다 (673.4145ms)
✔ R2-2: --reporter json (공백형)도 동일하게 stdout 을 건드리지 않는다 (695.4446ms)
✔ R2-2: --reporter=junit 도 stdout 을 건드리지 않는다 (941.829ms)
✔ R2-2 회귀: 기본(line) 리포터는 여전히 stdout+stderr 둘 다에 경고를 남긴다(R1 결함1 유지) (807.0274ms)
✔ R2-3: 내부 마커를 외부에서 export 해도(워커가 아니면) 명시 경로 없는 전체 실행은 여전히 막힌다 (674.7039ms)
✔ 결함4: 신선도 게이트는 mtime 만 바뀐 stale 상태를 여전히 막는다(회귀 확인) (16.3755ms)
✔ 결함4: REAL_QA_SKIP_FRESHNESS_CHECK 탈출구로 같은 stale 상태에서도 npm test 를 진행할 수 있다(U-5) (12.981ms)
✔ 결함5: 신선도 안내의 cd 명령이 출력 시점 cwd 기준으로 실제 design-system 경로를 가리킨다 (4.8292ms)
✔ 결함7: "확인 완료" 메시지가 실제 검사 대상만 명시하고 범위를 과장하지 않는다 (9.5112ms)
ℹ tests 50
ℹ suites 0
ℹ pass 50
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 26583.7232
__TYPECHECK_EXIT_CODE__=0
```

## 이번 라운드가 보지 않은 표면

- 금지된 `accounting-service` 전체 suite 및 전체 desktop Vitest/Playwright.
- 실제 Electron native print dialog, 실제 프린터/PDF의 한글 글꼴·물리 여백.
- partner-service 장애를 실제 HTTP로 주입한 502 관찰. 코드의 fail-closed 전파만 대조했다.
- Docker 이미지 재빌드 및 현재 HEAD를 공유 스택에 반영한 live endpoint 호출.
- fix 변경면 밖의 회계/전표 화면과 다른 PR 표면.

## 작업 무결성

- git은 조회 명령만 사용했다.
- 공유 DB에는 `SELECT`만 실행했다. write/DDL 없음.
- Docker 이미지 재빌드 없음.
- 제품 코드 수정 없음.
