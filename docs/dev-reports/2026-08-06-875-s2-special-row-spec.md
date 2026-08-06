# #875 S2 — 구형 탭 특수행(`운임`·`절삭`) 계승 격차 명세

작성일: 2026-08-06  
범위: 읽기 전용 조사·명세. 코드 수정, 스프레드시트/GAS 쓰기, Docker 재빌드·재배포, commit/push 없음.

## 결론 먼저: 직전 PM 전제의 반증

직전 라운드의 “제품이 아닌 행은 품목으로 저장하지 않는다” 차단 규칙은 폐기해야 한다. `종합견적서` 레거시는 `운임`·`절삭`을 데이터에 포함하고, 금액 입력 시 수량을 `1`로 잠그며, 합계·전송·견적 미리보기까지 참여시킨다. 금액 미입력의 정상 기준선은 두 행 모두 `price=0`, `qty=0`이다.

따라서 S3의 불변식은 “특수행을 sync에서 제외”가 아니라 다음이어야 한다.

> DB의 기존 `운임`·`절삭` 상품을 일반 수량행과 다른 입력 방향으로 계승하되, 금액이 0인 행은 화면에 남기고 금액 계산·저장·출력 payload에는 기여시키지 않는다. 금액이 0이 아니면 수량 1의 실제 견적행으로 포함한다.

추가로 세 번째 경우가 있다. 사용자가 입력한 카탈로그 상품 `절삭`과 `applyCutoffLogic()`이 합계 절삭을 위해 자동 생성하는 가상 `절삭`행은 이름·모델이 같아질 수 있으므로, S3에서 같은 행으로 합치면 안 된다.

---

## 1. `종합견적서` 레거시 특수행 규칙 전수

조사 기준은 `tools/legacy-gas/종합견적서/index.html` 및 동 폴더 `Code.js`이다. 아래의 “참”은 구현 방식이 아니라 S3가 보장해야 할 관측 가능한 동작이다.

### 1.1 입력·값·수량

좌표: `index.html:2698~2740` (`handleFreightInput`)

핵심 원문:

```js
// 운임/절삭 입력 핸들러
function handleFreightInput(e, isCut, priceMap, qtyMap, model, recomputeFunc) {
  let raw = e.target.value.replace(/[^0-9]/g, '');
  let val = parseInt(raw || '0', 10);

  // 절삭 음수 처리
  if (isCut && val !== 0) val = -Math.abs(val);

  // 데이터 저장
  if (val === 0) {
    priceMap.set(model, 0);
    if(qtyMap.unlock) qtyMap.unlock(model);
    qtyMap.set(model, 0);
  } else {
    priceMap.set(model, val);
    if(qtyMap.set && qtyMap.unlock) qtyMap.set(model, 1, true);
    else qtyMap.set(model, 1);
  }
```

```js
  e.target.value = val !== 0 ? fmt(Math.abs(val)) : '';
  const hiddenQty = tr.querySelector('input.qty-input[type="hidden"]');
  if(hiddenQty) hiddenQty.value = (val !== 0) ? '1' : '0';
  const qtyStatic = tr.querySelector('.qty-static');
  if(qtyStatic) qtyStatic.textContent = (val !== 0) ? '1' : '0';
  if (subCell) subCell.textContent = fmt(val);
```

관측 가능한 불변식:

| 입력 | 저장 단가 | 수량 | 화면 단가 표시 | 소계 |
|---|---:|---:|---|---:|
| `운임` 금액 0/공백 | `0` | `0`, 잠금 해제 | 빈 칸 | `0` |
| `운임` 양수 금액 | 입력값 | `1`, 잠금 | 양수 | 입력값 |
| `절삭` 금액 0/공백 | `0` | `0`, 잠금 해제 | 빈 칸 | `0` |
| `절삭` 양수 금액 | `-abs(입력값)` | `1`, 잠금 | 절댓값 | 음수 입력값 |

입력 칸은 숫자 이외 문자를 제거하고, `절삭`의 음수는 저장·계산값에만 적용하며 화면에는 절댓값으로 표시한다. 특수행의 수량은 직접 입력하는 일반 수량 input이 아니며 `qty-static`/hidden quantity로 표시·전달된다.

### 1.2 로딩·동기화·데이터 존재

좌표: `tools/legacy-gas/종합견적서/Code.js:1719~1759` (`getOldProducts_`)

원문 요지:

```js
function getOldProducts_() {
  const sheet = ss.getSheetByName('구형');
  ...
  const range = sheet.getRange(2, 1, lastRow - 1, 9);
  ...
  if (!row[0]) continue;
  result.push({
    name: row[0], model: row[1], unit: row[2],
    price: row[3], sheetPrice: row[5],
    isDisc: hasRef, remarks: row[7], spec: row[8]
  });
}
```

A열 이름만 비어 있지 않으면 `운임`·`절삭`도 로드된다. 이름을 기준으로 한 차단은 없다. 즉 구형 시트의 특수행은 “동기화 대상이 아닌 장식행”이라는 근거가 없다.

현재 product sync도 구형 행에서 이름·model code가 모두 있으면 처리한다: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1187~1199`. 가격은 `:1223~1224`에서 읽고, 신규 행은 `:1227~1244`에서 sheet mapping의 category로 seed하며, 기존 model code는 `:1245~1247`에서 가격을 갱신한다. 빈 값/파싱 실패 가격은 `:1911~1917`의 `parseDecimal()`에 의해 `BigDecimal.ZERO`가 된다. 이 결과도 `운임`·`절삭`의 `selling_price=0` 기준선과 모순되지 않는다.

### 1.3 필터·표시·정렬

- `index.html:1654`: `절삭` 단위 선택 UI(`selCutUnit`)가 별도로 존재한다. 이는 카탈로그 `절삭` 상품과 구분해야 하는 합계 절삭 기능이다.
- `index.html:4776`: 세트 부품 숨김 predicate가 다음과 같다.

  ```js
  const isHideMat=p=>/유연호스\s*I형|운임|절삭/i.test(((p?.kind)||'')+' '+((p?.name)||''));
  ```

  이는 세트의 **구성 부품 표시/폭발 제외** 규칙이지, 상위 카탈로그 행을 삭제하거나 sync에서 제외하는 규칙이 아니다.
- `index.html:5034`, `:5097`: 홈·싱글 필터 선택지 생성에서는 `/운임|절삭/i`를 제외한다. 선택지에 노출하지 않는다는 뜻이지, 각 화면의 본문 행·합계에서 반드시 제거한다는 뜻은 아니다.
- 홈 렌더 `index.html:5309~5320`: 특수행의 분류를 `{L:'기타', M:'', S:''}`로 만들고, `:5319~5320`에서 `운임`·`절삭`을 목록 맨 뒤로 보낸다.
- 화면별 특수 판정은 홈 `:5377~5379`, 싱글 `:5873~5875`, 상업멀티 `:6387~6389`, 구형 `:7004~7007`에 있다.
- 홈·싱글·상업멀티는 특수행의 출고가/규격을 비워 둔다. 구형 렌더 `:7027~7031`은 `tdName`을 일반행과 같이 만들면서 `makeListPriceInput()`과 `makeSpecInput()`을 넣는 레거시 잔존 quirk가 있다. 그러나 구형의 납품가 칸은 `:7059~`에서 특수 전용 input을 다시 주입한다. S3 신규 화면은 이 quirk를 무심코 일반행 계약으로 확대하지 말고, 아래의 공통 특수행 계약을 기준으로 삼아야 한다.

### 1.4 렌더링 입력 방향

홈 `index.html:5453~5499`, 싱글 `:5940~5979`, 상업멀티 `:6458~6500`, 구형 `:7034~7070`에서 공통적으로 확인된다.

- 일반행: 수량 input이 편집 가능하고, 단가는 `makePriceInput`/자동 산식으로 제공된다.
- `운임`·`절삭`: 수량은 `qty-static`으로 읽기 전용 표시한다.
- 단가 칸에는 전용 `price-input`을 직접 주입한다. `makePriceInput`을 쓰지 않는다.
- 특수행 input 변경은 모두 `handleFreightInput()`으로 연결된다.
- `운임`은 양수 금액, `절삭`은 음수 금액으로 합계에 반영된다.
- 싱글 자동 단가 갱신 `:7443`, 기본/발통 파생 수량 `:7548`, `:7584`, `:7595`는 특수행을 건드리지 않는다. 특수행은 일반 세트/부품/파생 수량 계산의 입력이 아니다.

### 1.5 합계·계산 참여

좌표: `index.html:4248~4252`, 구형 합계 `:7130~7155`.

```js
const sumHome=()=>Array.from(homeQty.entries())
  .reduce((s,[m,q])=>s+(homeUnitPrice(m)||0)*(q||0),0);
const sumSingles=()=>SINGLE_SETS.reduce(
  (s,x)=>s+(calcSetUnitPrice(x)*(singleQty.get(x.id)||0)),0);
const sumComm = () => Array.from(commQty.entries())
  .reduce((s, [m, q]) => s + (commUnitPrice(m) || 0) * (q || 0), 0);
```

특수행도 동일한 `price × quantity` 합계 경로에 있다. 따라서 `qty=0`이면 합계 기여가 0이고, 금액 입력으로 `qty=1`이 되면 운임/절삭 금액이 합계에 들어간다. 홈·상업멀티의 실내기/실외기 비율 계산은 해당 이름을 인원/능력 산식으로 세지 않으므로, 금액 합계에는 참여하지만 제품 능력·대수 비율에는 참여하지 않는다.

### 1.6 전송·저장·견적서/인쇄

- `buildSendRows()` `index.html:9075~9320`은 홈 `:9218~9222`, 싱글 `:9237~9249`, 구형 `:9297~9301`에서 `q=0`만 제외한다.
- 싱글 특수행은 `:9244~9249`에서 `section:'SINGLE'`, `isSetHead:false`, `unit:'식'`, `qty:q`, `price:getRealSinglePrice(...)`, `fixedDc:0`인 명시적 품목행으로 전송한다. 세트 헤드/구성품으로 폭발하지 않는다.
- 홈·상업멀티의 특수행도 q가 1이면 일반 품목 payload 경로에 들어간다. q가 0이면 payload에서 빠진다.
- `getStructuredQuoteData()` `:10755~10803`은 싱글 특수행을 `type:'item'`으로 만들고, `q=0`은 처음부터 제외한다. 구형도 q가 0이면 제외한다.
- 미리보기는 특수행의 이름·모델·단가·수량·소계를 일반 견적행과 같이 렌더링한다. `getQuoteItemBgColor()` `:11060~11067`은 운임 배경색을 `#BFBFBF`로 지정한다.
- 따라서 “0원 행이 화면에서 사라진다”가 아니라 “0원 행은 편집 화면에 보이지만 금액·저장·출력 payload에는 0으로 기여한다”가 레거시 규칙이다.

### 1.7 자동 합계 절삭과 카탈로그 `절삭`의 분리

좌표: `index.html:16204~16232`, 구조화 미리보기의 동등 로직 `:11059~11095`.

```js
function applyCutoffLogic(rows) {
  ...
  const rem = total % unit;
  if (rem === 0) return;
  let target = rows.find(r => r.qty === 1 && r.type !== 'set-head');
  if (target) {
    target.price -= rem;
    ...
  } else {
    rows.push({
      section:'기타', name:'절삭', model:'절삭', unit:'식',
      qty:1, price:-rem, sub:-rem
    });
  }
}
```

이 자동 생성행은 카탈로그에서 선택한 `절삭`의 product id와 다른 정산 artifact다. S3는 두 종류를 식별·저장·출력할 때 섞지 않아야 한다.

---

## 2. `거래처 발송 주문서` 계열과의 차이

이번 기준 화면은 `종합견적서`다. 아래 차이는 S3가 화면을 잘못 선택했을 때의 경계 조건으로만 기록한다.

`tools/legacy-gas/거래처 발송 주문서/Code.js`는 데이터 로더 단계부터 다음과 같이 제외한다.

```js
// Code.js:681
if (/운임|절삭/i.test(name)) continue;

// Code.js:802
if (/운임|절삭/i.test(name)) continue;

// Code.js:899
if (/운임|절삭/i.test(kind + ' ' + name)) continue;

// Code.js:1074, :1160
if (/운임|절삭/i.test(name)) continue;
if (/운임|절삭/i.test(model)) continue;
```

화면·구형 downstream도 제외한다.

- `index.html:3347`, `:3408`, `:3617`, `:3795`, `:4145`: 홈·싱글·상업멀티 source/render에서 제외.
- `index.html:4491~4493`: 구형 본문에서 제외.
- `index.html:4563~4567`: 구형 합계에서 제외.
- `index.html:5636~5637`: 구형 미리보기에서 제외.
- `index.html:6245~6250`: 구형 주문 rows에서 제외.
- `index.html:4744`, `:4771`, `:4786`, `:4797`: 싱글 자동 가격·파생 수량에서 제외.

다만 주문서 `Code.js:1911~`의 `getOldProducts_()` 자체는 구형 시트 행을 읽는다. 즉 “동기화/저장 대상에서 삭제”가 아니라 “거래처 발송 주문서의 표시·합계·전송 문맥에서 제외”다. 이 문서의 제외 규칙을 `종합견적서`의 특수행 계승 규칙으로 가져오면 안 된다.

---

## 3. 현재 데스크톱의 격차 — 무엇이 참이어야 하는가

대상: `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`.

현재 확인된 좌표:

| 좌표 | 현재 상태 | S3에서 참이어야 할 상태 |
|---|---|---|
| `:76~119` | `DraftLine`에 `quantity`, `unitPrice`, `productId`, `productType(SINGLE/BUNDLE)`만 있고 특수행 의미가 없다. | 특수행 여부와 카탈로그 product identity를 잃지 않고 왕복할 수 있어야 한다. `productType`만으로 특수행을 판정해서는 안 된다. |
| `:121~146`, 특히 `:128~129` | 모든 신규 라인의 기본값이 `quantity:'1'`, `unitPrice:'0'`. | 일반행 기본값과 별개로 특수행의 정상 기준선은 `quantity=0`, `unitPrice=0`이어야 한다. |
| `:489~505` | 수량 input이 모든 행에 편집 가능. | 특수행 수량은 읽기 전용 `0/1` 표시이며 단가 입력으로만 바뀌어야 한다. |
| `:508~536` | 모든 행에 일반 단가 input 경로가 있다. | 특수행 단가는 전용 금액 입력이어야 하며 일반 자동 단가/DC 계약과 분리되어야 한다. |
| `:891~903`, 특히 `:895` | `productId && quantity>0`만 totals 계산. | q0은 화면에 남고 합계 기여 0, q1 특수행은 합계·VAT·라인 합계에 참여해야 한다. 기존 `productId` 게이트도 함께 충족되어야 하므로 특수행 product lookup이 가능해야 한다. |
| `:1429~1457` | 저장 payload도 `productId && quantity>0`만 포함. | q0은 저장/전송에서 빠지고, q1 운임/절삭은 product id를 가진 실제 라인으로 포함되어야 한다. 자유 텍스트 우회나 특수행 차단은 레거시 계약이 아니다. |
| `:1863~1935` | 데스크톱 행도 수량·단가가 일반 input으로 렌더링. | 일반행과 특수행의 입력 방향, 잠금, 부호, 소계 표시가 분기되어야 한다. |
| 파일 전체 관련 검색 | `운임|절삭|freight|isSpecial|qtyStatic` 특수행 구현 0건. | 홈/싱글/상업멀티/구형 중 S3가 담당하는 견적 흐름에서 같은 특수행 불변식이 유지되어야 한다. |

추가 격차:

1. `운임`·`절삭`은 DB에 실제 product row로 존재하므로, 현재 API의 `productId` 필터를 통과할 수 있는 canonical lookup이 필요하다. 이를 “제품이 아님”으로 차단하면 레거시와 반대가 된다.
2. `product_type=SINGLE`인 두 DB row를 일반 SINGLE로만 취급하면 수량 편집·자동 단가·할인·파생 계산이 잘못 적용된다. 두 행은 별도의 특수행 의미가 필요하다.
3. 금액 입력이 양수이면 quantity를 1로 잠그고, 금액을 0으로 되돌리면 quantity를 0으로 풀어야 한다. `절삭`의 저장/계산 부호는 음수여야 하지만 사용자 입력/표시는 절댓값이어야 한다.
4. q0 특수행은 편집 화면에서 보이는 상태와 저장/출력 payload에서 빠지는 상태를 동시에 가져야 한다. q1 특수행은 합계·VAT·저장·견적서/인쇄에 모두 나타나야 한다.
5. 특수행은 일반 세트 폭발, fixed/variable discount, 자동 단가 재계산, 실내기·실외기 대수/능력 ratio, 파생 수량의 입력이 아니어야 한다.
6. `절삭` 상품 row와 자동 `applyCutoffLogic()` row는 별도 identity여야 한다.

### `:895` 판정

**부분 일치이며 전체 일치는 아니다.** 레거시 `sumHome/sumSingles/sumComm/sumOld`도 `price × q`이고 q0의 금액 기여가 0이므로, 이미 `productId`가 연결된 특수행에 한정하면 `quantity>0` 조건은 금액 합계 관점에서 레거시와 같은 결과를 낸다.

하지만 다음 차이가 있다.

- 현재 `:895`는 `productId`가 없으면 q1도 탈락시킨다. 레거시 `buildSendRows()`는 특수행에 대해 q만 검사하며 product UUID 게이트가 없다.
- 현재 화면에는 특수행의 q0 표시, 금액 입력→q1 잠금, 절삭 부호가 구현되어 있지 않다.
- 현재 저장 `:1429~`도 같은 productId 게이트를 가지므로, lookup이 실패하면 레거시의 q1 특수행이 저장되지 않는다.

따라서 `:895`만 바꾸는 것으로는 계승 완료가 아니다. 레거시와 같은 부분은 “q0의 금액 기여 0”이고, 부족한 부분은 identity·UI 상태·저장/출력·부호·자동계산 제외 계약이다.

---

## 4. DB 참조 조사 — `운임`·`절삭` 2건

읽기 전용 `psql -c`로 조회했다. 두 product row는 모두 active이며 `selling_price=0.00`이다.

| DB / 관계 | 운임 | 절삭 | 의미 |
|---|---:|---:|---|
| `product_db.price_history.product_id` | 2 | 2 | 가격 이력 metadata |
| `product_db.product_aliases.main_product_id` | 2 | 2 | alias metadata |
| `product_db.product_estimate_exposure.product_id` | 4 | 4 | 견적 노출 metadata |
| `product_db.ecount_alias_reservations.product_id` | 0 | 0 | 직접 참조 없음 |
| `product_db.product_spec.product_id` | 0 | 0 | 직접 참조 없음 |
| `product_db.bundle_component.bundle_product_id` | 0 | 0 | 세트 구성품 아님 |
| `product_db.quantity_sync_source.source_product_id` | 0 | 0 | 수량 sync source 아님 |
| `product_db.quantity_sync_target.target_product_id` | 0 | 0 | 수량 sync target 아님 |
| `slip_db.estimate_lines.product_id` | 0 | 0 | 견적 라인 사용 없음 |
| `slip_db.partner_product_price_memory.product_id` | 0 | 0 | 거래처 가격 기억 없음 |
| `slip_db.slip_lines.product_id` | 0 | 0 | 전표 라인 사용 없음 |

따라서 “참조 0건”이라고 뭉뚱그리면 틀린다. 업무 문서 라인 사용은 0건이지만, product_db에는 각 상품별 8건의 metadata 참조가 있다. 삭제·수정은 하지 않았다.

### 실행한 SQL 원문

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -c "WITH targets(name, id) AS (VALUES ('운임'::text, 'f182dfcc-7b66-4ed7-a1cd-76e7b9b477f8'::uuid), ('절삭'::text, '0f675d59-1c30-4d7d-b594-32d10a1558e8'::uuid)) SELECT t.name, 'ecount_alias_reservations.product_id' AS relation, count(e.*) AS references FROM targets t LEFT JOIN ecount_alias_reservations e ON e.product_id=t.id GROUP BY t.name UNION ALL SELECT t.name, 'price_history.product_id', count(p.*) FROM targets t LEFT JOIN price_history p ON p.product_id=t.id GROUP BY t.name UNION ALL SELECT t.name, 'product_aliases.main_product_id', count(p.*) FROM targets t LEFT JOIN product_aliases p ON p.main_product_id=t.id GROUP BY t.name UNION ALL SELECT t.name, 'product_estimate_exposure.product_id', count(p.*) FROM targets t LEFT JOIN product_estimate_exposure p ON p.product_id=t.id GROUP BY t.name UNION ALL SELECT t.name, 'product_spec.product_id', count(p.*) FROM targets t LEFT JOIN product_spec p ON p.product_id=t.id GROUP BY t.name UNION ALL SELECT t.name, 'bundle_component.bundle_product_id', count(b.*) FROM targets t LEFT JOIN bundle_component b ON b.bundle_product_id=t.id GROUP BY t.name UNION ALL SELECT t.name, 'quantity_sync_source.source_product_id', count(q.*) FROM targets t LEFT JOIN quantity_sync_source q ON q.source_product_id=t.id GROUP BY t.name UNION ALL SELECT t.name, 'quantity_sync_target.target_product_id', count(q.*) FROM targets t LEFT JOIN quantity_sync_target q ON q.target_product_id=t.id GROUP BY t.name ORDER BY name, relation;"
```

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -c "WITH targets(name, id) AS (VALUES ('운임'::text, 'f182dfcc-7b66-4ed7-a1cd-76e7b9b477f8'::uuid), ('절삭'::text, '0f675d59-1c30-4d7d-b594-32d10a1558e8'::uuid)) SELECT t.name, 'estimate_lines.product_id' AS relation, count(e.*) AS references FROM targets t LEFT JOIN estimate_lines e ON e.product_id=t.id GROUP BY t.name UNION ALL SELECT t.name, 'partner_product_price_memory.product_id', count(p.*) FROM targets t LEFT JOIN partner_product_price_memory p ON p.product_id=t.id GROUP BY t.name UNION ALL SELECT t.name, 'slip_lines.product_id', count(s.*) FROM targets t LEFT JOIN slip_lines s ON s.product_id=t.id GROUP BY t.name ORDER BY name, relation;"
```

---

## 5. `AM120MXVRHC1` 분류 판정 — 조사만

### DB 사실

DB row는 다음과 같다.

- 이름: `DVM ECO 리뉴얼 12HP 상부토출형`
- model/model code: `AM120MXVRHC1`
- `product_type=SINGLE`
- `product_category=COMMERCIAL_MULTI`
- `product_business_type=상품`
- `category_name=벽걸이형`
- `release_price=7,810,000`, `delivery_price=3,905,000`, `selling_price=7,810,000`
- active row이며 동일 active model code 중복 없음.

### 시트 사실

실 구형 탭에서 `AM120MXVRHC1`은 이름·model code가 있는 실제 품목행이며 D열 금액은 `7,810,000`이다. S1 대조 집합은 실 구형 탭 실제 품목 38건과 active `product_category=OLD` 37건을 비교했고, 공통 37건·시트-only 1건이었다. 그 유일한 시트-only가 `AM120MXVRHC1`이다.

### 같은 계열 전수 결과

“시트 구형 실제 품목 model code ↔ active DB OLD model code” 대조에서 분류가 다른/OLD 집합에 빠진 건은 **1건, `AM120MXVRHC1`뿐**이다. DB 전체 active model code도 3,061건/3,061 distinct이고 공란 0이므로, 동일 model code의 다른 active category row가 숨어 있는 경우는 확인되지 않았다.

### 판정

어느 쪽이 맞다고 단정하지 않는다.

- 시트 측 근거: 구형 탭에 실제 품목으로 존재하고 구형 대조 집합에서 유일한 sheet-only이다.
- DB 측 근거: 같은 model code의 유일한 active row가 `COMMERCIAL_MULTI`로 분류되어 있고 가격·상품명도 실재한다.

따라서 S3에서는 AM120의 category 변경이나 강제 OLD 재분류를 하지 않는다. “구형 시트 배치”와 “DB 상업멀티 분류”가 충돌하는 분류 결정으로 보류하며, 특수행 계승과 묶어 임의 수정하지 않는다.

---

## 6. S3 구현자가 밟아야 할 조합 목록

### A. sync·catalog 조합

1. `구형`의 `운임` 행이 D/F 공백 또는 0인 상태로 sync되어도 행을 차단하지 않고 active product identity와 0 가격 기준선을 유지한다.
2. `구형`의 `절삭` 행도 동일하게 sync 대상이며 `selling_price=0`을 정상 기준선으로 본다.
3. 두 행이 이미 DB에 있으므로 model code/product lookup이 성공하고, desktop line에 product id가 존재해야 한다.
4. sync는 `AM120MXVRHC1`을 기존 `COMMERCIAL_MULTI` row에서 `OLD`로 임의 변경하지 않는다.

### B. 견적 편집 조합

5. 특수행 초기 상태: 보임, 금액 0/빈 칸, 수량 0/static.
6. `운임`에 양수를 입력: 양수 단가, 수량 1 lock, 소계·합계·VAT·저장·견적서/인쇄 포함.
7. `절삭`에 양수를 입력: 화면 입력은 절댓값, 저장/계산 단가는 음수, 수량 1 lock, 소계·합계·VAT·저장·견적서/인쇄에 음수로 포함.
8. q1 특수행의 금액을 0/공백으로 되돌림: 단가 0, 수량 0/static, 합계 0, 저장/출력 payload 제외, 행 자체는 화면에 유지.
9. 사용자가 특수행 수량을 일반 input처럼 직접 바꾸거나 일반 자동 단가/DC가 덮어쓰지 않는다.
10. 특수행이 세트 폭발·구성품·파생 수량·ratio 산식의 입력으로 재사용되지 않는다.

### C. 문서·artifact 조합

11. q1 특수행은 종합견적서의 send/structured quote/preview/print 경로에 들어간다.
12. q0 특수행은 위 payload에서 빠지지만 편집 화면에는 남는다.
13. 카탈로그 `절삭` product row와 `applyCutoffLogic()` 자동 생성 `절삭` artifact의 identity·저장·출력을 분리한다.
14. S3가 거래처 발송 주문서까지 건드리는 경우에만 별도 조합으로 “표시/합계/전송 제외”를 유지한다. 이 제외를 종합견적서에 적용하지 않는다.
15. `운임`·`절삭` product_db metadata 참조는 보존하며 삭제하지 않는다.

---

## 신규 파일

- `docs/dev-reports/2026-08-06-875-s2-special-row-spec.md`

이번 라운드에는 위 신규 보고서 외 코드·설정·DB·GAS·스프레드시트를 변경하지 않았다.
