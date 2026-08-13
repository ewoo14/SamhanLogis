# DB 이관 런북 — 회사 PC 재현용

> 🚨 **집 PC 와 회사 PC 는 데이터가 다릅니다.** 아래 수치는 전부 **집 PC 2026-08-09 실측**입니다.
> 회사 PC 에서는 **그 PC 에서 다시 세십시오.** 수치가 다른 것보다 나쁜 것은 **발화 조건이 아예 없는 것**입니다.
> → [`.claude/memory/feedback_home_office_seed_data_differs.md`](../../.claude/memory/feedback_home_office_seed_data_differs.md)

---

## 0. 공통 전제

| 항목 | 값 |
|---|---|
| 정본 파일 | 저장소에 **커밋돼 있습니다** — 다시 받을 필요 없음 |
| 실행 방법 | **실 관리자 API** 로만. 🚫 DB 직접 INSERT/UPDATE 금지 |
| 멱등 | 전부 멱등. 2회차부터 `imported=0` |
| 검증 | 각 절의 SQL 을 **적재 전후로** 돌려 원문을 남길 것 |

```text
docs/migration/896-sheet/ecount/거래처등록.xlsx        1,052,151 bytes
docs/migration/896-sheet/ecount/사원담당리스트.xlsx        7,350 bytes
docs/migration/896-sheet/거래처.csv                    7,858 lines
docs/migration/896-sheet/담당자.csv
docs/migration/896-sheet/구형_템플릿.csv
docs/migration/896-sheet/추천실외기.csv
```

---

## 1. 기초거래처 적재 (`#896` / PR `#1154`)

### 실행

```text
POST /admin/partners/imports/ecount-xlsx
  multipart file = docs/migration/896-sheet/ecount/거래처등록.xlsx
```

### 집 PC 응답 원문 (2026-08-09 · 1회차)

```json
{"totalRows":7253,"imported":49,"updated":7204,"rejectedNullName":0,
 "skippedPlaceholder":0,"activeCount":7253,"suspendedCount":0,
 "sourceFileHash":"064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619",
 "excludedTrailerRows":1,"heldParseFailureRows":0,
 "registrationDateParsedCount":2423,"createdAtLoadTimeCount":4830}
```

`sourceFileHash` 는 **파일이 같으면 같아야 합니다** — 다르면 다른 파일을 올린 것입니다.

### 확정된 정책 (개발책임자 결정 2026-08-09)

| 항목 | 결정 |
|---|---|
| 정본 | 이카운트 `거래처등록.xlsx` (구글 시트 아님 — 시트가 살아 움직여 기준선이 없음) |
| 키 축 | UUID = 서버 키 · **거래처코드 = 매칭 키** (`findByPartnerCode`) |
| 여신한도 | 빈칸 → **`null`** (🚫 `0` 아님 — 한도 초과 출고 제한이 붙으면 전 거래처 차단) |
| 등록일자 | `created_at` · 없으면 **최초 적재 시점**(재적재로 바뀌지 않음) |
| 삭제행 재적재 | **부활 · UUID 유지** (`findByPartnerCodeIncludingDeleted` → `markRestored`) |

### 검증 SQL

```sql
BEGIN TRANSACTION READ ONLY;

-- ① 등록일자가 created_at 에 반영됐는가 (기대: present == matches)
SELECT COUNT(*) AS source_rows,
       COUNT(*) FILTER(WHERE p.registration_date IS NOT NULL) AS registration_present,
       COUNT(*) FILTER(WHERE p.registration_date IS NOT NULL
                        AND p.created_at = p.registration_date::timestamp) AS created_at_matches,
       COUNT(*) FILTER(WHERE p.registration_date IS NULL) AS registration_absent
FROM staging.ecount_partner_raw s
JOIN partners p ON p.id = s.target_partner_id
WHERE s.source_file_hash = '<응답의 sourceFileHash>';

-- ② 여신한도 — 0 이 있으면 안 된다
SELECT COUNT(*) FILTER (WHERE credit_limit IS NULL) AS null_cnt,
       COUNT(*) FILTER (WHERE credit_limit = 0)     AS zero_cnt
FROM partners WHERE is_deleted = FALSE;

-- ③ 조회 키 채움률 — 100% 여야 한다
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE NULLIF(btrim(partner_code),'') IS NOT NULL) AS code_filled
FROM partners WHERE is_deleted = FALSE;

-- ④ 같은 코드로 활성행이 둘 이상이면 안 된다
SELECT partner_code, COUNT(*) FROM partners
WHERE is_deleted = FALSE GROUP BY partner_code HAVING COUNT(*) > 1;
```

### 집 PC 기대값

```text
①  source_rows 7253 / registration_present 2423 / created_at_matches 2423 / absent 4830
②  null_cnt 7253 · zero_cnt 0
③  code_filled 비율 100%
④  0행
```

### 🚨 반드시 밟을 것 — 2회 적재로는 부족합니다

```text
1) 실 관리자 API 로 거래처 1건 삭제        DELETE /admin/partners/{code}
2) 같은 정본 파일로 재적재
3) 확인 — UUID 가 삭제 전과 동일한가 · 그 거래처를 참조하는 행의 고아 0인가
4) 원상 복구 후 CLEANUP_VERIFY 원문 남기기
```

DC율 210행이 **전부 존재하지 않는 거래처를 가리켜 사용 가능 0건**이 된 사고가 정확히 이 경로였습니다.

### 실패행 처리 (PR `#1154` R8)

한 행이 DB 제약에서 실패해도 **뒤의 정상 행은 계속 적재**되고, 실패행은 응답의 `heldParseFailureRows` / `heldSample` 에 `DB_CONSTRAINT` 사유로 보고됩니다. staging 은 `PENDING` 으로 남습니다. **응답에 held 가 0 이 아니면 그 목록을 확인**하십시오.

---

## 2. 품목 상태 동기화 (`#1095` / PR `#1133`)

### 실행

```text
관리자 화면의 시트 동기화 실행
원천: Drive "종합 견적서"  1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ
```

### 확정된 정책

```text
'단종' · '미판매'  →  품목 선택 후보에 미표시
'품절'             →  표시하되 수량 입력 잠금 ('품절' 텍스트)
표기 공란          →  기존 상태 보존 (동기화가 덮지 않는다)
```

### 검증 SQL

```sql
SELECT status, COUNT(*) FROM products WHERE is_deleted = FALSE GROUP BY status;
```

동기화 **전후로** 돌려 표기 없는 품목의 상태가 바뀌지 않았는지 대조하십시오.

⚠️ `V34` 가 `ck_products_status` CHECK 제약을 추가합니다. 기존 행에 네 값(`ACTIVE`·`DISCONTINUED`·`NOT_FOR_SALE`·`OUT_OF_STOCK`) 밖의 값이 있으면 마이그레이션이 실패합니다 — 집 PC 에는 없었습니다.

---

## 3. 비상품 품목 (PR `#1152`)

```text
운임 · 절삭 · 수수료 · 설치비 등 34건
견적품목 메뉴에서 지정 · 납품가 입력 시 수량 자동 1
```

적재가 아니라 **설정**입니다. 화면에서 지정하며, 지정 결과가 DB 에 남는지 확인하십시오.

---

## 4. DC율 재적재 — ⚠️ 거래처 적재가 선행

```text
집 PC 실측: 210행 전부 존재하지 않는 거래처를 가리켜 사용 가능 0건
```

**1번(기초거래처)이 끝난 뒤에** 하십시오. 그 전에는 전부 고아가 됩니다.

---

## 5. 🚨 Flyway 순서 제약 (2026-08-09 기준)

머지 순서를 어기면 `out-of-order = false` 라 **기동 실패**합니다.

```text
auth-service       V96(main) → V98(#1130) → V99(#1145)      ✅ 둘 다 머지됨
inventory-service  V23 → V24(#1151 머지됨) → V25(#1152 열림)
product-service    V32(main) → V33(#1152 열림) → V34(#1133 열림)
```

⟹ **`#1152` 가 `#1133` 보다 먼저** 머지돼야 합니다.

새 마이그레이션을 만들 때는 **`origin/main` 과 열려 있는 다른 PR 의 최대 번호를 함께** 보십시오.

```bash
for b in $(gh pr list --state open --json headRefName --jq '.[].headRefName'); do
  echo "$b $(git ls-tree -r origin/$b --name-only | grep '<service>.*db/migration/V' \
       | sed 's|.*/V||;s|__.*||' | sort -n | tail -1)"
done
```

---

### 5.1 V31 오삭제로 V33에서 기동이 막힌 기존 DB 복구

#### 증상

```text
product-service 부팅 실패
NON_GOODS 후보 수가 0 또는 34가 아닙니다: N
```

#### 원인

기존 `product_db`에 `created_by IN ('system','qa-seed')` 레거시 시드가 남아 있는 상태에서
V31이 적용되면, V31의 `products` 술어가 101개 UUID 밖의 정상 품목까지 soft-delete 한다.
그 결과 V33의 비상품 후보 수가 34 미만이 되어 Flyway가 V35까지 도달하지 못한다.

#### 조치

이 절차는 V33 실패로 서비스가 기동하지 않는 경우에만 수행한다. DB 직접 수정은 이 장애 복구의
명시적 예외이며, 임의의 `created_by` 기준 복구를 하지 않는다.

아래 명령은 저장소 루트에서 PowerShell로 실행한다. 회사PC에 host `psql`이나
`PRODUCT_DB_URL`이 없어도 되며, 저장소의 `samhan-postgres` 컨테이너 안의 `psql`을 사용한다.
`docker cp`는 SQL 파일을 컨테이너에 전달하기 위한 것이고, DB 쓰기는 다음 `psql` 명령에서만
V35의 복구 범위대로 수행된다.

1. 복구 전 활성 품목 수와 cleanup actor 표식을 **읽기 전용 SQL**로 기록한다.

   ```powershell
   docker exec samhan-postgres psql -X -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "SELECT COUNT(*) AS active_products_before FROM products WHERE is_deleted = FALSE; SELECT COUNT(*) AS cleanup_tagged_products FROM products WHERE is_deleted = TRUE AND deleted_by = 'issue-1096-test-seed-cleanup';"
   ```

2. 서비스 소스와 같은 릴리스의 `V35__repair_issue_1096_product_cleanup.sql`을 그대로 실행한다.
   이 파일은 cleanup actor가 붙은 행 중 V31의 101개 UUID 밖인 제품·alias·bundle·estimate exposure만
   되살리고, 복구된 비상품 후보에 V33 전환을 재적용한다. 101개 UUID는 되살리지 않는다.

   ```powershell
   docker cp .\services\product-service\src\main\resources\db\migration\V35__repair_issue_1096_product_cleanup.sql samhan-postgres:/tmp/V35__repair_issue_1096_product_cleanup.sql
   if ($LASTEXITCODE -ne 0) { throw "V35 SQL 파일을 samhan-postgres 컨테이너로 복사하지 못했습니다." }
   docker exec samhan-postgres psql -X -U samhan -d product_db -v ON_ERROR_STOP=1 --file=/tmp/V35__repair_issue_1096_product_cleanup.sql
   if ($LASTEXITCODE -ne 0) { throw "samhan-postgres의 product_db에서 V35 복구가 실패했습니다." }
   docker exec samhan-postgres rm -f /tmp/V35__repair_issue_1096_product_cleanup.sql
   ```

   이 수동 실행은 `flyway_schema_history`를 기록하지 않는다. 따라서 재기동 후 Flyway가 V33 → V34 →
   V35를 정상 순서로 적용하며, V35 재실행은 멱등하게 통과한다.

3. 복구 후 같은 SQL로 활성 품목 수를 다시 기록한다.

   ```powershell
   docker exec samhan-postgres psql -X -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "SELECT COUNT(*) AS active_products_after FROM products WHERE is_deleted = FALSE;"
   ```

   PM 회사 PC 실측 원문 수치는 **3,061 → 1,947 → 복구 후 3,061**이다. 이 숫자를 다른 DB의
   기대값으로 사용하지 말고, 해당 DB에서 실제 출력한 값을 함께 보관한다.

4. product-service를 재기동하고 V33이 통과했는지 확인한다. 이후 V35 적용 후 다음을 확인한다.

   ```powershell
   docker exec samhan-postgres psql -X -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "SELECT goods_type, inventory_qty_mgmt, COUNT(*) AS candidate_count FROM products WHERE is_deleted = FALSE AND model_code IN ('00101','01018','AAAA-00026','AAAA-00027','AAAA-00028','AAAA-00029','AAAA-00030','AAAA-00032','AAAA-00033','ZENG-00001','ZENG-00003','ZENG-00004','ZENG-00005','설치비1','설치비10','설치비11','설치비12','설치비13','설치비14','설치비15','설치비2','설치비3','설치비4','설치비5','설치비6','설치비7','설치비8','설치비9','영업수수료','운임','절삭','조달수수료','카드수수료','판매수수료') GROUP BY goods_type, inventory_qty_mgmt;"
   ```

   운임·절삭을 포함한 34개가 `NON_GOODS`, `inventory_qty_mgmt = FALSE`여야 한다.

---

## 6. QA 잔재 — 결함으로 오인하지 말 것

공유 DB 에 QA 라운드가 남긴 행이 있습니다. **가르는 근거는 `created_by`·`created_at`·이름**입니다.

| 잔재 | 표식 |
|---|---|
| 최근단가 `561,600` | QA BLOCK 을 유발했던 값 |
| 창고 `QA-1039-*` · 코드 `2` · `00003` | 이름에 라운드 식별자 |
| 품목 `QA797` · `9,999,999,999,999원` | 이름에 라운드 식별자 |
| **거래처 `1068689215`** | 삭제행+활성행 2개 · 고아 참조 2건. **집 PC 전용** — 2026-08-09 R4 검증 산물, 일회성 복구 예정 |

🚫 잔재를 지워 "해결" 하지 말고, 복구 대상으로도 세지 마십시오.
