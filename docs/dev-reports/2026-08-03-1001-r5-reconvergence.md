# 2026-08-03 #1001 R5 재수렴 — `partner_id` 원장 집합 정합성

## 조사 기록

### 1. 작업 기준 확인

- 지정 브랜치 `feat/1001-ledger-spec-rest`, HEAD `dfeef85106b0de8511ad6c86a7a52a6646983de7` 일치.
- 기존 변경은 없고 이 보고서만 신규(untracked) 상태.

```text
## feat/1001-ledger-spec-rest...origin/feat/1001-ledger-spec-rest
?? docs/dev-reports/2026-08-03-1001-r5-reconvergence.md
dfeef85106b0de8511ad6c86a7a52a6646983de7 [FIX] #1001 원장 조회를 partner_id 로 — 거래처 선택 시 매출 소실 해소
```

### 2. 저장소 규칙과 R4 기준 확인

- `AGENTS.md`, `.codex/AGENTS.md`, `docs/handoff/CURRENT-WORK.md`, 직전 R4 보고서를 읽었다.
- 이번 세션은 조사·보고서 작성만 수행하며 git/GitHub write, 공유 DB write/DDL, Docker rebuild, accounting-service 전체 suite를 수행하지 않는다.
- R4의 기준 데이터는 `P-2026-0017` → 내부 UUID `0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2`, 출고 1건·2라인·12,276,000원이다. R5에서는 이 결론을 독립 SQL과 실제 렌더 경로로 재검증한다.
- D2 정렬, D3 인쇄 반복, D4 인쇄 음수색 및 인쇄·표시·VAT·typecheck는 명시적으로 이월한다.

### 3. R4 변경점 확인

- `dfeef8510`은 accounting-service가 표시용 `partnerCode` 대신 해석한 `partnerId`를 slip-service `/internal/slips/partner-ledger-sales` query parameter로 전달하도록 바꿨다.
- `SlipRepository.findPartnerLedgerSales`는 `partnerId != null`이면 `s.partnerId = :partnerId`만 적용하고, `partnerId == null`일 때만 기존 `partnerCode` 필터로 fallback한다.
- 따라서 이번 각도의 핵심 검증점은 (a) partner UUID가 거래처별로 유일하게 해석되는지, (b) 대상 기간 출고에 NULL `partner_id`가 있는지, (c) 사용자 응답 경계에서 UUID가 제거되는지이다.

```text
dfeef8510 [FIX] #1001 원장 조회를 partner_id 로 — 거래처 선택 시 매출 소실 해소
.../PartnerLedgerSalesClient.java  + partnerId queryParam
.../PartnerLedgerReadService.java  salesClient.find(from, to, null, partnerId)
.../SlipRepository.java            partnerId 우선, partnerCode fallback
.../SlipInternalController.java    @RequestParam(required=false) UUID partnerId
```

### 4. 공유 DB 가용성과 slips 키 스키마 확인

- `samhan-postgres`는 healthy이며, `slip_db.public.slips`에 `partner_id uuid`와 `partner_code varchar`가 함께 존재한다.
- 아래는 읽기 전용 metadata `SELECT` 원문이다. 예상한 `slip_items` 테이블은 해당 이름으로 조회되지 않아 실제 라인 테이블명은 별도 metadata SELECT로 확인한다.

```text
samhan-postgres Up 19 hours (healthy)
 table_name | column_name  |     data_type
------------+--------------+-------------------
 slips      | id           | uuid
 slips      | slip_type    | character varying
 slips      | slip_date    | date
 slips      | status       | character varying
 slips      | partner_id   | uuid
 slips      | is_deleted   | boolean
 slips      | partner_code | character varying
(7 rows)
```

### 5. 실제 출고 라인 테이블 확인

- 라인 테이블은 `slip_lines`이며 금액 대조에 필요한 `quantity`, `unit_price`, `supply_amount`를 가진다.

```text
table_name | relevant_columns
-----------+------------------------------------------------
slip_lines | slip_id, quantity, unit_price, supply_amount
```

### 6. 거래처 기준 테이블 확인

- 화면의 거래처 선택을 UUID로 해석하는 기준 테이블은 `partner_db.public.partners(id, partner_code, name, is_deleted)`이다.

```text
table_name | columns
-----------+-------------------------------------
partners   | id, partner_code, name, is_deleted
```

### 7. 거래처 코드→UUID 해석 충돌 확인

- 활성 거래처 중 동일 `partner_code`를 가진 서로 다른 거래처는 0그룹/0건이다. 따라서 현재 실 데이터에서는 화면 코드 하나가 둘 이상의 UUID로 해석되어 두 원장이 합쳐지는 경로가 없다.

재현 명령:

```text
docker exec samhan-postgres psql -U samhan -d partner_db -P pager=off -c "SELECT COUNT(*) AS duplicated_active_codes, COALESCE(SUM(partner_count),0) AS partners_in_duplicated_codes FROM (SELECT partner_code, COUNT(*) AS partner_count FROM partners WHERE is_deleted=false AND NULLIF(BTRIM(partner_code),'') IS NOT NULL GROUP BY partner_code HAVING COUNT(*) > 1) d;"
```

출력 원문:

```text
 duplicated_active_codes | partners_in_duplicated_codes
-------------------------+------------------------------
                       0 |                            0
(1 row)

 partner_code | partner_count | names
--------------+---------------+-------
(0 rows)
```

### 42. 코드만 있는 DRAFT 3건의 향후 누락 가능성 판정

- `Slip.send()`는 `partnerId == null`이면 `INVALID_INPUT`으로 전송을 차단하고, 이후 `accept()`·`process()`·`complete()`도 `requirePartnerForCommitted()`를 호출한다.
- 따라서 코드만 있는 DRAFT 3건은 `partner_id` 없이 원장 대상 상태로 진입할 수 없다. 현재도 미래 전이도 `partner_id` 필터 때문에 조용히 사라지는 도달 가능한 경로가 아니다.
- 관련 코드: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java`의 `send`, `requirePartnerForCommitted`, `accept`, `process`, `complete`.

### 43. HEAD desktop renderer 기동

- 기존 `node_modules`를 사용해 mock OFF, API base `http://localhost:8080`으로 HEAD Vite renderer를 `http://127.0.0.1:5933`에 기동했다.
- HTTP 200, Vite ready 447ms를 확인했다. 신규 repo 파일은 만들지 않았고 로그는 `%TEMP%`에만 있다.

```text
status 200
VITE v5.4.21 ready in 447 ms
Local: http://127.0.0.1:5933/
```

### 44. 실제 브라우저 연결 결과

- in-app browser runtime의 available browser 목록이 빈 배열(`[]`)이라 HEAD renderer에 브라우저를 연결할 수 없었다.
- 별도 Playwright로 우회하지 말라는 browser skill 복구 지침을 따랐다. 따라서 “화면에서 실제로 나오는가”의 완전 E2E는 환경상 **미판정**이다.
- 다만 HEAD slip live endpoint에서 1전표·2라인·12,276,000원이 확인됐고, renderer/API 코드 경로는 이를 그대로 문서/라인으로 변환한다. 이를 실제 브라우저 확인으로 과장하지 않는다.

```text
No browser is available
available browsers: []
```

### 45. UUID 소비처/렌더 표면 전수 확인

- `PartnerLedgerReadService`에서 UUID는 거래처 코드 해석 후 내부 sales query와 `CashReceipt.partnerId` predicate에만 쓰인다(`:38-57`).
- `PartnerLedgerResponse`에는 UUID 문자열/필드명이 전혀 없다. slip 응답도 UUID 필드가 없다.
- desktop 페이지/API/인쇄 production 파일에서 `partnerId`/`slipId`/`lineId`/`journalId`는 구현 코드에 등장하지 않고 비노출 주석에만 있다. route와 request는 `partnerCode`, 전표 표시는 `documentNo`를 사용한다.
- live HEAD slip JSON에서도 UUID 값/property 0건이었다. 완전 브라우저 E2E는 미판정이지만, 도달 가능한 코드·실 응답 경계에서는 UUID 노출 결함 0이다.

### 46. 매출·수금 합계 최종 SQL 수치

- 문서형 원장의 수금 합계(`CONFIRMED cash_receipts`)와 회계 원장의 수금 합계(`CASH_RECEIPT`, 110계정 순대변)는 둘 다 0원으로 일치한다.
- 회계 원장의 매출 합계(`SLIP`, 110계정 순차변)는 22,000,000원이다. 문서형 원장의 live HEAD slip 합계 12,276,000원과 **9,724,000원 불일치**한다.

재현 명령:

```text
docker exec samhan-postgres psql -U samhan -d accounting_db -P pager=off -c "SELECT (SELECT COALESCE(SUM(cr.amount),0) FROM cash_receipts cr WHERE cr.is_deleted=false AND cr.status='CONFIRMED' AND cr.transaction_date BETWEEN DATE '2026-02-01' AND DATE '2026-03-31' AND cr.partner_id='0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2'::uuid) AS screen_receipt_total, COALESCE(SUM(jl.credit_amount-jl.debit_amount) FILTER (WHERE j.source_type='CASH_RECEIPT' AND jl.account_code='110'),0) AS journal_receipt_total, COALESCE(SUM(jl.debit_amount-jl.credit_amount) FILTER (WHERE j.source_type='SLIP' AND jl.account_code='110'),0) AS journal_sales_total FROM journals j JOIN journal_lines jl ON jl.journal_id=j.id AND jl.is_deleted=false WHERE j.is_deleted=false AND j.status IN ('POSTED','REVERSED') AND j.journal_date BETWEEN DATE '2026-02-01' AND DATE '2026-03-31' AND jl.partner_id='0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2'::uuid;"
```

출력 원문:

```text
 screen_receipt_total | journal_receipt_total | journal_sales_total
----------------------+-----------------------+---------------------
                    0 |                     0 |         22000000.00
(1 row)
```

### 47. 기존 Step 1 집계 API 직접 호출 시도

- old accounting 컨테이너의 `/accounting/sales/aggregate`를 user headers로 직접 호출하면 HTTP 403이었다. 직접 호출 헤더는 실제 gateway 권한 주입과 같지 않으므로 결과를 판정하지 않는다.
- gateway 경유 실제 경로로 다시 확인한다.

```text
StatusCode : 403
Body       :
```

### 48. Step 1 집계 API 실응답

- gateway 경유 `/accounting/sales/aggregate`와 `/api/accounting/sales/aggregate` 모두 200이며 대상 row는 `salesTotal=20,000,000`, `paymentTotal=0`, `receivableBalance=22,000,000`이다.
- 따라서 같은 사용자 조작에서 Step 1 “매출 합계”는 20,000,000원인데 Step 2 문서형 판매 합계는 12,276,000원이다. 사용자 화면 기준 차이는 **7,724,000원**이다.
- journal 110계정 VAT 포함 채권 22,000,000원과 비교하면 차이는 **9,724,000원**이다. VAT 규약을 판정하지 않고 두 비교 기준을 모두 명시한다.

출력 원문:

```text
PATH=/accounting/sales/aggregate HTTP=200
partnerCode partnerName salesTotal  paymentTotal receivableBalance
P-2026-0017 (원주에어컨공업) 20000000.00 0.00 22000000.00

PATH=/api/accounting/sales/aggregate HTTP=200
partnerCode partnerName salesTotal  paymentTotal receivableBalance
P-2026-0017 (원주에어컨공업) 20000000.00 0.00 22000000.00
```

> PowerShell 원문에서는 `partnerName`만 console encoding으로 깨졌으나 partner DB exact SELECT에서 `원주에어컨공업`임을 별도로 확인했다.

## 결함

### F-1 — Step 1 매출 합계와 Step 2 문서 원장 매출 합계 불일치

- 심각도: HIGH (같은 화면·같은 거래처·같은 기간에서 합계가 서로 다름)
- 파일:줄:
  - `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx:251` — Step 1 `getSalesAggregate`
  - `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx:256` — Step 2 `getLedgerData`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadService.java:47` — Step 2 판매문서를 slip-service에서 구성
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadService.java:55` — Step 2 수금을 `cash_receipts`에서 구성
- 사용자 조작: `/accounting/partner-ledger`에서 `2026-02-01~2026-03-31`, `P-2026-0017` 입력 후 조회 → 원주에어컨공업 row의 `원장 보기` 클릭.
- 잘못된 결과:
  - Step 1 실 API: 매출 합계 20,000,000원, 수금 합계 0원, 채권 잔액 22,000,000원.
  - Step 2 HEAD 판매 집합: `INSPECTING` 1건·2라인·12,276,000원, 수금 0원.
  - 사용자 화면의 “매출 합계” 기준 차이: **7,724,000원**.
  - VAT 포함 110계정 채권과 비교한 차이: **9,724,000원**. VAT 표시 규약은 이번 라운드에서 판정하지 않는다.
- 원인 증거: 회계 분개의 source UUID는 현재 slip DB에 없고, journal date `2026-02-18`인데 설명은 `전표 2026/05/03-8`이다. `partner_id` 혼입이 아니라 서로 다른 원천 집합/고아 회계 분개가 같은 거래처·기간 합계를 구성한다.

재현 명령 1 — Step 1과 같은 회계 분개 집계:

```text
docker exec samhan-postgres psql -U samhan -d accounting_db -P pager=off -c "SELECT j.source_type, j.status AS journal_status, jl.account_code, COUNT(*) AS lines, SUM(jl.debit_amount) AS debit, SUM(jl.credit_amount) AS credit FROM journals j JOIN journal_lines jl ON jl.journal_id=j.id AND jl.is_deleted=false WHERE j.is_deleted=false AND j.journal_date BETWEEN DATE '2026-02-01' AND DATE '2026-03-31' AND jl.partner_id='0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2'::uuid GROUP BY j.source_type, j.status, jl.account_code ORDER BY j.source_type, jl.account_code;"
```

출력 원문:

```text
 source_type | journal_status | account_code | lines |    debit    |   credit
-------------+----------------+--------------+-------+-------------+-------------
 SLIP        | POSTED         | 110          |     1 | 22000000.00 |        0.00
 SLIP        | POSTED         | 220          |     1 |        0.00 |  2000000.00
 SLIP        | POSTED         | 401          |     1 |        0.00 | 20000000.00
(3 rows)
```

## 조사 종료 검증

### 임시 프로세스 정리

- 본 세션이 띄운 HEAD slip-service `:28086`과 Vite renderer `:5933` listener를 종료했다. 잔여 listener는 0개다.

```text
LocalPort 28086 OwningProcess 34188
LocalPort 5933  OwningProcess 82116
remaining_listeners=0
```

재현 명령 2 — Step 2 HEAD 판매 집합과 같은 SQL:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT s.slip_no, s.slip_date, s.status, COUNT(sl.id) FILTER (WHERE sl.is_deleted=false) AS lines, COALESCE(SUM(sl.supply_amount + sl.vat_amount) FILTER (WHERE sl.is_deleted=false),0) AS ledger_sale_amount FROM slips s LEFT JOIN slip_lines sl ON sl.slip_id=s.id WHERE s.is_deleted=false AND s.slip_type='OUTBOUND' AND s.status IN ('CONFIRMED','DELIVERED','COMPLETED','SHIPPING','INSPECTING') AND s.slip_date BETWEEN DATE '2026-02-01' AND DATE '2026-03-31' AND s.partner_id='0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2'::uuid GROUP BY s.id, s.slip_no, s.slip_date, s.status ORDER BY s.slip_date, s.slip_no;"
```

출력 원문:

```text
   slip_no    | slip_date  |   status   | lines | ledger_sale_amount
--------------+------------+------------+-------+-------------------
 2026/03/08-1 | 2026-03-08 | INSPECTING |     2 |       12276000.00
(1 row)
```

재현 명령 3 — 고아 source 확인:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT slip_no, slip_date, slip_type, status, partner_id, partner_code, is_deleted FROM slips WHERE id='447d46f5-b66a-3c8c-82a1-489552ffacac'::uuid;"
```

출력 원문:

```text
 slip_no | slip_date | slip_type | status | partner_id | partner_code | is_deleted
---------+-----------+-----------+--------+------------+--------------+------------
(0 rows)
```

## 최종 판정

1. 다른 거래처 혼입: **0건**. 활성 거래처 코드 중복 0그룹, 원장 후보 31건은 서로 다른 UUID 31그룹이며 HEAD target 조회는 1건만 반환했다.
2. `partner_id` 전환 누락: **0건**. 원장 대상 전체 31/31, 지정 기간 25/25가 `partner_id` 보유. 코드만 있는 3건은 DRAFT이며 UUID 없이는 커밋 상태 전이가 차단된다.
3. 화면 실제 표시: HEAD slip live API에서 기대 `INSPECTING` 1건·2라인·12,276,000원 확인. 그러나 running accounting/슬립 Docker는 stale, 공유 accounting schema는 HEAD보다 뒤처짐, browser runtime은 unavailable이어서 완전 E2E는 **미판정**.
4. UUID 노출: 도달 가능한 내부 응답·accounting DTO·desktop API/route/print URL에서 **결함 0**. `partnerId`는 `/internal` 요청 query에만 있다.
5. 합계: 수금 0원은 일치. 매출은 Step 1 20,000,000원 vs Step 2 12,276,000원으로 **7,724,000원 불일치(F-1)**.

따라서 **이 각도에서 도달 가능한 결함 1건**이다. `partner_id` 자체의 혼입·누락 결함은 0건이며, 도달한 결함은 같은 화면의 회계 집계와 문서형 원장 집합 불일치다.

## 미판정

- 실제 데스크톱 브라우저 DOM end-to-end: browser runtime available 목록 `[]`.
- HEAD accounting endpoint: 실행 DB에 `cash_receipts.lines_json` migration이 없어 Flyway 비활성 read-only 기동이 schema validation에서 중단. 공유 DB DDL 금지 때문에 migration을 적용하지 않았다.
- 위 두 항목은 의심을 결함으로 세지 않았다.

## 이번 라운드에서 보지 않은 표면

- 인쇄 전반
- 표시 규약
- VAT 규약
- typecheck
- D2 정렬
- D3 인쇄 반복
- D4 인쇄 음수색

## 신규 파일

- `docs/dev-reports/2026-08-03-1001-r5-reconvergence.md`

### 40. 회계 분개 원천 확인

- 회계 분개는 `journal_date=2026-02-18`, 설명상 `전표 2026/05/03-8`, source UUID `447d46f5-b66a-3c8c-82a1-489552ffacac`이다.
- 원장 조회의 출고 `2026/03/08-1`과 문서번호/날짜가 다르다. source UUID를 slip DB에서 조회해 같은 거래처에 귀속된 별도 실전표인지 확인한다.

```text
2026/02/18-1 | 2026-02-18 | SLIP | 447d46f5-b66a-3c8c-82a1-489552ffacac | 전표 2026/05/03-8 자동 분개 (출하 매출) | POSTED
line 1 | 110 | debit 22000000.00 | 외상매출금 (부가세포함)
line 2 | 401 | credit 20000000.00 | 상품매출 (공급가액)
line 3 | 220 | credit  2000000.00 | 부가세예수금 (10%)
```

### 41. 회계 source UUID의 slip 존재 여부

- 회계 분개의 `source_ref_id=447d46f5-b66a-3c8c-82a1-489552ffacac`는 현재 `slip_db.slips`에 존재하지 않는다(0 rows).
- 따라서 22,000,000원 분개는 현재 출고 집합과 연결되지 않는 orphan/stale 회계 원천이다. 화면 원장은 현재 slip 집합 12,276,000원을 읽으므로 동일 거래처·회계기간 합계가 일치할 수 없다.

재현 명령:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT slip_no, slip_date, slip_type, status, partner_id, partner_code, is_deleted FROM slips WHERE id='447d46f5-b66a-3c8c-82a1-489552ffacac'::uuid;"
```

출력 원문:

```text
 slip_no | slip_date | slip_type | status | partner_id | partner_code | is_deleted
---------+-----------+-----------+--------+------------+--------------+------------
(0 rows)
```

### 8. `partner_id` / `partner_code` 채움률

- 전체 미삭제 전표 2,345건에는 `partner_id` NULL + 코드만 존재하는 행이 3건 있다.
- 그러나 원장 대상(`OUTBOUND` + 5개 상태) 31건은 전부 `partner_id`가 있고, 코드만 있는 행/양쪽 빈 행은 0건이다.
- 지정 기간 `2026-02-01~2026-03-31`의 원장 대상 25건도 전부 `partner_id`가 있어, **현재 원장 집합에서 `partner_id` 전환으로 빠지는 전표는 0건**이다. 전체 3건은 상태·유형을 추가 확인해 잠재 누락인지 판정한다.

재현 명령 핵심 조건:

```sql
WHERE is_deleted=false
  AND slip_type='OUTBOUND'
  AND status IN ('CONFIRMED','DELIVERED','COMPLETED','SHIPPING','INSPECTING')
```

출력 원문:

```text
             scope             | total | with_partner_id | with_partner_code | partner_id_only | partner_code_only | both_empty
-------------------------------+-------+-----------------+-------------------+-----------------+-------------------+------------
 all_non_deleted               |  2345 |             411 |               312 |             102 |                 3 |       1931
 ledger_eligible_all_dates     |    31 |              31 |                 0 |              31 |                 0 |          0
 ledger_eligible_target_period |    25 |              25 |                 0 |              25 |                 0 |          0
(3 rows)
```

### 10. 실 원장 후보의 거래처 분리 분포

- `P-2026-0017`은 활성 거래처 정확히 1건이며 UUID는 R4 기준과 일치한다.
- 원장 후보 31건은 서로 다른 `partner_id` 31개 그룹으로 분리되고 각 그룹은 전표 1건이다. 현재 실 데이터에서 서로 다른 거래처 전표가 동일 UUID 원장으로 합쳐진 사례는 0건이다.
- 후보의 `partner_code`는 전부 비어 있어 코드 기반으로는 분리할 수 없지만, UUID 기반에서는 31개 집합이 정확히 분리된다.

출력 원문(대상 및 집계 요약):

```text
                  id                  | partner_code |      name      | is_deleted
--------------------------------------+--------------+----------------+------------
 0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2 | P-2026-0017 | 원주에어컨공업 | f
(1 row)

partner_id별 GROUP BY 결과: 31 rows
각 row의 slips=1, populated_code_count=0
대상 UUID 0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2 역시 slips=1
```

### 11. 라인 금액 컬럼 확인

- `slip_lines`에는 `line_total`, `unit_price_with_vat`, `supply_amount`, `vat_amount`가 있다. 이번 각도에서는 R4/API가 원장 매출액으로 사용하는 컬럼을 코드에서 확인한 뒤 동일 식으로 SQL 대조한다. VAT 표시 규약 자체는 조사하지 않는다.

```text
quantity integer
unit_price numeric
line_total numeric
unit_price_with_vat numeric
supply_amount numeric
vat_amount numeric
```

### 12. API 매출액 계산식과 응답 DTO 확인

- `PartnerLedgerSalesResponse.lineAmount`는 `supply_amount + vat_amount`를 우선 사용하고, accounting-service는 라인 합으로 판매 문서 `amount`를 만든다.
- slip 내부 응답과 accounting 원장 응답은 전표번호·거래처코드·거래처명·라인만 담고 `partnerId`/전표 UUID/라인 UUID 필드가 없다.
- 코드 위치: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java`의 `from`/`lineAmount`, `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadService.java`의 `sale`/`responseDocument`.
- 실제 화면·URL까지의 UUID 비노출은 후속 렌더 경로에서 계속 확인한다.

### 13. `P-2026-0017` 대상 출고 집합 SQL 재현

- 지정 기간의 대상 UUID 조회 결과는 정확히 `INSPECTING` 출고 1건, 활성 라인 2건, 공급가 11,160,000원 + VAT 1,116,000원 = 원장 매출 12,276,000원이다.

재현 명령:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT s.slip_no, s.slip_date, s.status, COUNT(sl.id) FILTER (WHERE sl.is_deleted=false) AS lines, COALESCE(SUM(sl.supply_amount) FILTER (WHERE sl.is_deleted=false),0) AS supply_amount, COALESCE(SUM(sl.vat_amount) FILTER (WHERE sl.is_deleted=false),0) AS vat_amount, COALESCE(SUM(sl.supply_amount + sl.vat_amount) FILTER (WHERE sl.is_deleted=false),0) AS ledger_sale_amount FROM slips s LEFT JOIN slip_lines sl ON sl.slip_id=s.id WHERE s.is_deleted=false AND s.slip_type='OUTBOUND' AND s.status IN ('CONFIRMED','DELIVERED','COMPLETED','SHIPPING','INSPECTING') AND s.slip_date BETWEEN DATE '2026-02-01' AND DATE '2026-03-31' AND s.partner_id='0beb5a9c-00c1-3b69-aa42-e32bd6dc77d2'::uuid GROUP BY s.id, s.slip_no, s.slip_date, s.status ORDER BY s.slip_date, s.slip_no;"
```

출력 원문:

```text
   slip_no    | slip_date  |   status   | lines | supply_amount | vat_amount | ledger_sale_amount
--------------+------------+------------+-------+---------------+------------+--------------------
 2026/03/08-1 | 2026-03-08 | INSPECTING |     2 |   11160000.00 | 1116000.00 |        12276000.00
(1 row)
```

### 14. 실행 중 서비스 가용성

- 실제 호출 가능한 `samhan-slip-service`(localhost:18086), `samhan-accounting-service`(localhost:8087), `samhan-api-gateway`(localhost:8080), `samhan-partner-service`(localhost:8095)가 모두 healthy다.
- Docker 이미지는 재빌드하지 않는다. 실행 컨테이너가 HEAD 계약을 포함하는지는 내부 endpoint 응답으로 판별하며, 포함하지 않으면 실제 화면 결과는 미판정으로 분류한다.

```text
samhan-slip-service       127.0.0.1:18086->8086/tcp Up 16 hours (healthy)
samhan-accounting-service 127.0.0.1:8087->8087/tcp  Up 19 hours (healthy)
samhan-api-gateway        127.0.0.1:8080->8080/tcp  Up 19 hours (healthy)
samhan-partner-service    127.0.0.1:8095->8095/tcp  Up 19 hours (healthy)
```

### 15. 데스크톱 렌더 경로 추적

- 사용자 조작은 `/accounting/partner-ledger`에서 시작일·종료일·거래처 코드 입력 → `조회` → 집계 row의 `원장 보기` 클릭이다.
- 화면 상태와 네트워크 요청은 끝까지 `partnerCode`만 사용한다. 상세 호출은 `GET /accounting/journals/partner-ledger?partnerCode=...&from=...&to=...`이며 UUID는 브라우저 query/route/state에 없다.
- 인쇄 URL도 `/#/print/partner-ledger?partnerCode=&from=&to=`만 사용한다. 인쇄 규약은 이월하지만 URL UUID 비노출만 확인했다.
- 관련 코드: `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx`의 `buildPrintUrl`, `selectedPartner`, 조회 input/row click; `clients/desktop/src/renderer/api/partnerLedgerApi.ts`의 `getLedgerData`.

### 16. 실 API 호출 1차 시도

- 실행 중 gateway의 `POST /api/auth/login`은 토큰 없는 요청을 401 `UNAUTHORIZED`로 거부했다. 현재 배포 라우팅이 저장소 seed 스크립트의 경로와 다르므로 `/auth/login` 계약을 재확인한다.
- 이 실패만으로 화면 결과를 판정하지 않는다.

```text
401
{"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}
```

### 17. 실 API 호출 2차 시도

- `POST /auth/login`도 401이며 토큰이 발급되지 않았다. 비밀번호를 추가 추측하지 않고 auth controller/실 QA 하네스의 현재 로그인 계약을 읽어 정확한 경로와 필드만 확인한다.

```text
hasToken : False
Invoke-RestMethod : The remote server returned an error: (401) Unauthorized.
```

### 18. 실 로그인 계약 확인

- 현재 실 QA 계정 `dev_master`로 gateway `POST /api/auth/login`이 성공했고 MASTER 토큰과 userId가 발급됐다. 토큰 원문은 출력·저장하지 않았다.

```text
success   : True
hasToken  : True
role      : MASTER
hasUserId : True
```

### 19. 실 원장 API 1차 호출

- gateway `GET /api/accounting/journals/partner-ledger`는 인증 후에도 HTTP 400을 반환했다. 오류 body를 별도 캡처해 배포 컨테이너 계약 불일치인지 입력 문제인지 판정한다.

```text
Invoke-RestMethod : 원격 서버에서 (400) 잘못된 요청 오류를 반환했습니다.
```

### 23. 사용자 헤더 포함 실 API 호출

- `Authorization`, `X-User-Id`, `X-User-Role`을 모두 넣어도 동일한 빈-body HTTP 400이다. 헤더 누락 문제는 아니다.

```text
StatusCode : 400
Body       :
```

### 26. accounting 400 원문 확보

- `curl.exe --get --data-urlencode`로 body를 확보했다. accounting-service가 `INVALID_INPUT`/“요청 파라미터 형식이 올바르지 않습니다.”를 반환한다.
- 날짜/거래처 중 어느 parameter binding이 실패하는지 최소 호출로 분리한다.

```text
HTTP/1.1 400
Content-Type: application/json

{"success":false,"code":"INVALID_INPUT","message":"요청 파라미터 형식이 올바르지 않습니다.","data":null,"timestamp":"2026-08-02T20:57:42.030589609Z"}
```

### 27. parameter 최소 분리

- `from+to`만 보낸 호출과 `partnerCode`만 보낸 호출이 모두 동일 400이다. 특정 날짜나 거래처 코드 값 하나의 형식 문제로 분리되지 않는다.
- 실행 컨테이너가 HEAD의 신규 endpoint mapping을 포함하는지 OpenAPI/mapping으로 확인한다.

```text
from+to only:      INVALID_INPUT, HTTP=400
partnerCode only:  INVALID_INPUT, HTTP=400
```

### 28. 실행 accounting 컨테이너의 HEAD 포함 여부

- `http://localhost:8087/v3/api-docs`에 `/accounting/journals/partner-ledger`가 없다. 즉 현재 healthy 컨테이너는 HEAD `dfeef8510` 이전 이미지다.
- 앞선 400은 신규 controller 실행 결과가 아니라, 존재하지 않는 path를 fallback 처리한 결과다. 따라서 이 컨테이너로 HEAD의 실제 화면 성공/실패를 판정하지 않는다.
- Docker 이미지는 재빌드하지 않는다. 허용 범위에서 worktree HEAD를 별도 로컬 프로세스로 실행할 수 있는지 확인한다.

```text
OPENAPI_HAS_PARTNER_LEDGER=false
```

### 29. 실행 slip 컨테이너의 R4 계약 포함 여부

- slip-service OpenAPI에는 `/internal/slips/partner-ledger-sales`와 `partnerId` parameter가 모두 있다. slip 컨테이너는 R4의 핵심 필터 계약을 포함한다.

```text
hasEndpoint  : True
hasPartnerId : True
pathMatches  : 1
```

### 30. 실행 slip 내부 endpoint 직접 호출

- `partnerId` query를 붙여 호출했지만 18전표·55라인·187,542,300원이 반환됐고 기대 `INSPECTING 2026/03/08-1`은 없었다. 응답 JSON 자체에는 UUID 값/`*id`·`*uuid` property가 0건이었다.
- 이 결과는 HEAD SQL과 정반대이며, 상태 집합도 R4 이전(`INSPECTING` 미포함) 형태다. OpenAPI의 전역 `partnerId` 문자열 확인이 해당 endpoint parameter를 보장하지 않았을 가능성이 높다.
- **아직 HEAD 결함으로 세지 않는다.** 해당 path operation의 parameter 목록을 구조적으로 파싱해 컨테이너 stale 여부를 판정한다.

```text
success                 : True
sales                   : 18
lines                   : 55
amount                  : 187542300
statuses                : DELIVERED,COMPLETED,...,CONFIRMED,...
slipNos                 : 2026/03/10-1,...,2026/02/01-1
uuidValueMatches        : 0
idOrUuidPropertyMatches : 0
```

### 36. HEAD accounting-service 별도 실행 1차 시도

- simple discovery 설정을 만들던 PowerShell hashtable brace 오류로 프로세스 시작 전에 중단됐다. 애플리케이션/DB에는 영향이 없다.

```text
Unexpected token '}' in expression or statement.
An empty pipe element is not allowed.
```

### 37. HEAD accounting-service 2차 기동 결과

- 별도 프로세스는 공유 `accounting_db`에 HEAD entity가 요구하는 `cash_receipts.lines_json` 컬럼이 없어 JPA schema validation 단계에서 종료했다.
- Flyway를 켜면 공유 DB DDL/write가 발생하므로 금지사항에 따라 재시도하지 않는다. 따라서 HEAD accounting API와 실제 화면 end-to-end는 현재 환경에서 **미판정** 후보이며, SQL/HEAD slip endpoint/렌더 경로로 도달 가능한 범위만 판정한다.

```text
healthy : False
status  : not-ready
Schema-validation: missing column [lines_json] in table [cash_receipts]
> Task :services:accounting-service:bootRun FAILED
BUILD FAILED in 18s
```

### 38. 회계 원장 대조 스키마 확인

- `accounting_db`에는 `cash_receipts(partner_id, amount, transaction_date, journal_id, status, is_deleted)`, `journals(journal_date, source_type, status, is_deleted, cash_receipt_id)`, `journal_lines(account_code, debit_amount, credit_amount, partner_id, is_deleted)`가 있다.
- 이 컬럼으로 동일 UUID·기간의 수금 합계와 회계 분개 차변/대변을 읽기 전용 SQL로 대조한다.

### 39. 대상 거래처 회계 합계 1차 대조

- 같은 UUID·기간 회계 분개에는 `SLIP/POSTED` 1건 묶음이 있고: 외상매출금(110) 차변 22,000,000원, VAT예수금(220) 대변 2,000,000원, 상품매출(401) 대변 20,000,000원이다.
- 확정/기타 상태를 포함해 `cash_receipts` 자체는 0건이다.
- 화면 판매문서 합계 12,276,000원과 회계 매출채권 차변 22,000,000원은 9,724,000원 차이가 난다. 동일 원천 문서인지 source ref를 확인하기 전에는 결함 판정을 보류한다.

출력 원문:

```text
 source_type | journal_status | account_code | lines |    debit    |   credit
-------------+----------------+--------------+-------+-------------+-------------
 SLIP        | POSTED         | 110          |     1 | 22000000.00 |        0.00
 SLIP        | POSTED         | 220          |     1 |        0.00 |  2000000.00
 SLIP        | POSTED         | 401          |     1 |        0.00 | 20000000.00
(3 rows)

 status | receipts | amount
--------+----------+--------
(0 rows)
```

### 31. 실행 slip 컨테이너 stale 확정

- 해당 OpenAPI operation parameter는 `from,to,partnerCode` 3개뿐이며 `partnerId`가 없다. §29의 전역 문자열 검사는 오판이므로 정정한다.
- 실행 slip 컨테이너 역시 HEAD 이전 이미지다. §30은 unknown `partnerId`가 무시되어 전체 기간 자료가 반환된 stale 환경 결과이며 PR HEAD 결함 증거가 아니다.

```text
operationId    : findPartnerLedgerSales
parameters     : from,to,partnerCode
parameterCount : 3
```

### 32. HEAD slip-service 별도 실행 시작

- Docker rebuild 없이 worktree HEAD를 `SERVER_PORT=28086`, Eureka 등록/조회 비활성, Flyway 비활성으로 `bootRun` 시작했다.
- Flyway를 꺼 공유 DB DDL/write를 차단하고 JPA `validate` + GET만 허용한다. 로그는 repo 밖 `%TEMP%/samhan-r5-slip-bootrun.*.log`에 둔다.

```text
To honour the JVM settings for this build a single-use Daemon process will be forked.
Daemon will be stopped at the end of the build
```

### 33. HEAD slip-service 1차 기동 결과

- 55초 내 health는 올라오지 않았고 프로세스는 `WarehouseCodeMapper`의 로컬 창고코드 `00003` UUID 설정 누락으로 종료했다. 컴파일 자체가 아니라 기동 환경 누락이다.
- 공유 DB write/DDL은 수행하지 않았고 Flyway는 비활성 상태였다. compose의 기존 창고 mapping 환경변수만 재사용해 1회 재시도한다.

```text
healthy : False
status  : not-ready

Caused by: java.lang.IllegalStateException: 창고 매핑 기동 검증 실패: 창고코드 '00003'
> Task :services:slip-service:bootRun FAILED
BUILD FAILED in 26s
```

### 34. HEAD slip-service 2차 기동 성공

- compose의 기존 로컬 창고 UUID mapping 4개만 주입한 재시도에서 `localhost:28086/actuator/health`가 `UP`이다.
- Docker image는 재빌드하지 않았고, Flyway/Eureka는 계속 비활성이다.

```text
healthy : True
status  : UP
```

### 35. HEAD slip 내부 endpoint 실데이터 검증

- HEAD endpoint는 지정 UUID/기간에 대해 기대 그대로 1전표·2라인·12,276,000원·`INSPECTING`·`2026/03/08-1`을 반환했다.
- 응답 JSON의 UUID 값과 이름에 `id`/`uuid`가 포함된 property는 모두 0건이다. `partnerId`는 요청 query에만 있고 응답에는 없다.
- console의 `partnerName` 한글은 PowerShell 렌더에서 깨졌으므로 이름 판정에는 사용하지 않는다. accounting의 partner snapshot과 실제 DOM에서 별도로 확인한다.

```text
success                 : True
sales                   : 1
lines                   : 2
amount                  : 12276000
statuses                : INSPECTING
slipNos                 : 2026/03/08-1
uuidValueMatches        : 0
idOrUuidPropertyMatches : 0
```

### 24. 서비스 로그 도달 여부

- 최근 10분 gateway/accounting/slip 로그에는 원장 요청이나 예외가 없고 Eureka 주기 로그만 있다. 요청이 accounting/slip controller까지 도달했다는 증거가 없다.
- gateway route 설정을 읽어 실제 prefix/rewrite를 확인한다.

### 25. gateway route와 accounting 직접 호출

- gateway에는 `/api/accounting/**`(StripPrefix=1), `/api/v1/accounting/**`(StripPrefix=2), `/accounting/**`(no-prefix) route가 모두 존재한다.
- gateway를 우회해 `localhost:8087/accounting/journals/partner-ledger`를 동일 사용자 헤더로 호출해도 빈-body HTTP 400이다. 원인은 accounting-service 내부이며 직후 로그를 확인한다.

```text
StatusCode : 400
Body       :
```

### 20. 실 원장 API 400 body 확인

- HTTP 400 응답 body는 비어 있었다. 저장소의 `apiClient` base URL과 gateway rewrite 규칙을 확인해 실제 브라우저와 동일한 URL로 다시 호출한다.

```text
StatusCode : 400
Body       :
```

### 21. 브라우저와 동일한 API URL 확인

- desktop `apiClient` 기본 base URL은 `http://localhost:8080`이고 `getLedgerData` path는 `/accounting/journals/partner-ledger`이다. 앞선 호출의 `/api/accounting/...`가 잘못됐다.
- controller의 실제 mapping도 `/accounting/journals/partner-ledger`다. `/api` prefix 없이 재호출한다.

### 22. 실 원장 API 2차 호출

- 정확한 `/accounting/journals/partner-ledger` 경로도 bearer token만으로는 HTTP 400이다. 실 QA 관례대로 로그인 응답의 userId/role을 gateway 전달 헤더에 함께 넣어 재호출하고, 동시에 서비스 로그로 원인을 확인한다.

```text
Invoke-RestMethod : 원격 서버에서 (400) 잘못된 요청 오류를 반환했습니다.
```

### 9. 코드만 채워진 3건의 원장 포함 여부

- 3건은 모두 `2026-05-30`, `OUTBOUND`, `DRAFT`, `P-2026-0005`이다.
- 현 조회 상태 집합에 `DRAFT`가 없으므로 R4 전후 모두 현재 원장에는 포함되지 않는다. 따라서 현재 누락 결함으로 세지 않는다.
- 향후 상태 전이 전에 `partner_id`가 보강되는지는 생성/전이 경로를 추적해 판정한다. 재현되지 않은 미래 의심은 결함으로 세지 않는다.

재현 명령:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -c "SELECT slip_no, slip_date, slip_type, status, partner_code, partner_name FROM slips WHERE is_deleted=false AND partner_id IS NULL AND NULLIF(BTRIM(partner_code),'') IS NOT NULL ORDER BY slip_date, slip_no;"
```

출력 원문:

```text
   slip_no    | slip_date  | slip_type | status | partner_code | partner_name
--------------+------------+-----------+--------+--------------+--------------
 2026/05/30-1 | 2026-05-30 | OUTBOUND  | DRAFT  | P-2026-0005 |
 2026/05/30-2 | 2026-05-30 | OUTBOUND  | DRAFT  | P-2026-0005 |
 2026/05/30-3 | 2026-05-30 | OUTBOUND  | DRAFT  | P-2026-0005 |
(3 rows)
```

## 조사 종료 요약

- 도달 가능한 결함: **1건(F-1, Step 1/Step 2 매출 합계 7,724,000원 불일치)**.
- `partner_id` 필터 자체의 타 거래처 혼입 0건, 원장 대상 누락 0건, 도달 가능한 UUID 노출 0건.
- 완전 브라우저 E2E는 browser unavailable + HEAD accounting schema 불일치로 미판정.
- 본 세션 임시 listener `:28086`, `:5933`은 종료했고 잔여 listener는 0개다.

### 보고서 최종 검증

- 신규 보고서 no-index whitespace warning 0건(`noindex_diff_exit=1`은 신규 파일 차이 존재 의미).
- tracked `git diff --check` 종료 0.
- git status에는 지정 브랜치와 신규 보고서 1개만 존재.
- 필수 판정 문구(결함 수, partner_id 누락, 화면, UUID, 합계 차이, 미판정, D2/D3/D4, 신규 파일) 전부 존재.
- 임시 listener 0개.

```text
noindex_diff_exit=1
whitespace_warning_lines=0
tracked_diff_check_exit=0
?? docs/dev-reports/2026-08-03-1001-r5-reconvergence.md
temporary_listener_count=0
```
