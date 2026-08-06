# PR #1082 SOL 5.6 2차 적대검증 — 도달성 판정 및 fix 지시서

- 검증 대상: `fix/1051-slip-product-link-audit` / `a830e717a0beda2a1aba383554d265dcac636764`
- 판정: **도달 결함 있음 — 머지 불가**
- 원칙: 실 사용자 경로의 도달 결함과 증거 무결성만 판정했다. 테스트 강도·mock·문서 품질·가드 완전성은 판정하지 않았다.

## 1. 도달 결함 A — 본사 주문 상세의 정상 저장이 전부 422로 차단됨

### 사용자가 밟는 한 문장

`MASTER`·`MANAGER`·`SALES` 사용자가 주문 상세를 열고 memo, 수량, 품목명, 모델명, 비고, 납품가 또는 카테고리 중 어느 하나를 편집해 저장하면 `PARTNER_ORDER_UPDATE_INVALID_LINE` 422를 받는다.

### 재현 절차

1. 노출·비삭제 DRAFT 주문 상세를 조회한다.
2. 데스크톱이 만드는 것과 같은 편집 payload를 만든다. 상세 응답에는 `lineTotal`이 있으나 `authority`는 없으므로 데스크톱은 `lineTotal = line.lineTotal ?? line.subtotal`, `authority = line.authority ?? null`로 보낸다.
3. memo만 바꾸고 PUT 한다.
4. `MASTER`, `MANAGER`, `SALES` 각각에서 같은 422를 확인한다.
5. 서버는 변경 유무를 계산하기 전에 모든 라인에 `validateLines`를 적용하고, `lineTotal != null && authority == null`을 거부한다.

### 실행 원문

세 권한 모두에서 받은 응답 원문은 다음과 같았다.

```json
{"success":false,"code":"PARTNER_ORDER_UPDATE_INVALID_LINE","message":"공급가액·부가세·합계를 사용할 때 authority는 필수입니다.","data":null,"errors":null}
```

HTTP status는 세 요청 모두 `422`였다. 같은 요청을 `PARTNER` 신원으로 호출한 원문은 다음과 같았다.

```json
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=sales.partner-order.edit action=UPDATE role=PARTNER reason=PARTNER identity (X-Is-Partner=true)","data":null,"errors":null}
```

HTTP status는 `403`이었다. 직접 PUT은 `partnerSelfService`가 아닌 본사 권한 경로이며, 거래처 사용자는 별도의 편집 요청 경로를 사용한다. 따라서 PARTNER 403은 이 PR의 도달 결함으로 세지 않았다.

### 입력별 실제 도달 결과

| 편집 | 현재 데스크톱 실경로 결과 | 판정 |
|---|---|---|
| memo만 변경 | 422 | 결함 A 재현 |
| 수량만 변경 | 422 | 결함 A에 선차단 |
| 품목명 직접 수정 | 422 | 결함 A에 선차단 |
| 모델명 공백/대소문자 변형 | 422 | 결함 A에 선차단 |
| 비고만 변경 | 422 | 결함 A에 선차단 |
| 납품가만 변경 | 422 | 결함 A에 선차단 |
| 카테고리 변경 | 422 | 결함 A에 선차단 |
| 라인 추가·삭제 | 현재 상세 편집 UI에 조작 수단 없음 | 실 사용자 경로로 재현하지 않음 |

모델명 공백·대소문자 변형은 결함 A를 우회하더라도 별도 불일치가 있다. product-service는 입력을 trim하지만 반환 `modelCode`는 카탈로그의 canonical 값이고, update-service는 반환 map을 canonical 값으로 만든 뒤 원래 요청 문자열로 조회한다. 대소문자도 lookup 쿼리에서 정규화하지 않는다. 다만 현재 UI에서는 결함 A가 먼저 발생하므로 별도 도달 결함 건수로 중복 계산하지 않았다.

### 코드 근거

- `PartnerOrderDetailResponse.LineResponse`에는 `lineTotal`은 있으나 `authority` 필드가 없다.
- `SalesPartnerOrderDetailPage.toEditLines`는 `lineTotal: line.lineTotal ?? line.subtotal`, `authority: line.authority ?? null`로 변환한다.
- `PartnerOrderUpdateService.update`는 `diff`보다 먼저 `validateLines`를 호출한다.
- `validateLines`는 `authority`가 비었는데 `lineTotal`이 있으면 위 422를 발생시킨다.

## 2. 도달 결함 B — 기존 orphan 주문은 자가 복구가 막히고 전표 전환도 실패함

### 사용자가 밟는 한 문장

기존 orphan 주문을 본사 사용자가 상세 화면에서 바로잡아 저장하려 하면 결함 A의 422로 막히며, 고치지 않은 채 전표 전환하면 존재하지 않는 `product_id`가 재고 예약으로 전달되어 409가 된다.

### 재현·근거

읽기 전용 조회 원문:

```text
    order_no     | status |                         memo                         |              product_id              |     model_name      |       product_name        | category_key | quantity | price_vat  |  subtotal  |     remark
-----------------+--------+------------------------------------------------------+--------------------------------------+---------------------+---------------------------+--------------+----------+------------+------------+-----------------
 2026/06/08-1982 | DRAFT  | #693 deps fix QA — PUT 저장 후 세션 유지 검증        | 77fabff4-6917-3846-ad8c-3616eba3a219 | AR05TXEAAWKNEU-11   | 삼성 윈드프리 5평형       | homemulti    |        1 |  600000.00 |  600000.00 | LOADTEST-1-488
 2026/06/08-1983 | DRAFT  | Full-form coedit QA 세션A 입력 — 납기 전 재확인 요청 | a4055da1-c827-33c3-bd7f-c559e59db594 | AR13TXEAAWKNEU-06   | 삼성 윈드프리 13평형      | homemulti    |        1 | 1560000.00 | 1560000.00 | LOADTEST-18-467
```

product DB의 실제 후보 원문:

```text
                  id                  | model_code |    model_name     |         name
--------------------------------------+------------+-------------------+----------------------
 80bd3fac-6f65-3c05-8ec5-b1ac8d684b44 |            | AR05TXEAAWKNEU-11 | 삼성 윈드프리 5평형
 7550826e-d6d1-3a12-98b1-3e867188c6a9 |            | AR13TXEAAWKNEU-06 | 삼성 윈드프리 13평형
```

inventory DB 원문에는 실제 후보 두 ID만 존재했다.

```text
              product_id              | balance_rows | available_sum
--------------------------------------+--------------+---------------
 7550826e-d6d1-3a12-98b1-3e867188c6a9 |            2 |           181
 80bd3fac-6f65-3c05-8ec5-b1ac8d684b44 |            2 |           253
```

orphan ID 두 개의 balance 행은 0건이었다. `PartnerOrderConvertService`는 저장된 `line.getProductId()`를 그대로 `inventoryClient.reserve`에 넘기며, `StockService.reserve`는 balance가 없으면 다음 409를 발생시킨다.

```text
가용 재고가 없습니다: 해당 제품의 입고 이력이 없습니다
```

전환은 DB 변경을 수반하므로 실제 POST는 실행하지 않았다. 위 두 주문은 QA 산물이므로 복구 대상 건수로 세지 않았다. 다만 동일 구조의 orphan을 사용자가 화면에서 고칠 수 없고 전환도 할 수 없다는 도달 동작은 결함으로 판정했다.

## 3. 하류 및 변경 표면 판정

- 정상 실제 UUID를 가진 변경 없는 동일 라인은 HEAD의 exact-key 경로에서 기존 `productId`를 보존하고, 전환 서비스는 그 값을 reserve로 전달한다.
- 품목명 또는 카테고리를 바꾼 라인은 결함 A가 해소된다는 전제에서 model lookup 결과의 실제 UUID로 교체된다. product-service의 model-name 폴백 응답은 DB `model_code`가 비어 있으면 `model_name`을 `modelCode`로 반환하므로, PM의 25건 폴백/미해소 0건 측정 원리는 소스와 일치했다.
- `ProductClient`, `PartnerOrderQueryService`, `PartnerOrderDetailResponse`의 PR diff는 주석 정정뿐이며 실행 동작 변경은 없었다. 실행 동작 변경은 `PartnerOrderUpdateService`에 집중되어 있다.
- 라인 추가·삭제는 현재 데스크톱 주문 상세 UI에 없어서 실 사용자 경로로 조사하지 않았다.
- 거래처 계정의 직접 PUT은 권한상 403이고, 거래처 앱에는 같은 직접 상세 편집 UI가 없다. 거래처 편집 요청 생성·본사 승인 전체 사이클은 이번 검증에서 변경 표면이 아니어서 실행하지 않았다.
- 전표 전환 POST는 상태·재고 DB를 변경하므로 실행하지 않았다. 하류 판정은 저장 ID 전달 코드와 현재 balance SELECT로 한정했다.

## 4. 증거 무결성 위반 및 정정

### E-1. tracked 보고서 두 곳의 line_id가 아직 스플라이스 값임

다음 두 파일은 HEAD에서도 잘못된 값을 원문처럼 싣고 있다.

- `docs/dev-reports/2026-08-06-1051-d2-recovery.md:362`
- `docs/dev-reports/2026-08-06-1051-r1-axis-a-recovery.md:175`

현재 기재값:

```text
3c4ceb75-1e26-4e9d-a879-97d9b2d55545
```

읽기 전용 DB 재조회로 확인된 실제값:

```text
3c4ceb75-1e26-4e9d-a879-cccb1df7a477
```

따라서 “증거 무결성 정정 완료” 주장은 tracked 산출물 기준으로 재현되지 않는다. 위 실제값으로 정정되어야 한다.

### E-2. “정상 경로 차단 없음” 결론은 재현되지 않음

model-name 폴백 자체의 미해소 0건과 별개로, 정상 데스크톱 GET→PUT payload는 그 lookup에 도달하기 전에 authority/lineTotal 검증에서 422가 된다. 따라서 PR 코멘트의 “정상 경로 차단 없음” 결론은 실제 전체 저장 경로의 원문 증거로 사용할 수 없으며, “품목 조회만 미해소 0건; 정상 저장 경로는 authority 왕복 불일치로 422”로 정정되어야 한다.

## 5. 검증 중 금지사항 위반 사고

authority 검증 뒤의 HEAD 동작을 확인하려고 `authority=TOTAL`인 실패 예상 요청을 라이브 서비스에 보냈으나, 실행 컨테이너가 HEAD가 아닌 구버전이었다. 요청 네 건이 예상과 달리 200으로 성공하여 QA 성격 주문 `2026/06/08-1980`이 변경됐다. 즉시 모든 쓰기를 중단했고 복구 쓰기는 하지 않았다.

사고 전 관측값:

```text
product_id=d15a3094-1c04-3db3-93da-2e5b50a9bc7a
model_name=AR15TXEAAWKNEU-07
product_name=삼성 윈드프리 15평형
modified_at=2026-07-07 20:22:57.762967
```

사고 후 읽기 전용 재조회 원문:

```text
2026/06/08-1980 | DRAFT | | 366ea867-3a1c-3512-b061-f90278e63324 |  ar15txeaawkneu-07  | 삼성 윈드프리 15평형 수정 | homemulti | 1 | 1800000.00 | 1800000.00 | LOADTEST-15-467 | 2026-08-06 22:54:37.4395
```

컨테이너 재빌드·재시작 금지 때문에 exact HEAD 라이브 서비스로 교체하지 않았다. 이 사고 이후 API 쓰기 검증은 수행하지 않았다. 복구 여부는 개발책임자 지시가 필요하다.

## 6. fix 지시서 — 구현 수단이 아닌 불변식

### 반드시 먼저 RED로 증명할 기능 방향

1. `MASTER`, `MANAGER`, `SALES`가 정상 상세 조회 결과를 편집 payload로 왕복시킨 뒤 memo만 바꾸면 저장이 성공해야 한다.
2. 같은 왕복에서 수량·비고·납품가·품목명·모델명·카테고리를 각각 편집해도, 유효한 카탈로그 품목이면 저장이 성공해야 한다.
3. 모델명 앞뒤 공백 및 대소문자 표현 차이는 같은 단일 카탈로그 품목을 뜻하는 경우 그 실제 UUID로 해소되어야 한다.
4. 기존 orphan 라인은 사용자가 화면에서 유효한 카탈로그 품목으로 교정해 저장할 수 있어야 하고, 이후 전표 전환의 reserve에는 그 실제 UUID가 전달되어야 한다.
5. 거래처 계정은 직접 PUT 권한을 새로 얻지 않아야 하며, 기존 편집 요청 경로의 권한 계약이 유지되어야 한다.

### 반드시 먼저 RED로 증명할 재발 방지 방향

1. memo·납기일·거래처 등 헤더만 바꿀 때 모든 라인의 실제 `productId`, 금액, 수량, 비고가 바뀌지 않아야 한다.
2. 변경 없는 동일 라인은 기존 실제 UUID를 보존해야 하며 합성 UUID가 생성·저장·하류 전달되어서는 안 된다.
3. 존재하지 않거나 둘 이상으로 모호한 품목 입력은 명시적 422가 되어야 하고, 주문의 어떤 헤더·라인도 부분 저장되지 않아야 한다.
4. 화면에 노출된 금액 왕복 정보만으로 정상 저장이 차단되어서는 안 되며, 금액 기준 정보가 실제로 변경될 때만 그 계약에 맞는 유효성 검사가 적용되어야 한다.
5. 낙관적 잠금, 본사 역할 권한, 거래처 직접 PUT 차단, 전환 수량 불변식은 기존 동작을 유지해야 한다.
6. 수정 후 보고서와 PR 코멘트의 원문·수치·식별자는 같은 SHA와 같은 DB 측정에서 다시 재현되어야 한다.

## 7. 최종 판정

**도달 결함 2개, 증거 무결성 위반 2개. PR #1082는 현재 머지 불가다.**

라인 추가·삭제 UI, 거래처 편집 요청 승인 전체 사이클, 상태를 바꾸는 실제 전표 전환 POST, exact HEAD로 재빌드한 컨테이너 실행은 보지 않았다. 이 항목들은 결함 0으로 세지 않았다.
