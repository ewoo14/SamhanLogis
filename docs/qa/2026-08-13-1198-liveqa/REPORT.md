# PR #1198 적대 라이브 QA 보고서

> 대상: PR #1198 `fix/1072-account-code-unification`, 지정 HEAD `f6d892f74`  
> 실행일: 2026-08-13 KST  
> 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**  
> 최종 판정: **있음 — 1건. 금액 불일치 0건, 사용자 노출 잔존 3자리 설명 1건. 머지 비권고.**

## 1. 환경 원문

개발책임자가 제공한 원문:

```text
① 이 브랜치에는 미머지 마이그레이션 V101 이 있습니다
   🚫 공유 개발 스택에 올리지 마십시오 — 다른 트랙이 main 기준으로 빌드할 때
      Flyway validate 가 "applied migration not resolved locally" 로 깨집니다
   ⟹ 격리 DB(Testcontainers 또는 별도 이름의 DB)로 검증하십시오
      🚩 격리 복제 시 한글이 깨진 사례가 있습니다 — 인코딩을 먼저 확인하십시오
② 공유 스택은 혼합 이미지입니다 (slip 08-12T17:53 / accounting·inventory·dashboard 08-11T17:59)
   백엔드 의존 항목을 억지로 판정하지 말고 관측 불가로 남기십시오
③ 여유 RAM
```

재개 지시 원문:

```text
🚨 "Browser 런타임 []" 은 Playwright 부재의 근거가 아니다
인앱 Browser 런타임을 쓰지 말고 위 경로의 chromium 을 playwright 로 직접 launch 하십시오.
🚫 미머지 V101 을 공유 스택에 올리지 마십시오 — 격리 DB 로
🚫 docs/qa 안에 캡처 스크립트를 남기지 마십시오
🚫 git 명령 일절 금지 — 커밋은 PM 대행
🚨 여유 RAM 1.0GB 아래면 즉시 중단·보고
```

실측 환경:

- 로컬 Playwright: `Version 1.59.1`.
- Chromium: `C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe`; 파일 존재 및 직접 launch 성공. 브라우저가 보고한 버전은 `147.0.7727.15`.
- 격리 PostgreSQL 16: 컨테이너 `qa1198-account-pg`, DB `qa1198_accounting_db`, host port `25432`.
- 브랜치 accounting-service: 격리 DB 전용 host port `28087`; `health=UP`.
- renderer: 이 worktree의 `clients/desktop`, Vite `127.0.0.1:5175`; mock 전용 Vite `127.0.0.1:5176`.
- shared gateway는 로그인·버전·거래처/전표 조회에만 사용했다. V101과 QA 회계 행은 공유 DB에 쓰지 않았다.
- V100 한글 seed에서 `현금`, `보통예금`, `외상매출금`, `부가세예수금`, `상품매출`, `법인세비용`을 정상 조회했다.
- 최초 여유 RAM `20.439GB`, 실행 중 최저 관측 `17.472GB`, 정리 후 `20.888GB`; 1.0GB 중단선 미도달.
- Git 명령은 실행하지 않았다.
- 캡처 하네스는 `scripts/.tmp-1198-*.mjs`에만 임시 생성하고 종료 전에 삭제했다. `docs/qa`에는 스크립트가 없다.

### 이전 중단 경위 정정

이 보고서의 이전 판본은 인앱 Browser의 다음 결과를 로컬 Playwright 부재로 해석해 중단했다.

```text
No browser is available
[]
```

그 근거는 틀렸다. 위 결과는 **인앱 Browser 런타임이 비어 있다는 뜻일 뿐이며, 로컬 Playwright Chromium과 별개**다. PM이 재개 브리핑에서 로컬 실행 경로를 보완했고, 이번 실행에서는 지정 Chromium을 `playwright.chromium.launch({ executablePath })`로 직접 기동해 시나리오 2~5를 완료했다.

## 2. 시나리오 1 — 이관 전후 합계·잔액

### 2.1 fresh DB에서 V101 자체 단언 실행

이미 확보한 결과를 재사용했으며 다시 실행하지 않았다.

명령 원문:

```text
.\gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.it.AccountCodeUnificationV101IT' --no-daemon --rerun-tasks
```

결과 원문:

```text
> Task :services:accounting-service:test
BUILD SUCCESSFUL in 1m 5s
21 actionable tasks: 21 executed
```

별도 이름의 격리 DB에도 V1~V100을 적용해 풍부한 기준선을 넣은 뒤 브랜치 accounting-service를 실제 기동했다. Flyway 결과:

```text
 installed_rank | version |        description         | success
----------------+---------+----------------------------+---------
             75 | 101     | unify legacy account codes | t
```

따라서 V101 후반의 `DO $$ ... RAISE EXCEPTION ... $$` 검증 블록은 fresh PostgreSQL과 이번 풍부한 표본 DB에서 모두 실제로 실행됐다.

### 2.2 쿼리 원문과 결과

V100 기준선 쿼리:

```sql
SELECT coa.category,
       SUM(jl.debit_amount) AS debit_total,
       SUM(jl.credit_amount) AS credit_total,
       COUNT(*) AS line_count
FROM journal_lines jl
LEFT JOIN chart_of_accounts coa ON coa.code=jl.account_code
WHERE jl.memo LIKE 'QA1198%'
GROUP BY coa.category
ORDER BY coa.category;

SELECT SUM(debit_amount) AS total_debit,
       SUM(credit_amount) AS total_credit
FROM journal_lines
WHERE memo LIKE 'QA1198%';
```

V101 후 원래 카테고리 기준 대조 쿼리(V101 자체 단언과 같은 의미):

```sql
SELECT coa.category,
       SUM(jl.debit_amount) AS debit_total,
       SUM(jl.credit_amount) AS credit_total,
       COUNT(*) AS line_count
FROM journal_lines jl
JOIN journals j ON j.id=jl.journal_id
LEFT JOIN chart_of_accounts coa ON coa.code=jl.legacy_account_code
WHERE j.journal_no LIKE 'QA1198-BEFORE-%'
GROUP BY coa.category
ORDER BY coa.category;

SELECT SUM(jl.debit_amount) AS total_debit,
       SUM(jl.credit_amount) AS total_credit,
       COUNT(*) AS lines,
       COUNT(*) FILTER (WHERE jl.account_code ~ '^[0-9]{3}$') AS remaining_3digit
FROM journal_lines jl
JOIN journals j ON j.id=jl.journal_id
WHERE j.journal_no LIKE 'QA1198-BEFORE-%';
```

결과:

```text
   category    | debit_total | credit_total | line_count
---------------+-------------+--------------+------------
 ASSET         |  1060000.00 |    230000.00 |          5
 COST_OF_SALES |   300000.00 |         0.00 |          1
 INCOME_TAX    |    30000.00 |         0.00 |          1
 LIABILITY     |        0.00 |    410000.00 |          3
 NON_OPERATING |        0.00 |     50000.00 |          1
 REVENUE       |        0.00 |    900000.00 |          1
 SGA           |   200000.00 |         0.00 |          1

 total_debit | total_credit | lines | remaining_3digit
-------------+--------------+-------+-----------------
  1590000.00 |   1590000.00 |    13 |               0
```

코드 이관 원문:

```text
QA1198-BEFORE-1  102→1039, 401→4019, 220→2559
QA1198-BEFORE-2  501→4511, 201→2519
QA1198-BEFORE-3  801→8029, 102→1039
QA1198-BEFORE-4  101→1019, 901→9019
QA1198-BEFORE-5  991→9719, 102→1039
QA1198-BEFORE-6  110→1089, 255→2559
```

주의: 현재 `chart_of_accounts.category`로 새 코드 자체를 다시 묶으면 이카운트 정본 분류에 따라 `4511=REVENUE`, `9719=NON_OPERATING`으로 보인다. V101 단언은 SQL 주석대로 `legacy_account_code`를 통해 **이관 전 카테고리를 고정**해 금액 보존을 검사한다. `501→4511`, `991→9719`는 결정문에 명시된 매핑이며 이 재분류 자체는 결함으로 세지 않았다.

## 3. 시나리오 2 — 화면 금액 이관 전후 동일성

Playwright가 renderer를 열고 accounting 요청만 격리 `28087`로 전달했다. 로그인 JWT에서 gateway 계약인 `X-User-Id`, `X-User-Groups`, `X-Is-System-Master`, `X-Is-Partner`를 재구성했다. 화면 요청 HTTP 결과는 시산표·원장·월별손익·자금현황·거래처 집계/상세 모두 `200`이었다.

| 화면 | V100 기준선 | V101 실화면 | 차이/판정 | 증거 |
|---|---:|---:|---|---|
| 시산표 8월 차변/대변 | 1,590,000 / 1,590,000 | 1,590,000 / 1,590,000, 균형 `일치` | 0 / 0 | [01](./_local/01-trial-balance-after-v101.png) |
| 원장 | 13라인, 차변/대변 각 1,590,000 | 13라인, 3자리 잔존 0, 전체 잔액 0 | 동일 | [02](./_local/02-general-ledger-after-v101.png) |
| 월별손익 8월 | 매출 900,000, 원가 300,000, 판관비 200,000, 영업외수익 50,000, 법인세 30,000, 순익 420,000 | 화면 순서대로 `900,000`, `-300,000`, `200,000`, `50,000`, `30,000`, `420,000` | 동일 | [03](./_local/03-monthly-income-after-v101.png) |
| 자금현황 QA 기간 증감 | 현금 +50,000, 보통예금 +1,000,000/-230,000, 순증 +820,000 | 증가 1,050,000, 감소 230,000, 순증 +820,000 | 동일 | [04](./_local/04-funds-status-after-v101.png) |
| 거래처 원장 QA 기여 | 매출 900,000 + 조정 10,000 = 910,000 | 상세에 QA 두 행 900,000/10,000, 누계 910,000 | 동일 | [05](./_local/05-partner-ledger-aggregate-after-v101.png), [06](./_local/06-partner-ledger-detail-after-v101.png) |

거래처 원장 총액 `1,911,000` 중 `1,001,000`은 개발책임자가 고지한 타 라운드 공유 판매전표 `2026/08/13-3`이다. QA 표본 `910,000`과 분리했고 결함으로 세지 않았다.

화면 상단의 “버전 정책을 확인하지 못했습니다” 배너는 혼합 공유 스택의 버전 endpoint 관측값이다. 격리 accounting 요청은 모두 성공했으므로 PR의 회계 금액 결함으로 세지 않았다.

## 4. 시나리오 3 — 신규 전표 4자리 저장

절차:

1. `/accounting/journals/new` 진입.
2. 차변 `1039 보통예금`, 대변 `4019 상품매출`, 각 `77,777원` 입력.
3. 적요 `QA1198 신규 4자리 저장`으로 저장.
4. `POST /accounting/journals -> 201`, 상세 `GET -> 200` 확인.
5. 저장 후 격리 DB를 직접 조회.

스크린샷: [입력](./_local/07-new-journal-four-digit-form.png), [저장 상세](./_local/08-new-journal-four-digit-saved.png).

쿼리 원문:

```sql
SELECT j.journal_no, j.status, j.description,
       string_agg(jl.account_code || ':' || jl.debit_amount || '/' || jl.credit_amount,
                  ', ' ORDER BY jl.line_no) AS lines,
       SUM(jl.debit_amount) AS debit_total,
       SUM(jl.credit_amount) AS credit_total
FROM journals j
JOIN journal_lines jl ON jl.journal_id=j.id
WHERE j.description='QA1198 신규 4자리 저장'
  AND j.deleted_at IS NULL AND jl.deleted_at IS NULL
GROUP BY j.journal_no,j.status,j.description;

SELECT COUNT(*) AS three_digit_new_lines
FROM journal_lines jl
JOIN journals j ON j.id=jl.journal_id
WHERE j.description='QA1198 신규 4자리 저장'
  AND jl.account_code ~ '^[0-9]{3}$';
```

결과:

```text
 journal_no  | status | description             | lines                                  | debit_total | credit_total
-------------+--------+-------------------------+----------------------------------------+-------------+-------------
 2026/08/13-1 | DRAFT | QA1198 신규 4자리 저장 | 1039:77777.00/0.00, 4019:0.00/77777.00 | 77777.00    | 77777.00

 three_digit_new_lines
----------------------
 0
```

판정: **신규 행도 4자리로 정상 저장된다.** 기존 행 이관만 확인하는 오류는 재현되지 않았다.

## 5. 시나리오 4 — 3자리 사용 화면·API 정상 경로

- 시산표, 원장, 월별손익, 자금현황, 거래처 원장, 신규 분개, 입금보고서의 정상 사용자 경로가 실제 화면에서 동작했다.
- 입금보고서 `GET /accounting/cash-receipts?page=0&size=50 -> 200`; QA 행 `123,456원` 표시: [09](./_local/09-cash-receipts-after-v101.png).
- 계좌/카드 관리 route 자체는 렌더링됐다: [10](./_local/10-bank-card-after-v101.png). CODEF 등록기관 조회는 격리 환경에 vendor 자격이 없어 `502`였으며, 해당 외부 의존은 관측 불가로 분리했다.
- 이관 테이블 DB 확인:

```sql
SELECT slip_no, amount, debit_account_code, legacy_debit_account_code,
       credit_account_code, legacy_credit_account_code
FROM cash_receipts WHERE slip_no='QA1198-CR-1';

SELECT account_code, account_name, chart_account_code, legacy_chart_account_code
FROM bank_accounts WHERE account_code='QA1198-BANK';

SELECT card_code, card_name, linked_account_code, legacy_linked_account_code
FROM card_master WHERE card_code='QA1198-CARD';
```

```text
QA1198-CR-1 | 123456.00 | 1029 | 103 | 1089 | 110
QA1198-BANK | QA1198 isolated bank | 1039 | 102
QA1198-CARD | QA1198 isolated card | 2559 | 220
```

정상 경로 파손은 없었지만, 거래처 원장 화면 안내문에 남은 `401/110`은 아래 도달 결함으로 판정했다.

## 6. 시나리오 5 — 라운드 3 다섯 좌표

### 6.1 FE mock

`VITE_MOCK_MODE=1` renderer를 별도 `5176`에서 실제 기동했다. mock 시산표가 차변/대변 각 `17,700,000`, 균형 일치, 4자리 코드만 표시했다. 브라우저가 관측한 accounting network 요청 수는 `0`으로 in-process mock 경로를 실제로 밟았다.

증거: [12-fe-mock-trial-balance-four-digit.png](./_local/12-fe-mock-trial-balance-four-digit.png), [`round3-runtime-log.txt`](./_local/round3-runtime-log.txt).

### 6.2 집계

거래처 집계 `GET /accounting/sales/aggregate -> 200`. QA 매출 `900,000`, 조정 `10,000`이 실제 집계됐다. 타 라운드 판매전표 `1,001,000`은 분리했다. 증거: [05](./_local/05-partner-ledger-aggregate-after-v101.png).

### 6.3 원장 runtime

`GET /accounting/ledgers?from=2026-08-01&to=2026-08-31 -> 200`; 이관된 13라인이 `1039/4019/2559/4511/2519/8029/1019/9019/9719/1089`로 표시됐다. 증거: [02](./_local/02-general-ledger-after-v101.png).

### 6.4 JournalSeeder

동일 격리 DB에 두 번째 accounting-service를 `dev` profile + `SAMHAN_ACCOUNTING_SEED_TEST_DATA=true`로 실제 기동했다.

런타임 로그:

```text
JournalSeeder created 47 journals (skipped 3)
JournalSeeder 복식부기 invariant — sum(debit)=518400000 sum(credit)=518400000 OK
```

3건 skip은 기존 journal_no 충돌에 대한 시더의 idempotency 경로다. 생성+skip 합계 50건으로 전체 루프가 실행됐다.

쿼리 원문:

```sql
WITH s AS (
  SELECT id FROM journals
  WHERE created_at >= TIMESTAMP '2026-08-13 22:08:50'
    AND (description LIKE '전표 % 자동 분개 (출하 매출)'
      OR description LIKE '거래처 P-2026-% 외상매출금 회수'
      OR description LIKE '% 사원 급여 지급 (SGA)'
      OR description='사무실 통신비 (SGA)'
      OR description='월말 감가상각 조정 분개')
)
SELECT COUNT(*) FILTER (WHERE jl.account_code ~ '^[0-9]{3}$') AS three_digit,
       SUM(jl.debit_amount) AS debit,
       SUM(jl.credit_amount) AS credit
FROM journal_lines jl JOIN s ON s.id=jl.journal_id;
```

```text
 three_digit | debit        | credit
-------------+--------------+-------------
 0           | 518400000.00 | 518400000.00
```

8개 사용 코드와 라인 수: `1039(13), 1089(37), 2024(5), 2559(29), 4019(29), 8029(2), 8139(3), 8239(5)`. 실제 시더 분개 상세: [14-journal-seeder-four-digit-runtime.png](./_local/14-journal-seeder-four-digit-runtime.png).

### 6.5 세금계산서 설명

브랜치 accounting-service의 실 Swagger UI에서 `POST /accounting/tax-invoices/{id}/issue`를 펼쳤다. 런타임 설명은 다음과 같이 재현됐다.

```text
DRAFT → ISSUED. 발행번호 채번 + 자동 분개
(1089 외상매출금 / 2559 부가세예수금 / 4019 매출)
```

증거: [13-tax-invoice-four-digit-description-runtime.png](./_local/13-tax-invoice-four-digit-description-runtime.png).

## 7. 이관 전후 금액 대조표

| 카테고리/대상 | V100 | V101 | 차이 |
|---|---:|---:|---:|
| ASSET 차변 | 1,060,000.00 | 1,060,000.00 | 0 |
| ASSET 대변 | 230,000.00 | 230,000.00 | 0 |
| COST_OF_SALES 차변 | 300,000.00 | 300,000.00 | 0 |
| INCOME_TAX 차변 | 30,000.00 | 30,000.00 | 0 |
| LIABILITY 대변 | 410,000.00 | 410,000.00 | 0 |
| NON_OPERATING 대변 | 50,000.00 | 50,000.00 | 0 |
| REVENUE 대변 | 900,000.00 | 900,000.00 | 0 |
| SGA 차변 | 200,000.00 | 200,000.00 | 0 |
| 전체 차변 | 1,590,000.00 | 1,590,000.00 | 0 |
| 전체 대변 | 1,590,000.00 | 1,590,000.00 | 0 |
| cash_receipts 금액 | 123,456.00 | 123,456.00 | 0 |
| 월별손익 8월 당기순익 | 420,000.00 | 420,000.00 | 0 |
| 자금현황 QA 순증 | 820,000.00 | 820,000.00 | 0 |
| 거래처 원장 QA 누계 | 910,000.00 | 910,000.00 | 0 |

## 8. 도달 결함

### D-1 — 거래처 원장 사용자 안내문에 폐기된 3자리 코드가 남음

- 도달 경로: 로그인 → 회계 → 거래처 원장.
- 재현: 화면 Step 1 안내가 `자체 분개 (401/110 코드) 기반 거래처별 합계`라고 표시된다.
- 실제 runtime 계약: 라운드 3에서 집계 코드는 `4019/1089`로 변경됐고, 같은 화면의 실제 QA 금액도 새 코드로 정상 집계됐다.
- 영향: 금액 오산은 없으나, 실 사용자가 폐기된 계정 체계를 현행 기준으로 오인한다. 이 PR의 “3자리 폐기/4자리 통일” 사용자 경로에 직접 모순된다.
- 증거: [05-partner-ledger-aggregate-after-v101.png](./_local/05-partner-ledger-aggregate-after-v101.png).
- 판정: **도달 가능한 결함 1건**. 심각도와 무관하게 결함으로 계수했다.

금액 불일치, 신규 전표 3자리 저장, 이관 테이블 누락은 0건이다. 결정 7 leaf 전용 기표 제약은 지시대로 범위에서 제외했다.

## 9. 증거 무결성 정정

1. **이 보고서 이전 판본의 중단 근거를 정정한다.** `No browser is available`/`[]`은 인앱 Browser 상태이며 로컬 Playwright 부재 증거가 아니다. 로컬 Chromium을 직접 launch해 실제 QA가 가능했다.
2. fix 보고서의 fresh PostgreSQL V101 실행 원문은 재현됐다.
3. 라운드 3의 `JournalSeeder` 4자리 코드와 합계 invariant, 세금계산서 Swagger 설명은 실 기동으로 재현됐다.
4. 라운드 3의 FE mock은 실제 mock renderer에서 accounting network 0건으로 재현됐다.
5. 위 정정 외에 fix 보고서의 “원문/실측” 주장과 모순되는 증거는 발견하지 못했다.

## 10. 관측 불가 및 실패 명령 원문

### 10.1 관측 불가

- CODEF 등록기관 조회: 격리 환경에 vendor 자격/연동이 없어 `GET /accounting/codef/connection/institutions -> 502`. 계좌/카드 route 렌더링과 DB 이관은 별도로 확인했다.
- shared 버전 정책 endpoint: 혼합 이미지 때문에 화면 상단 확인 실패 배너가 표시됐다. 회계 API 응답과 분리했다.

### 10.2 실패/복구 기록

인앱 Browser(이전 중단, 이번에는 사용하지 않음):

```text
No browser is available
[]
```

첫 실화면 라우팅에서 gateway identity 헤더 없이 accounting-service를 직접 호출한 결과:

```text
GET /accounting/reports/trial-balance/summary ... -> 403
GET /accounting/ledgers ... -> 403
GET /accounting/reports/income-statement/monthly ... -> 403
GET /accounting/reports/funds-status ... -> 403
GET /accounting/sales/aggregate ... -> 403
GET /accounting/accounts -> 403
```

`HeaderAuthenticationFilter`/gateway 계약을 확인해 신원 헤더를 전달한 뒤 전부 `200`, 신규 저장 `201`로 복구했다.

JournalSeeder 첫 기동 시 잘못 지정한 격리 DB 비밀번호:

```text
FATAL: password authentication failed for user "samhan"
BUILD FAILED in 1m 36s
```

컨테이너 원문 `POSTGRES_PASSWORD=<REDACTED:13자 개발스택 공통 비밀번호>`를 확인해 재기동했고 `health=UP`, 시더 로그 성공을 얻었다.

초기 컬럼명 오기 쿼리:

```text
ERROR: column "receipt_no" does not exist
ERROR: column "bank_name" does not exist
ERROR: column "card_company" does not exist
```

`\d`로 실제 컬럼 `slip_no`, `account_code`, `card_code`를 확인해 수정 쿼리로 재실행했다.

캡처 종료 시 SSE route가 남아 발생한 하네스 오류:

```text
route.fetch: Request context disposed.
```

제품 요청과 스크린샷 저장은 이미 성공했다. `about:blank` 이동과 `unrouteAll({ behavior: 'ignoreErrors' })`로 캡처 종료를 정리해 최종 재실행 `Exit code: 0`을 확인했다.

## 11. 만든 데이터와 정리

격리 DB에만 생성:

- V100 기준선: journals 6행 `QA1198-BEFORE-1~6`, journal_lines 13행.
- `cash_receipts` 1행 `QA1198-CR-1` (`123,456원`).
- `bank_accounts` 1행 `QA1198-BANK`; `card_master` 1행 `QA1198-CARD`.
- 실화면 신규 분개 1건 `2026/08/13-1`, 적요 `QA1198 신규 4자리 저장`, 2라인.
- `JournalSeeder`: 생성 47건, idempotency skip 3건.
- dev profile에서 함께 실행된 다른 개발용 시더 분개 8건.
- 공유 거래처 `P-2026-0017`의 식별자는 조회만 하고 격리 표본의 참조에만 사용했다. UUID를 사용자 화면/보고서에 노출하지 않았다.

공유 DB 생성/수정: **0행**. 개발책임자가 고지한 타 라운드 데이터는 수정하지 않았다.

종료 정리:

```text
STOP_PID=45804 NAME=java.exe
STOP_PID=38860 NAME=java.exe
STOP_PID=71732 NAME=node.exe
STOP_PID=37740 NAME=node.exe
qa1198-account-pg
REMAINING_QA_PORTS=0
QA_CONTAINER_COUNT=0
DESKTOP_NODE_MODULES_EXISTS=False
DESIGN_DIST_EXISTS=False
FREE_RAM_GB=20.888
```

격리 컨테이너 제거로 위 DB 데이터는 삭제되어 복구되지 않는다. 임시 로그·의존성·캡처 스크립트도 제거했고, 보고서/스크린샷/텍스트 증거만 남겼다.

## 12. 머지 권고

**머지 비권고.** 금액 보존과 신규 4자리 저장은 통과했지만, PR 목적과 모순되는 폐기 코드 `401/110`이 거래처 원장 실사용자 안내에 도달한다. 해당 문구를 현행 `4019/1089` 기준으로 고친 뒤 같은 화면 한 경로를 재확인할 것을 권고한다.
