# PR #984 R6 SOL 재수렴 적대검증

## 최종 판정

**BLOCK — canonical 오름차순 fix 자체는 실데이터 값을 바꾸지 않고 R5 `HIGH-2b`를 해소했지만, fix가 연결한 alias 표면에서 정상 관리자 경로로 주문 160건이 전부 거부되는 도달 가능 결함 1건을 확인했다.**

- `[HIGH-1]` 시트에서 사라진 품목은 soft-delete되지만 ECOUNT staging alias는 그대로 남는다. 이후 MIG-8 주문 재import가 삭제된 Product UUID를 160개 주문 라인에 저장하고, partner-order 이식은 160/160 주문을 거부한다.
- canonical 후보/fallback 오름차순은 실 raw 동명 164그룹에서 구 결과를 바꾼 그룹이 0개다. R5 `HIGH-2b`의 파일 행 순서 의존은 실제 해소됐다.
- R5 `EVIDENCE-1` 정정은 오독 위치와 원문 문장 양쪽에 배치되어 실제 해소됐다.
- 최신 원격 22개 head 기준 V29 이상 migration은 0개다. PR #996 최신 head가 V29를 제거했으므로 #996 → #984 순서의 Flyway 적용 순서 충돌은 현재 해소됐다.
- 증거 수치 1건은 정정이 필요하다. exact SHA는 맞고 전건 green이지만 현재 GitHub 원격은 `30/30`이 아니라 고유 check-run `38/38 SUCCESS`다.

조사는 5 agents가 canonical·정렬 경계, 결정성·alias, migration 적용 순서, IT 격리·증거, 독립 반증을 나눠 수행했다. 코드·git·공유 DB·Docker 배포 상태는 변경하지 않았다.

---

## 결함 1 — `[HIGH-1]` soft-delete된 품목 UUID가 staging alias에서 살아남아 이관 주문 160건을 전부 거부시킨다

### 실 사용자 경로

1. Google Sheet에서 현재 활성 품목 `AR-EC05` 행을 제거한다.
2. 관리자가 데스크톱 시트 동기화 화면에서 `지금 동기화`를 누른다.
3. product-service는 시트에서 사라진 `AR-EC05` Product 1건을 soft-delete한다. 그러나 `product_aliases`와 `staging.ecount_item_alias`는 정리하지 않는다.
4. 관리자가 accounting-service의 `/admin/ecount/reimport/mig-8`을 실행한다.
5. alias resolver는 `products`를 확인하지 않고 staging의 UUID를 그대로 반환한다. accounting-service는 현재 PENDING인 `AR-EC05` 주문 160건의 라인에 삭제 Product UUID를 저장한다.
6. 관리자가 partner-order의 `/admin/partner-orders/mig8-import`를 실행한다.
7. product-service UUID lookup은 soft-delete Product를 반환하지 않는다. partner-order는 product lookup miss로 160개 주문을 모두 거부한다.

모든 단계는 시트 편집, 관리자 `지금 동기화`, ECOUNT 재import, MIG-8 주문 이식이라는 정상 사용자·운영자 경로다.

### 재현 절차

공유 DB를 쓰지 않고 현재 사전상태를 읽기 전용으로 대조했다.

1. `product_db`에서 `AR-EC05`를 조회한다.
   - 활성 Product 1건
   - `lineage=SHEET`, `product_category=HOME_MULTI`
   - `usage_scope_manual=false`
   - 활성 수량 동기화 규칙 참조 0건
   - 활성 `product_aliases` 1건
   - `staging.ecount_item_alias` map 1건
2. `accounting_db.staging.ecount_order_raw`를 조회한다.
   - `item_name='AR-EC05'`, `transform_status='PENDING'`, 활성 행 160건
   - 서로 다른 `order_no` 160개
   - 거래처명 1개: `주식회사 광도설비-황정욱`
3. `partner_db`를 조회한다.
   - 위 거래처 exact ACTIVE 행 1건
4. 시트에서 `AR-EC05` 행을 제거하고 `지금 동기화`를 실행한다.
5. accounting MIG-8 재import 후 partner-order MIG-8 이식을 차례로 실행한다.

4~5는 공유 데이터 write 금지 때문에 이번 라운드에서 실행하지 않았다. 다만 아래 분기에는 다른 선택지가 없으며 현재 160개 PENDING 주문이 이미 존재한다.

- sync: Product 1건 `markDeleted`, alias/staging alias 삭제 0건
- accounting transform: staging alias UUID 1/1 반환, 160개 line의 `product_id`에 동일 삭제 UUID 저장
- partner-order import: soft-delete Product lookup 0건, 주문 생성 0건, 거부 160건

### 관측된 잘못된 결과

| 항목 | 읽기 전용 현재값 / 코드상 결정값 |
|---|---:|
| 정상 sync로 soft-delete 가능한 SHEET alias code | 869 |
| 그중 accounting PENDING 주문과 exact 교차 | 16 codes / 193행 |
| 대표 `AR-EC05` PENDING 주문 | 160행 / 160개 주문 |
| `AR-EC05` Product soft-delete | 1건 |
| sync가 정리하는 public/staging alias | 0 / 0건 |
| accounting이 삭제 UUID로 변환하는 주문 라인 | 160/160 |
| partner-order 이식 생성 | 0 |
| partner-order 이식 거부 | 160/160 |

현재 즉시 dangling alias는 0건이다. 잘못된 결과는 위 정상 사용자 순서로 `AR-EC05` 한 행을 시트에서 제거한 뒤 발생한다.

### 파일:행 근거

- 사용자 sync 버튼: `clients/desktop/src/renderer/routes/admin/SheetSyncPage.tsx:134-142`
- sync endpoint: `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductAdminController.java:64-72`
- 시트 부재 Product soft-delete와 alias 미정리: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1362-1389`
- public/staging alias 생성: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:564-603`
- Product 상태를 보지 않는 staging alias 조회: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountAliasResolveService.java:35-44`
- accounting MIG-8 전체 PENDING 적재와 alias resolve: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java:50-79,98-112,206-216`
- 삭제 UUID를 order line에 저장: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java:294-340,454-475`
- 관리자 MIG-8 재import command: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:406-419`
- 삭제 UUID downstream export: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/AccountingMig8OrderExportService.java:64-78,99-108`
- soft-delete Product를 UUID lookup에서 제외: `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:48`, `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:382-393`
- product lookup miss 주문 거부: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/mig8/service/Mig8OrderImportService.java:95-100,172-198`
- partner-order 관리자 이식 endpoint: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/mig8/web/Mig8OrderImportController.java:16-31`

---

## 각도별 판정

### 1. 품목코드 오름차순이 만드는 새 결과

**PASS — 현재 실 raw와 공유 DB에서 사용자 표시값 변경 0건이다.**

동일 source hash `02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C`의 2,836행을 재구성했다.

| 범위 | 그룹 | 구 선택과 새 선택이 다른 그룹 |
|---|---:|---:|
| exact-name 동명 전체 | 164 / 328행 | 0 |
| relation·승인 대표 후보 존재 | 152 | 0 |
| 후보 없는 fallback | 12 / 24행 | 0 |

R5 `HIGH-2b`의 12그룹은 구 파일 첫 행이 이미 문자열 오름차순 최소 code였다. 공유 DB의 현재 정본과 새 선택 결과도 품목명·규격·입고단가가 각각 12/12 일치했다. 따라서 새 규칙 배포 후 같은 파일을 재임포트해도 사용자가 보던 값이 튀지 않는다.

근거:

- raw 수집과 이름 그룹화: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:69-100`
- 후보 `mainCode` 정렬: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:125-150`
- fallback DB 정본 우선·raw code 최소: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:336-349`
- 기존 DB 정본의 결정적 선택: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:611-624`
- 선택 row의 규격·가격 저장: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:389-473`
- 12그룹 원문: `docs/dev-reports/2026-07-30-984-same-name-merge.md:153-168`

### 2. 문자열 오름차순 경계

**PASS — 현재 실 입력에서 로케일·대소문자·전각/반각·자릿수로 사용자가 잘못된 값을 받는 사례 0건이다.**

`Comparator.comparing(String)`은 locale을 사용하지 않고 UTF-16 code unit 순서로 비교하므로 JVM locale에 좌우되지 않는다.

| 실 동명 raw 경계 | 수치 | 구 첫 code와 새 최소 code 불일치 |
|---|---:|---:|
| 소문자 code 행 | 3 | 0 |
| 비ASCII code 행 | 9 | 0 |
| 숫자형 code 행 | 12 | 0 |
| 전각 code 행 | 0 | 0 |
| 숫자형·문자형 혼합 동명 그룹 | 10 | 0 |
| 같은 prefix·상이한 숫자 suffix 자릿수 동명 그룹 | 0 | 해당 없음 |

`AAAA-00009`와 `AAAA-00010`은 zero-padding되어 있고 서로 다른 품목명 그룹이다. 현재 사용자 결과를 바꾸는 자릿수 역전 경로가 아니다.

근거: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:135-140,336-349`.

### 3. 같은 입력 집합의 결정성

**사용자 결과 PASS. 동일 code 중복 raw는 판정불가.**

- relation 파일: 한 alias가 서로 다른 main을 가리키면 행 순서와 무관하게 `MIG2_ALIAS_DUPLICATE`로 transaction 전체가 중단된다. 동일 매핑 중복은 결과가 같다.
- staging: importer는 staging 적재 순서를 계산 입력으로 다시 읽지 않는다.
- collection: 결과를 정하는 `HashMap`/`HashSet` iteration 경로는 없다.
- 병렬 import: 같은 item file hash는 advisory transaction lock으로 직렬화된다.
- group 파일: 실 group 파일에는 `AF90H17D38WN`이 `[CAC] 싱글`과 `[FAC] 가정용`에 2행 존재하고 `putIfAbsent`라 행 순서에 따라 `product_group1/category_group` 2개 DB 컬럼이 바뀐다. 그러나 두 컬럼은 현재 Product 응답·화면·다운스트림에서 소비되지 않아 실 사용자 잘못된 결과에는 도달하지 않는다.
- 동일 code 중복 raw: code comparator가 동률이면 `itemsByCode.putIfAbsent`의 첫 행 규격·단가가 남는다. 정상 사용자 upload는 가능하지만 현재 실 source는 2,836행/2,836 distinct code이고 공유 write 없이 실제 사용자 오결과를 만들 수 없어 판정불가다.

근거:

- relation conflict 차단: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:214-243`
- group 첫 행 보존: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:246-263`
- item code 첫 행 보존: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:69-80`
- import lock: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:56-67,266-270`

### 4. alias fallback

**FAIL — 결함 1로 도달한다. 나머지 현재 충돌 경계는 PASS 또는 판정불가다.**

읽기 전용 현재값:

| 항목 | 결과 |
|---|---:|
| 활성 alias / distinct 활성 code | 2,835 / 2,835 |
| 한 alias의 활성 중복 target | 0 |
| 활성 alias → 현재 soft-delete target | 0 |
| soft-delete alias | 0 |
| alias code ↔ 다른 활성 `product_code` 충돌 | 0 |
| R4 대상 alias / target | 24 / 12 |

- importer가 기존 alias를 다른 Product로 remap하려 하면 public alias와 staging alias 양쪽의 조건부 upsert가 0행이 되어 transaction을 중단한다: `EcountProductImporter.java:564-603`.
- direct `product_code` 우선 조회가 현재 다른 Product를 반환하는 실 충돌은 0건이다: `ProductService.java:218-228`.
- inventory의 alias 문자열 직접 reserve는 canonical 재고 key와 어긋날 수 있지만 현재 `stock_instances=0`이라 관측 가능한 오예약·재고부족 결과는 판정불가다: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:153-184`.

### 5. 신규 IT +106줄의 기존 테스트·데이터 오염

**PASS — 신규 `DET984MERGE` fixture가 남기는 행과 다른 fixture를 지우는 경로가 모두 0건이다.**

`@DirtiesContext`를 DB 정리 근거로 사용하지 않았다. 신규 IT는 고유 prefix/actor를 사용하고 `@BeforeEach`, forward/reverse 사이, `@AfterEach`에 직접 cleanup한다.

| sentinel | 현재 공유 DB |
|---|---:|
| DET product | 0 |
| DET alias | 0 |
| DET item raw | 0 |
| DET relation raw | 0 |
| DET group raw | 0 |

- prefix는 `DET984MERGE%`이며 `_` wildcard가 없다.
- repo의 다른 fixture가 같은 prefix/actor를 쓰는 곳은 0개다.
- cleanup 순서는 public alias → staging alias/raw/relation/group → exposure → price history → product다.
- 신규 fixture가 쓰지 않는 bundle/quantity-sync child를 삭제하지 않아도 FK 잔재가 생기지 않는다.
- 로컬 XML에서 `EcountProductImporterIT`는 신규 항목 포함 5 tests, failures/errors/skipped 0이다.

근거: `services/product-service/src/test/java/com/samhanair/logis/product/it/EcountProductImporterIT.java:41-70,207-289`.

### 6. 증거 무결성

#### 현재 수치 대조

| 주장 | 이번 라운드 대조 | 판정 |
|---|---|---|
| exact SHA `98e3c0dab` | local HEAD와 PR #984 `headRefOid` 모두 전체 SHA 일치 | PASS |
| CI `30/30 success` | 현재 고유 check-run `38/38 SUCCESS`, 실패·pending 0 | **수치 불일치 +8** |
| product-service 62 suites / 628 tests / 0 / 0 / 0 | 로컬 XML 62개 직접 합산: 628 / 0 / 0 / 0 | PASS |
| lookup 24/24 200 | R4 단일 실행 원문 24행과 summary `200:24` | PASS |
| 대상 alias 24, 12그룹 각 1행 | 현재 공유 DB read-only count 24, 12개 이름 min=max=1 | PASS |
| `skippedGroupCount=0` | R4 1·2차 원문 0, 현재 source hash의 `SKIPPED_MAIN_CANDIDATE=0` | PASS |
| 2차 임포트 멱등 | R4 원문 `imported=0`, products/aliases/12그룹 불변 | PASS |
| 726/726, 전표 200, AVAILABLE→RESERVED, 잘못 매칭 0 | R3 원문 존재, 이번 commit의 lookup/inventory/slip diff 0 | 양립 |
| 중간 실패 rollback | R3 원문에서 실패 파일 product/public alias/staging alias 0, transaction 경계 diff 0 | 양립 |

GitHub green 결론은 유지된다. 다만 현재 원격 API에서 literal `30/30`은 재현되지 않으므로 R6 이후에는 exact SHA의 현재 관측값 `38/38`을 사용해야 한다.

근거:

- R4 24개 HTTP 원문: `docs/qa/984-ecount-import-live/R4-REPORT.md:235-266`
- R4 1·2차 응답과 DB 멱등 대조: `docs/qa/984-ecount-import-live/R4-REPORT.md:270-325`
- 726·전표·재고 원문: `docs/qa/984-ecount-import-live/R3-SOL-REVIEW.md:152-170`
- rollback 원문: `docs/qa/984-ecount-import-live/R3-SOL-REVIEW.md:172-189`
- 이번 fix 전체 변경: `EcountProductImporter.java +11/-4`, `EcountProductImporterIT.java +106`, 문서 정정 2건과 신규 보고서

#### R5 `EVIDENCE-1`

**해소.**

- 구 보고서의 `### 3.7 복구 전 실 원본 파일 존재 확인` 제목 직후, `.gitkeep` 명령·출력보다 먼저 정정이 있다: `docs/dev-reports/2026-07-29-984-r4-product-lineage-verification.md:294-301`.
- 잘못 읽히던 원문 문장 자체에도 `[원문 보존, 위 정정의 대상]` 표시가 있다: 같은 파일 `:327`.
- 동명 병합 구 보고서도 같은 오독 문단에 `[수정 전 관찰]`과 현재 선택 규칙을 함께 적었다: `docs/dev-reports/2026-07-30-984-same-name-merge.md:151-168`.

따라서 R5의 “부분 해소” 상태는 HEAD `98e3c0dab`에서 완전 해소로 바뀐다.

---

## R5 항목 해소 판정

| R5 항목 | R6 판정 | 근거 |
|---|---|---|
| `HIGH-2b` 파일 행 순서 의존 | **해소** | 후보 152그룹과 fallback 12그룹 모두 구 선택↔새 선택 차이 0; code comparator로 순서 고정 |
| `EVIDENCE-1` 구 보고서 모순 | **해소** | 오독 위치 선행 정정 + 원문 대상 표시 + 동명 보고서 수정 전 표시 |

동명 병합 자체와 품목명 승격은 개발책임자·PM 판정에 따라 결함으로 재보고하지 않았다.

---

## 마이그레이션 적용 순서 판정

**PASS — 최신 원격 head 기준 #996 → #984 순서에 미적용 하위 번호가 생기지 않는다.**

조사 중 PR #996 원격 head가 `077d082f`에서 `f1db94f2`로 갱신됐다. 이전 head의 V29는 최신 commit `f1db94f2`에서 삭제됐다. 최종 판정은 최신 `git ls-remote --heads origin` 결과를 사용한다.

| 대상 | 최신 SHA | product-service migration | main 이후 추가 |
|---|---|---:|---|
| `origin/main` | `8b302629` | V1~V26, 26개 | 없음 |
| PR #996 | `f1db94f2` | V1~V26, 26개 | 없음 |
| PR #984 | `98e3c0dab` | V1~V28, 28개 | V27, V28 |
| `wip/984-r4-product-lineage-unverified` | `68ab9196` | V1~V28, 28개 | V27, V28 |
| 나머지 원격 head 18개 | SHA별 `git ls-tree` | V26 이하 | V27 이상 없음 |

원격 head 22개와 열린 PR 5개를 전수 대조했다. 현재 V29 이상 migration은 0개다.

- #996 먼저: 신규 migration 0개
- #984 나중: V27 → V28 두 파일을 오름차순 적용
- 미적용 하위 번호: 0개
- 반대 순서: main에 V27/V28이 보존되므로 후속 #996도 신규 migration 0개

공유 DB read-only 대조는 V1~V28 `success=true` 28개, V29 0개다. `application.yml`은 Flyway override를 두지 않으며 repo 문서는 기본 `outOfOrder=false`, `validateOnMigrate=true`를 명시한다. 현재 순서는 이 기본값에서도 안전하다.

근거:

- V27: `services/product-service/src/main/resources/db/migration/V27__allow_skipped_main_candidate_status.sql:1-9`
- V28: `services/product-service/src/main/resources/db/migration/V28__add_product_lineage.sql:1-60`
- Flyway 설정: `services/product-service/src/main/resources/application.yml:32-35`
- 기본값 기록: `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md:52-55`
- #996 최신 commit: `f1db94f2 fix(#896): V29 seed 제거 — 결함 3건이 동시에 소멸`

---

## 이 라운드가 보지 않은 것

- 코드 수정, fix 구현, 새 테스트 작성.
- git add/commit/push/checkout/fetch, PR·Issue 쓰기.
- Docker stack 재배포·중단, 실제 운영 배포.
- 공유 DB write. 따라서 결함 1의 시트 행 제거·sync·MIG-8 재import·partner-order 이식을 실제 실행하지 않았다. 현재 read-only 사전상태와 각 서비스의 무조건 분기로 후결과를 확정했다.
- 새 Gradle 실행. 기존 로컬 XML과 exact SHA CI만 대조했다.
- 게이트웨이 `/admin/products/**` 선재 404.
- 동명 병합 자체와 품목명 승격의 정책 재판정.
- R3에서 이미 통과한 726건 HTTP, 전표 수락, 재고 예약, rollback의 재실행.
- 현재 실 source에 없는 동일 code·상이 규격/단가 중복 raw의 사용자 결과.
- `stock_instances=0`인 inventory alias 직접 reserve 경로의 실제 오예약 결과.
- V1~V26만 담긴 과거 branch artifact를 현재 V28 DB에 직접 배포하는 비정상 경로.
