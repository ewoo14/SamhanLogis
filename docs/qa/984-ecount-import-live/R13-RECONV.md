# PR #984 R13 기능 회귀 검토

- 역할: 기능 회귀 검토자(구현·수정 없음)
- 검증 대상 HEAD: `ff161201643a479bc21ef3f0c0eeacacef2ec3c3`
- 범위: (1) R12 회복 경로의 잘못된 통과 여부, (2) reservation 경합 창의 현 상태
- 제약: git/Docker/공유 DB 쓰기 없음. 실 API throwaway 데이터만 허용 범위에서 사용.

## 진행 기록

- 검토 시작. 산출물 골격을 우선 생성함.
- `git rev-parse HEAD` 결과가 검증 대상 `ff161201643a479bc21ef3f0c0eeacacef2ec3c3`와 일치함.
- 시작 시점 worktree 미추적 파일은 본 R13 산출물 1건뿐임.
- R11의 BLOCK 2건과 R12 회복 경로 보고서를 확인함. R12는 기존 idempotency 주문의 `product_id IS NULL` 라인만 재해소하며, reservation 구조는 변경하지 않았다고 보고함.
- R12 diff 확인: 재실행은 기존 주문을 찾은 뒤 주문번호+라인번호 기반 결정적 라인 ID, 주문 ID, `product_id IS NULL`, 활성 행 조건을 모두 만족하는 라인만 갱신함(`Mig8OrderImportService.java:94-100`, `:155-178`).
- 갱신 필드는 `product_id`, `model_name`, `product_name`, `category_key`, audit 필드뿐임. `quantity`, `price_vat`, `subtotal`, `supply_amount`, `vat_amount`와 주문 `total_amount`는 재실행 UPDATE 대상이 아님(`Mig8OrderImportService.java:168-177`; 최초 저장은 `:181-206`).
- accounting 변환은 exact itemName 결과를 우선하고 없으면 선두 token 결과를 사용함(`Mig8OrderTransformService.java:486-518`). R12 회복 자체는 이 결과로 export된 `productId`를 새로 판별하지 않고 해당 라인번호에 적용함.
- 현재 실행 중 partner-order 컨테이너의 `/app/app.jar`에는 V15 migration이 없고 jar 시각도 2026-07-30이어서 HEAD R12 실 API가 아님. Docker 재빌드·재기동 금지에 따라 이 컨테이너를 HEAD API 증거로 사용하지 않음.
- 공유 `product_db`를 읽기 전용 조회한 결과 `staging.ecount_item_alias`는 0행이며, 라이브 다의 후보/alias 재현 데이터는 없음. 공유 DB에는 쓰지 않음.
- HEAD + 격리 Testcontainers PostgreSQL에서 `Mig8OrderImportServiceIT` 5건과 MockMvc 실 전환 API `PartnerOrderConvertIT` 12건을 실행함. 합계 `17 tests / failures 0 / errors 0 / skipped 0`, `BUILD SUCCESSFUL`(44초).
- import 실측 시나리오 건수: 완전 회복 1주문·1라인, 일부 회복 후 잔여 미해소 1주문·1라인, 최초 미해소 보존/차단 1주문·1라인, 정상 멱등 경로 3주문·4라인. 회복과 전환 API는 동일 테스트 컨텍스트의 별도 클래스이며, 회복 주문을 곧바로 HTTP 전환하는 단일 end-to-end 시나리오는 기존 테스트에 없음.

## (1) 회복 경로가 잘못된 것까지 통과시키는가?

**판정: PASS** — R12가 새로 여는 범위에서 잔여 미해소 주문의 false-open, 다른 라인 결합, 금액·수량 덮어쓰기를 찾지 못했다.

### 잔여 미해소인데 전환이 열리는가

- 재실행 UPDATE는 주문번호+라인번호로 만든 결정적 라인 ID, 기존 주문 ID, 활성 행, `product_id IS NULL`을 동시에 요구한다. 해소되지 않은 다른 라인은 NULL로 남는다(`Mig8OrderImportService.java:155-178`).
- 전환은 요청 대상 라인의 `productId == null`이면 409로 차단한다(`PartnerOrderConvertService.java:121-138`). R12의 일부 회복 throwaway는 2라인 중 1라인만 해소한 뒤 NULL 1건/비NULL 1건을 단언했다(`Mig8OrderImportServiceIT.java:185-210`).
- 실측: 잔여 미해소인데 열린 주문 `0건`; 부분 회복 후 계속 차단 조건을 가진 주문 `1건`·잔여 미해소 라인 `1건`.

### 잘못된 품목에 결합되는가

- R12는 선두 token을 다시 매칭하지 않는다. accounting이 export한 `productId`를 product lookup으로 활성·표시 필드까지 확인한 뒤, 같은 주문번호+라인번호의 기존 NULL 라인에만 기록한다(`Mig8OrderImportService.java:94-100`, `:155-178`, `:209-224`).
- accounting 원본은 `(order_id, line_no)` unique이고(`V28__add_order_domain.sql:40-60`), native 라인 ID도 주문번호+라인번호로 결정된다. 따라서 한 후보의 결과가 다른 라인번호로 이동하는 R12 경로는 없다.
- alias resolver의 입력 key는 `staging.ecount_item_alias.alias_code` PK라 한 alias key가 동시에 여러 UUID를 반환하지 않는다(`V7__add_product_aliases_and_ecount_staging.sql:116-126`; `EcountAliasResolveService.java:42-61`). exact itemName을 우선하고 없을 때만 선두 token을 사용한다(`Mig8OrderTransformService.java:486-518`).
- 실측: 회복 라인의 기대 UUID 일치 `1건`, 다른 라인 결합 `0건`. 공유 alias 데이터가 0행이라 실제 운영 다의 후보 표본은 없었으며, 후보 중 어느 품목이 업무적으로 옳은지라는 매칭 규칙 자체는 판정하지 않았다.

### 금액·수량이 원본과 같은가

- 최초 회복 fixture는 수량 `2`, 공급가 `100,000`, 부가세 `10,000`, 합계 `110,000`, VAT 포함 단가 `55,000`이다(`Mig8OrderImportServiceIT.java:266-277`). 첫 실행과 두 번째 실행은 같은 금액·수량을 export한다(`:155-166`).
- 재실행 UPDATE에는 수량·단가·공급가·부가세·라인 합계·주문 합계가 없고 품목 식별/표시와 audit 필드만 있다(`Mig8OrderImportService.java:168-177`). 따라서 위 값의 재실행 변경 건수는 `0건`; 회복된 라인 `1건`의 원본 값은 그대로다.
- 정상 멱등 경로도 3주문·4라인이 유지됐다. focused 실행 결과는 import 5건과 MockMvc 전환 API 12건, 합계 `17/17` 통과였다.

### 실 API 범위 주의

- MockMvc 전환 API 12건은 HEAD + 격리 PostgreSQL의 실제 controller/service 경로로 실행했다. import 회복 5건은 같은 방식의 격리 PostgreSQL이지만 외부 client를 격리 mock한 service 통합테스트다.
- 실행 중 live partner-order jar는 V15가 없는 R12 이전 바이너리라 HEAD 회복 endpoint로 사용할 수 없었다. 따라서 “회복 주문 생성→동일 주문 HTTP 전환”을 한 시나리오로 잇는 HEAD 실 API end-to-end는 보지 못했다. PASS는 R12 UPDATE 조건, 전환 guard, 격리 실측을 합친 판정이다.

## (2) R11 이월 reservation 경합 창은 어떻게 됐는가?

**판정: BLOCK** — R11의 실제 사용자 경합 창은 그대로다. R12가 창의 1회 길이를 넓히지는 않았지만 해결하지도 않았다.

- `transformFromStaging()`은 `REQUIRES_NEW` transaction 안에서 `finally`의 원격 `releaseReservations()`를 실행한 뒤 메서드를 반환한다. Spring accounting commit은 반환 후이므로 release→commit 창이 그대로다(`Mig8OrderTransformService.java:50-52`, `:62-87`; `ProductAliasClient.java:102-120`).
- reservation은 생성/갱신 시점부터 고정 2분이며 heartbeat가 없다(`EcountAliasReservationService.java:19`, `:23-58`). 2분이 지나면 sheet sync가 `expires_at > NOW()` 조건에서 보호하지 않으므로, 긴 변환에서는 commit 전 삭제 가능 시간이 더 넓어진다(`EcountAliasReservationService.java:61-81`; `ProductSheetSyncService.java:1386-1398`).
- accounting advisory lock은 `MIG8_ORDER_TRANSFORM` key로 transform끼리만 직렬화한다(`Mig8OrderTransformService.java:526-530`). sheet sync는 product row lock+reservation만 사용하고, 직접 단종/삭제는 reservation을 확인하지 않는다(`ProductService.java:583-588`, `:698-704`). native 품목 import도 source file hash 기반 별도 advisory lock이다(`EcountProductImporter.java:56-62`, `:266-270`). 즉 세 경로와 accounting lock이 공유되지 않는다.
- R12 diff는 partner-order import service/test/report 3개뿐이다. R12 재실행은 `/products/internal/lookup`만 호출하며 alias reservation endpoint를 호출하지 않는다(`Mig8OrderImportService.java:94-100`, `:209-224`; `ProductClient.java:50-92`). 따라서 **partner-order 재실행 1회당 신규 reservation 획득·해제는 0건**이고, R12가 per-run 경합 창을 직접 넓힌 것은 아니다.
- 다만 미해소를 upstream accounting transform 재실행으로 해소하는 운영은 transform 1회마다 alias resolve를 두 번 실행해 reservation token도 2개 만들고 종료 시 2개를 release한다(`Mig8OrderTransformService.java:66-67`; `ProductAliasClient.java:46-50`, `:102-120`). 재시도가 늘면 이 기존 창의 노출 횟수는 비례해 늘 수 있다. R12가 새 호출을 추가한 것은 아니므로 “창의 길이 확대 0, 기존 창 노출 횟수는 accounting 재실행 횟수만큼 증가”로 구분한다.
- 사용자가 겪을 수 있는 결과는 release 후 commit 전 또는 TTL 만료 후 product가 삭제되어 accounting 주문 라인이 비활성 UUID를 갖는 것이다. 이후 native import의 active product lookup이 실패해 주문 회복/전환이 다시 막힐 수 있으므로 BLOCK을 유지한다.

## 내가 보지 않은 것

- R7 원본 26,055행 live replay: 이 PC에 데이터가 없어 **데이터 부재로 미판정**.
- 실행 중 partner-order 컨테이너는 R12 이전 바이너리이므로 HEAD 실 HTTP import 재실행과 회복 주문의 연속 HTTP 전환은 보지 못했다. Docker 재빌드·재기동 및 공유 DB 쓰기는 하지 않았다.
- 공유 `staging.ecount_item_alias`가 0행이어서 실제 운영 다의 후보 표본의 업무적 정답은 보지 못했다. 선두 token 매칭 규칙 자체의 타당성·재설계는 범위에서 제외했다.
- migration 번호, 증거 무결성 전면 재현, 변경 파일 전수 조사, 범위 밖 기능 회귀는 보지 않았다.

## 실행 증거

- HEAD: `ff161201643a479bc21ef3f0c0eeacacef2ec3c3`.
- 명령: `.\gradlew.bat :services:partner-order-service:test --tests com.samhanair.logis.partnerorder.it.Mig8OrderImportServiceIT --tests com.samhanair.logis.partnerorder.it.PartnerOrderConvertIT --no-daemon`.
- 결과: 종료코드 `0`, `BUILD SUCCESSFUL in 44s`; JUnit XML 기준 `Mig8OrderImportServiceIT 5/5`, `PartnerOrderConvertIT 12/12`, failures/errors/skipped 모두 `0`.
- 공유 DB 조회: `staging.ecount_item_alias` 0행. 모든 조회는 `docker exec ... psql ... -c "SQL"` 형식으로 stdin 없이 수행했다.
