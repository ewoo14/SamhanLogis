# PR #1265 CODEX SOL 재판정 2회차

검증일: 2026-08-18 KST  
최종 판정: **머지 불가 — 실사용자 도달 결함 2건.**

## ① 검증 SHA·main 병합

- 지시된 PR head: `fe915a0368062874bfd224c4f475341cfe18470d`
- 시작 전 수행: `git merge origin/main --no-edit`
- 병합 결과: 충돌 0건, merge commit `0c8210bcfeb26e16e8139cfeb1bfc560f3f0dba4`
- merge 부모: PR head `fe915a036` + main `ba1271b97af7fbd9d7590db2baba616193bbcc4a`
- main 쪽 병합분은 메모리 문서 1개이며 이번 제품 판정 코드를 바꾸지 않는다.
- `git add`·commit·push 및 제품 코드 수정은 하지 않았다. 검증용 Playwright 스펙과 지정된 보고서·증거만 생성했다.

## ② 동일 전표 금액 3지점 실측과 레거시 원문

격리 PostgreSQL과 브랜치 `slip-service` JAR(28086), 실제 견적 웹, 실제 데스크톱 화면을 사용했다. 대상은 전표 `2026/08/18-30`, 모델 `AC060CN6PBH1`, 수량 3, VAT 포함 단가 616,975원이다.

| 지점 | 공급가 | VAT | 합계 | 소수부 행 |
|---|---:|---:|---:|---:|
| 견적 웹 최초 생성 후 전표 상세 | 1,682,659 | 168,266 | 1,850,925 | 0/4 |
| 일마감 선발행 화면에서 같은 단가 재입력(가격수정) | **1,682,658** | **168,267** | 1,850,925 | 0/4 |
| `내역저장` 후 일마감 재조회 | **1,682,658** | **168,267** | 1,850,925 | 0/4 |

같은 전표·수량·단가에서 공급가와 VAT가 각각 1원 바뀐다. 합계만 같고 구성 금액이 다르므로 결함이다.

레거시 원문은 두 곳이 동일하다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:2122-2127`:

```js
const priceVat = Math.round(Number(it.price)||0);
const total = priceVat * qty;
const sup = Math.round(Math.abs(total)/1.1);
const vat = Math.abs(total) - sup;
const supply = total<0 ? -sup : sup;
const vatAmt = total<0 ? -vat : vat;
```

`tools/legacy-gas/종합견적서/Code.js:1849-1855`:

```js
const total = priceVat * qty;
const sup = Math.round(Math.abs(total) / 1.1);
const vat = Math.abs(total) - sup;
const supply = total < 0 ? -sup : sup;
const vatAmt = total < 0 ? -vat : vat;
```

즉 정본은 `Math.round(total / 1.1)` 후 차액을 VAT로 두는 **총액축**이다. 실측값도 `Math.round(1,850,925 / 1.1) = 1,682,659`, VAT 168,266이다. 현재 fix의 단가축은 `Math.round(616,975 / 1.1) × 3 = 1,682,658`을 만들어 레거시와 1원 어긋난다.

## ③ shared/common 전수 사용처와 계약 충돌 판정

빌드 산출물·문서를 제외하고 저장소 전체를 전수 검색한 결과, `VatInclusiveUnitAmountCalculator`의 생산 사용처는 정확히 2곳이며 둘 다 `slip-service`다.

1. `SlipLine.java:546-547` — 전표 가격수정 `changeUnitPriceWithVat`
2. `DailyClosingAmountUpdateService.java:88-89` — 일마감 금액 저장

다른 서비스의 직접 사용처는 0곳이다. 다만 두 경로가 저장한 공급가/VAT를 전표 상세·일마감·후속 회계/세금 소비자가 읽으므로 저장값 파급은 slip-service 밖까지 이어진다.

계약 테스트 충돌 원문을 같은 head에서 직접 재현했다.

```text
VatInclusiveUnitAmountCalculatorTest
expected: 1819
 but was: 1820
```

입력은 `1000.49 × 2`이고 기존 common 계약은 `1819/182/2001`이다. 현재 계산기는 단가별 공급가를 먼저 반올림해 1820을 만들며, VAT에는 소수부가 남고 공급가+VAT와 반올림 합계도 일치하지 않는다. 반대로 fix가 추가한 slip 계약은 `105×2 → 190/20/210`을 요구한다. 레거시 총액축은 `105×2 → 191/19/210`이므로 **기존 common 계약이 옳고 새 slip 단가축 계약이 틀렸다.**

로컬 집중 실행 결과:

- `:shared:common:test --tests '*VatInclusiveUnitAmountCalculatorTest'`: 1건 실패
- `:services:slip-service:test --tests '*SlipLineAmountContractTest'`: 9/9 통과 — 잘못된 단가축을 고정한 테스트
- `:services:partner-order-service:test --tests '*BootstrapServiceTest'`: 통과

따라서 shared/common 변경은 기존 정본 계약을 깨뜨렸고, 위 ②의 실제 화면 1원 회귀로 도달했다. 별도 결함으로 중복 계상하지 않고 **도달 결함 1**에 합산한다.

## ④ 원천 추적률 — 기존과 신규 구분

공유 `slip_db`는 SELECT만 했다. 기존 원천 전표 모집단은 견적 7건 + 주문 20건 = 27건이다.

| 구분 | 원천 표시 가능 | 전체 | 비고 |
|---|---:|---:|---|
| 기존 견적 | 7 | 7 | `source_id`를 그대로 표시 |
| 기존 주문 | 3 | 20 | 병합 전표 3건에 `slip_source_orders` 6행 존재 |
| 기존 전체 | **10** | **27** | 검증 전 0/27에서 10/27로 증가, 17건 미해소 |
| 현재 active | 6 | 6 | active 견적 6건; 기존 주문 20건은 모두 soft-delete 상태 |

신규 견적은 이번 라이브 전표에서 `WEB-20260818-1787009826217`이 실제 매출 수정 화면의 `원천 견적`으로 표시됐다.

신규 단건 주문은 여전히 비어지는 경로다. `PartnerOrderConvertService`는 payload에 `orderNo`를 넣지만 `PublishFromPartnerOrderRequest`에는 그 필드가 없고, 단건 발행은 `slip_source_orders`를 기록하지 않는다. 상세 응답은 주문 원천이면 오직 `slip_source_orders.order_no`만 읽는다. 병합 주문만 이 테이블을 기록하므로 사용자가 신규 단건 주문을 전표로 전환하면 화면의 원천 주문이 비어 있다. 이는 **도달 결함 2**다.

## ⑤ 주문서웹 품목 행과 끊겼던 지점

실제 주문서웹에서 거래처 인증 후 홈멀티에 진입했다. 환영 애니메이션과 튜토리얼 가림막이 끝난 뒤 실제 품목행을 셌다.

- 인증: 성공
- 화면: 홈멀티
- 실제 DOM 품목행: **105행**
- 첫 표시행: `실외기_6HP 단배관 / AJ060MXHNBC1 / 2,929,300`
- branch bootstrap 배열: `homemulti=107`, `singleSets=224`, `singleParts=1447`, `commercialMulti=382`, `commercialParts=137`, `oldProducts=39`

따라서 1차의 주문서웹 0행 결함은 현재 head에서 해소됐다. 끊겼던 곳은 인증 방식이 아니라 partner-order-service가 product-service를 찾지 못해 빈 fallback bootstrap을 캐시하던 discovery 경로였다. 브랜치 JAR에 `product-service -> 127.0.0.1:8084` simple discovery를 연결하자 backend 배열과 UI 행이 모두 나타났다.

PR #1272의 503은 같은 **서비스 discovery 계열**이지만 동일 원인은 아니다. #1272는 공유 Gateway에 `PARTNER-ORDER-SERVICE` 인스턴스 자체가 없어 Gateway→partner-order 단계에서 503이었고, 이번 1265의 최초 0행은 branch partner-order→product-service 단계의 누락이었다.

## ⑥ 잃으면 안 되는 것 재현

격리 DB에서 실제 견적 웹으로 연속 생성된 전표 `2026/08/18-21`~`-27`의 7건을 전수 집계했다.

| 항목 | 결과 |
|---|---:|
| 전표 라인 | 28/28 |
| 공급가·VAT·합계 소수부 잔존 | **0/28** |
| `category_key` 보존 | 28/28 |
| `bundle_set_options` 보존 | 28/28 |
| 전표별 실제 품목·카테고리·옵션 | 4/4 |

최초 생성 금액·품목·카테고리·옵션 보존은 통과했다. 회귀는 생성 순간이 아니라 같은 단가를 가격수정/일마감 계산기에 다시 태울 때 발생한다.

## ⑦ 스크린샷과 행 수

모든 PNG는 `resolveQaShotsDir()` 경유 `_local`에 저장했고 원본 해상도로 직접 열었다.

| 파일 | 직접 확인한 화면 | 행 수 |
|---|---|---:|
| [01-initial-slip-source-and-4rows.png](screenshots/_local/01-initial-slip-source-and-4rows.png) | 신규 전표 매출 수정, 원천 견적 문자열과 금액 | 실제 품목 4행 + 입력용 빈 draft 1행 |
| [02-price-edit-same-unit-1won-flip.png](screenshots/_local/02-price-edit-same-unit-1won-flip.png) | 일마감 선발행, 동일 단가 재입력·미저장 1건 | 품목 4행 |
| [03-daily-closing-requery-1won-flip.png](screenshots/_local/03-daily-closing-requery-1won-flip.png) | 저장 후 같은 전표 일마감 재조회 | 품목 4행 |
| [04-order-web-home-catalog-rows.png](screenshots/_local/04-order-web-home-catalog-rows.png) | 인증된 주문서웹 홈멀티 실제 첫 품목행 | DOM 전체 105행 |

숫자 원문은 [amount-evidence.json](screenshots/_local/amount-evidence.json), 주문서 행 원문은 [order-evidence.json](screenshots/_local/order-evidence.json)에 있다. 최초 주문서 캡처에서 환영 애니메이션이 화면을 덮은 것을 직접 발견해 증거로 쓰지 않고, 애니메이션·튜토리얼 종료 후 실제 행을 다시 캡처해 덮어썼다.

## ⑧ 판정 불가 축

- 기존 20개 주문 전표는 모두 soft-delete 상태여서 17개 미해소 행 각각을 현재 사용자 목록에서 열어 캡처하는 것은 판정 불가다. 저장 데이터와 현재 변환/표시 코드의 전수 대조로 10/27을 산출했다.
- 신규 **단건 주문**의 주문서웹 생성→승인→전표 변환 전 과정을 이번 격리 라이브에서 끝까지 생성하지는 못했다. 다만 단건 wire의 `orderNo` 폐기와 표시 조회원 부재는 확정적이며, 신규 단건 전환 시 사용자 화면이 비는 경로다.
- 소수 단가의 실제 화면 입력은 UI가 원 단위로 정규화하므로 화면 도달 여부는 판정 불가다. 공통 계산기의 `1000.49×2` 소수/invariant 파괴는 계약 실패로만 기록하고 도달 결함을 추가하지 않았다.

## ⑨ CI 확인과 귀속

PR head `fe915a036`의 check를 직접 조회했다. slip 계열 `slip-units`, `slip-it-public`, `slip-it-core`, `accounting+partner`는 모두 통과했고, 안내된 `SlipSalesUpdateIT R9 expected 2 / was 1` 실패는 이 head에서 발생하지 않았다. `Set up job` 실패도 없었다.

실패 귀속:

1. `빌드 + 테스트 (shared+auth+gateway)`: **PR 귀속.** main의 같은 job은 성공했고 PR에서는 `VatInclusiveUnitAmountCalculatorTest expected 1819 / was 1820` 1건으로 실패했다. 도달 결함 1과 동일 원인이다.
2. `Frontend Desktop` 및 `Harness Guard`: **PR 귀속 CI 실패.** PR에 추적된 `.pid` 파일이 들어와 extension census가 `expected [] / received ['.pid']`로 실패했다. 제품 화면 결함 수에는 넣지 않는다.
3. `Frontend Mobile-Staff`: `SalesTabNavigator` 5초 timeout. PR diff에 mobile-staff 변경이 없고 main job은 성공했으므로 이번 제품 변경 귀속 근거가 없다. CI 재실행 전에는 green으로 보지 않는다.
4. GitGuardian: 1초 failure이나 외부 상세 근거를 확보하지 못해 false positive 여부는 판정 불가다. 성공으로 간주하지 않는다.

즉 GitHub `Set up job` 장애로 면책할 실패가 아니라, 최소 shared 계약 실패와 `.pid` 가드 실패는 명백한 PR 귀속이다. 현재 CI는 green이 아니다.

## ⑩ 최종 판정 — 머지 불가, 도달 결함 2건

**실 사용자가 화면을 통해 재현할 수 있는 결함이 있다. 머지 불가다.**

1. 동일 전표·수량·단가가 최초 생성과 가격수정/일마감에서 공급가·VAT 각각 1원씩 달라진다. shared/common을 잘못된 단가축으로 통일하면서 레거시 총액축과 기존 common 계약을 깨뜨렸다.
2. 기존 원천 추적은 10/27만 복구됐고, 신규 단건 주문도 `orderNo`가 slip-service 계약에서 폐기되어 전표 화면의 원천 주문이 비어 있다.

주문서웹 품목 0행은 105행으로 복구됐고, 견적 웹 최초 생성 28/28 금액·소수부 0/28·카테고리/옵션 28/28은 유지됐다. 그러나 위 2건과 PR 귀속 CI red가 있으므로 머지할 수 없다.

## ⑪ 프로세스·컨테이너 회수

보고서 게시 직전까지 사용한 전용 프로세스와 컨테이너를 모두 회수했다.

- 전용 포트: 2583, 25173, 25180, 28086, 28088
- 격리 DB `sol1265r2-pg`: 제거, 잔여 0
- 전용 listener: **0개**
- 공유 `samhan-*` 컨테이너: 24개 유지, stop/restart/write 0
- 공유 DB: SELECT만 수행, write 0
- 다른 워크트리·타 작업 격리 컨테이너: 변경 0
