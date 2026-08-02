# PR #985 R4 가격 기준가 parity 실서버 검증

검증 워크트리: `D:\dev\Samhan-Public\.claude\worktrees\t8-985`

## 판정

최종 판정은 PASS이다. 변경 서비스 이미지를 재빌드한 뒤 실제 bootstrap → draft → confirm → `partner_order_lines` 경로를 실행했다. 최종 전수 대조에서 차이 0행, 0원 저장 0행이다.

초기 sweep에서 `AM120MXVRHC1` 1행이 RED로 보였으나, 이는 R4 결함이 아니었다. bootstrap의 원시 `price=3,905,000`을 화면 표시가로 잘못 사용한 검증기 결함이었다. 실제 order-app 표시 규칙은 `list=7,810,000`에 고정DC 40%를 적용하여 4,686,000원이며, DB 저장값도 4,686,000원이었다. 이 원문은 아래에 보존한다.

## 시각

- JAR 빌드: `2026-07-29 14:57:54 +09:00` ~ `2026-07-29 14:58:30 +09:00`
- 변경 이미지 no-cache 재빌드: `2026-07-29 15:23:28 +09:00` ~ `2026-07-29 15:23:59 +09:00`
- 최종 실제 draft-confirm sweep: `2026-07-29 16:11:46 +09:00` ~ `2026-07-29 16:18:01 +09:00`
- corrected display 재대조: `2026-07-29 16:20:33 +09:00` ~ `2026-07-29 16:20:39 +09:00`
- 회귀 테스트 실행 로그: `2026-07-29 16:22:00 +09:00` 종료 로그 포함

재빌드가 검증보다 먼저였다. 최종 sweep 당시 `samhan-dc-config-service`, `samhan-partner-order-service`, `samhan-product-service`, `samhan-postgres` 모두 healthy였다.

## 전수 대상과 결과

bootstrap 실응답은 homemulti 119행, commercialMulti 408행, oldProducts 40행, singleSets 원본 288행이었다. order-app의 실제 노출 필터 적용 결과 싱글 세트는 197행이었고, 197행 전부를 실행했다. 따라서 요청된 싱글 세트 100행은 표본이 아니라 전부 포함되며, 현재 live bootstrap에서 노출된 나머지 행까지 함께 확인했다.

| 대상 | 대상 건수 | 실제 confirm 성공 | DB line | 차이 행 | 0원 저장 |
|---|---:|---:|---:|---:|---:|
| 노출 고정DC | 144 | 144 | 144 | 0 | 0 |
| 노출 싱글 세트 | 197 | 193 | 193 | 0 | 0 |

싱글 4행은 제품 기준가가 실제 API에서 0/null이어서 confirm이 500으로 fail-closed 되었다: `FH-LFHIF`, `발통세트`, `운임`, `절삭`. 이 4행에는 `partner_order_lines`가 생성되지 않았고 0원 저장도 없었다.

최종 summary 원문:

```text
SWEEP_SUMMARY|kind=FIXED_DC|targets=144|apiSuccess=144|dbRows=144|differenceRows=0|zeroStoredRows=0
SWEEP_SUMMARY|kind=SINGLE_SET|targets=197|apiSuccess=193|dbRows=193|differenceRows=0|zeroStoredRows=0
FAIL_CLOSED_ZERO_BASIS=4
API_FAILURES=0
DIFFERENCE_ROWS=0
ZERO_STORED_ROWS=0
MISSING_DB_ROWS=0
VERIFICATION_CURL8088_END_KST=2026-07-29 16:18:01 +09:00
```

corrected display 재대조 원문은 다음과 같다. 이 재대조는 위의 실제 confirm 결과를 대상으로 order-app 표시 계산을 바로 적용한 것이다.

```text
CORRECTED_RECONCILIATION_START_KST=2026-07-29 16:20:33 +09:00
TARGET_COUNTS|fixedDc=144|singleSet=197|total=341
DB_QUERY_OUTPUT_BEGIN
 target_kind | db_rows | nonzero_rows | zero_rows | null_rows 
-------------+---------+--------------+-----------+-----------
 fixedDc     |     144 |          144 |         0 |         0
 singleSet   |     193 |          193 |         0 |         0
(2 rows)

DB_QUERY_OUTPUT_END
SWEEP_SUMMARY|kind=FIXED_DC|targets=144|apiSuccess=144|dbRows=144|differenceRows=0|zeroStoredRows=0
SWEEP_SUMMARY|kind=SINGLE_SET|targets=197|apiSuccess=193|dbRows=193|differenceRows=0|zeroStoredRows=0
CORRECTED_DIFFERENCE_ROWS=0
CORRECTED_ZERO_STORED_ROWS=0
CORRECTED_MISSING_DB_ROWS=4
CORRECTED_RECONCILIATION_END_KST=2026-07-29 16:20:39 +09:00
```

`CORRECTED_MISSING_DB_ROWS=4`는 위의 fail-closed 4행이며, 성공한 confirm의 DB 누락은 없다.

## RED-first 기록

최종 sweep 직후 보존한 RED 원문:

```text
DIFFERENCE|n=14|kind=fixedDc|model=AM120MXVRHC1|display=3905000|stored=4686000.00
SWEEP_SUMMARY|kind=FIXED_DC|targets=144|apiSuccess=144|dbRows=144|differenceRows=1|zeroStoredRows=0
SWEEP_SUMMARY|kind=SINGLE_SET|targets=197|apiSuccess=193|dbRows=193|differenceRows=0|zeroStoredRows=0
FAIL_CLOSED_ZERO_BASIS=4
API_FAILURES=0
DIFFERENCE_ROWS=1
ZERO_STORED_ROWS=0
MISSING_DB_ROWS=0
VERIFICATION_CURL8088_END_KST=2026-07-29 16:18:01 +09:00
```

RED 원인을 확인한 결과 실제 화면 표시값을 잘못 모델링한 검증기 RED였다. 실제 bootstrap/product 원문은 다음과 같다.

```text
{"success":true,"code":"OK","message":"성공","data":[{"id":"...","name":"DVM ECO 리뉴얼 12HP 상부토출형","modelName":"AM120MXVRHC1","sellingPrice":7810000.00,"modelCode":"AM120MXVRHC1","categoryKey":"commercialMulti","fixedDiscountRate":40.00,"discountFlags":"000000","releasePrice":7810000.00,"deliveryPrice":3905000.00,"hasVariableDiscount":true}],"timestamp":"2026-07-29T07:18:25.305881432Z"}
{"name":"DVM ECO 리뉴얼 12HP 상부토출형","model":"AM120MXVRHC1","price":3905000.0,"list":7810000.0,"useK2":true,"고정DC":40.0}
```

order-app의 `commUnitPrice`는 `useK2=true`이면 `list * (1 - fixedDc)`를 계산한다. 따라서 표시값은 4,686,000원이다. 실제 DB 원문:

```text
                  remark                  |  model_name  |  price_vat  
------------------------------------------+--------------+-------------
 codex-r4-985-final-2026072918/fixedDc/14 | AM120MXVRHC1 |  4686000.00
 codex-r4-985-final-2026072918/fixedDc/77 | AM320NXGGBH1 | 27777750.00
(2 rows)
```

따라서 invariant 위반은 확인되지 않았으며, 이 RED 이후 production source를 추가 수정하지 않았다. 대신 같은 기준가 선택을 고정하는 회귀 테스트 `confirm_uses_release_price_base_for_commercial_fixed_dc_am120`를 추가했고 통과했다.

## 실행한 명령과 출력 원문

### 이미지 재빌드

실행 명령:

```powershell
docker compose -p infrastructure -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml build --no-cache dc-config-service partner-order-service product-service
docker compose -p infrastructure -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --no-deps dc-config-service partner-order-service product-service
```

재빌드 원문:

```text
IMAGE_REBUILD_NO_CACHE_START_KST=2026-07-29 15:23:28 +09:00
#15 [product-service 4/4] COPY --chown=app:app services/product-service/build/libs/product-service.jar /app/app.jar
#15 DONE 0.7s
#16 exporting manifest list sha256:471a8f3174d3b0f6bbd5d805f7a4bea9800ce7908c15a6edeea4c3b6be70452e
#20 dc config manifest list sha256:9a9e539f2468e57af05c7df9231da672d7933f918b6b7fa4f4a8ef726ff9aba5
#21 partner-order manifest list sha256:bba0050e3da85f5dbac8515ab1f1c75f04b8e349ed9eb264123f967541bb2117
IMAGE_REBUILD_NO_CACHE_END_KST=2026-07-29 15:23:59 +09:00
IMAGE_REBUILD_NO_CACHE_EXIT_CODE=0
CONTAINER_RESTART_EXIT_CODE=0
SERVICE=samhan-product-service|Up 21 seconds (health: starting)
SERVICE=samhan-partner-order-service|Up 21 seconds (health: starting)
SERVICE=samhan-dc-config-service|Up 21 seconds (health: starting)
PRODUCT_IMAGE_ID=sha256:471a8f3174d3b0f6bbd5d805f7a4bea980ce7908c15a6edeea4c3b6be70452e|CREATED=2026-07-29T06:23:46.151826035Z
```

### 실제 sweep 명령의 핵심 원문

실행한 inline PowerShell은 다음 endpoint를 사용했다. draft/confirm은 반드시 `8088`, DC internal은 `8089`, product internal은 `8084`였다.

```powershell
$orderBase='http://localhost:8088'
$dcBase='http://localhost:8089'
$productBase='http://localhost:8084'
$prefix='codex-r4-985-final-2026072918'

# 실제 호출 순서
GET  $orderBase/api/v1/partner-orders/bootstrap?partnerCode=1068689215
GET  $dcBase/internal/partner-dc-configs/1068689215
POST $productBase/products/internal/lookup-by-model-codes
POST $orderBase/api/v1/partner-orders/drafts
POST $orderBase/api/v1/partner-orders/{draftId}/confirm

# 실제 DB aggregate query
docker exec samhan-postgres psql -U samhan -d partner_order_db -P pager=off -c "SELECT split_part(l.remark,'/',2) AS target_kind, count(*) AS db_rows, count(*) FILTER (WHERE l.price_vat <> 0) AS nonzero_rows, count(*) FILTER (WHERE l.price_vat = 0) AS zero_rows, count(*) FILTER (WHERE l.price_vat IS NULL) AS null_rows FROM partner_order_lines l WHERE l.remark LIKE 'codex-r4-985-final-2026072918/%' GROUP BY split_part(l.remark,'/',2) ORDER BY target_kind;"
```

위 명령의 실제 aggregate 출력 원문:

```text
 target_kind | db_rows | nonzero_rows | zero_rows | null_rows 
-------------+---------+--------------+-----------+-----------
 fixedDc     |     144 |          144 |         0 |         0
 singleSet   |     193 |          193 |         0 |         0
(2 rows)
```

최종 실제 sweep의 전체 terminal 출력 원문:

```text
VERIFICATION_CURL8088_START_KST=2026-07-29 16:11:46 +09:00
BOOTSTRAP_COUNTS|homemulti=119|commercialMulti=408|oldProducts=40|singleSetsRaw=288|singleSetsShown=197
TARGET_COUNTS|fixedDc=144|singleSet=197|total=341
PRODUCT_MAP|requestedModels=335|resolvedModels=335|unresolvedTargets=0
PROGRESS|attempts=25|success=25|fail=0
PROGRESS|attempts=50|success=50|fail=0
PROGRESS|attempts=75|success=75|fail=0
PROGRESS|attempts=100|success=100|fail=0
PROGRESS|attempts=125|success=125|fail=0
PROGRESS|attempts=150|success=150|fail=0
PROGRESS|attempts=175|success=175|fail=0
PROGRESS|attempts=200|success=200|fail=0
FAIL|n=209|kind=singleSet|model=FH-LFHIF|stage=confirm|status=500|class=fail-closed-zero-basis|raw={"success":false,"code":"INTERNAL_ERROR","message":"확정 가격 기준가 없음: FH-LFHIF","data":null,"timestamp":"2026-07-29T07:15:36.680251160Z"}
PROGRESS|attempts=225|success=224|fail=1
PROGRESS|attempts=250|success=249|fail=1
PROGRESS|attempts=275|success=274|fail=1
PROGRESS|attempts=300|success=299|fail=1
PROGRESS|attempts=325|success=324|fail=1
FAIL|n=337|kind=singleSet|model=발통세트|stage=confirm|status=500|class=fail-closed-zero-basis|raw={"success":false,"code":"INTERNAL_ERROR","message":"확정 가격 기준가 없음: 발통세트","data":null,"timestamp":"2026-07-29T07:17:55.933270213Z"}
FAIL|n=340|kind=singleSet|model=운임|stage=confirm|status=500|class=fail-closed-zero-basis|raw={"success":false,"code":"INTERNAL_ERROR","message":"확정 가격 기준가 없음: 운임","data":null,"timestamp":"2026-07-29T07:17:59.227210425Z"}
FAIL|n=341|kind=singleSet|model=절삭|stage=confirm|status=500|class=fail-closed-zero-basis|raw={"success":false,"code":"INTERNAL_ERROR","message":"확정 가격 기준가 없음: 절삭","data":null,"timestamp":"2026-07-29T07:18:00.390726433Z"}
DB_QUERY_OUTPUT_BEGIN
 target_kind | db_rows | nonzero_rows | zero_rows | null_rows 
-------------+---------+--------------+-----------+-----------
 fixedDc     |     144 |          144 |         0 |         0
 singleSet   |     193 |          193 |         0 |         0
(2 rows)

DB_QUERY_OUTPUT_END
DIFFERENCE|n=14|kind=fixedDc|model=AM120MXVRHC1|display=3905000|stored=4686000.00
SWEEP_SUMMARY|kind=FIXED_DC|targets=144|apiSuccess=144|dbRows=144|differenceRows=1|zeroStoredRows=0
SWEEP_SUMMARY|kind=SINGLE_SET|targets=197|apiSuccess=193|dbRows=193|differenceRows=0|zeroStoredRows=0
FAIL_CLOSED_ZERO_BASIS=4
API_FAILURES=0
DIFFERENCE_ROWS=1
ZERO_STORED_ROWS=0
MISSING_DB_ROWS=0
VERIFICATION_CURL8088_END_KST=2026-07-29 16:18:01 +09:00
```

### 회귀 테스트

실행 명령:

```powershell
$env:DOCKER_HOST='npipe:////./pipe/docker_engine'; .\gradlew :services:partner-order-service:test --tests 'com.samhanair.logis.partnerorder.it.PartnerOrderConfirmServiceIT.confirm_uses_release_price_base_for_commercial_fixed_dc_am120' --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html for details.
The daemon will be stopped at the end of the build 
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :services:partner-order-service:processResources UP-TO-DATE
> Task :services:partner-order-service:processTestResources NO-SOURCE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :services:partner-order-service:compileJava UP-TO-DATE
> Task :services:partner-order-service:classes UP-TO-DATE
> Task :services:partner-order-service:compileTestJava
> Task :services:partner-order-service:testClasses
> Task :services:partner-order-service:test
BUILD SUCCESSFUL in 52s
15 actionable tasks: 2 executed, 13 up-to-date
```

## 이 라운드가 보지 않은 것

- `clients/**` 프론트엔드 파일은 수정하지 않았고 GUI 브라우저 캡처/시각 QA는 하지 않았다. 화면 단가는 기존 order-app 계산 규칙을 read-only로 재현했다.
- 견적(estimate) 경로는 실행하지 않았다.
- `partner-auth-service` 로그인/비밀번호 경로는 실행하지 않았다.
- `services/product-service` 이카운트 import 관련 파일은 보지 않았다.
- oldProducts, 노출되지 않은 fixed-DC 없는 멀티 품목, singleParts/commercialParts 구성품 sweep은 하지 않았다.
- 새 이슈/PR 생성, 머지, 브랜치 조작, 커밋은 하지 않았다.
