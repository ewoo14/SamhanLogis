# PR #984 R11 기능 회귀 검토

- 대상 SHA: `e6eab1837803e8aff76c20b1e5af9d433d1a5846`

## 중간 확인 기록

- [확인 1] `git rev-parse HEAD`가 대상 SHA와 정확히 일치한다. 조사 시작 시 작업트리의 유일한 미추적 파일은 본 R11 보고서였다. 저장소 지침상 이번 역할은 읽기 전용 검토이며 구현 변경은 하지 않는다.
- [확인 2] R9는 reservation 조기 release→accounting commit 창, 2분 TTL 만료, sheet sync 외 삭제 경로 미보호를 BLOCK으로 이월했다. R10 보고서는 reservation 경합과 TTL/commit handshake를 작업 범위에서 명시적으로 제외했다. 따라서 실제 판정은 현 HEAD의 관련 코드가 R9 이후 바뀌었는지와 호출 경계를 직접 대조해야 한다.
- [확인 3] R9 대상 `0169ae9d9`부터 현 HEAD까지의 변경 파일 목록에는 `Mig8OrderTransformService`, `EcountAliasReservationService`, `EcountAliasResolveService`, `ProductSheetSyncService`, `ProductService`가 하나도 없다. R10은 partner-order import/convert와 accounting admin 표시만 변경했다. reservation 경합 창 자체를 좁히거나 넓히는 직접 변경은 없다.
- [확인 4] 현 HEAD에서도 accounting transform은 `@Transactional(REQUIRES_NEW)` 메서드 내부 `finally`에서 원격 reservation을 release한다(`Mig8OrderTransformService.java:50-52`, `:62-87`). Spring 프록시의 accounting commit은 메서드 반환 뒤이므로 release→commit 창이 그대로다. line upsert도 전달받은 `productId`를 그대로 기록하며 Product active 재확인이 없다(`:310-355`).
- [확인 5] reservation 만료는 여전히 생성/갱신 시점부터 고정 2분이고 heartbeat가 없다(`EcountAliasReservationService.java:19`, `:46-57`). sheet sync는 `expires_at > NOW()`인 reservation만 보호한다(`:62-81`; `ProductSheetSyncService.java:1386-1398`). 직접 `discontinue`/`delete`는 reservation을 검사하지 않는다(`ProductService.java:583-588`, `:698-704`). accounting advisory lock도 accounting transform에서만 획득한다(`Mig8OrderTransformService.java:526-530`). 따라서 R9의 세 경계는 모두 그대로이며 실제 발생 건수는 데이터 부재로 미측정이다.
- [확인 6] R10의 단일·병합 전환 차단은 선택 라인의 `productId == null`일 때만 409를 던진다(`PartnerOrderConvertService.java:131-140`; `PartnerOrderMergeConvertService.java:150-160`). 정상 `productId` 라인은 기존 수량 검증과 예약/전표 경로로 계속 진행하므로 정적 조건 자체는 정상 주문을 포괄 차단하지 않는다.
- [확인 7] 회계 admin 표시는 정확히 `productId == null`만 센다. 목록은 해당 라인 수를 count하고(`AccountingAdminQueryService.java:150-154`), 상세는 각 라인의 동일 조건을 `unresolved`로 보낸다(`:157-168`). desktop도 count가 0이면 `-`, 상세 `unresolved`가 true일 때만 `(미해소)`를 붙인다(`OrderListPage.tsx:95-103`; `OrderDetailPage.tsx:52-59`). 비미해소 라인에 표시가 붙는 코드 경로는 없다.
- [확인 8] 미해소 라인이 accounting에서 나중에 해소돼도 기존 native 주문은 자동 복구되지 않는다. import는 주문번호 기반 idempotency key가 이미 있으면 product lookup과 line 처리 전에 즉시 `skipped`한다(`Mig8OrderImportService.java:78-86`, `:214-219`). 최초 import는 미해소 native 라인에 `product_id = NULL`을 INSERT할 뿐(`:140-171`), 재실행 시 이를 UPDATE하는 경로가 없다. 따라서 해당 native 주문의 전환 차단은 영구 지속한다.
- [확인 9] 로컬 Docker에는 gateway/accounting/partner-order/slip/inventory 등 API 스택이 실행 중이며 모두 healthy다. 다만 partner-order 컨테이너는 17시간째 실행 중이어서 현 HEAD R10 코드가 실제 배포됐는지는 별도 확인이 필요하다. 재빌드·재기동은 금지 조건대로 하지 않는다.
- [확인 10] 실행 중 partner-order의 `/app/app.jar`에는 현 HEAD 신규 migration `V15__allow_unresolved_mig8_product_lines.sql`이 없다(`jar tf` 검색 0건). 즉 현재 live HTTP 컨테이너는 R10 이전 바이너리라 현 HEAD 실 API 증거로 사용할 수 없다. 금지된 Docker 재빌드·재기동은 하지 않았다.
- [확인 11] 현 HEAD + 격리 Testcontainers PostgreSQL의 기존 API 통합테스트 4개를 선택 실행했고 종료코드 0(`BUILD SUCCESSFUL`, 41초)이었다. 정상 DRAFT 주문은 MockMvc `POST /api/v1/partner-orders/{id}/convert-to-slip`에서 부분전환 200 및 전량전환 200/`CONVERTED`를 통과했고(`PartnerOrderConvertIT.java:150-181`, `:194-225`), 정상 MIG-8 주문 3건/라인 4건 import와 미해소 주문 1건/라인 2건 보존도 통과했다(`Mig8OrderImportServiceIT.java:91-119`, `:148-169`). 공유 DB에는 쓰지 않았다.
- [확인 12] 생성된 JUnit XML은 `Mig8OrderImportServiceIT` 2 tests 및 `PartnerOrderConvertIT` 2 tests, 합계 4 tests / failures 0 / errors 0 / skipped 0을 기록한다. 따라서 미해소가 전혀 없는 정상 주문의 import→전표/재고 예약 호출 경로가 R10 조건 때문에 새로 막혔다는 증거는 없고, 선택 정상 경로는 PASS다.
- [확인 13] 직접 PUT 수정은 native 라인을 전량 교체할 수 있으나 요청에 실제 `productId`를 받지 않고 모델명 등으로 별도 name-based UUID를 만든다(`PartnerOrderUpdateRequest.java:25-46`; `PartnerOrderUpdateService.java:98-101`, `:349-358`, `:423-425`). 이는 accounting 라인이 나중에 실제 product UUID로 해소된 결과를 native 라인에 동기화하는 경로가 아니다. 따라서 재import skip 결론을 뒤집지 않는다.
- [확인 14] 요청된 읽기 전용 SQL을 `docker exec ... psql ... -c "SELECT ..."` 형식으로 실행한 결과 공유 `accounting_db`의 `staging.ecount_order_raw`는 0행이다. 26,055행 replay·실제 발생 건수는 데이터 부재로 미판정한다. 선택 테스트 종료 후 Testcontainers/Ryuk 잔존 컨테이너는 0건이다.

## 최종 판정

### (1) R9가 이월한 reservation 경합 창 — **BLOCK**

- R10은 이 창을 **좁히지도, 넓히지도 않았고 그대로 두었다.** R9 이후 reservation/transform/product 삭제 관련 파일은 변경되지 않았다.
- accounting의 `@Transactional` service 메서드가 반환되기 전 `finally`에서 원격 reservation을 release하므로, release 뒤 Spring 프록시의 accounting commit 전까지 삭제가 끼어들 수 있다(`Mig8OrderTransformService.java:50-52`, `:62-87`). line upsert 직전 Product active 재확인도 없다(`:310-355`).
- reservation은 여전히 2분 고정 TTL이며 heartbeat가 없고(`EcountAliasReservationService.java:19`, `:46-57`), sheet sync는 만료되지 않은 reservation만 보호한다(`:62-81`; `ProductSheetSyncService.java:1386-1398`). 직접 단종·삭제는 reservation을 검사하지 않는다(`ProductService.java:583-588`, `:698-704`). accounting advisory lock은 transform끼리만 직렬화한다(`Mig8OrderTransformService.java:526-530`).
- 따라서 조기 release 창, TTL 만료로 넓어지는 창, sheet sync·직접 삭제·native import와 공유되지 않는 lock 경계가 모두 남아 있다. 실제 발생 건수는 `staging.ecount_order_raw = 0`이므로 **데이터 부재로 미측정**이다.

### (2) R10이 정상 경로를 새로 막았는가 — **BLOCK**

- **미해소가 하나도 없는 정상 주문은 PASS다.** 차단 조건은 선택 라인의 `productId == null`에만 적용된다(`PartnerOrderConvertService.java:131-140`; `PartnerOrderMergeConvertService.java:150-160`). 현 HEAD + 격리 PostgreSQL의 API 통합테스트에서 정상 주문 부분전환과 전량전환이 모두 200이었고, 전량전환은 `CONVERTED`가 됐다(`PartnerOrderConvertIT.java:150-181`, `:194-225`). JUnit 결과는 해당 2건 모두 failure/error/skip 0이다. 즉 정상 라인의 재고 예약 호출과 전표 전환은 새 가드 때문에 막히지 않는다.
- **회계 admin 오표시도 PASS다.** 목록 count와 상세 boolean은 정확히 `productId == null`만 미해소로 판정한다(`AccountingAdminQueryService.java:150-168`). desktop은 count 0을 `-`로 표시하고 상세 boolean이 true일 때만 `(미해소)`를 붙인다(`OrderListPage.tsx:95-103`; `OrderDetailPage.tsx:52-59`).
- 그러나 **나중에 해소되는 주문은 BLOCK이다.** 최초 native import가 NULL `product_id` 라인을 보존한 뒤(`Mig8OrderImportService.java:140-171`), accounting에서 같은 라인이 실제 product UUID로 해소되어도 재import는 기존 idempotency key를 발견하는 즉시 `skipped`한다(`:78-86`, `:214-219`). 기존 native 라인을 UPDATE하는 동기화 경로가 없으므로 NULL이 영구 잔존하고, 단일·병합 전환은 계속 409로 막힌다.
- 따라서 R10은 처음부터 정상인 주문을 새로 막지는 않았지만, 일시적 미해소 주문을 **해소 후에도 다시 전환 가능하게 만들지 못했다.** 실제 사용자는 accounting에서 품목을 해소해도 영업 native 주문의 전표·재고 전환을 계속 할 수 없으므로 질문 (2)의 종합 판정은 BLOCK이다.

## 재현·검증 범위

- 실행 명령: `./gradlew :services:partner-order-service:test --no-daemon`의 선택 4 tests. 결과 `BUILD SUCCESSFUL`(41초), `Mig8OrderImportServiceIT` 2/2 및 `PartnerOrderConvertIT` 2/2, failures 0 / errors 0 / skipped 0.
- 데이터는 Testcontainers의 격리 PostgreSQL에서만 생성·정리됐다. 공유 DB에는 SELECT 외 쓰지 않았다.
- 실행 중 live partner-order 컨테이너의 jar에는 V15가 없어 R10 이전 바이너리임을 확인했다. 이 컨테이너를 재빌드·재기동하지 않았으며, 현 HEAD의 live network HTTP 증거로 사용하지 않았다.

## 내가 보지 않은 것

- 요청 범위 밖인 선두 token 매칭의 오결합, 증거 무결성 전면 재현, 변경 파일 전수 조사는 보지 않았다.
- 마이그레이션 번호는 이미 V15로 해소된 것으로 두었으며 문제를 제기하지 않았다.
- 26,055행 라이브 replay는 하지 않았다. `staging.ecount_order_raw = 0`이므로 실제 처리시간·경합 발생 건수·미해소 주문 수는 데이터 부재로 미판정했다.
- 실행 중 live HTTP 컨테이너는 R10 이전 바이너리라 현 HEAD의 실 네트워크 API 호출은 보지 못했다. 대신 현 HEAD controller→service→Testcontainers PostgreSQL을 통과하는 MockMvc API 통합테스트로 정상 주문의 부분·전량 전환을 확인했다.
- Docker 이미지 재빌드·서비스 재기동, 공유 DB 쓰기, git 쓰기, 제품 코드 수정은 하지 않았다.
