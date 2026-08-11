# PR #1166 제품구분 SOL 5.6 재검토 R2

- 검토일: 2026-08-11 (KST)
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wdg2`
- 검토 HEAD: `a2619089904eca7acfbca45a867780ee4ee8860f`
- 기준 PR: #1166
- 공유 DB: `BEGIN TRANSACTION READ ONLY`로 조회만 수행. write·migration·rollback 없음
- 격리 검증: Testcontainers PostgreSQL 16
- git: 조회 명령만 사용. checkout/fetch/pull/add/commit/reset 없음
- 판정: **차단결함 1건 — 구현자 보완 후 재검토 필요**

## 1. 판정 요약

기존 SOL 결함 3건의 수정 자체는 다음처럼 통과했다.

| 축 | 판정 | 직접 증거 |
|---|---|---|
| SOL-1 목록 제품구분/필터/count/AND | PASS | 실제 desktop renderer Playwright `2 passed`; 격리 DB count `전체 1→1`, `미분류 1→0`, `q+미분류 1→0` |
| SOL-2 rollback 4조건 | PASS | 격리 혼합 batch에서 대상 1건만 복원, 2회차 0건; 각 skip 행과 감사 상태 보존 |
| SOL-3 main 병합/V38 | PASS | 병합 당시 교집합 2파일 확인; 현재 origin/main 신규 교집합 0; main V37, HEAD V38 연속 |

그러나 새 조합에서 다음 1건이 재현됐다.

| ID | 심각도 | 결함 |
|---|---|---|
| R2-1 | P1 / merge blocking | V38 감사행이 이미 있는 제품을 담당자가 `classification_manual=true`와 제3 제품구분으로 고친 뒤 `apply()`를 재실행하면, 백필이 수동값을 감사 적용값으로 다시 덮는다. |

정상 Flyway 재부팅은 이미 적용된 V38을 다시 실행하지 않는다. 하지만 구현 Javadoc이 `apply()`를 migration 재실행 검증 경로로 명시하고 있고, 요구 불변식도 “백필·rollback 양쪽에서 `classification_manual=true` 불가침”이다. 또한 최초 실행 중 후보 조회와 UPDATE 사이의 사후 변경 경계에도 같은 누락 조건이 존재한다. 따라서 전체 suite GREEN만으로 닫을 수 없다.

## 2. 첫 각도 — 실패했던 기초품목 목록

### 2.1 실제 화면 재실행

`clients/desktop`에서 실제 renderer를 `vite.config.ts`, root `src/renderer`, `VITE_API_BASE_URL=http://127.0.0.1:1`로 띄우고 설치된 Playwright 1.59.1 / `chromium-1217` headless로 실행했다. 인증과 API만 `page.route` fixture로 격리했다.

최종 결과:

```text
Running 2 tests using 1 worker
[1/2] 등록 폼의 필수 카테고리 선택에서 미분류를 선택할 수 있다
[2/2] 기초품목 화면에서 미분류 필터와 2,126건 카운트를 제공한다
2 passed (2.7s)
```

캡처:

1. [01-form-unregistered-selected.png](../qa/2026-08-11-category-r2/01-form-unregistered-selected.png) — 등록 폼 `미분류` 선택
2. [02-catalog-before-category-filter.png](../qa/2026-08-11-category-r2/02-catalog-before-category-filter.png) — 필터 미선택, `총 3,084건`
3. [03-catalog-unregistered-filtered.png](../qa/2026-08-11-category-r2/03-catalog-unregistered-filtered.png) — `제품구분=미분류`, 행 제품구분 `미분류`, `총 2,126건 / 미분류 2,126건`
4. [04-catalog-filter-cleared.png](../qa/2026-08-11-category-r2/04-catalog-filter-cleared.png) — 필터 해제 후 `총 3,084건`

첫 실행은 BrowserRouter 서버에 HashRouter URL을 사용해 두 테스트 모두 대시보드로 낙착했다. 제품 assertion 실패가 아닌 하네스 오류였으며, 요청에 따라 원문을 [playwright-first-run-failure.txt](../qa/2026-08-11-category-r2/playwright-first-run-failure.txt)에 첨부했다. 의도된 HashRouter 하네스로 교정한 뒤 위 최종 결과를 얻었다.

### 2.2 count가 동적인가

화면 코드는 `selectedPhysicalCategory.name + listQuery.data.totalElements`를 렌더링한다. production source에서 `2,126/3,084` 업무 수치 리터럴을 검색했으며 관련 일치는 0건이었다. 고정 수치는 결정적 화면 fixture에만 있다.

격리 PostgreSQL에서 한 제품을 `UNCLASSIFIED → INDOOR_WALL`로 직접 바꾸고 같은 repository count query를 다시 실행했다.

```text
R2_DYNAMIC total=1->1 unregistered=1->0 and=1->0
```

- 필터 미선택 전체 count는 동일하다.
- 미분류 count만 정확히 1 감소한다.
- `q=R2-DYNAMIC-COUNT AND categoryId=UNCLASSIFIED` 결과도 1→0으로 변한다.

따라서 UI count는 백엔드 `totalElements`를 따르며 하드코딩이 아니다. 상세 원문은 [isolated-postgres-probe-output.txt](../qa/2026-08-11-category-r2/isolated-postgres-probe-output.txt)에 있다.

### 2.3 필터 미선택/검색 회귀

`ProductRepository.searchByUsageScope`의 content query와 count query 모두 물리 제품구분 조건을 다음 null guard로 추가했다.

```sql
AND (CAST(:physicalCategoryId AS text) IS NULL
     OR p.category_id = CAST(:physicalCategoryId AS uuid))
```

기존 4인자 overload는 새 5인자 메서드에 `physicalCategoryId=null`을 전달한다. 격리 probe에서 필터 전후 전체 count가 `1→1`로 같았고, 실제 화면도 `3,084→2,126→3,084`였다. 검색어 조건은 괄호 안 OR 묶음 뒤에 물리 category 조건이 별도 AND로 결합된다.

기존 `category`는 `EstimateCategory`, 신규 `categoryId`는 물리 `products.category_id`로 끝까지 분리돼 있다. DTO도 `productCategory`와 `physicalCategory`를 별도 필드로 유지한다.

## 3. 두 번째 각도 — main 병합 의미 충돌

### 3.1 교집합을 두 기준으로 계산한 결과

요청한 현재 공식의 결과:

```text
merge-base(HEAD, origin/main) = 0ced104f2f5f8dfa9ac7e6136e3098f7e5da0f1a
feature files = 43
origin/main files = 45
intersection = 0
```

현재 merge-base가 이미 5개 main 병합을 포함한 `ccc5dd82b`의 main 부모이므로, 이 공식만 쓰면 #1132의 당시 겹침이 사라진다. 실제 병합 의미 충돌은 병합 전 양 부모의 공통기준으로 별도 계산했다.

```text
feature parent = f8f36bc06
main parent    = 0ced104f2
pre-merge base = 436c6d332
feature files = 32
main files = 157
intersection = 2
```

교집합 전수:

1. `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`
2. `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`

### 3.2 ProductSheetSyncService 양쪽 의도

merge 결과를 양 부모와 각각 대조했다.

- #1132/V37 의도 보존: `v37ManagedParents`, `isActiveDefaultBackfillBundle`, 감사 부모의 교체·신규 구성품 `isDefault=true`, rollback 완료 부모의 문자열 규칙 복귀가 남아 있다.
- #1166 의도 보존: 신규 시트 품목은 `ProductNameCategoryClassifier.classify(name)` 결과 category로 생성되고, soft-delete 재등장은 `findLatestDeletedByModelCode → markRestored()` 후 기존 category를 보존한다.
- 두 test 집합도 모두 merge 결과에 남았다. 전체 product-service 777 tests에서 V37 RED-A/RED-B와 신규 OUTDOOR/UNCLASSIFIED/재등장 테스트가 함께 통과했다.

텍스트 conflict marker는 제품 서비스와 desktop renderer에서 0건이었다.

### 3.3 V38 번호 재확인

로컬 remote-tracking ref 기준 `origin/main=c7013f247`이고, `0ced104f2..origin/main`에는 #1165 및 후속 문서 커밋이 있다.

```text
origin/main: COUNT=37 MAX=37 MISSING=
HEAD:        COUNT=38 MAX=38 MISSING=
```

따라서 V38은 현재 origin/main product-service 최대 V37의 정확한 +1이다. 현재 추가 main 변경과 PR 변경 파일의 교집합은 0이다.

## 4. 세 번째 각도 — rollback 4조건

격리 PostgreSQL 한 transaction에 다음 6행을 섞었다.

| 행 | 깨뜨린 조건 | rollback 후 결과 |
|---|---|---|
| eligible | 없음 | `OUTDOOR → INDOOR_WALL`, 감사 완료 |
| completed | 감사행 이미 완료 | `OUTDOOR` 유지, 기존 완료 유지 |
| productDeleted | 제품 soft-delete | `OUTDOOR` 유지, 감사 미완료 |
| manual | `classification_manual=true` | `OUTDOOR` 유지, 감사 미완료 |
| currentMismatch | 현재 category=`INDOOR`, applied=`OUTDOOR` | `INDOOR` 유지, 감사 미완료 |
| auditDeleted | 감사행 soft-delete | `OUTDOOR` 유지, 감사 미완료 |

실측:

```text
R2_ROLLBACK first=1 second=0
```

첫 실행은 eligible 1건만 `UPDATE ... RETURNING a.id`로 복원·완료했고, 두 번째 실행은 0건이었다. 기존 구현자의 혼합 batch 테스트는 manual/soft-delete/completed/audit-deleted를 다루지만 `currentMismatch`를 단독으로 만들지 않았다. 검토 probe가 이 누락 조합을 별도로 만들어 통과를 확인했다.

결론: 요청한 rollback 4조건, 혼합 batch, 재실행 안전성에는 결함이 없다.

## 5. RED-B 보존 재확인

### 5.1 공유 DB read-only 재계수

`samhan-postgres/product_db`에서 `BEGIN TRANSACTION READ ONLY` 및 `transaction_read_only=on`을 확인한 뒤 재계수했다.

```text
active_products=3,084
classification_manual=true=0
받침대 선행 패턴=18
그중 실외기 이름=11
그중 실내기 이름=2
구성품 OUTDOOR 순증=41
다중 역할 제품=11
```

18행을 전수 출력해 이전 R1 목록과 동일함을 확인했다. 11개 지정 받침대는 모두 선행 `PIPING` 대상이고, 나머지 7개도 받침대/브라켓 부자재라 정상 본체 과잉 매칭은 0이다.

### 5.2 코드/회귀 축

- 모델코드 접두 분류 없음: production 호출은 V38의 `classify(candidate.name(), componentKinds)`와 시트 신규의 `classify(name)` 두 곳뿐이다. classifier API 자체도 modelCode를 받지 않는다.
- 시트 신규 자동분류와 soft-delete 재등장 보존: merge 결과와 IT 통과.
- 견적·전표·세트/정액DC 축: 이번 PR diff는 `Product.productCategory`, 견적/전표 계산, slip-service를 바꾸지 않는다. 목록 API에서 기존 `category`와 신규 `categoryId`도 분리돼 있다.
- 기존 목록 열/필터/정렬: 기존 열을 삭제하거나 순서를 바꾸지 않고 `제품구분` 열만 별도 추가했다. repository 정렬 `e.display_order ASC NULLS LAST, p.model_code ASC`도 유지된다.

다만 `classification_manual=true`의 최초 백필 제외와 rollback 제외만 통과했고, **사후 수동 변경 뒤 백필 재실행은 R2-1로 실패**했다.

## 6. 결함 R2-1 지시서

### 6.1 불변식

1. `classification_manual=true` 제품은 백필 후보 조회뿐 아니라 실제 UPDATE 시점에도 절대 변경하지 않는다.
2. 감사행이 과거에 생성돼 있어도 현재 제품이 수동분류이면 그 감사행을 근거로 재적용하지 않는다.
3. skip된 수동행의 category, `modified_at/by`, 감사 rollback 상태를 변경하지 않는다.
4. 기존 최초 자동분류, 미분류, 구성품 역산, rollback 4조건은 그대로 유지한다.

### 6.2 좌표 전수

- `services/product-service/src/main/java/db/migration/V38__ProductCategoryBackfill.java:41-48` — `apply()`가 후보/감사 처리 후 기존 감사행 전체에 `applyAuditedChanges()` 실행.
- 같은 파일 `:169-196` — 후보 SELECT에는 `p.classification_manual = FALSE`가 있음.
- 같은 파일 `:199-230` — 기존 `(migration_key, product_id)` 감사행은 `ON CONFLICT DO NOTHING`이라 최신 수동 상태를 감사 단계에서 갱신하지 않음.
- 같은 파일 `:233-250` — 실제 UPDATE에는 `p.classification_manual = FALSE`가 없음. 근본 좌표.
- `services/product-service/src/test/java/db/migration/V38__ProductCategoryBackfillTest.java:41-75` — 수동 플래그를 최초 apply 전에만 세워 기존 감사행 재적용 경계를 못 봄.
- 같은 파일 `:100-125` — rollback 테스트는 category를 이미 applied인 `OUTDOOR`로 다시 쓰고 manual=true만 켜므로 “현재값 불일치”를 독립 검증하지 않음. rollback SQL 자체는 별도 probe에서 통과.
- `docs/dev-reports/2026-08-11-product-category-backfill.md:93,157-166` 및 `2026-08-11-product-category-fix.md:154-167` — 보완 후 재실행 불가침 증거로 갱신할 문서 좌표.

### 6.3 격리 재현 데이터

```text
product       R2-BACKFILL-MANUAL-RERUN
name          실외기
before apply  category=INDOOR_WALL, classification_manual=false
after apply   category=OUTDOOR, audit previous=INDOOR_WALL/applied=OUTDOOR
human change  category=INDOOR, classification_manual=true, modified_by=human
apply again   expected=INDOOR, actual=OUTDOOR
JUnit         expected "INDOOR" but was "OUTDOOR"
```

### 6.4 RED-A — 실제 UPDATE 시점 수동 가드

위 재현을 `V38__ProductCategoryBackfillTest`에 정식 회귀로 추가한다. 두 번째 `apply(connection)` 후 다음을 모두 요구한다.

- category=`INDOOR`
- `classification_manual=true`
- `modified_by=human` 유지
- 기존 audit의 `rolled_back_at`은 null 유지

현재 코드는 category와 `modified_by`를 V38 값으로 바꿔 RED여야 한다. 구현은 후보 SELECT만 고치지 말고, 실제 `UPDATE products ... FROM audit`의 WHERE에서 현재 수동 플래그를 원자적으로 재검증해야 한다.

### 6.5 RED-B — 기존 감사행 재적용 표적

기존 V38 감사행이 있는 제품을 다음 두 상태로 각각 만든 뒤 재실행한다.

1. `classification_manual=true`, category는 applied와 같음: update count 0, `modified_at/by` 불변.
2. `classification_manual=true`, category는 제3값: 제3값/수정자 불변.

두 행과 정상 자동행을 한 batch에 섞어 정상 자동행만 처리되는지 검증한다. rollback 테스트와 이름이 섞이지 않게 “apply 재실행” 테스트로 분리한다.

### 6.6 새 조합

- manual=false 최초 apply / manual=true 최초 apply
- 감사 생성 후 manual false→true, category applied 유지 / 제3값 변경
- 제품 soft-delete + manual=true / 감사 soft-delete + manual=true
- manual 행과 정상 자동행 혼합 batch
- apply 2회 후 rollback 1회 / rollback 후 apply 재호출
- update 직전 현재 상태 재검증(동시 변경 경계)
- skipped 행의 category뿐 아니라 `modified_at/by` 불변

### 6.7 구현자 중단 조건

**제 전제가 틀렸다면 고치지 말고 중단·보고**하십시오.

특히 “`classification_manual`은 L/M/S에만 해당하므로 물리 제품구분 백필 재실행은 수동행도 덮어야 한다”는 별도 개발책임자 결정이 있거나, V38 `apply()` 재호출을 계약에서 제거하려는 방향이라면 조건 한 줄을 임의 추가하지 말고 먼저 보고해야 한다. 현재 요청과 기존 보고서는 백필·rollback 양쪽 불가침을 명시하므로 본 지시서는 그 전제를 따른다.

## 7. 검증 명령과 결과

| 검증 | 결과 |
|---|---|
| 격리 R2 probe 3개 | **2 pass / 1 fail** — R2-1 재현 |
| `:services:product-service:test --no-daemon --rerun-tasks` | **BUILD SUCCESSFUL**, 777 tests, failures/errors/skipped 0, 3분 20초 |
| `npm test -- productCatalogApi.test.ts mock.test.ts` | assertion 전 로컬 파생물 가드 실패: `out/main/index.js` 없음 |
| Vitest CLI 동일 2파일 | **152 passed / 1 skipped** |
| Playwright 첫 실행 | **2 failed** — BrowserRouter/HashRouter 하네스 불일치, 원문 첨부 |
| Playwright 최종 | **2 passed**, headless chromium-1217 |
| 공유 DB RED-B 재계수 | read-only transaction, 3,084/18/11/41/11 재확인 |
| migration 집합 | origin/main V1~V37, HEAD V1~V38, 누락 0 |

## 8. PM 보고

기존 SOL-1~3 수정은 수용 가능하다. 그러나 R2-1이 명시된 수동 불가침을 깨므로 PR #1166은 이 상태에서 머지하면 안 된다. 구현자는 §6의 RED를 먼저 추가하고 실제 UPDATE 시점 가드를 보완한 뒤, 본 검토자에게 같은 HEAD 기준 재검토를 요청해야 한다.

이번 재검토는 제품 코드를 수정하지 않았다. 검토용 probe와 QA용 spec/config 임시 변경은 실행 후 제거·원상복구했고, 남은 변경은 본 보고서와 `docs/qa/2026-08-11-category-r2/` 산출물뿐이다.
