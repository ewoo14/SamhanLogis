# #1198 결정 7 — 상위 계정 기표 차단(leaf 전용) 애플리케이션 제약 정찰

> 정찰일: 2026-08-13 KST  
> 코드 기준: 로컬 `main` `3dc78fc88`, 정찰 종료 exact SHA `2542fc3f8` (`origin/fix/1072-account-code-unification`)  
> DB 기준: 집PC `samhan-postgres/accounting_db`  
> 제약: 코드 수정 없음, Git 쓰기 없음, DB 쓰기 없음. DB 쿼리는 모두 `BEGIN READ ONLY`와 `ROLLBACK` 사이에서 실행했다.

## 0. 즉시 판정

1. main 애플리케이션의 공통 검증은 `AccountService.requireLeafAccount()` 하나다. 이 메서드는 자식을 직접 세지 않고 `chart_of_accounts.is_leaf` **저장값**을 읽는다. 조사 종료 시점 #1198 브랜치는 여기에 옛 통제 코드 7개 하드 거부를 추가했지만, 4자리 계정 판정은 여전히 저장값이다.
2. 다만 V101 적용 후에는 두 `chart_of_accounts` 트리거가 저장 `is_leaf`를 활성 자식 유무로 파생·동기화한다. 따라서 V101 적용 후 공통 검증의 실질 기준은 `활성 자식 0개`가 되지만, 적용 전에는 그렇지 않다.
3. 집PC DB에는 V101 적용 이력과 두 트리거가 **현재 없다**. 실제 부모는 51개인데 저장 `is_leaf=false`는 옛 3자리 루트 7개뿐이다. 현재 공통 검증은 실제 부모 44개를 leaf로 오판할 수 있다.
4. `JournalService.create()`와 `postAutoJournal()`, `CashReceiptService`, MIG-9은 leaf 판정을 거친다. 반면 분개장 CSV, 일반전표 CSV, KFTC 입금매칭, dev 시더, 역분개 복사 경로는 동일 판정을 거치지 않는다.
5. V101 트리거는 `chart_of_accounts.is_leaf`를 지킨다. `journal_lines` INSERT/UPDATE를 막지 않는다. `journal_lines.account_code`에는 계정 마스터 FK도 없다.
6. 집PC 활성 `journal_lines` 309행 중 활성 자식이 있는 상위 계정으로 기표된 행은 **0행**이다. 삭제 행까지 포함해도 0행이다.
7. 오늘 알려진 QA 판매/입고전표에서 만들어진 것은 매출·매입 회계전표 DRAFT 각 1건과 allocation 각 1건이다. 이 네 테이블에는 `account_code` 컬럼이 없고, 오늘 생성된 `journals`는 0건이므로 상위 계정 기표 0행 집계에 QA journal line은 섞이지 않았다.

### 동시 작업 관찰

정찰 중 다른 에이전트가 작업하던 로컬 원격추적 ref가 `25b974670 → a96738771 → 2542fc3f8`로 이동했다. 최종 분석은 exact SHA `2542fc3f8`에 고정했다. `a96738771..2542fc3f8` 사이에는 아래에서 인용하는 `AccountService`와 V101의 내용 변경이 없다. 현재 V101은 결정 문서와 같이 `('255', '2559', 'MAPPED')`이며, 집PC `journal_lines.account_code='255'` 7행도 해당 매핑 대상이다. 이 정찰은 그 브랜치 파일을 수정하지 않았다.

---

## 1. 현재 걸려 있는 제약 전수

### 1.1 공통 애플리케이션 검증

| 위치 | 동작 | 현재 판정 기준 | V101 적용 후 실질 기준 |
|---|---|---|---|
| `AccountService.java:36-43` | 코드 존재 확인 후 non-leaf면 `INVALID_INPUT` | JPA로 읽은 저장 `ChartOfAccount.isLeaf()` | 트리거가 저장값을 파생하므로 활성 자식 유무 |
| `ChartOfAccount.java:28, 53-56` | soft-delete 계정 조회 제외, `is_leaf` 매핑 | `@SQLRestriction("is_deleted = false")` + 저장 컬럼 | 동일 |
| `JournalService.java:90-95` | 수동 분개 각 라인 선검증 | 위 공통 검증 | 위 공통 검증 |
| `JournalService.java:210-214` | 자동 분개 각 라인 선검증 | 위 공통 검증 | 위 공통 검증 |
| `CashReceiptService.java:426-430` | 차변·대변 계정 선검증 | 위 공통 검증 | 위 공통 검증 |

조사 종료 exact SHA `2542fc3f8`의 `AccountService`는 repository 조회 전에 다음 7개를 하드 거부한다.

```java
Set.of("100", "200", "300", "400", "500", "800", "900")
```

이는 V101이 3자리 계정을 soft-delete한 뒤에도 기존 `JournalControllerIT`의 `100 → 400` 계약을 유지하기 위한 추가 가드다. 자식 유무를 직접 판정하는 구현은 아니며, 이 목록 밖 4자리 계정은 아래의 저장 `isLeaf()` 판정을 그대로 탄다.

`AccountService` 원문 요지:

```java
ChartOfAccount account = repository.findById(code)
        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, ...));
if (!account.isLeaf()) {
    throw new BusinessException(ErrorCode.INVALID_INPUT,
            "통제 계정(parent)에는 분개할 수 없습니다: " + code + " " + account.getName());
}
```

즉 현재 메서드는 `NOT EXISTS (active child)`를 질의하지 않는다.

### 1.2 이미 있는 회귀 테스트

| 테스트 | 증명하는 것 | 증명하지 않는 것 |
|---|---|---|
| `JournalControllerIT.java:145-158` | 저장 `is_leaf=false`인 옛 3자리 `100`을 수동 분개 생성에서 400으로 거부 | 저장값이 잘못된 실제 부모, JDBC 우회 경로, V101 적용 후 4자리 트리 |
| `CashReceiptControllerIT.java:171-190` | 미존재 계정 404, 저장 non-leaf `100` 400 | 다른 현금 배치/JDBC 쓰기 |
| `JournalServiceTest.java:88-...` | `requireLeafAccount()` 호출 여부 | mock이므로 실제 시드·자식 유무 |
| `MonthlyIncomeStatementControllerIT.java:153-155` | 부모 `400`을 직접 심은 뒤 보고서가 제외하는 읽기 내성 | 쓰기 제약. 오히려 엄격한 `journal_lines` DB 트리거를 추가하면 fixture가 바로 실패함 |

### 1.3 집PC에서 현재 검증 기준이 실제 트리와 어긋나는 정도

```sql
BEGIN READ ONLY;
SELECT COUNT(*) AS active_accounts,
       COUNT(*) FILTER (WHERE is_leaf=FALSE) AS stored_non_leaf,
       COUNT(*) FILTER (
         WHERE NOT EXISTS (
           SELECT 1 FROM chart_of_accounts ch
           WHERE ch.parent_code=coa.code
             AND ch.code<>coa.code
             AND ch.is_deleted=FALSE
         )
       ) AS derived_leaf
FROM chart_of_accounts coa
WHERE coa.is_deleted=FALSE;
ROLLBACK;
```

```text
BEGIN
 active_accounts | stored_non_leaf | derived_leaf
-----------------+-----------------+--------------
             353 |               7 |          302
(1 row)

ROLLBACK
```

활성 계정 353개 중 자식 0개인 실제 leaf는 302개, 실제 부모는 51개다. 저장 non-leaf는 7개뿐이므로 실제 부모 44개가 저장 `is_leaf=true`다. 그 44개 원문 목록은 아래와 같다.

```text
1010 1011 1012 1018 1049 1087 1088 1168 1462 1761 1762
2012 2312 2325 2365 2450 2470 2510 2511 2518 2911 3310
3319 3349 3379 3419 3511 3515 3565 3759 4001 4011 5018
6018 7018 8011 8018 8127 9011 9018 9318 9611 9717 9999
```

이 목록은 “기표 가능해야 하는 계정” 판정이 아니라 현재 저장 플래그와 활성 자식 유무의 물리적 불일치 목록이다.

---

## 2. 계정 코드를 저장하는 코드 경로 전수

화면이 아니라 최종 저장 컬럼과 코드 경로를 기준으로 분류했다.

### 2.1 `journal_lines.account_code` 쓰기

| 경로 | 최종 쓰기 | leaf 판정 | 판정 종류 / 비고 |
|---|---|---|---|
| 공개 수동 분개 `JournalController → JournalService.create` | JPA cascade | **있음** | `AccountService`, 저장 `is_leaf` |
| 내부 분개 `AccountingInternalJournalController → JournalService.create` | JPA cascade | **있음** | 공개 경로와 같은 서비스 재사용 |
| 세금계산서 발행 자동분개 `TaxInvoiceService.issue → postAutoJournal` | JPA cascade | **있음** | `postAutoJournal`에서 각 라인 검증 |
| 현금출납 확정/수정 재게시 `CashReceiptService → postAutoJournal` | JPA cascade | **있음** | 현금 문서 저장 때 한 번, 분개 게시 때 다시 검증 |
| 현금출납 문서 생성·수정 `CashReceiptService` | `cash_receipts.debit/credit_account_code` JPA | **있음** | create, bank-linked draft, DRAFT 수정, CONFIRMED 수정에서 검증 |
| MIG-9 현금 이관 배치 `Mig9CashJournalService` | JDBC INSERT | **있음** | `chart_of_accounts.is_leaf=TRUE AND is_deleted=FALSE` SQL 조회. 저장 플래그 기준 |
| 분개장 CSV `EcountJournalEntryImporter` | JDBC UPDATE/INSERT | **없음** | `staging.ecount_account_map.account_uuid`를 코드로 가져올 뿐 계정 마스터 존재/leaf 미확인 |
| 일반전표 CSV `EcountGeneralVoucherImporter` | JDBC UPSERT | **없음** | 모든 라인에 pseudo-code `MIGRATION` 저장. 계정 마스터 조회 없음 |
| KFTC 입금매칭 `DepositMatchService.createJournalDraft` | JPA cascade | **없음** | 기본 상수 두 개를 `JournalLine.create`에 직접 전달 |
| 수동 역분개 `JournalService.reverse` | JPA cascade | **없음** | 기존 라인의 코드를 그대로 복사하고 차/대만 swap |
| 자동 역분개 `JournalService.autoReverse` | JPA cascade | **없음** | 기존 라인의 코드를 그대로 복사 |
| dev 시더 `JournalSeeder` | JPA cascade | **없음** | `dev` + `app.accounting.seed-test-data=true`에서만 상수 코드 직접 저장 |
| Flyway V6/V9 seed | SQL INSERT | **애플리케이션 판정 없음** | 애플리케이션 기동 전 DB migration 경로 |
| V101 이관 UPDATE | SQL UPDATE | **이관 target만 migration-time 확인** | 실제 이관된 target 집합만 저장 플래그와 자식 존재를 함께 검사 |

`JournalLine.create()` 자체는 금액 XOR 등 도메인 값만 검사하고 계정 마스터 repository를 알지 못하므로 leaf 제약이 없다.

`EcountReimportService`는 위 Ecount importer와 MIG-9을 순서대로 호출하는 orchestration 표면이며 별도 `journal_lines` 쓰기는 없다. 또한 현재 main에는 분개 Excel **import** 경로가 없고 `JournalExcelExportService`의 export만 있다. 따라서 “Excel import”라는 별도 leaf 우회 경로는 발견되지 않았으며, 실제 파일 import 쓰기는 위 두 CSV importer다.

### 2.2 자동분개 호출망의 실제 범위

현재 main에서 `JournalService.postAutoJournal()` 호출자는 두 곳뿐이다.

```text
CashReceiptService.java:341
TaxInvoiceService.java:257
```

따라서 세금계산서 자동분개와 현금출납 자동분개는 공통 leaf 검증을 타지만, 이름이 “자동”인 모든 분개 경로가 이 메서드를 타는 것은 아니다. KFTC 입금매칭과 MIG-9은 별도 구현이다.

### 2.3 매출·매입 회계전표

현재 main의 `sales_accounting_slips/lines/allocations`와 `purchase_accounting_slips/lines/allocations`에는 `account_code` 컬럼이 없다. `SalesAccountingSlipService`와 `PurchaseAccountingSlipService`도 `journal_lines`를 만들지 않는다. 따라서 현재 경로의 leaf 판정은 **해당 없음**이다.

오늘 CONFIRMED 원천 두 건으로 생성된 것은 이 도메인의 DRAFT 헤더와 allocation이며, 복식부기 `journals/journal_lines`가 아니다. 향후 #1144에서 account code 또는 journal 생성이 추가되면 그때 새 쓰기 경로가 생긴다.

### 2.4 계정 참조를 저장하지만 지금 분개하지 않는 경로

| 저장 컬럼 | 경로 | leaf 판정 | 비고 |
|---|---|---|---|
| `bank_accounts.chart_account_code` | `EcountBankAccountImporter` | **없음** | staging map 존재만 확인, leaf 미확인. `bank_accounts.account_code`는 은행 계좌 비즈니스 코드라 별도 |
| `card_master.linked_account_code` | `EcountCardImporter` | **없음** | CSV 괄호 안 문자열 파싱·길이만 확인, 마스터 존재도 미확인 |
| `chart_of_accounts.code/parent_code/is_leaf` | `EcountAccountImporter` | **입력 플래그 사용** | 현재는 CSV 유래 값을 저장. V101 적용 후 BEFORE/AFTER 트리거가 입력 플래그를 무시하고 자식 유무로 재계산 |

결정 7 문구는 “전표 라인” 제약이다. 위 은행/카드 참조까지 leaf-only로 묶을지는 이 정찰에서 업무 의미를 추론하지 않았다.

### 2.5 범위에서 분리한 동일 이름 컬럼

`arologis-service`의 `arologis_cash_txns.account_code`는 독립 `ArologisSimpleAccount`를 가리키는 단식부기 논리 참조다. `chart_of_accounts` 트리와 `journal_lines`를 사용하지 않으며 leaf 개념도 없다. 이번 결정 7의 물리 경계와 별개로 분리했다.

---

## 3. V101 트리거가 보장하는 것 / 보장하지 않는 것

### 3.1 보장하는 것 — V101이 성공 적용된 DB

V101 `:460-550`은 `chart_of_accounts`에 두 트리거를 만든다.

1. BEFORE INSERT/UPDATE 트리거가 해당 계정의 `NEW.is_leaf`를 `NOT EXISTS(active child)`로 덮어쓴다.
2. AFTER INSERT/DELETE/parent 변경/soft-delete 변경 트리거가 영향받은 부모의 저장 `is_leaf`를 다시 계산한다.
3. 기존 모든 계정의 저장값도 한 번 전수 정합화한다.
4. soft-delete 자식은 자식 수에서 제외한다.
5. V101에서 **실제로 이관된 target code**는 migration 종료 전 저장 `is_leaf=true`이면서 활성 자식도 없어야 한다. 아니면 V101 전체가 롤백된다.

따라서 V101 적용 후 `AccountService`와 MIG-9이 저장 `is_leaf`를 읽더라도 그 저장값은 자식 유무의 파생 캐시가 된다.

### 3.2 보장하지 않는 것

1. `journal_lines` INSERT/UPDATE 차단: 트리거 대상은 `chart_of_accounts`뿐이다.
2. `journal_lines.account_code`의 계정 마스터 존재: FK가 없다. V1도 이를 “logical reference (FK 강제 X)”로 정의한다.
3. 상위 계정 코드의 신규 기표 차단: 직접 JDBC/JPA/SQL로 부모 코드를 넣어도 DB는 허용한다.
4. 기존 4자리/5자리 `journal_lines` 전수 검증: V101 leaf 검사는 `v101_migrated_target_codes`에 들어간 실제 이관 target만 본다.
5. pseudo-code `MIGRATION` 차단 또는 허용 정책: V101이 정의하지 않는다.
6. 애플리케이션의 모든 우회 경로 통합: 분개장 CSV, 일반전표 CSV, KFTC, 시더, 역분개는 그대로 별도다.
7. 현재 집PC에서의 효력: V101이 아직 적용되지 않았으므로 두 트리거가 없다.

### 3.3 집PC 설치 여부 원문

```sql
BEGIN READ ONLY;
SELECT installed_rank,version,description,success
FROM flyway_schema_history WHERE version='101';

SELECT c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
WHERE NOT t.tgisinternal
  AND c.relname IN ('chart_of_accounts','journal_lines');
ROLLBACK;
```

```text
BEGIN
 installed_rank | version | description | success
----------------+---------+-------------+---------
(0 rows)

 table_name | tgname | trigger_def
------------+--------+-------------
(0 rows)

ROLLBACK
```

### 3.4 현재 `journal_lines` 물리 제약 원문

```text
ck_journal_lines_amount_xor        CHECK (차변/대변 XOR)
journal_lines_credit_amount_check CHECK (credit_amount >= 0)
journal_lines_debit_amount_check  CHECK (debit_amount >= 0)
journal_lines_journal_id_fkey     FOREIGN KEY (journal_id) REFERENCES journals(id)
journal_lines_pkey                PRIMARY KEY (id)
```

계정 마스터 FK나 leaf 트리거는 없다.

---

## 4. 실 데이터의 상위 계정 기표 행

### 4.1 자식 유무 기준 전수 쿼리

저장 `is_leaf`를 신뢰하지 않고 활성 자식 존재로 부모를 판정했다. 삭제 journal/line까지 포함한 수와 활성 수를 같이 셌다.

```sql
BEGIN READ ONLY;
SELECT COUNT(*) AS journal_lines_all,
       COUNT(*) FILTER (WHERE is_deleted=FALSE) AS journal_lines_active
FROM journal_lines;

SELECT COUNT(*) AS lines_on_derived_parent_all,
       COUNT(*) FILTER (
         WHERE jl.is_deleted=FALSE AND j.is_deleted=FALSE
       ) AS lines_on_derived_parent_active
FROM journal_lines jl
JOIN journals j ON j.id=jl.journal_id
JOIN chart_of_accounts coa ON coa.code=jl.account_code
WHERE EXISTS (
  SELECT 1 FROM chart_of_accounts ch
  WHERE ch.parent_code=coa.code
    AND ch.code<>coa.code
    AND ch.is_deleted=FALSE
);
ROLLBACK;
```

### 출력 원문

```text
BEGIN
 journal_lines_all | journal_lines_active
-------------------+---------------------
               309 |                  309
(1 row)

 lines_on_derived_parent_all | lines_on_derived_parent_active
-----------------------------+-------------------------------
                           0 |                             0
(1 row)

ROLLBACK
```

### 4.2 저장 플래그 기준 교차검증

```sql
SELECT COUNT(*) AS lines_on_stored_non_leaf_all,
       COUNT(*) FILTER (
         WHERE jl.is_deleted=FALSE AND j.is_deleted=FALSE
       ) AS lines_on_stored_non_leaf_active
FROM journal_lines jl
JOIN journals j ON j.id=jl.journal_id
JOIN chart_of_accounts coa ON coa.code=jl.account_code
WHERE coa.is_leaf=FALSE;
```

```text
 lines_on_stored_non_leaf_all | lines_on_stored_non_leaf_active
------------------------------+--------------------------------
                            0 |                              0
(1 row)
```

### 4.3 현재 활성 라인의 계정 상태 원문

```text
101  28  DERIVED_LEAF    102  49  DERIVED_LEAF
103  10  DERIVED_LEAF    110  99  DERIVED_LEAF
142   5  DERIVED_LEAF    146   1  DERIVED_LEAF
201   3  DERIVED_LEAF    210   1  DERIVED_LEAF
220  34  DERIVED_LEAF    221   1  DERIVED_LEAF
255   7  DERIVED_LEAF    260   1  DERIVED_LEAF
301   1  DERIVED_LEAF    343   1  DERIVED_LEAF
401  42  DERIVED_LEAF    404   4  DERIVED_LEAF
501   1  DERIVED_LEAF    801   3  DERIVED_LEAF
814   9  DERIVED_LEAF    818   5  DERIVED_LEAF
819   2  DERIVED_LEAF    901   1  DERIVED_LEAF
991   1  DERIVED_LEAF
```

23개 코드 309행 모두 현재 활성 자식 0개다. 이는 업무상 허용 판정이 아니라 물리적 자식 유무 집계다.

### 4.4 오늘 QA 잔재 분리

알려진 QA 원천 전표에 연결된 회계전표는 다음 두 건이다.

```sql
BEGIN READ ONLY;
SELECT 'SALES' AS kind,h.slip_no,h.status,h.created_at,
       a.source_slip_no,a.source_line_no
FROM sales_accounting_slip_allocations a
JOIN sales_accounting_slip_lines l ON l.id=a.sales_slip_line_id
JOIN sales_accounting_slips h ON h.id=l.slip_id
WHERE a.is_deleted=FALSE
  AND a.source_slip_no IN ('2026/08/13-1','2026/08/13-2','2026/08/13-3')
UNION ALL
SELECT 'PURCHASE',h.slip_no,h.status,h.created_at,
       a.source_slip_no,a.source_line_no
FROM purchase_accounting_slip_allocations a
JOIN purchase_accounting_slip_lines l ON l.id=a.purchase_slip_line_id
JOIN purchase_accounting_slips h ON h.id=l.slip_id
WHERE a.is_deleted=FALSE
  AND a.source_slip_no='2026/08/13-1';

SELECT j.journal_no,j.journal_date,j.status,j.source_type,j.description,
       j.created_at,COUNT(jl.id) FILTER(WHERE jl.is_deleted=FALSE) AS active_lines
FROM journals j
LEFT JOIN journal_lines jl ON jl.journal_id=j.id
WHERE j.created_at::date=DATE '2026-08-13'
GROUP BY j.id;
ROLLBACK;
```

```text
BEGIN
   kind   |      slip_no      | status |         created_at         | source_slip_no | source_line_no
----------+-------------------+--------+----------------------------+----------------+---------------
 PURCHASE | 2026/08/13-6831   | DRAFT  | 2026-08-13 20:13:46.926208 | 2026/08/13-1   |              1
 SALES    | 2026/08/13-5591   | DRAFT  | 2026-08-13 20:15:35.605346 | 2026/08/13-3   |              1
(2 rows)

 journal_no | journal_date | status | source_type | description | created_at | active_lines
------------+--------------+--------+-------------+-------------+------------+-------------
(0 rows)

ROLLBACK
```

분리 결과:

- QA 회계전표 2건과 allocation 2건은 `sales/purchase_accounting_*` 도메인에만 있다.
- 해당 테이블에는 account code 컬럼이 없다.
- 오늘 생성된 복식부기 `journals`가 0건이므로 `journal_lines` 상위 계정 0행은 QA 제외 전후가 동일하다.
- QA 창고 4건과 거래처 `P-2026-0017`은 `accounting_db.journal_lines` 집계에 직접 들어가는 행이 아니다.

### 4.5 제약을 켰을 때 현재 실 데이터가 깨지는가

- **자식 유무 기준 기존 상위 계정 행 0개**이므로, 기존 `journal_lines`만 놓고 보면 소급 거부 대상은 없다.
- exact SHA `2542fc3f8`의 V101은 `255 → 2559`를 포함하므로 앞서 결정 문서가 지적한 `255` 7행 잔존 가드는 해소 대상으로 들어간다. 단, 집PC DB에는 아직 V101을 실행하지 않았고 이 정찰에서도 실행하지 않았다.
- `journal_lines` 신규 DB 트리거까지 추가하면 현재 데이터보다 먼저 일반전표 CSV의 `MIGRATION` pseudo-code, 부모 직접 삽입을 사용하는 월별 손익 IT fixture, 역사 라인을 복사하는 역분개 경로의 계약을 결정해야 한다.

---

## 5. 애플리케이션 제약 선택지

아래는 상호 배타적 최종안이 아니라 구현 경계 선택지다. 어느 계정이 업무상 기표 가능해야 하는지는 판정하지 않았다.

### 선택지 A — V101 파생 저장값을 애플리케이션 단일 기준으로 사용

`AccountService.requireLeafAccount()`의 현재 계약을 유지하고, 모든 runtime 쓰기 경로가 이 검증 또는 동일한 bulk 검증을 호출하게 한다.

대가와 깨지는 것:

- V101이 먼저 성공 적용되어 저장 플래그가 자식 유무와 동기화된다는 배포 순서에 의존한다.
- 분개장 CSV, 일반전표 CSV, KFTC, 역분개, dev 시더를 공통 게이트로 편입해야 한다.
- `MIGRATION` pseudo-code는 계정 마스터에 없으므로 일반전표 CSV가 현재 계약 그대로는 실패한다.
- 새 JDBC 경로가 공통 서비스를 우회하면 다시 구멍이 생긴다.
- 장점은 현재 `AccountService`/MIG-9 패턴과 맞고 질의가 단순하다는 것이다.

### 선택지 B — 애플리케이션이 매번 자식 유무를 직접 파생

저장 `is_leaf` 대신 `활성 계정 존재 AND NOT EXISTS(active child)`를 공통 validator가 직접 조회한다. 다건 import는 코드 집합을 한 번에 검증하는 bulk API가 필요하다.

대가와 깨지는 것:

- V101 적용 전의 저장 플래그 불일치 44개에도 정확히 반응한다.
- 행마다 단건 조회하면 N+1이므로 수동/자동 분개와 import를 위한 bulk 설계가 필요하다.
- 검증 직후 자식이 추가되는 동시성 경합을 DB 없이 완전히 막지 못한다.
- JDBC/import가 validator를 호출하도록 바꾸지 않으면 여전히 우회 가능하다.
- `MIGRATION`, 역분개, 시더에 대한 예외 여부를 먼저 결정해야 한다.

### 선택지 C — 애플리케이션 선검증 + `journal_lines` DB 강제 제약

사용자 친화적 오류는 A 또는 B로 먼저 반환하고, 별도의 `journal_lines` INSERT/UPDATE 트리거가 최종적으로 활성 계정 존재와 활성 자식 0개를 강제한다. 이는 현재 V101보다 DB 범위를 넓히는 선택이다.

대가와 깨지는 것:

- JPA, JDBC, batch, 향후 새 경로를 모두 막고 검증-저장 사이 race도 DB 시점에 닫는다.
- 현재 V101 트리거만으로는 구현되지 않은 범위다.
- 일반전표 CSV의 `MIGRATION` 라인이 즉시 실패한다.
- `MonthlyIncomeStatementControllerIT`의 부모 직접 기표 fixture가 실패한다. 해당 테스트가 증명하려는 “과거 오염 자료를 보고서에서 제외” 내성을 다른 방식으로 보존할지 결정해야 한다.
- 과거 상위 계정 행이 있었다면 역분개 생성도 실패한다. 집PC 현재 표본은 0행이지만 다른 PC/운영 DB는 별도 실측이 필요하다.
- Flyway가 기존 라인을 이관·검증하는 순서와 트리거 설치 시점을 조정해야 한다.

---

## 6. 개발책임자 판단이 필요한 질문

1. 결정 7은 `journal_lines`가 **DRAFT로 저장되는 순간부터** leaf-only인가, 아니면 POSTED 전이 시점의 기표만 막고 DRAFT/import 중간 상태는 허용하는가?
2. 일반전표 CSV가 쓰는 `MIGRATION` pseudo-code를 폐기·대체할지, 명시적 예외로 유지할지 판단이 필요하다.
3. 결정 7의 대상은 `journal_lines.account_code`만인가, 아니면 아직 분개하지 않는 `cash_receipts.debit/credit_account_code`, `bank_accounts.chart_account_code`, `card_master.linked_account_code`도 leaf-only여야 하는가?
4. 애플리케이션 검증은 V101의 파생 저장값을 신뢰할지(선택지 A), 매번 자식 유무를 직접 조회할지(선택지 B) 판단이 필요하다.
5. V101의 `chart_of_accounts` 트리거와 별도로 `journal_lines` DB 트리거까지 추가할지(선택지 C) 판단이 필요하다.
6. 부모 직접 기표를 심어 보고서 제외를 검증하는 `MonthlyIncomeStatementControllerIT`의 역사 오염 내성을 엄격한 DB 제약 도입 뒤에도 유지할지 판단이 필요하다.
7. 집PC 외 회사PC/운영 DB에서도 자식 유무 기준 상위 계정 기표 0행을 확인한 뒤 제약을 켤지 판단이 필요하다.

---

## 7. 정찰 종료 상태

- 코드 수정 0건
- Git 쓰기 0건
- DB 쓰기 0건
- 모든 DB 쿼리 `BEGIN READ ONLY` + `ROLLBACK`
- 생성 파일: 본 정찰 보고서 1개
