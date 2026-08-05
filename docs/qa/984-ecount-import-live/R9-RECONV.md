# PR #984 R9 기능 회귀 검토

- 대상 SHA: `0169ae9d90d31ad865b291864062bb9d48be4079`

## 조사 전 확인

- `git rev-parse HEAD` 결과가 대상 SHA와 정확히 일치한다.
- 검토 범위는 요청된 두 질문으로만 제한하며, 코드 수정·git 쓰기·Docker 재빌드/재기동·공유 DB 쓰기·라이브 replay를 수행하지 않는다.

## (1) `product_id = NULL` 하류 처리 — 확인 기록

### 1-1. accounting 내부 export

- `AccountingMig8OrderExportService`는 주문에 속한 `order_lines`를 `product_id` 조건 없이 전부 조회하고(`AccountingMig8OrderExportService.java:68-74`), 각 행을 응답 목록에 추가한다(`:77`). `product_id`는 nullable UUID로 그대로 DTO에 매핑된다(`:100-108`). 따라서 이 경계에서는 NULL 라인이 조용히 탈락하지 않는다.
- 계약 IT도 두 번째 라인의 `product_id = NULL`을 seed하고, 응답 `lines[1]` 자체는 존재하되 `productId` 필드만 없음을 단언한다(`AccountingMig8OrderInternalControllerIT.java:107-114`, `:138-145`).

### 1-2. partner-order 네이티브 이식 경계

- `AccountingMig8OrderClient`도 `lines` 배열의 모든 원소를 순회해 추가하며(`AccountingMig8OrderClient.java:119-136`), 없는 `productId`를 `null`로 파싱한다(`:157-160`). 이 경계까지 라인 자체는 유지된다.
- 그러나 `Mig8OrderImportService.hasInvalidLine()`은 라인 하나라도 `productId == null`이면 즉시 invalid로 판정한다(`Mig8OrderImportService.java:190-204`). 호출부는 `hasInvalidLine`이 참이면 주문 전체를 `rejected`로 반환하고 native `partner_orders`/`partner_order_lines` INSERT 전에 종료한다(`:95-100`; 실제 INSERT는 `:110-139`). 즉 **NULL 라인만 제외하는 것이 아니라 그 라인을 포함한 주문 전체가 네이티브 주문 도메인에 생성되지 않는다.**
- import endpoint의 결과에는 `rejectedCount`가 포함되지만(`Mig8OrderImportResult.java:4-16`, `:30-32`), `importOneSafely`는 런타임 예외도 같은 rejected count로 축약하고(`Mig8OrderImportService.java:66-74`), NULL 품목의 주문번호·라인·사유를 응답 상세로 전달하지 않는다.

### 1-3. 화면과 금액

- 회계 admin 주문 목록은 accounting `orders`를 직접 조회하므로 주문이 보인다(`AccountingAdminQueryService.java:35-39`). 목록 화면은 주문번호·거래처·상태와 함께 합계/공급가를 표시한다(`OrderListPage.tsx:53-106`, `:213-218`).
- 회계 admin 상세는 `order.getLines()` 전부를 DTO로 만들며 productId로 필터하지 않는다(`AccountingAdminQueryService.java:148-162`). 화면도 `order.lines` 전부를 품목명·수량·단가·공급가·부가세·라인합계로 렌더링한다(`OrderDetailPage.tsx:47-97`, `:142-153`). 다만 화면 DTO에는 `productId`나 “미해소” 상태 필드가 아예 없다(`accountingAdminApi.ts:37-52`). 따라서 사용자는 미해소 라인을 **금액이 있는 일반 품목 라인처럼 보게 되며**, 미해소임을 화면에서 알 수 없다.
- accounting 주문 헤더 합계는 활성 `order_lines`의 `supply_amount`와 `vat_amount`를 productId 조건 없이 합산한다(`Mig8OrderTransformService.java:358-372`). 따라서 NULL 라인의 금액은 회계 admin 목록·상세 합계에 **포함**된다.

### 1-4. 네이티브 주문·전표·재고

- 반면 영업 “주문서 관리” 화면은 `/api/v1/partner-orders`의 native `partner_orders`만 조회한다(`SalesPartnerOrderListPage.tsx:168-183`; `PartnerOrderQueryService.java:209-216`). 앞 단계에서 주문 전체 INSERT가 거부되므로 해당 주문은 이 목록에 없고 상세 진입도 불가능하다(`PartnerOrderQueryService.java:124-133`).
- 전표 전환은 먼저 native 주문을 조회하고 없으면 `PARTNER_ORDER_NOT_FOUND`로 끝난다(`PartnerOrderConvertService.java:103-112`). 재고 예약은 그 뒤 선택된 native 주문 라인의 productId로만 실행된다(`:121-180`). 따라서 이 주문은 **전표 전환 0건, 재고 예약/차감 0건**이다. NULL 라인만 빠지는 것이 아니라 주문 전체가 영업 운영 경로에서 사라진다.

## (2) 삭제 식별자 결합 창 — 확인 기록

### 2-1. reservation의 실제 범위

- reservation은 `(reservation_token, product_id)`별 `expires_at`만 저장하며 FK나 주문 커밋 상태는 저장하지 않는다(`V29__add_ecount_alias_reservations.sql:2-12`). TTL은 생성/갱신 시점부터 고정 2분이다(`EcountAliasReservationService.java:18`, `:42-50`).
- resolver는 active Product만 조회한 뒤 같은 product 행에 `FOR UPDATE`를 잡고 reservation을 생성한다(`EcountAliasResolveService.java:39-57`; `EcountAliasReservationService.java:32-50`). sheet sync도 삭제 직전에 같은 Product 행을 잠그고 active reservation(`expires_at > NOW()`)을 검사해, 활성 중이면 soft-delete를 보류한다(`EcountAliasReservationService.java:54-73`; `ProductSheetSyncService.java:1365-1398`). 이 좁은 경합—resolver 예약 생성 대 sheet-sync soft-delete—은 직렬화된다.
- 그러나 관리자의 직접 `ProductService.delete()`는 reservation 존재 여부를 검사하지 않고 `markDeleted`한다(`ProductService.java:698-705`). `discontinue()`도 reservation을 검사하지 않는다(`:583-588`). 따라서 reservation이 active여도 sheet-sync 외 삭제/비활성 경로에는 보호가 적용되지 않는다.

### 2-2. TTL 만료와 커밋 경계

- accounting 변환은 transaction 시작 직후 advisory transaction lock을 얻고(`Mig8OrderTransformService.java:50-53`, `:526-530`), alias를 두 번 해소한 뒤 모든 주문 그룹을 순차 upsert한다(`:62-81`). **마지막 resolve 이후 TTL을 갱신하는 heartbeat가 없다.** 마지막 resolve부터 해당 라인 upsert까지 2분을 넘으면 reservation은 자동으로 inactive가 되고, sheet sync는 그 Product를 soft-delete할 수 있다. accounting의 line upsert는 받은 UUID를 그대로 쓰며 Product active 상태를 재검증하지 않는다(`:310-355`).
- 더 짧은 확정 창도 있다. `finally`에서 원격 reservation release를 호출하는 시점은 service 메서드가 반환되기 전이다(`Mig8OrderTransformService.java:82-87`). Spring의 accounting DB transaction commit은 프록시가 메서드 반환을 받은 뒤 수행되므로, **reservation 해제 → accounting commit 사이**에는 sheet sync 또는 직접 삭제가 Product를 지울 수 있다. 두 DB 사이에는 commit handshake/FK가 없으므로 삭제된 UUID가 새 `order_lines.product_id`로 확정될 수 있다.
- 그러므로 “2분 안에 끝난다”는 가정만으로도 창이 0이 되지 않으며, 2분 만료 시에는 창이 변환 진행 중으로 더 넓어진다. 이 PC에는 원본 26,055행이 없으므로 실제 처리시간과 발생 건수는 **데이터 부재로 미측정**이다. 하지만 창의 존재 자체는 코드 경계로 확정된다.

### 2-3. 프로세스 중단과 동시 실행

- accounting 프로세스가 resolver 이후 DB commit 전에 죽으면 accounting transaction은 rollback되고 Product DB reservation만 TTL까지 남는다. 이 경우에는 신규 주문 결합이 생기지 않는다. Product 프로세스가 죽어도 reservation은 DB 행이라 재기동과 무관하게 TTL까지 남는다.
- 동시에 두 transform 요청이 와도 `pg_advisory_xact_lock`이 accounting DB transaction 단위로 직렬화한다(`Mig8OrderTransformService.java:50-53`, `:526-530`). 따라서 두 transform끼리 같은 staging을 동시에 쓰는 창은 없다.
- 다만 이 advisory lock은 product sheet sync·직접 삭제·partner-order native import와 공유되지 않는다. 따라서 transform 직렬화는 위의 TTL/조기 release 창을 닫지 못하며, 첫 transform commit 직후 native import가 실행되면 삭제된 UUID를 가진 accounting 주문을 읽을 수 있다.

## 최종 판정

### (1) `product_id = NULL` 라인의 하류 처리 — **BLOCK**

- 회계 admin 목록·상세에는 주문과 NULL 라인이 보이고 그 금액도 합계에 포함된다. 그러나 “미해소” 표시가 없어 일반 품목처럼 보인다(`AccountingAdminQueryService.java:148-162`; `OrderDetailPage.tsx:47-97`, `:142-153`; `accountingAdminApi.ts:37-52`).
- 다음 native 이식에서는 NULL 라인 하나 때문에 주문 전체가 200 응답의 `rejectedCount` 한 건으로 축약되고, native 주문 목록·상세·전표 전환·재고 경로에서는 완전히 사라진다(`Mig8OrderImportService.java:95-100`, `:190-204`; `Mig8OrderImportController.java:23-28`; `PartnerOrderQueryService.java:209-216`; `PartnerOrderConvertService.java:103-112`, `:165-180`).
- 따라서 이 PR이 막으려던 “200 응답 아래 조용한 누락”은 **라인 누락에서 주문 전체의 native 누락으로 형태를 바꿔 되살아났다.** 실제 26,055행 replay 및 발생 건수는 데이터 부재로 미판정이나, 사용자 오작동 경로 자체는 정적 코드로 확정된다.

### (2) 삭제 식별자가 신규 주문에 결합될 창 — **BLOCK**

- 2분 TTL 만료 뒤 reservation은 inactive로 취급되고 sheet sync 삭제가 재개된다(`EcountAliasReservationService.java:64-70`; `ProductSheetSyncService.java:1386-1398`). transform은 heartbeat나 line-upsert 직전 Product active 재검증이 없다(`Mig8OrderTransformService.java:62-81`, `:310-355`).
- TTL 전에도 `finally`의 release가 accounting DB commit보다 먼저 실행되어 조기-release 창이 있고(`Mig8OrderTransformService.java:82-87`), 직접 delete/discontinue는 reservation을 검사하지 않는다(`ProductService.java:583-588`, `:698-705`). 따라서 삭제된 식별자가 신규 accounting 주문 라인에 확정될 수 있다.
- 프로세스가 commit 전에 죽는 경우는 rollback되어 결합을 만들지 않고 orphan reservation만 TTL까지 남는다. 동시 transform 두 건도 accounting advisory transaction lock으로 직렬화된다(`Mig8OrderTransformService.java:50-53`, `:526-530`). 그러나 어느 것도 product 삭제나 native import와 같은 lock/commit 경계를 공유하지 않아 위 창을 닫지 못한다.

## 내가 보지 않은 것

- 요청 범위 밖인 선두 token 매칭의 오결합, migration 번호 적절성, 증거 무결성 재현, 변경 파일 전수 조사는 보지 않았다.
- 라이브 replay와 공유 DB 쓰기는 하지 않았다. 이 PC의 `staging.ecount_order_raw = 0`이라는 제공 조건에 따라 26,055행의 실제 처리시간·NULL 건수·화면 발생 건수는 데이터 부재로 미판정했다.
- 테스트의 강도·mock 품질·누락 테스트는 평가하지 않았다.
- Docker 재빌드·재기동, git 쓰기, 코드 수정은 하지 않았다.
