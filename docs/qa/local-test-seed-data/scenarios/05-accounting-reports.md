# 시나리오 5 — 회계 보고서 (이카운트 17 보고서 매핑)

> **목적**: 시드된 65 chart_of_accounts + 50 journals (POSTED 40 / DRAFT 5 / REVERSED 5) 를 기반으로 분개장 / 단건 조회 / 시산표 / 계정과목 트리 endpoint 검증
> **선행 조건**: 시나리오 1 통과 + accounting-service ready
> **소요 시간**: 약 7분
> **검증 대상**: accounting-service (AccountController / JournalController / TrialBalanceController)
> **인용**: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/{AccountController,JournalController,TrialBalanceController}.java` + `V1__init_accounting_service.sql`

---

## 0. 사전 가정 — accounting-service endpoint 매트릭스

`AccountController` / `JournalController` / `TrialBalanceController` Javadoc 인용:

| Endpoint | 권한 | 비고 |
|---|---|---|
| `GET  /accounting/accounts` | 모든 인증 사용자 | ChartOfAccount tree |
| `POST /accounting/journals` | ACCOUNTANT, MASTER | 분개 생성 (DRAFT) |
| `GET  /accounting/journals?from=&to=&status=` | ACCOUNTANT, MASTER | 페이지 조회 (from/to 필수) |
| `GET  /accounting/journals/{id}` | ACCOUNTANT, MASTER | 단건 + lines |
| `POST /accounting/journals/{id}/post` | ACCOUNTANT, MASTER | DRAFT → POSTED |
| `POST /accounting/journals/{id}/reverse` | ACCOUNTANT, MASTER | POSTED → REVERSED + 신규 역분개 자동 생성 |
| `GET  /accounting/balances?period=YYYYMM` | ACCOUNTANT, MASTER | 시산표 (POSTED+REVERSED(보상쌍 상쇄) 분개 라인 집계) |

> **현황** — 본 슬라이스는 분개장/시산표/계정과목 트리 만 활성. balance-sheet / income-statement / general-ledger 는 향후 슬라이스 (deferred). 본 시나리오는 활성 endpoint 만 검증.

---

## 1. STEP 1 — ACCOUNTANT 로그인

```sh
ACC_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"leeseongmi","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')
ACC_USER_ID=$(curl -sS http://localhost:8080/api/auth/me -H "Authorization: Bearer $ACC_TOKEN" | jq -r '.data.userId')
```

---

## 2. STEP 2 — 계정과목 트리 조회

```sh
curl http://localhost:8080/api/accounting/accounts \
  -H "Authorization: Bearer $ACC_TOKEN"
```

**기대 status**: `200 OK`
**기대 본문 (요약)**:

```json
{
  "ok": true,
  "data": [
    {"code":"100","name":"자산","category":"ASSET","parentCode":null,"isLeaf":false,"displayOrder":1000},
    {"code":"101","name":"현금","category":"ASSET","parentCode":"100","isLeaf":true,"displayOrder":1010},
    {"code":"102","name":"보통예금","category":"ASSET","parentCode":"100","isLeaf":true,"displayOrder":1020},
    {"code":"110","name":"외상매출금","category":"ASSET","parentCode":"100","isLeaf":true,"displayOrder":1100},
    {"code":"200","name":"부채","category":"LIABILITY","parentCode":null,"isLeaf":false,"displayOrder":2000},
    {"code":"201","name":"외상매입금","category":"LIABILITY","parentCode":"200","isLeaf":true,"displayOrder":2010},
    {"code":"220","name":"부가세예수금","category":"LIABILITY","parentCode":"200","isLeaf":true,"displayOrder":2200},
    {"code":"300","name":"자본","category":"EQUITY",...},
    {"code":"400","name":"매출","category":"REVENUE",...},
    {"code":"401","name":"상품매출","category":"REVENUE","parentCode":"400","isLeaf":true,...},
    {"code":"500","name":"매출원가","category":"COST_OF_SALES",...},
    {"code":"800","name":"판관비",...},
    {"code":"900","name":"영업외",...}
  ]
}
```

**검증 포인트**:
- [ ] `data.length >= 65` (V1 시드 — 50 leaf + 그룹 헤더)
- [ ] code 오름차순 정렬
- [ ] 7-그룹 (100/200/300/400/500/800/900) 모두 포함
- [ ] 한국어 name 깨짐 X
- [ ] `code='110'` `name='외상매출금'` (한국 표준)
- [ ] `code='401'` `name='상품매출'`
- [ ] `code='220'` `name='부가세예수금'`

### 2.1 ASSET category 만 (만일 filter 지원 시)

본 controller 는 query filter 미지원 (전체 트리만 반환). FE 가 client-side `filter(c => c.category === 'ASSET')` 적용.

```sh
# JQ 클라이언트 측 필터 검증
curl -s http://localhost:8080/api/accounting/accounts -H "Authorization: Bearer $ACC_TOKEN" \
  | jq '.data | map(select(.category == "ASSET")) | length'
```

**기대값**: `>= 22` (자산 21 leaf + 그룹 헤더 1).

---

## 3. STEP 3 — 분개장 페이지 조회 (50 row)

```sh
curl "http://localhost:8080/api/accounting/journals?from=2026-04-01&to=2026-05-31&page=0&size=50" \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "content": [
      {"id":"...","journalNo":"20260501-001","journalDate":"2026-05-01","status":"POSTED","description":"..."},
      ...
    ],
    "totalElements": 50,
    "totalPages": 1,
    "size": 50,
    "number": 0
  }
}
```

**검증 포인트**:
- [ ] `data.totalElements == 50` (시드)
- [ ] `data.content.length == 50`

### 3.1 status 필터별 검증

```sh
curl "http://localhost:8080/api/accounting/journals?from=2026-04-01&to=2026-05-31&status=POSTED" \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT"
```

**기대값**: `data.totalElements == 40`

```sh
curl "http://localhost:8080/api/accounting/journals?from=2026-04-01&to=2026-05-31&status=DRAFT" \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT"
```

**기대값**: `data.totalElements == 5`

```sh
curl "http://localhost:8080/api/accounting/journals?from=2026-04-01&to=2026-05-31&status=REVERSED" \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT"
```

**기대값**: `data.totalElements == 5`

---

## 4. STEP 4 — 분개 단건 조회

POSTED 분개 1건 sample:

```sh
JOURNAL_ID=$(docker exec -t samhan-postgres psql -U samhan -d accounting_db -At \
  -c "SELECT id FROM journals WHERE status='POSTED' AND NOT is_deleted ORDER BY journal_date LIMIT 1;")

curl http://localhost:8080/api/accounting/journals/$JOURNAL_ID \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "id": "<UUID>",
    "journalNo": "20260501-001",
    "journalDate": "2026-05-01",
    "status": "POSTED",
    "description": "5월 1주차 매출 분개",
    "sourceType": "MANUAL",
    "postedAt": "2026-05-01T...",
    "postedBy": "<user_id>",
    "lines": [
      {"lineNo":1,"accountCode":"110","accountName":"외상매출금","debitAmount":1100000,"creditAmount":0,"partnerId":"...","memo":"..."},
      {"lineNo":2,"accountCode":"401","accountName":"상품매출","debitAmount":0,"creditAmount":1000000,"memo":"..."},
      {"lineNo":3,"accountCode":"220","accountName":"부가세예수금","debitAmount":0,"creditAmount":100000,"memo":"..."}
    ]
  }
}
```

**검증 포인트**:
- [ ] 차/대 합계 일치 (1,100,000 = 1,000,000 + 100,000)
- [ ] 각 line 의 `accountCode` 가 표준 65 코드 중 하나
- [ ] 한국어 `accountName` 깨짐 X (외상매출금 / 상품매출 / 부가세예수금)

### 4.1 임의 UUID 조회 → 404

```sh
curl -i http://localhost:8080/api/accounting/journals/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `404 Not Found`

---

## 5. STEP 5 — 시산표 조회 (Trial Balance)

```sh
curl "http://localhost:8080/api/accounting/balances?period=202605" \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `200 OK`
**기대 본문 (요약)**:

```json
{
  "ok": true,
  "data": {
    "period": "2026-05",
    "rows": [
      {"accountCode":"101","accountName":"현금","debitTotal":5000000,"creditTotal":0,"balance":5000000,"category":"ASSET"},
      {"accountCode":"110","accountName":"외상매출금","debitTotal":12000000,"creditTotal":2000000,"balance":10000000,"category":"ASSET"},
      {"accountCode":"220","accountName":"부가세예수금","debitTotal":0,"creditTotal":1100000,"balance":-1100000,"category":"LIABILITY"},
      {"accountCode":"401","accountName":"상품매출","debitTotal":0,"creditTotal":11000000,"balance":-11000000,"category":"REVENUE"}
    ],
    "totalDebit": <합계>,
    "totalCredit": <합계>
  }
}
```

**검증 포인트**:
- [ ] `data.totalDebit == data.totalCredit` (시산표 균형 — 복식부기 무결성)
- [ ] POSTED+REVERSED(보상쌍 상쇄) 분개 집계 — DRAFT 만 제외
- [ ] balance 부호 — ASSET/COST_OF_SALES 은 양수, LIABILITY/EQUITY/REVENUE 는 음수 (표시용 — TrialBalanceService 의 부호 규약 인용)

### 5.1 period 형식 오류 → 400

```sh
curl -i "http://localhost:8080/api/accounting/balances?period=2026-05" \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error.code: INVALID_INPUT`, `message contains "yyyyMM"`

### 5.2 미래 period — 빈 결과

```sh
curl "http://localhost:8080/api/accounting/balances?period=202712" \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `200 OK`
**기대 본문**: `data.rows.length == 0` (또는 모든 balance == 0)

---

## 6. STEP 6 — 분개 라이프사이클 (DRAFT → POSTED → REVERSED)

### 6.1 신규 DRAFT 분개 생성

```sh
PARTNER_ID=$(docker exec -t samhan-postgres psql -U samhan -d partner_db -At \
  -c "SELECT id FROM partners WHERE partner_code='P0001';")

CREATE_RESP=$(curl -sS -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Id: $ACC_USER_ID" \
  -H "X-User-Role: ACCOUNTANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"journalDate\": \"2026-05-09\",
    \"description\": \"시나리오 5 — 라이프사이클 검증\",
    \"sourceType\": \"MANUAL\",
    \"lines\": [
      {\"lineNo\":1,\"accountCode\":\"110\",\"debitAmount\":2200000,\"creditAmount\":0,\"partnerId\":\"$PARTNER_ID\",\"memo\":\"외상매출금\"},
      {\"lineNo\":2,\"accountCode\":\"401\",\"debitAmount\":0,\"creditAmount\":2000000,\"memo\":\"상품매출\"},
      {\"lineNo\":3,\"accountCode\":\"220\",\"debitAmount\":0,\"creditAmount\":200000,\"memo\":\"VAT\"}
    ]
  }")

NEW_JOURNAL_ID=$(echo $CREATE_RESP | jq -r '.data.id')
NEW_JOURNAL_NO=$(echo $CREATE_RESP | jq -r '.data.journalNo')
echo "Created: id=$NEW_JOURNAL_ID journalNo=$NEW_JOURNAL_NO"
```

**기대 status**: `201 Created`
**기대 본문**: `data.status == "DRAFT"` + `data.journalNo` matches `^\d{8}-\d+$`

### 6.2 DRAFT → POSTED

```sh
curl -X POST http://localhost:8080/api/accounting/journals/$NEW_JOURNAL_ID/post \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Id: $ACC_USER_ID" \
  -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `200 OK`
**기대 본문**:
- `data.status == "POSTED"`
- `data.postedAt` not null
- `data.postedBy == $ACC_USER_ID` (or `system` if header 누락)

### 6.3 POSTED 재호출 → 409

```sh
curl -i -X POST http://localhost:8080/api/accounting/journals/$NEW_JOURNAL_ID/post \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `409 Conflict`
**기대 본문**: `error.code: CONFLICT`, `message contains "이미"` 또는 `"DRAFT 가 아닐"`

### 6.4 POSTED → REVERSED (자동 역분개 생성)

```sh
REVERSE_RESP=$(curl -sS -X POST http://localhost:8080/api/accounting/journals/$NEW_JOURNAL_ID/reverse \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Id: $ACC_USER_ID" \
  -H "X-User-Role: ACCOUNTANT")

REVERSE_JOURNAL_ID=$(echo $REVERSE_RESP | jq -r '.data.id')
REVERSE_JOURNAL_NO=$(echo $REVERSE_RESP | jq -r '.data.journalNo')
```

**기대 status**: `200 OK`
**기대 본문 (응답은 신규 역분개)**:
- `data.id != $NEW_JOURNAL_ID` (신규 row)
- `data.status == "POSTED"` (역분개는 자동 POST)
- `data.lines` — 차/대 swap (110 대변 / 401 차변 / 220 차변)

**원본 status 검증**:

```sh
docker exec -it samhan-postgres psql -U samhan -d accounting_db \
  -c "SELECT journal_no, status, reversed_journal_id FROM journals WHERE id='$NEW_JOURNAL_ID';"
```

**기대값**: `status='REVERSED'` + `reversed_journal_id == $REVERSE_JOURNAL_ID`

---

## 7. STEP 7 — Negative tests (Plan §7 Q9 권한 매트릭스)

### 7.1 MANAGER 가 분개 생성 → 403 (Q9 명시 — MANAGER 제외)

```sh
MGR_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"janyeonggu","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')

curl -i -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $MGR_TOKEN" \
  -H "X-User-Role: MANAGER" \
  -d '{"journalDate":"2026-05-09","lines":[{"lineNo":1,"accountCode":"101","debitAmount":1000,"creditAmount":0}]}'
```

**기대 status**: `403 Forbidden`

### 7.2 SALES 가 분개 list 조회 → 403

```sh
curl -i "http://localhost:8080/api/accounting/journals?from=2026-05-01&to=2026-05-31" \
  -H "Authorization: Bearer $SALES_TOKEN" -H "X-User-Role: SALES"
```

**기대 status**: `403 Forbidden`

### 7.3 차/대 합계 mismatch → 400

```sh
curl -i -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT" \
  -d '{
    "journalDate":"2026-05-09",
    "lines":[
      {"lineNo":1,"accountCode":"101","debitAmount":1000,"creditAmount":0},
      {"lineNo":2,"accountCode":"110","debitAmount":0,"creditAmount":900}
    ]
  }'
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error.code: INVALID_INPUT`, `message contains "차/대 합계"`

### 7.4 통제 계정 (parent — is_leaf=false) 사용 → 400

```sh
curl -i -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT" \
  -d '{
    "journalDate":"2026-05-09",
    "lines":[
      {"lineNo":1,"accountCode":"100","debitAmount":1000,"creditAmount":0},
      {"lineNo":2,"accountCode":"110","debitAmount":0,"creditAmount":1000}
    ]
  }'
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error.code: INVALID_INPUT`, `message contains "통제"` 또는 `"leaf"`

### 7.5 차변/대변 둘 다 0 → 400 (CHECK 제약)

```sh
curl -i -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT" \
  -d '{
    "journalDate":"2026-05-09",
    "lines":[
      {"lineNo":1,"accountCode":"101","debitAmount":0,"creditAmount":0}
    ]
  }'
```

**기대 status**: `400 Bad Request` (validation 또는 CHECK 위반)

### 7.6 차변/대변 둘 다 양수 → 400 (CHECK ck_journal_lines_amount_xor)

```sh
curl -i -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT" \
  -d '{
    "journalDate":"2026-05-09",
    "lines":[
      {"lineNo":1,"accountCode":"101","debitAmount":500,"creditAmount":500}
    ]
  }'
```

**기대 status**: `400 Bad Request`
**기대 본문**: CHECK 위반 (`debit > 0 AND credit = 0` OR vice versa)

---

## 8. STEP 8 — 향후 슬라이스 (deferred) endpoint

다음 endpoint 는 본 슬라이스에서 미구현 — Phase 11 또는 별도 슬라이스에서 추가:

| 미구현 endpoint | 매핑 이카운트 보고서 |
|---|---|
| `GET /accounting/general-ledger?accountCode=110` | 총계정원장 (외상매출금 분개 list) |
| `GET /accounting/balance-sheet` | 재무상태표 (자산/부채/자본) |
| `GET /accounting/income-statement` | 손익계산서 (매출/매출원가/판관비/영업외) |
| `GET /accounting/cash-flow` | 현금흐름표 |
| `GET /accounting/vat-report?period=YYYYMM` | 부가세 신고서 |
| ... 외 12 보고서 | (이카운트 17 보고서 마이그레이션 deferred) |

> 본 시나리오 5 는 현 슬라이스 활성 endpoint 만 검증 — 향후 활성화 시 본 문서에 STEP 추가.

---

## 9. 정합성 검증 (시나리오 5 한정)

| Check | psql query | 기대값 |
|---|---|---|
| 시드 65 row | `SELECT count(*) FROM chart_of_accounts WHERE NOT is_deleted;` | >= 65 |
| 7-그룹 모두 존재 | `SELECT DISTINCT category FROM chart_of_accounts;` | ASSET / LIABILITY / EQUITY / REVENUE / COST_OF_SALES / SGA / NON_OPERATING (7건) |
| 50 journal 시드 | `SELECT count(*) FROM journals WHERE NOT is_deleted;` | 50 |
| status 분포 | `SELECT status, count(*) FROM journals WHERE NOT is_deleted GROUP BY status;` | POSTED=40, DRAFT=5, REVERSED=5 |
| 복식부기 무결성 | `SELECT journal_id FROM journal_lines WHERE NOT is_deleted GROUP BY journal_id HAVING SUM(debit_amount) <> SUM(credit_amount);` | 0 row |
| accountCode 표준 코드 한정 | `SELECT DISTINCT account_code FROM journal_lines jl WHERE NOT is_deleted AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.code = jl.account_code AND NOT c.is_deleted);` | 0 row |
| CHECK ck_journal_lines_amount_xor | `SELECT count(*) FROM journal_lines WHERE NOT ((debit_amount > 0 AND credit_amount = 0) OR (debit_amount = 0 AND credit_amount > 0)) AND NOT is_deleted;` | 0 row (CHECK 가드) |
| journal_no 활성 unique | `SELECT journal_no, count(*) FROM journals WHERE NOT is_deleted GROUP BY 1 HAVING count(*) > 1;` | 0 row |
| REVERSED 분개의 reversed_journal_id 존재 | `SELECT count(*) FROM journals WHERE status='REVERSED' AND reversed_journal_id IS NULL AND NOT is_deleted;` | 0 row |

---

## 10. 종료 기준

- [ ] STEP 2 계정과목 트리 65+ row + 7-그룹 검증
- [ ] STEP 3 분개 페이지 50 row + status 필터별 (40/5/5) 검증
- [ ] STEP 4 단건 + lines 복식부기 검증
- [ ] STEP 5 시산표 균형 + period 형식 가드
- [ ] STEP 6 라이프사이클 (DRAFT → POSTED → REVERSED + 자동 역분개)
- [ ] STEP 7 Negative 6건 모두 기대 status 일치
- [ ] §9 정합성 9건 모두 만족
- [ ] QA 스크린샷 1장 — Edge 의 시산표 화면 (POSTED+REVERSED(보상쌍 상쇄) 분개 합계 일치)
  - 저장: `docs/qa/local-test-seed-data/screenshots/05-trial-balance.png`

---

## 11. 회귀 가드 / 알려진 이슈

| 이슈 | 회피책 |
|---|---|
| MANAGER 권한 제외 (Plan §7 Q9 — accounting-slice-A) | §7.1 negative test 로 매 회귀 검증 |
| 자동 분개 (slip → journal) deferred (Plan A3) | 본 시나리오 단계별 분개 직접 입력 |
| general-ledger / balance-sheet / income-statement deferred | 향후 슬라이스 발행 시 본 문서 STEP 추가 |
| 한국어 이름 깨짐 (PowerShell UTF-8) | curl body file 사용 또는 IDE HTTP client |

---

## 12. 한국 표준 65 계정과목 풀-매트릭스 (V1 시드 인용)

본 시나리오의 핵심 — 한국 일반기업회계기준 65 계정 코드 (V1__init_accounting_service.sql 풀 인용).

### 12.1 100 자산 (ASSET) — 22 row

| code | name | parent | is_leaf | display_order |
|---|---|---|---|---|
| 100 | 자산 | NULL | false | 1000 |
| 101 | 현금 | 100 | true | 1010 |
| 102 | 보통예금 | 100 | true | 1020 |
| 103 | 당좌예금 | 100 | true | 1030 |
| 104 | 정기예금 | 100 | true | 1040 |
| 105 | 정기적금 | 100 | true | 1050 |
| 108 | 단기매매증권 | 100 | true | 1080 |
| 110 | 외상매출금 | 100 | true | 1100 |
| 111 | 받을어음 | 100 | true | 1110 |
| 114 | 단기대여금 | 100 | true | 1140 |
| 120 | 미수금 | 100 | true | 1200 |
| 122 | 소모품 | 100 | true | 1220 |
| 124 | 선급금 | 100 | true | 1240 |
| 125 | 선급비용 | 100 | true | 1250 |
| 130 | 상품 | 100 | true | 1300 |
| 131 | 제품 | 100 | true | 1310 |
| 135 | 부가세대급금 | 100 | true | 1350 |
| 141 | 토지 | 100 | true | 1410 |
| 142 | 건물 | 100 | true | 1420 |
| 146 | 차량운반구 | 100 | true | 1460 |
| 148 | 비품 | 100 | true | 1480 |
| 163 | 소프트웨어 | 100 | true | 1630 |

### 12.2 200 부채 (LIABILITY) — 10 row

| code | name | parent |
|---|---|---|
| 200 | 부채 | NULL |
| 201 | 외상매입금 | 200 |
| 202 | 지급어음 | 200 |
| 210 | 미지급금 | 200 |
| 212 | 미지급비용 | 200 |
| 220 | 부가세예수금 | 200 |
| 221 | 예수금 | 200 |
| 226 | 선수금 | 200 |
| 230 | 단기차입금 | 200 |
| 260 | 장기차입금 | 200 |

### 12.3 300 자본 (EQUITY) — 6 row

| code | name | parent |
|---|---|---|
| 300 | 자본 | NULL |
| 301 | 자본금 | 300 |
| 320 | 자본잉여금 | 300 |
| 331 | 자기주식 | 300 |
| 341 | 이익잉여금 | 300 |
| 343 | 미처분이익잉여금 | 300 |

### 12.4 400 매출 (REVENUE) — 4 row

| code | name | parent |
|---|---|---|
| 400 | 매출 | NULL |
| 401 | 상품매출 | 400 |
| 404 | 제품매출 | 400 |
| 405 | 매출에누리 | 400 |

### 12.5 500 매출원가 (COST_OF_SALES) — 3 row

| code | name | parent |
|---|---|---|
| 500 | 매출원가 | NULL |
| 501 | 상품매출원가 | 500 |
| 510 | 제품매출원가 | 500 |

### 12.6 800 판관비 (SGA) — 약 12 row

대표 코드: 801(급여) / 805(임차료) / 814(통신비) / 815(수도광열비) / 817(세금과공과) / 818(감가상각비) / 819(보험료) / 820(접대비) / 822(차량유지비) / 824(운반비) / 826(도서인쇄비) / 829(소모품비) / 830(수수료비용) / ...

### 12.7 900 영업외 (NON_OPERATING) — 약 8 row

대표 코드: 901(이자수익) / 904(임대료) / 905(잡이익) / 951(이자비용) / 953(기부금) / 957(수수료비용) / 958(잡손실) / ...

> 본 표는 `services/accounting-service/src/main/resources/db/migration/V1__init_accounting_service.sql` 의 INSERT 문 인용. 시드 시점 row 수가 V1 코드와 일치 검증.

### 12.8 분개 사용 가능 leaf 코드만 list

```sh
curl -s http://localhost:8080/api/accounting/accounts -H "Authorization: Bearer $ACC_TOKEN" \
  | jq '.data | map(select(.isLeaf == true)) | length'
```

**기대값**: ~ 50+ (V1 시드 leaf 만).

---

## 13. Error code 매트릭스 (accounting)

| HTTP | error.code | 의미 | 발생 trigger |
|---|---|---|---|
| 400 | INVALID_INPUT | period 형식 yyyyMM 위반 | TrialBalanceController parse |
| 400 | INVALID_INPUT | from > to | (현 슬라이스 미강제, 빈 결과 가능) |
| 400 | INVALID_INPUT | 차/대 합계 mismatch | JournalService.create |
| 400 | INVALID_INPUT | 통제 계정 (is_leaf=false) | JournalService.create |
| 400 | INVALID_INPUT | 차변/대변 동시 양수 또는 동시 0 | DB CHECK ck_journal_lines_amount_xor |
| 400 | INVALID_INPUT | partnerId UUID 형식 | jakarta validation |
| 400 | INVALID_INPUT | journalDate null | @NotNull |
| 401 | UNAUTHORIZED | JWT 만료 | gateway |
| 403 | FORBIDDEN | MANAGER 가 분개 생성 | @PreAuthorize ACCOUNTANT/MASTER |
| 403 | FORBIDDEN | SALES 가 list 조회 | @PreAuthorize |
| 404 | NOT_FOUND | journalId 미존재 | JournalRepository |
| 404 | NOT_FOUND | accountCode 미존재 | ChartOfAccountRepository |
| 409 | CONFLICT | DRAFT 가 아닌 분개 post 시도 | Journal.markPosted() |
| 409 | CONFLICT | POSTED 가 아닌 분개 reverse 시도 | Journal.markReversed() |
| 409 | CONFLICT | 동시 수정 race | OptimisticLock |
| 500 | INTERNAL | DB 연결 끊김 | DataAccessException |

---

## 14. Performance baseline

| Endpoint | 평균 (ms) | p99 (ms) | 비고 |
|---|---|---|---|
| `GET /accounting/accounts` (65 row) | 30 | 80 | DB 1회 fetch + DTO 변환 |
| `GET /accounting/journals?from=&to=` (50 row) | 50 | 150 | index hit (date_status_active) |
| `GET /accounting/journals/{id}` | 20 | 60 | join + lines fetch |
| `POST /accounting/journals` (3 line) | 100 | 250 | accountCode validate × 3 + insert |
| `POST /accounting/journals/{id}/post` | 50 | 120 | 차/대 검증 + status 갱신 |
| `POST /accounting/journals/{id}/reverse` | 80 | 200 | 신규 역분개 자동 생성 + post |
| `GET /accounting/balances?period=YYYYMM` (50 row 집계) | 100 | 300 | sum + group by aggregation |

---

## 15. FE 화면 표시 contract (UUID 비공개 가드)

| 응답 필드 | type | FE 노출? | 대체 식별자 |
|---|---|---|---|
| `journal.id` | UUID | **NO** | `journalNo` (20260501-001) |
| `journal.lines[].id` | UUID | **NO** | `lineNo` (1, 2, 3, ...) |
| `journal.lines[].partnerId` | UUID | **NO** | partner-service lookup → partnerName |
| `journal.postedBy` | UUID 또는 'system' | **NO** | employee lookup → displayName |
| `journal.reversedJournalId` | UUID | **NO** | (FE 가 GET 으로 journalNo 변환) |
| `journal.journalNo`, `journalDate`, `status`, `description` | string | YES | (그대로) |
| `journal.lines[].accountCode`, `accountName`, `debitAmount`, `creditAmount`, `memo` | string/number | YES | (그대로) |
| `chartOfAccount.code`, `name`, `category`, `parentCode`, `isLeaf` | string | YES | (그대로) |
| `trialBalance.rows[].accountCode`, `accountName`, `debitTotal`, `creditTotal`, `balance` | string/number | YES | (그대로) |

---

## 16. Audit trail — Journal 라이프사이클

### 16.1 BaseEntity audit field 검증

```sql
SELECT journal_no, status, created_by, created_at, modified_by, modified_at, posted_by, posted_at
FROM journals WHERE id='$NEW_JOURNAL_ID';
```

**기대값**:
- `created_by` = ACCOUNTANT user_id (또는 'system')
- `created_at` ≈ STEP 6.1 실행 시각
- `posted_by` = ACCOUNTANT user_id (STEP 6.2 후)
- `posted_at` ≈ STEP 6.2 실행 시각
- `modified_by` / `modified_at` = 마지막 수정자 (STEP 6.4 reverse 시 갱신)

### 16.2 reversed_journal_id 추적

```sql
SELECT j.journal_no AS original_no, r.journal_no AS reverse_no, j.status AS original_status, r.status AS reverse_status
FROM journals j
LEFT JOIN journals r ON r.id = j.reversed_journal_id
WHERE j.id='$NEW_JOURNAL_ID';
```

**기대값**: original_no = $NEW_JOURNAL_NO + reverse_no = $REVERSE_JOURNAL_NO + 양쪽 status (REVERSED + POSTED).

### 16.3 reverse 분개의 차/대 swap 검증

```sql
SELECT j.journal_no, jl.line_no, jl.account_code, jl.debit_amount, jl.credit_amount
FROM journal_lines jl
JOIN journals j ON j.id = jl.journal_id
WHERE j.id IN ('$NEW_JOURNAL_ID', '$REVERSE_JOURNAL_ID')
ORDER BY j.journal_no, jl.line_no;
```

**기대값** (예시):

| journal_no | line_no | account_code | debit | credit |
|---|---|---|---|---|
| 20260509-X (원본) | 1 | 110 | 2,200,000 | 0 |
| 20260509-X | 2 | 401 | 0 | 2,000,000 |
| 20260509-X | 3 | 220 | 0 | 200,000 |
| 20260509-Y (역분개) | 1 | 110 | 0 | 2,200,000 |
| 20260509-Y | 2 | 401 | 2,000,000 | 0 |
| 20260509-Y | 3 | 220 | 200,000 | 0 |

차/대 정확히 swap.

---

## 17. Observability — log

### 17.1 Journal 라이프사이클 log 패턴

```
INFO  c.s.l.accounting.web.JournalController : POST /accounting/journals - lines=3
INFO  c.s.l.accounting.service.JournalService : Journal created: journalNo=20260509-X status=DRAFT
INFO  c.s.l.accounting.service.JournalService : Journal posted: journalNo=20260509-X by=<userId>
INFO  c.s.l.accounting.service.JournalService : Journal reversed: original=20260509-X reverse=20260509-Y
```

### 17.2 차/대 mismatch 시 log

```
WARN  c.s.l.accounting.service.JournalService : Validation failed - debit total 1000 != credit total 900
```

---

## 18. 시드 50 journal 분포 검증

```sql
-- accounting_db
SELECT
    EXTRACT(MONTH FROM journal_date) AS month,
    status,
    count(*) AS cnt
FROM journals
WHERE NOT is_deleted
GROUP BY month, status
ORDER BY month, status;
```

**기대값** (시드 spec — 4월/5월 분산):
- 4월 POSTED 20 / DRAFT 2 / REVERSED 3
- 5월 POSTED 20 / DRAFT 3 / REVERSED 2
- 합계 50

### 18.1 50 journal 의 라인 평균

```sql
SELECT count(*) AS total_journals, sum(line_cnt) AS total_lines, avg(line_cnt) AS avg_lines
FROM (
  SELECT journal_id, count(*) AS line_cnt
  FROM journal_lines WHERE NOT is_deleted GROUP BY 1
) x;
```

**기대값**: total_journals = 50, avg_lines ≈ 2.5~3 (시드 spec — 매출 분개 3 line + 비용 분개 2 line 혼재).

### 18.2 시드 분개의 sourceType 분포

```sql
SELECT source_type, count(*) FROM journals WHERE NOT is_deleted GROUP BY source_type;
```

**기대값**: MANUAL ≥ 30 (수동 입력), SLIP ≤ 20 (시드된 source_ref_id 가 slip UUID).

---

## 19. 시산표 부호 규약 (TrialBalanceService 의 도메인 인용)

본 시나리오 STEP 5 의 검증 — `balance` 부호 의미.

| category | balance 부호 의미 | 양수면 | 음수면 |
|---|---|---|---|
| ASSET | 자산 잔액 (정상 = 양수) | 자산 보유 | 차감계정 (대손충당금) 음수 |
| LIABILITY | 부채 잔액 (정상 = 음수 — 대변 잔액) | 미분류 | 부채 잔액 |
| EQUITY | 자본 잔액 (정상 = 음수) | 미분류 | 자본 잔액 |
| REVENUE | 매출 잔액 (정상 = 음수) | 매출에누리 등 | 매출 |
| COST_OF_SALES | 비용 잔액 (정상 = 양수) | 비용 발생 | 미분류 |
| SGA | 판관비 잔액 (정상 = 양수) | 판관비 발생 | 미분류 |
| NON_OPERATING | 영업외 (혼재) | 영업외비용 | 영업외수익 |

### 19.1 시산표 균형 검증

`SUM(debit_total) == SUM(credit_total)` (모든 row 합계).

```sh
curl -s "http://localhost:8080/api/accounting/balances?period=202605" \
  -H "Authorization: Bearer $ACC_TOKEN" -H "X-User-Role: ACCOUNTANT" \
  | jq '.data | {totalDebit: ([.rows[].debitTotal] | add), totalCredit: ([.rows[].creditTotal] | add)}'
```

**기대값**: `totalDebit == totalCredit` (소수점 0.01 까지 일치).

---

## 20. 한국어 인코딩 가드

본 시나리오의 한국어 — accountName + description + memo + partnerName.

```sql
SELECT code, name, octet_length(name) AS bytes FROM chart_of_accounts WHERE NOT is_deleted ORDER BY code LIMIT 10;
```

**기대값** (예시):
- `현금` 6 byte (한글 1자 = 3 byte × 2)
- `외상매출금` 15 byte
- `부가세예수금` 18 byte
- `미처분이익잉여금` 24 byte

mojibake 발견 시 — V1 SQL 의 INSERT 시점 인코딩 문제 (Flyway 의 placeholder 또는 file encoding).

---

## 21. 향후 슬라이스 — 이카운트 17 보고서 매핑 plan

본 시나리오 §8 의 deferred endpoint 들이 향후 활성화 시 본 문서에 추가될 STEP plan.

### 21.1 General Ledger (총계정원장)

```
GET /accounting/general-ledger?accountCode=110&from=2026-04-01&to=2026-05-31
→ 200 OK
{
  "ok": true,
  "data": {
    "accountCode": "110",
    "accountName": "외상매출금",
    "openingBalance": 5000000,
    "closingBalance": 7500000,
    "entries": [
      {"journalNo":"...", "journalDate":"...", "debit":..., "credit":..., "balance":..., "partnerName":"..."},
      ...
    ]
  }
}
```

검증: `closingBalance == openingBalance + sum(entries.debit) - sum(entries.credit)`

### 21.2 Balance Sheet (재무상태표)

```
GET /accounting/balance-sheet?asOf=2026-05-31
→ 200 OK
{
  "data": {
    "asset": { "current": [...], "nonCurrent": [...], "total": ... },
    "liability": { "current": [...], "nonCurrent": [...], "total": ... },
    "equity": { ..., "total": ... }
  }
}
```

검증: `asset.total == liability.total + equity.total` (재무상태표 균형).

### 21.3 Income Statement (손익계산서)

```
GET /accounting/income-statement?from=2026-01-01&to=2026-05-31
→ 200 OK
{
  "data": {
    "revenue": [...],
    "costOfSales": [...],
    "grossProfit": ...,
    "sga": [...],
    "operatingProfit": ...,
    "nonOperating": [...],
    "netIncome": ...
  }
}
```

검증: `grossProfit = revenue - costOfSales`, `operatingProfit = grossProfit - sga`, `netIncome = operatingProfit + nonOperating`.

> 위 3 endpoint 는 deferred — 향후 슬라이스에서 본 시나리오에 STEP 추가.

---

## 22. Production-readiness gap 분석

| 항목 | dev (현 상태) | production 요구사항 | gap 해결 슬라이스 |
|---|---|---|---|
| 자동 분개 (slip → journal) | 수동 (Plan A3 deferred) | 자동 trigger | accounting-slice-A3 |
| general-ledger / balance-sheet / income-statement | deferred | 17 보고서 모두 활성 | (Phase 11) |
| 회계 마감 (period close) | 없음 | 월별 / 분기별 마감 후 분개 입력 차단 | (향후 슬라이스) |
| 부가세 신고서 자동 생성 | 없음 | 분기별 220/135 코드 자동 집계 | (향후 슬라이스) |
| 결산 분개 (감가상각 등) | 수동만 | 월별 자동 trigger | (향후 슬라이스) |
| 외화 환산 | KRW only | 멀티 통화 + 환차익/환차손 | (Phase 12+) |
| 회계 audit log | BaseEntity 7 field | 모든 변경 이력 보존 (immutable) | (Phase 11) |

---

## 23. 종료 기준 (full)

- [ ] STEP 1~6
- [ ] §7 Negative 6건
- [ ] §9 정합성 9건
- [ ] §12 65 코드 매트릭스 + leaf 50+ 검증
- [ ] §13 error matrix 16 케이스
- [ ] §14 performance baseline 7 endpoint
- [ ] §15 UUID 비공개 가드 9 필드
- [ ] §16 Journal audit + reversed_journal_id + 차/대 swap
- [ ] §17 observability log 패턴
- [ ] §18 시드 50 journal 분포
- [ ] §19 시산표 부호 + 균형
- [ ] §20 한국어 인코딩
- [ ] §21 향후 보고서 plan 인지
- [ ] §22 prod-readiness gap 7건
- [ ] QA 스크린샷 — Edge 시산표 화면 (POSTED+REVERSED(보상쌍 상쇄) 합계 일치)

---

## 24. 다음 시나리오 진입 가드

본 시나리오 통과 후 → `06-arologis-dispatch.md` 진입.

### 24.1 alert 템플릿

```
[QA Alert] 시나리오 5 실패 — STEP <N>

기대값: <expected>
실제값: <actual>

journalNo: <no>
journalId: <id>

console log (accounting-service):
<log>

journal_lines row:
<SELECT>

trial balance debit/credit:
<jq 결과>
```

---

## 25. 참고 자료

- `services/accounting-service/src/main/java/.../web/AccountController.java` — 계정과목 트리
- `services/accounting-service/src/main/java/.../web/JournalController.java` — 분개 라이프사이클
- `services/accounting-service/src/main/java/.../web/TrialBalanceController.java` — 시산표
- `services/accounting-service/src/main/java/.../service/JournalService.java` — 도메인 로직
- `services/accounting-service/src/main/java/.../service/TrialBalanceService.java` — 부호 규약
- `services/accounting-service/src/main/resources/db/migration/V1__init_accounting_service.sql` — 65 코드 시드
- `docs/dev-reports/accounting-slice-A/plan.md` — 슬라이스 plan
- `docs/qa/accounting-slice-A/qa-report.md` — Slice A reference
- `feedback_korean_accounting.md` — 한국 일반기업회계기준 표준 코드 의무
