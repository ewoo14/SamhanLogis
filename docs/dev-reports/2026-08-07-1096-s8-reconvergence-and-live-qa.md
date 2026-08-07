# PR #1097 / 이슈 #1096 — S8 재수렴 적대검증 + SOL 직접 라이브 QA

검증일: 2026-08-07 KST  
검증자: SOL (코드 검토만이 아니라 실 게이트웨이·실 DB·t1096 렌더러·headless Chromium 직접 실행)  
판정: **실 사용자 도달 결함 2건. 결함 0 아님.**

## 0. 환경 확인 — 실행 전에 재확인한 값

| 항목 | 재확인 결과 |
|---|---|
| cwd | `C:\dev\Samhan-Public\.claude\worktrees\t1096` |
| 브랜치 / HEAD | `chore/1096-test-seed-cleanup` / `19b3c3a25` |
| 비교 기준 | `origin/main` `ad99dda99`; `git diff origin/main...HEAD` 35파일 |
| 작업트리 | 검증 시작 시 clean |
| Docker | **18/18 컨테이너 healthy** |
| 배포 이미지 | slip/product 16:54 KST경, partner-order 17:01 KST경 생성 이미지로 실행 중 |
| Flyway | `slip_db V117`, `product_db V31`, `partner_order_db V18`, 모두 `success=true` |
| 게이트웨이 | `GET http://localhost:8080/actuator/health` → HTTP 200 |
| 자격 | `infrastructure/.env.local`은 없음. `docs/handoff/CURRENT-WORK.md` 환경 절 사용. 보고서에는 `<redacted>`만 기록 |
| 렌더러 | **t1096**의 `clients/desktop`, `http://127.0.0.1:5196`, 앱 버전 `2026/08/07-109608` |
| 브라우저 | `chromium.launch({ headless: true })`, 1600×1000 |

컨테이너는 재빌드·재기동하지 않았다. DB에는 직접 `INSERT/UPDATE/DELETE`하지 않았고 모든 직접 DB 명령은 `SELECT`였다. 로컬 렌더러는 최초에 design-system `dist`가 없어 모듈 해석이 실패했으므로 t1096 안에서 design-system 의존성을 설치하고 `npm run build`만 수행했다. 컨테이너에는 영향이 없다.

초기 렌더러 버전값 `2026/08/07-1096-s8`은 숫자 suffix 가드에 걸려 프로세스 시작 전에 종료됐다. 정본 형식 `2026/08/07-109608`로 다시 시작했고, 실패 프로세스는 남지 않았다.

## 1. 결론

### 도달 결함 F1 — 대량 soft-delete 뒤 기본 목록이 활성 집합을 표시하지 않는다

- DB baseline 활성 견적은 34건, 주문은 3건이다.
- 실 GUI 기본 목록은 견적 **전체 2,027건**, 주문 **전체 1,988건**으로 표시했다.
- 원인은 관리자 목록의 기존 `includeDeleted=true` 계약이다. 삭제행을 감사·복원용으로 보여주는 기능 자체는 동작하지만, 이번 대량 삭제 뒤 기본 화면이 삭제행 수천 건으로 채워져 “34건/3건이 남았다”는 활성 모집단을 표현하지 못한다.
- 주문 화면에서는 활성 3건이 상단에 있었지만 뒤로 삭제행과 `복원` 버튼이 수천 건 이어졌다. 견적도 활성 34건과 cleanup 1,986건, 과거 삭제 7건이 같은 `전체` 카운터에 합쳐졌다.
- **실 사용자 경로 재현 가능**: `/sales/estimates`, `/sales/partner-orders` 진입만으로 재현된다.

증거:

- [견적 기본 목록 — 전체 2,027건](../qa-shots/1096-s8-live-qa/03-estimates-list.png)
- [주문 기본 목록 — 전체 1,988건](../qa-shots/1096-s8-live-qa/05-partner-orders-list.png)
- [활성 주문번호 검색 — 1건으로 정상 축소](../qa-shots/1096-s8-live-qa/06-partner-orders-active-search.png)

### 도달 결함 F2 — “남은 전표가 모두 실데이터”가 아니다

- QA 시작 전 활성 전표 343건 중 `created_by='system'` 100건과 `system-internal` 3건, 합계 **103건**이 남아 있었다.
- `2026/01/01-1`은 `[Stage 2 시드]`, `TEST-MODEL-0001`, `테스트제품-TEST-MODEL-0001`을 실 상세 화면에 표시한다.
- 따라서 “남은 343 전표가 정말 실데이터”라는 전제는 거짓이다. 이번 PR의 101개 product UUID 참조 cleanup과 별개인 시드 문서가 사용자 화면에 잔존한다.
- **실 사용자 경로 재현 가능**: 활성 전표 조회 후 상세를 열 수 있다.

증거: [잔존 system 시드 전표 상세](../qa-shots/1096-s8-live-qa/16-residual-system-seed-slip-detail.png)

수정 지시서는 [2026-08-07-1096-s8-fix-directive.md](2026-08-07-1096-s8-fix-directive.md)에 분리했다.

## 2. 과잉 삭제 판정

### 2.1 ① 남은 데이터가 정본인가

| 데이터 | baseline 활성 | 판정 |
|---|---:|---|
| 품목 | 3,082 | **PASS** — `ECOUNT 1,963 + SHEET 1,119`; 다른 lineage 0 |
| 전표 전체 | 343 | **FAIL** — system/system-internal 시드 103건 포함 |
| 판매전표 화면 모집단 | 301 | 사용자 제시 343은 판매/입고 합계. baseline은 `OUTBOUND 301 + INBOUND 42`라는 제3 상태 |
| 견적 | 34 | **관측 불가** — 전부 `[DEV-SEED] 개발매니저` 생성. 문서 lineage 컬럼이 없어 SHEET/ECOUNT 정본임을 증명할 수 없음 |
| 주문 | 3 | **관측 불가** — 2건 `[DEV-SEED] 개발영업`, 1건 auth 계정 매핑 불가. 문서 lineage 없음 |

품목 SQL 원문:

```sql
SELECT count(*) AS active_products
FROM products
WHERE is_deleted = FALSE;

SELECT lineage, count(*)
FROM products
WHERE is_deleted = FALSE
GROUP BY lineage
ORDER BY lineage;
```

결과:

```text
active_products = 3082
ECOUNT = 1963
SHEET  = 1119
```

잔존 전표 SQL 원문:

```sql
SELECT created_by, status, count(*) AS rows,
       min(created_at) AS first_created,
       max(created_at) AS last_created
FROM slips
WHERE is_deleted = FALSE
GROUP BY created_by, status
ORDER BY rows DESC;

SELECT count(*) AS residual_obvious_seed_slips
FROM slips
WHERE is_deleted = FALSE
  AND created_by IN ('system', 'system-internal');

SELECT slip_type, count(*)
FROM slips
WHERE is_deleted = FALSE
GROUP BY slip_type
ORDER BY slip_type;
```

QA 작성 전 결과는 `residual_obvious_seed_slips=103`, `OUTBOUND=301`, `INBOUND=42`다. SOL GUI QA가 판매전표 1건을 추가한 뒤에는 `OUTBOUND=302`, 전체 344가 됐다.

### 2.2 ② 지워진 집합에 실데이터가 섞였는가

cleanup actor 기준 실측은 다음과 같다.

| 문서 | cleanup 행 | 생성자 분포 |
|---|---:|---|
| slips | 2,064 | dev_sales `[DEV-SEED]` 1,431; dev_manager `[DEV-SEED]` 603; dev_master `[DEV-SEED]` 16; service account 14 |
| estimates | 1,986 | dev_sales `[DEV-SEED]` 1,430; dev_manager `[DEV-SEED]` 543; dev_master `[DEV-SEED]` 13 |
| partner_orders | 2,018 | dev_sales `[DEV-SEED]` 1,494; dev_manager `[DEV-SEED]` 489; system 30; dev_master `[DEV-SEED]` 4; qa-tester 1 |

SQL 원문:

```sql
SELECT created_by, status, count(*) AS rows,
       min(created_at) AS first_created,
       max(created_at) AS last_created
FROM slips
WHERE deleted_by = 'issue-1096-test-seed-cleanup'
GROUP BY created_by, status
ORDER BY rows DESC;

SELECT created_by, status, count(*) AS rows,
       min(created_at) AS first_created,
       max(created_at) AS last_created
FROM estimates
WHERE deleted_by = 'issue-1096-test-seed-cleanup'
GROUP BY created_by, status
ORDER BY rows DESC;

SELECT created_by, status, count(*) AS rows,
       min(created_at) AS first_created,
       max(created_at) AS last_created
FROM partner_orders
WHERE deleted_by = 'issue-1096-test-seed-cleanup'
GROUP BY created_by, status
ORDER BY rows DESC;
```

생성자 ID는 `auth_db.accounts`에서 login/display name으로 대조한 뒤 보고서에서는 UUID를 노출하지 않았다.

판정:

- cleanup 집합에서 일반 운영 계정 생성자를 관측하지 못했다. 생성자 표식과 대량 생성 시간대는 모두 개발/QA 집합을 가리킨다.
- 다만 문서 테이블에는 SHEET/ECOUNT 같은 provenance가 없고 `[DEV-SEED]` 계정도 실제 GUI로 문서를 만들 수 있다. 따라서 “삭제된 모든 문서가 비실데이터임을 DB가 증명한다”는 판정은 **관측 불가**다. 이 축을 결함 0으로 세지 않는다.
- 사용자 우려였던 “일반 운영계정 문서가 cleanup actor로 삭제됨”은 현재 DB에서 관측되지 않았다.

PM 수치와의 차이:

```text
PM 삭제: slips 2062, estimates 1983
actor 실측: slips 2064, estimates 1986
```

Flyway V117 적용시각은 `2026-08-07 16:54:39.485107`이고, cleanup 집합의 최신 생성은 전표 `16:33:14`, 견적 `14:09:25`다. PM의 적용 전 SQL 실행시각 원문이 없어, (a) PM 집계와 Flyway 사이 동시 생성, (b) PM 집계 필터 차이, (c) 이전 스냅샷 전달 중 무엇인지는 확정할 수 없다. 이는 제시된 전/후 두 값 밖의 셋째 가능성이며 **관측 불가**로 기록한다.

### 2.3 ③ 되돌릴 수 있는가

**PASS.** 물리 삭제는 없고 세 마이그레이션 모두 cleanup actor 한정 복구 SQL을 주석으로 갖는다.

- product V31: 130~134행
- partner-order V18: 124~126행
- slip V117: 174~179행

SQL 형태:

```sql
UPDATE <target_table>
SET is_deleted = FALSE,
    deleted_at = NULL,
    deleted_by = NULL
WHERE deleted_by = 'issue-1096-test-seed-cleanup';
```

헤더 테이블은 `deleted_by_name=NULL`까지 포함한다. 본 라운드는 복구 SQL과 GUI 복원 버튼을 실행하지 않았다.

## 3. SOL 직접 라이브 QA ①~⑥

### ① 판매전표 목록·상세

- baseline DB 활성 `slips=343`은 판매+입고 합계다. 판매 화면은 baseline `OUTBOUND=301`이다.
- `/sales/slips` 목록은 렌더됐고 활성 `2026/08/07-17` 상세가 정상 열렸다.
- 목록은 삭제 판매전표도 함께 노출하므로 첫 행에 cleanup 삭제 전표와 복원 버튼이 표시됐다.

증거: [목록](../qa-shots/1096-s8-live-qa/01-sales-slips-list.png), [활성 상세](../qa-shots/1096-s8-live-qa/02-sales-slip-detail.png)

### ② 견적 목록·상세

- baseline 활성 34건.
- 활성 `2026/08/07-2` 상세가 정상 열렸다.
- 기본 목록 카운터는 삭제행 포함 2,027건이라 F1로 판정했다.

증거: [목록](../qa-shots/1096-s8-live-qa/03-estimates-list.png), [상세](../qa-shots/1096-s8-live-qa/04-estimate-detail.png)

### ③ 주문서 목록

- 활성 3건.
- 정확 주문번호 검색에서 활성 1건으로 축소되고 상세가 열렸다.
- 기본 목록은 삭제행 포함 1,988건이라 F1로 판정했다.

증거: [목록](../qa-shots/1096-s8-live-qa/05-partner-orders-list.png), [활성 검색](../qa-shots/1096-s8-live-qa/06-partner-orders-active-search.png), [상세](../qa-shots/1096-s8-live-qa/06b-partner-order-detail.png)

### ④ 품목 조회·검색

- 활성 3,082건은 전부 ECOUNT/SHEET다.
- 삭제 대상 표본 `AR05TXEAAWKNEU-01` 검색은 0건.
- 활성 SHEET 표본 `AC023CS1DBC1SY` 검색은 1건.

증거: [전체 목록](../qa-shots/1096-s8-live-qa/07-products-list.png), [삭제 품목 0건](../qa-shots/1096-s8-live-qa/08-deleted-product-search-empty.png), [활성 품목 1건](../qa-shots/1096-s8-live-qa/08b-active-product-search.png)

### ⑤ 신규 작성 — 최우선 경로

**PASS. 전표와 견적을 실제 GUI에서 각각 1건 저장했다.**

- 판매전표: 본사창고 + 실제 거래처 + 활성 SHEET 세트 `AC023CS1DBC1SY` 선택. 구성품 4행으로 전개돼 저장됐고 `2026/08/07-19` 상세가 열렸다. baseline 343→344.
- 견적: 같은 거래처와 품목을 선택하고 수량 1 입력. `POST /slips/estimates` HTTP 201, `2026/08/07-4` 상세로 이동. baseline 34→35.
- 첫 견적 저장 시 수량 0 상태에서는 “수량 > 0” 안내로 쓰기 요청 없이 차단됐고, 수량 1 입력 후 정상 저장됐다. 이는 정상 validation이다.

증거:

- [새 판매전표 초기](../qa-shots/1096-s8-live-qa/09-new-slip-form.png)
- [판매전표 저장 직전](../qa-shots/1096-s8-live-qa/11-new-slip-ready-to-save.png)
- [판매전표 저장 후 상세](../qa-shots/1096-s8-live-qa/12-new-slip-saved-detail.png)
- [새 견적 초기](../qa-shots/1096-s8-live-qa/10-new-estimate-form.png)
- [견적 저장 직전](../qa-shots/1096-s8-live-qa/13-new-estimate-ready-to-save.png)
- [견적 저장 후 상세](../qa-shots/1096-s8-live-qa/14-new-estimate-saved-detail.png)

### ⑥ 삭제 품목을 참조했던 남은 문서 상세

- cleanup 라인을 하나 이상 가지면서 헤더가 활성인 전표는 **89건**이다.
- 표본 `2026/08/06-23`은 cleanup 라인 1개가 숨겨지고 정본 3라인이 정상 표시됐다. 상세, 합계, 액션 영역 모두 열렸다.
- 활성 견적 중 cleanup 라인을 가진 문서는 0건이다. 개발책임자의 “혼합 견적 전체 삭제” 결정과 일치한다.

SQL 원문:

```sql
SELECT count(*)
FROM slips s
WHERE s.is_deleted = FALSE
  AND EXISTS (
      SELECT 1
      FROM slip_lines l
      WHERE l.slip_id = s.id
        AND l.deleted_by = 'issue-1096-test-seed-cleanup'
  );

SELECT count(*)
FROM estimates e
WHERE e.is_deleted = FALSE
  AND EXISTS (
      SELECT 1
      FROM estimate_lines l
      WHERE l.estimate_id = e.id
        AND l.deleted_by = 'issue-1096-test-seed-cleanup'
  );
```

결과는 전표 89, 견적 0이다. 증거: [혼합 전표 상세 — 정본 3라인](../qa-shots/1096-s8-live-qa/15-mixed-slip-detail-after-cleanup.png)

## 4. 삭제행 복원 표면 보조 확인

- cleanup 견적 `2026/08/07-3`: 삭제행은 보이지만 복원 버튼 없음(`restoreAvailable=false`).
- cleanup 주문 `2026/06/08-1983`: 삭제행과 복원 버튼이 보임. 실행하지 않았다. 주문 그래프는 actor/삭제시각 일치 시 일반 복원을 허용하는 기존 계약이다.

증거: [견적 복원 비노출](../qa-shots/1096-s8-live-qa/17-deleted-estimate-restore-blocked.png), [주문 복원 노출](../qa-shots/1096-s8-live-qa/18-deleted-order-restore-blocked.png)

## 5. 본 범위 / 안 본 범위

본 범위:

- 세 migration 적용 상태와 row count
- 활성/cleanup 생성자·생성시각 분포
- t1096 데스크톱의 판매전표·견적·주문·품목 GUI
- 신규 판매전표/견적 실제 저장
- 혼합 전표 상세

안 본 범위:

- **범위 외** 입고전표 UI, 구매 화면, 모바일 앱, 거래처 PWA는 조사하지 않았다.
- **범위 외** inventory의 보존 참조(`stock_balances`, `stock_instances`, `stock_movements`) 정합은 조사하지 않았다.
- cleanup 문서 6,068건의 본문을 한 건씩 판독하지 않았다. 생성자/시각/상태 집계와 GUI 표본으로 판정했다.
- 일반 복원 API/버튼은 실행하지 않았고 삭제행을 되살리지 않았다.
- auto-update 503 배너, `/logs/front` 503, SalesSubNav duplicate-key 경고는 이 PR의 seed cleanup 범위로 조사하지 않았다.
- 다른 워크트리와 컨테이너 재기동/재빌드는 건드리지 않았다.

## 6. 새 파일

- `docs/dev-reports/2026-08-07-1096-s8-reconvergence-and-live-qa.md`
- `docs/dev-reports/2026-08-07-1096-s8-fix-directive.md`
- `docs/qa-shots/1096-s8-live-qa/*.png` 20장

