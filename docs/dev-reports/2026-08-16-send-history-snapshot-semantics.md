```text
cwd   C:/dev/Samhan-Public   (main, 읽기 전용)
HEAD  0245810d2b5a878568be7490fd97000818b4f6e9
```

# 발송내역 snapshot 의미 실측 (2026-08-16)

## 조사 결론

- **종합견적서(estimate-app): live join** — 엄밀히는 출고전표를 조인하지 않고 `partner_orders` 현재 행을 다시 읽는 live read다. 별도 발송 snapshot을 조회하지 않는다.
- **주문서웹(order-app): live join** — `partner_orders` 현재 행을 직접 다시 읽는다. `partner_order_history`와 `partner_order_revisions`는 조회 API가 사용하지 않는다.
- 두 앱 모두 레거시 Notion 발송 DB의 독립 사본 구조와 다르다.
- 현재 HEAD에는 두 웹앱의 legacy 화면 필드와 현행 API DTO 사이에 계약 불일치가 있다. 따라서 “발송내역 화면에 실제 문서가 어떻게 렌더되는가”는 코드만으로 정상 동작을 확인할 수 없다. 아래 snapshot/live 판정은 각 화면이 실제로 호출하는 현행 조회 경로와 DB를 기준으로 했다.

## 1. 종합견적서(estimate-app) 발송내역

### 1.1 조회 경로

1. 화면의 `loadHistory()`는 날짜와 기준 필드를 받아 `getNotionHistory(...)` RPC를 호출한다: `clients/web/estimate-app/views/index.ejs:14122-14141`.
2. 현행 RPC 구현은 이름과 달리 Notion이나 estimate snapshot을 조회하지 않고 `GET /api/v1/partner-orders`를 호출한다: `clients/web/estimate-app/lib/code.js:2440-2450`.
3. 해당 API는 `PartnerOrderListController.list()`에서 `PartnerOrderQueryService.list()`로 간다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderListController.java:49-75`.
4. 기본 경로(`includeDeleted=false`)는 JPA Specification으로 현재 `PartnerOrder`를 조회한다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderQueryService.java:87-103`, `:207-224`.
5. 읽는 원본은 `partner_orders`다. 엔티티에 `@SQLRestriction("is_deleted = false")`가 걸려 있다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java:36-41`.
6. 응답은 현재 주문 행의 주문번호·상태·합계·연결 전표번호 등을 즉석 변환한다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderSummaryResponse.java:55-78`.
7. 거래처명은 저장된 발송 사본이 아니라 조회 시점에 partner-service를 다시 조회한다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderQueryService.java:271-275`.

### 1.2 얼어붙음/live 판정과 변경 시 동작

**판정: live join(current-row live read).**

- 이 경로는 `slips`, `slip_lines`, `slip_revisions`를 읽지 않는다. `partner_orders.slip_no`는 연결 번호 문자열일 뿐이다.
- 출고전표 자체의 내용이 바뀌어도 이 조회 결과가 그 내용을 따라 바뀌지는 않는다. 출고전표를 읽지 않기 때문이다.
- 대신 연결된 `partner_orders` 현재 헤더가 수정되면 목록 DTO의 상태·합계·연결 전표번호 등은 현재 값으로 바뀐다.
- 주문 라인의 모델명·상품명은 주문 생성 시 `partner_order_lines`에 복사되지만(`PartnerOrderLine`: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:28-43`, `:68-74`), 주문 수정은 기존 라인을 soft delete하고 새 라인으로 교체한다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderUpdateService.java:84-114`, `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java:377-400`. 따라서 “상품 마스터 변경”에는 snapshot이지만 “주문 원본 변경”에는 불변 snapshot이 아니다.
- 별도 full snapshot은 `partner_order_revisions`에 존재하지만, 이 발송내역 API는 그것을 읽지 않는다. confirm 시 CREATE revision을 캡처하는 코드는 `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:180-190`, snapshot 조립·저장은 `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/revision/service/PartnerOrderRevisionService.java:129-157`이다.

### 1.3 삭제 시 동작

- **partner_order soft delete:** 목록에서 사라진다. 기본 조회는 `includeDeleted=false`이고 `PartnerOrder`의 `@SQLRestriction("is_deleted = false")`가 적용된다 (`PartnerOrderQueryService.java:100-103`, `:207-224`; `PartnerOrder.java:36-41`). 즉 “보낸 기록”을 별도 보존해 보여 주는 경로가 아니다.
- **연결된 slip soft delete:** 이 조회는 slip 테이블을 조인하지 않으므로 slip 삭제만으로는 `partner_orders` 행이 사라지지 않는다. 연결 번호는 현재 주문 행에 그대로 남을 수 있다.
- 주문 삭제 서비스는 삭제 직전 revision snapshot을 남기지만, 발송내역은 그 revision을 조회하지 않는다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderDeleteService.java:50-85`.

### 1.4 현행 화면/API 계약 실측

- RPC는 `startDate`, `endDate`, `userEmail`을 `/api/v1/partner-orders`에 보내지만(`code.js:2444-2449`), 컨트롤러의 날짜 파라미터는 `dateFrom`, `dateTo`이고 `userEmail` 파라미터가 없다(`PartnerOrderListController.java:52-64`). 전달한 기간·사용자 필터가 이 API에 적용되지 않는다.
- `_msGet()`은 `ApiResponse`를 그대로 반환한다: `clients/web/estimate-app/lib/code.js:96-107`. `getNotionHistory()`는 배열 또는 `data.items`만 인식한다: `:2444-2450`. 실제 컨트롤러는 `ApiResponse<Page<...>>`, 즉 행이 `data.content`에 있으므로 현재 구현은 이를 빈 배열로 만든다.
- 화면은 `date`, `slipNo`, `custName`, `items` 등 legacy 문서 필드를 기대한다: `clients/web/estimate-app/views/index.ejs:14145-14175`, `:14183-14220`. 현행 목록 DTO는 그 계약을 제공하지 않는다 (`PartnerOrderSummaryResponse.java:13-27`).
- 따라서 HEAD 기준 실제 화면 종단에서 정상 문서 조회가 된다고 판정할 수 없다. **확인 불가**다. 다만 호출 대상 DB가 snapshot이 아니라 현재 `partner_orders`라는 점은 코드로 확정된다.

### 1.5 실데이터 대조

`partner_order_db`를 `BEGIN; SET TRANSACTION READ ONLY; ...; ROLLBACK;`으로 조회했다.

- `partner_order_history`의 `CONFIRMED` 이벤트와 연결되는 주문: **1,994건**.
- 그중 현재 활성 `partner_orders`: **4건**.
- 그중 현재 soft delete `partner_orders`: **1,990건**. 이들은 현행 기본 목록에서 사라진다.
  - 이슈 #1096 테스트 시더 정리 actor로 삭제: **1,987건**.
  - 그 외 삭제: **3건**.
- confirm 때 캡처한 CREATE full snapshot과 최신 revision의 내용(상태·연결전표·revision counter 같은 비내용 필드 제외)이 다른 주문: **4건**.
  - 현재 활성이며 내용 불일치: **3건**.
  - 현재 삭제이며 내용 불일치: **1건**.
- `slip_source_orders` 활성 연결은 서로 다른 slip 기준 **3건**이고 연결된 slip **3건 모두 현재 soft delete**다. 이 연결들이 가리키는 주문 5건도 모두 이슈 #1096 테스트 시더 정리로 soft delete되어, 현재 데이터에는 “slip만 삭제되고 주문은 활성인” 독립 사례가 없다. 그 경우의 UI 결과는 실데이터로 분리 측정할 수 없어 **확인 불가**이며, 코드상으로는 slip을 조인하지 않으므로 주문 행이 유지되는 한 영향이 없다.

## 2. 주문서웹(order-app) 발송내역

### 2.1 조회 경로

1. 화면의 `fetchOrderHistory()`가 `getOrderHistory(...)` RPC를 호출한다: `clients/web/order-app/index.html:8962-8977`.
2. shim은 모든 페이지를 `GET /partner-orders/history`에서 읽는다: `clients/web/order-app/src/samhanApi.ts:333-343`; 페이지 언래핑과 반복은 `:102-180`.
3. API는 `PartnerOrderHistoryController.history()`에서 `PartnerOrderHistoryService.findHistory()`로 간다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderHistoryController.java:28-49`.
4. 서비스는 `PartnerOrderRepository.findAllBy...ConfirmedAtBetween...`를 호출하고 현재 `PartnerOrder`를 `HistoryResponse`로 변환한다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderHistoryService.java:51-76`.
5. 저장소의 조회 대상은 `partner_orders` 엔티티다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/repository/PartnerOrderRepository.java:53-62`.
6. `HistoryResponse`는 현재 주문 행의 `orderNo`, `slipNo`, 상태, 합계, `confirmedAt`을 즉석에서 읽는다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/HistoryResponse.java:10-26`.

### 2.2 얼어붙음/live 판정과 변경 시 동작

**판정: live join(current-row live read).**

- 이름이 비슷한 `partner_order_history` 테이블을 조회하지 않는다. 조회 서비스가 사용하는 저장소는 `PartnerOrderRepository`다 (`PartnerOrderHistoryService.java:20-23`).
- `partner_order_history`의 CONFIRMED 행은 confirm 시 `detail_json={"orderNo": ...}` 이벤트 메타데이터만 저장한다: `PartnerOrderConfirmService.java:179-182`. 품목·주소·금액의 발송 사본이 아니다.
- 주문 헤더나 라인이 변경되면 현재 `partner_orders`/`partner_order_lines`가 바뀌며, 이 API가 반환하는 필드(특히 합계·상태)는 변경된 현재 값이다.
- CREATE/EDIT/RESTORE/DELETE full snapshot은 `partner_order_revisions`에 별도로 남지만 이 history API는 사용하지 않는다.

### 2.3 삭제 시 동작

- `PartnerOrder`에 `@SQLRestriction("is_deleted = false")`가 걸려 있고 history 저장소 메서드는 그 엔티티를 조회한다: `PartnerOrder.java:36-41`, `PartnerOrderRepository.java:53-59`.
- 따라서 주문이 soft delete되면 발송내역 API에서도 사라진다. `partner_order_history` CONFIRMED 이벤트와 `partner_order_revisions` CREATE/DELETE snapshot이 남아 있어도 화면 조회에는 사용되지 않는다.
- 라인만 soft delete된 경우에도 `PartnerOrderLine`의 `@SQLRestriction("is_deleted = false")`로 현재 상세에서는 빠진다: `PartnerOrderLine.java:39-44`.

### 2.4 현행 화면/API 계약 실측

- API DTO는 6개 요약 필드만 제공한다 (`HistoryResponse.java:10-16`).
- legacy 화면은 `outDate`, `orderDate`, `addr`, `note`, `items`, `bizName`, `payDate`, `siteAddr`, `receiver`를 기대한다: `clients/web/order-app/index.html:8988-9023`, `:9027-9072`.
- 특히 상세 열기는 `d.items.reduce(...)`를 즉시 호출한다(`index.html:9032-9035`). 현행 DTO에는 `items`가 없으므로 현재 계약 그대로면 상세 문서를 정상 렌더링할 수 없다.
- 따라서 실제 화면 종단의 정상 동작은 **확인 불가**다. 조회 소스가 현재 주문 행이라는 판정에는 영향이 없다.

### 2.5 실데이터 대조

두 앱이 같은 `partner_orders` 원본을 읽으므로 DB 전체 cohort 집계는 종합견적서와 같다.

- CONFIRMED 이벤트 연결 주문: **1,994건**.
- 현재 API에서 살아 있는 원본: **4건**.
- soft delete되어 API에서 사라진 원본: **1,990건**(테스트 시더 정리 **1,987건**, 그 외 **3건**).
- CREATE full snapshot 대비 최신 내용 불일치: **4건**. 현재 보이는 활성 원본 중 **3건**이 생성 시점 내용과 다르다.
- 이는 발송내역 행과 원본을 별도 두 집합으로 비교한 수치가 아니다. 현행 발송내역 행 자체가 현재 원본 행이므로, `partner_order_revisions`의 CREATE snapshot을 발송 시점 기준선으로 삼아 비교한 수치다.

## 3. 레거시 GAS/Notion 동작 — 원문

### 3.1 종합견적서

레거시는 전송 시 별도 Notion 발송 DB에 헤더와 품목 전체를 새 page로 저장했다.

> `parent: { database_id: NOTION_DB_SEND },`  
> `'출고일': { date: { start: safeDate } },`  
> `'전표번호': { number: Number(slipNo) },`  
> `'거래처명': { title: [{ text: { content: info.bizName || '미지정' } }] },`  
> `'배송주소': { rich_text: [{ text: { content: info.addr || '' } }] },`  
> `'특이사항': { rich_text: [{ text: { content: info.note || '' } }] },`  
> `'품목데이터': { rich_text: chunks }`

출처: `tools/legacy-gas/종합견적서/Code.js:2368-2387`. `chunks`는 직전에 `JSON.stringify(items)`를 Base64로 만든 값이다: `:2352-2362`.

조회도 원본 전표가 아니라 그 Notion 발송 DB를 직접 query하고 저장된 Base64 품목을 복호화한다.

> `const url = \`https://api.notion.com/v1/databases/${NOTION_DB_SEND}/query\`;`

출처: `tools/legacy-gas/종합견적서/Code.js:2415-2433`.

> `const dataProps = p['품목데이터']?.rich_text || [];`  
> `const base64Items = dataProps.map(t => t.text.content).join('');`  
> `const decodedStr = Utilities.newBlob(Utilities.base64Decode(base64Items)).getDataAsString();`  
> `parsedItems = JSON.parse(decodedStr);`

출처: `tools/legacy-gas/종합견적서/Code.js:2476-2512`.

**판정:** 원본 출고전표와 독립된 snapshot이다. 이 파일에는 원본 전표 변경·삭제에 맞춰 Notion page를 수정하거나 archive하는 경로가 없다. 원본이 지워져도 별도로 저장된 Notion page는 독립적으로 남는다.

### 3.2 거래처 발송 주문서

레거시는 주문 전송 시 별도 주문 Notion DB에 헤더와 Base64 품목을 새 page로 저장했다.

> `parent: { database_id: NOTION_DB_ID_ORDER },`  
> `'거래처명': { title: [{ text: { content: common.bizName || '' } }] },`  
> `'배송주소': { rich_text: [{ text: { content: common.addr || '' } }] },`  
> `'현장주소': { rich_text: [{ text: { content: common.siteAddr || '' } }] },`  
> `'특이사항': { rich_text: [{ text: { content: common.note || '' } }] },`  
> `'품목데이터': { rich_text: chunks }`

출처: `tools/legacy-gas/거래처 발송 주문서/Code.js:3222-3256`. 품목은 `JSON.stringify(items)` 후 Base64 분할한다: `:3230-3242`.

조회는 그 Notion 주문 DB를 직접 query한다.

> `const url = \`https://api.notion.com/v1/databases/${NOTION_DB_ID_ORDER}/query\`;`

출처: `tools/legacy-gas/거래처 발송 주문서/Code.js:3084-3127`.

> `const dataProps = p['품목데이터']?.rich_text || [];`  
> `const base64Items = dataProps.map(t => t.text.content).join('');`  
> `const decodedStr = Utilities.newBlob(Utilities.base64Decode(base64Items)).getDataAsString();`  
> `parsedItems = JSON.parse(decodedStr);`

출처: `tools/legacy-gas/거래처 발송 주문서/Code.js:3175-3209`.

**판정:** 원본 주문과 독립된 snapshot이다. 이 파일에는 원본 주문 변경·삭제에 맞춰 Notion page를 수정하거나 archive하는 경로가 없다. 원본이 지워져도 별도로 저장된 Notion page는 독립적으로 남는다.

## 4. 레거시와 현행 차이 요약

| 앱 | 레거시 | 현행 조회 원본 | 원본 내용 변경 | 원본 soft delete |
|---|---|---|---|---|
| 종합견적서 발송내역 | 별도 Notion page에 헤더+품목 사본 | 현재 `partner_orders`; slip은 조회하지 않음 | 주문 행 변경은 현재 값 반영. slip 변경은 조회하지 않으므로 미반영 | 주문 삭제 시 사라짐. slip만 삭제되면 코드상 주문 행은 유지 |
| 주문서웹 발송내역 | 별도 Notion page에 헤더+품목 사본 | 현재 `partner_orders` | 현재 값 반영 | 주문 삭제 시 사라짐 |

현행 DB에는 발송 시점 full snapshot(`partner_order_revisions` CREATE)이 존재하지만, 두 발송내역 조회 경로는 이를 사용하지 않는다. 따라서 저장 데이터의 존재와 사용자에게 보이는 발송내역의 의미가 다르다.

## 5. 읽기 전용 실측 조건

- Git 변경 명령, 제품 코드 수정, 컨테이너 재배포를 수행하지 않았다.
- DB 조회는 모두 `BEGIN; SET TRANSACTION READ ONLY; ...; ROLLBACK;`으로 실행했다.
- 보고서에는 UUID, 개별 거래처명, 사업자번호, 주문번호, 전표번호를 기록하지 않았다.
