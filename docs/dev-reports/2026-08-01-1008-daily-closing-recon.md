# 일마감 금액 산출 규칙 레거시 대조 조사

## 확인 1 — G-A 및 PR #991

**판정: G-A는 그대로이며 PR #991로 고쳐지지 않았다.**

- 현행 `DiscountRevalidator.java:114-121`은 멀티를 판정할 때 `fixedDc == null ? 45 : roundPercent(fixedDc)`로 기대율을 정한다. 즉 고정DC가 없으면 여전히 **45% 상수**다.
- 현행 `MonthEndCloseService.java:427-456`은 적용 가격과 품목별 고정DC를 조회해 `revalidate(...)`에 넘기지만, 거래처 코드나 거래처별 전역DC는 넘기지 않는다. 특히 `MonthEndCloseService.java:447` 주석도 `fixedDc key 누락은 미설정(멀티 45 폴백)`이라고 명시한다.
- PR #991에서 반영된 설정 조회는 `MonthEndCloseService.java:415-417,441-443`의 `priceChangeDefaultVariants()`와 `priceHistoryDate(...)` 경로로, 날짜 상수 대신 어느 가격 이력 기준일을 쓸지 정하는 변경이다. 거래처별 `dc_configs` 조회나 기대율 입력은 아니다.
- 레거시 쪽은 `Code.js:564-566`에서 전표 거래처코드로 `discInfo`를 정하고, `Code.js:721-729`에서 **고정DC → 거래처 상업/홈 전역DC → 45%** 순으로 기대율을 고른다. 예컨대 전역DC 48%, 실제율 48%, 고정DC 없음이면 레거시는 기대율 **48% / 일치**, 현행은 기대율 **45% / 불일치**다(3%p 차이).

## 확인 2 — G-B

**판정: 종전의 `OUT_OF_SCOPE` 즉시 반환은 제거됐지만, 레거시 1way 전역DC 50,000원 규칙은 여전히 없다. 따라서 G-B의 현상은 바뀌었고 핵심 금액 규칙 갭은 남았다.**

- `DiscountRevalidator.java:37-38`에는 `AC|AP|AR|AF|PC|AWR|ARR` 접두 패턴이, `DiscountRevalidator.java:52-53`에는 `OUT_OF_SCOPE` enum 값이 남아 있다.
- 그러나 전체 현행 본문에서 `Status.OUT_OF_SCOPE` 반환은 **0건**이다. 이 grep 0건만으로 기능 부재를 단정한 것이 아니라, 해당 접두의 실제 분기인 `DiscountRevalidator.java:123-131`을 확인했다. 현재는 `actualDiscountAmount = 출고가 - VAT포함 유효단가`, `expectedDiscountAmount = 출고가 - 납품가`를 구해 정수원 반올림 후 같은지를 `VERIFIED`로 반환한다(`DiscountRevalidator.java:182-187,217-220`). 테스트도 7개 접두가 `VERIFIED`에 진입함을 고정한다(`DiscountRevalidatorTest.java:240-253`).
- 레거시는 품목 하나가 아니라 전표 안의 실내기·실외기·옵션을 세트 카탈로그로 매칭해 기대 구성품 합계를 만든 뒤(`Code.js:585-617`), 세트 유형별 거래처 전역DC를 고르고(`Code.js:619-648`), `기대 구성품 합계 - 전역DC`와 실제 구성품 단가 합계를 비교한다(`Code.js:650-657`). 1way는 `Code.js:638-639`의 `discInfo.dc1way`가 적용되며, 배경의 실값은 **50,000원**이다.
- 현행 `revalidate(...)` 인자에는 거래처 코드·전역DC·세트 구성품 목록이 없고(`DiscountRevalidator.java:68-74`), `MonthEndCloseService.java:449-456`도 품목별 실단가·출고가·납품가·고정DC만 넘긴다. 따라서 레거시 **1way 전역DC 50,000원** 대 현행 **전역DC 반영 0원(대신 품목별 출고가-납품가를 기대 DC액으로 사용)**이다.

## 확인 3 — 공통 산식과 허용 오차

| 레거시 규칙 (원문 인용 + `Code.js:행번호`) | 현행 위치 또는 **없음** | 같음 / 다름 / 확인불가 | 다르면 양쪽 값 |
|---|---|---|---|
| `var n = Number(s);` / `return isNaN(n) ? 0 : Math.round(n);` (`Code.js:156-157`) — 입력 금액·수량을 먼저 정수 반올림 | `MonthEndCloseService.java:379-388` — `(공급가액 + 부가세) / 수량`, scale 10 `HALF_UP` | 다름 | 레거시: 입력 `단가(VAT포함)` 자체를 정수원 반올림. 현행: 합계에서 역산한 단가를 소수 10자리까지 유지 |
| `var rate = price ? (1 - (unit / price)) : 0;` / `item['총계'] = unit * qty;` (`Code.js:559-561`) | `DiscountRevalidator.java:170-179`; 합계 표시는 `MonthEndCloseService.java:355-357,462-464` | 같음(할인율 판정 산식) | 해당 없음 — 양쪽 모두 `1 - VAT포함 실단가 / 출고가`, 정수 % 반올림 |
| `item['확인'] = (actualRate === expectRate);` (`Code.js:731`), `Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)` (`Code.js:654`) — 별도 ±허용값 없음 | 할인율 `DiscountRevalidator.java:213-215`; 단가·DC액 `DiscountRevalidator.java:205-220` | 같음(명시적 허용 오차 없음) | 레거시: 정수화한 값의 완전일치, 허용 오차 **0원 / 0%p**. 현행: 정수원 또는 정수 %로 `HALF_UP`한 값의 완전일치, 허용 오차 **0원 / 0%p** |

## 확인 4 — 가격 기준값 선택

| 레거시 규칙 (원문 인용 + `Code.js:행번호`) | 현행 위치 또는 **없음** | 같음 / 다름 / 확인불가 | 다르면 양쪽 값 |
|---|---|---|---|
| `if (dateNum >= 20260701) suffix = '_단가인상';` (`Code.js:438`), 단 `!isBeforeHike` 조건(`Code.js:424`) | `MonthEndCloseService.java:415-417,613-624` | 다름 | 레거시: 기준일 **2026-07-01** 하드코딩 + 수동 인상 전 플래그. 현행: `priceChangeDefaultVariants()` 설정값에 따라 인상 전이면 **2000-01-01** baseline, 아니면 조회일 `asOf` |
| `var delivery = pData.deliveryPrice || price;` (`Code.js:552`) | `DiscountRevalidator.java:190-195` | 같음 | 해당 없음 — 납품가 null/0이면 출고가 사용 |
| 일반 가격표는 출고가 열이 없으면 납품가 열을 출고가로 사용 (`Code.js:319-324`); 싱글 구성품은 `납품가` 열이 여러 개면 두 번째 열을 선택 (`Code.js:227-243`) | 일반 가격은 product price history의 `release`/`delivery`(`MonthEndCloseService.java:442-455`); 싱글 구성품 카탈로그 금액 열 규칙은 **없음** | 다름 | 레거시: 시트 열 fallback 및 두 번째 납품가. 현행: 제품 가격 이력 1건의 출고가·납품가, 세트 카탈로그 합계 없음 |
| `if (!pData) pData = { price: 0, deliveryPrice: 0, fixedDc: null };` (`Code.js:545`) | `MonthEndCloseService.java:442-455`, `DiscountRevalidator.java:92-95` | 다름 | 레거시: 출고가·납품가 **0원**으로 계속 분기. 현행: 가격 없으면 `MISSING_REFERENT`, `verified=null`(운임·절삭 예외) |
| 가격 조회는 `OLD` 우선(`Code.js:519-520`), 유연호스·방진가대는 품명 키워드 탐색(`Code.js:524-540`), 이후 현재 zone → `UNKNOWN` 순(`Code.js:543-544`) | 제품 exact model/label 해소(`MonthEndCloseService.java:401-443,500-540`) 후 카테고리·설정 기준일의 product price history 조회(`MonthEndCloseService.java:568-624`) | 다름 | 레거시: Google 가격표의 OLD/zone/UNKNOWN 우선순위. 현행: product id + category axis + 설정 기준일 가격 이력 |

## 확인 5 — 무조건 통과·구형·부자재 분기

| 레거시 규칙 (원문 인용 + `Code.js:행번호`) | 현행 위치 또는 **없음** | 같음 / 다름 / 확인불가 | 다르면 양쪽 값 |
|---|---|---|---|
| `if (/(운임|절삭)/.test(item['품목명'])) { item['확인'] = true; }` (`Code.js:669-670`) | `DiscountRevalidator.java:80-84` | 같음 | 해당 없음 — 가격·금액과 무관하게 `true` |
| `if (isMultiApplied === false) { item['확인'] = true; }` (`Code.js:672-674,684-685,715-716`) — 구형·부자재·멀티 대조를 끄면 무조건 통과 | **없음** — `DiscountRevalidator.revalidate` 인자(`DiscountRevalidator.java:68-74`)와 `MonthEndCloseService.getDailyDetail` 경로(`MonthEndCloseService.java:185-199`)에 이 토글이 없고 해당 클래스 전문 및 관련 테스트에서 `isMultiApplied|multiApplied`를 찾아본 결과 0건 | 다름 | 레거시 OFF: 판정값 항상 `true`. 현행: 토글 없이 항상 해당 규칙을 계산 |
| `if (/^(AM|NJ|NS|AVX)/.test(item._token)) { item['확인'] = (actualRate === 50); }` (`Code.js:675-678`) — 단 `_isOld`일 때만(`Code.js:519-520,671`) | `DiscountRevalidator.java:97-105` | 다름 | 기대율은 양쪽 **50%**. 적용 범위는 레거시: 구형 시트에서 찾은 행만, 현행: `NJ/NS/AVX` 및 비멀티 `AM` 토큰 근사 전체 |
| `item['확인'] = (unitPrice === item._deliveryPrice);` (`Code.js:679-681`) — 위 50% 접두 외 구형 | `DiscountRevalidator.java:106-112`의 액세서리/AXJ만 존재; 그 밖의 구형이라는 독립 상태는 **없음** | 다름 | 레거시: 구형 시트의 기타 품목은 실단가와 납품가 **0원 차이** 요구. 현행: 구형 상태를 보존하지 않아 기타 default `true`(`DiscountRevalidator.java:133-134`)로 갈 수 있음 |
| `/(유연호스|발통세트|일자발|방진가대)/` 또는 `/^AXJ/`이면 `unitPrice === item._deliveryPrice` (`Code.js:683-689`) | `DiscountRevalidator.java:35,106-112` | 같음 | 해당 없음 — 정수원 납품가 완전일치(허용 오차 0원) |

## 확인 6 — 싱글 세트 금액 판정

| 레거시 규칙 (원문 인용 + `Code.js:행번호`) | 현행 위치 또는 **없음** | 같음 / 다름 / 확인불가 | 다르면 양쪽 값 |
|---|---|---|---|
| `var key = row['일자'] + '_' + row['번호'];` (`Code.js:473-477`) — 세트 판정을 판매전표별로 격리 | **없음** — 세금계산서 경로는 당일 발행분 전체를 하나의 `byModel`에 누적(`MonthEndCloseService.java:204-240`), 판매전표 경로도 당일 전표 전체를 하나의 `byModel`에 누적(`MonthEndCloseService.java:253-283`) | 다름 | 레거시: `일자+번호`별. 현행: 일자 전체의 품목/모델/카테고리/실단가 축(`MonthEndCloseService.java:391-398,704-710`) |
| `currentZone`을 `AM...X/N`→`COMM_MULTI`, `AJ...X/N`→`HOME_MULTI`, 싱글 본체→`SINGLE`로 바꾸고 각 행에 보존 (`Code.js:483-500`) | 동일한 순차 zone 상태는 **없음**; 보존 model/category로 `AxisKey`를 구성(`MonthEndCloseService.java:391-398`) | 다름 | 레거시: 같은 전표의 앞 행이 뒤 행 zone을 결정. 현행: 행별 snapshot 축, 원본 순서 상태 전이 없음 |
| `var loopQty = Math.abs(qty);` 후 수량 단위마다 `used: false` pool 생성 (`Code.js:568-581`), `qty ... || 1` (`Code.js:571`) | **없음** — 현행은 수량 합계만 누적(`MonthEndCloseService.java:346-357`); `pool|riUsage` 구조를 대상 main/test에서 찾아본 결과 0건 | 다름 | 레거시: 절댓값 수량만큼 개별 매칭, 수량 0도 **1개**로 취급. 현행: 수량 0이면 실단가 `null`(`MonthEndCloseService.java:383-385`) |
| `var reqOut = ... 'OUTDOOR'; if (!reqOut) continue;` 및 미사용 동일 실외기 필수 (`Code.js:590-600`) | **없음** — 현행 접두 분기는 구성품 관계를 받지 않는다(`DiscountRevalidator.java:68-74,123-131`) | 다름 | 레거시: 실내기+필수 실외기 조합 금액. 현행: 개별 품목 금액 |
| `cands.sort(function(a, b) { return catalog.setToComps[b].length - catalog.setToComps[a].length; });` (`Code.js:587-588`) 후 첫 금액 일치에서 `break` (`Code.js:654-657`) | **없음** | 다름 | 레거시: 구성품 수가 많은 후보 우선, 첫 일치 세트를 소비. 현행: 세트 후보 탐색 없음 |
| `expectedPriceSum = ... INDOOR ... .price + reqOut.price;` 뒤 실제로 존재하는 기타 구성품만 더함 (`Code.js:600-617`) | **없음** | 다름 | 레거시: 카탈로그 납품가의 세트 구성품 합계. 현행: 개별 품목 납품가 1개 |
| `if (discInfo.excl.some(function(ex) { return nm.indexOf(ex) > -1; })) isExcl = true;` (`Code.js:603-607`) | **없음** — `할인제외 품목` 및 `excl` 관련 세트 로직을 대상 서비스 main/test에서 찾아본 결과 0건 | 다름 | 레거시: 구성품 하나라도 거래처 할인제외 목록과 부분일치하면 세트 전역DC **0원**. 현행: 할인제외 입력 자체 없음 |
| `var isExcludedSet = (setU.indexOf('AR') === 0 && /S$/.test(setU)) || (setU.indexOf('AF') === 0 && /S$/.test(setU));` (`Code.js:621-624`) | **없음** | 다름 | 레거시: `AR...S`·`AF...S` 세트 전역DC **0원**. 현행: 이 세트 예외 없음 |
| 360/4way/1way/스탠드/디럭스/1등급을 판별해 각각 `discInfo.dc360`, `dc4way`, `dc1way`, `stand`, `deluxe`, `grade1`의 절댓값을 선택 (`Code.js:625-646`) | **없음** — 해당 설정명·`dc1way|dc360|dc4way|grade1|deluxe|setToComps|indoorToSets`를 대상 서비스 main/test에서 찾아본 결과 0건. 대신 개별 품목 기대 DC액=`출고가-납품가`(`DiscountRevalidator.java:123-131`) | 다름 | 레거시: 거래처별 전역DC 6종(이번 G-B 1way 실값 **50,000원**). 현행: 전역DC **0원 반영**, 개별 품목의 출고가-납품가 차액 사용 |
| `var finalExpectedPrice = expectedPriceSum - discount;` / `if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice))` (`Code.js:650-655`) | **없음** — 현행은 `출고가-실단가`와 `출고가-납품가` 비교(`DiscountRevalidator.java:128-131`) | 다름 | 레거시: `abs(실제 구성품 단가 합계) = abs(기대 구성품 납품가 합계 - 전역DC)`. 현행: `round(출고가-실단가) = round(출고가-납품가)` |
| 성공한 세트의 모든 수량 단위를 `used=true`로 만들고(`Code.js:654-656`), 실내기·실외기·보조실내기는 해당 행의 모든 단위가 사용돼야 `확인=true` (`Code.js:661-666,709-710`) | **없음** | 다름 | 레거시: 구성품 완전소비 여부의 boolean. 현행: 품목별 DC액 boolean |
| 판넬·리모컨·자재는 싱글 본체가 없으면 무조건 true; 세트에 쓰였으면 true; 본체 매칭 실패가 있으면 false; 그 외 납품가 완전일치 (`Code.js:690-708`) | **없음** — 현행은 PANEL/REMOTE/MATERIAL 역할 및 본체 실패 전파 없이 접두별 개별 DC액 또는 기타 default 처리 | 다름 | 레거시: 4단계 분기. 현행: 세트 상태값 없음 |

## 확인 7 — 멀티 및 기본 분기

| 레거시 규칙 (원문 인용 + `Code.js:행번호`) | 현행 위치 또는 **없음** | 같음 / 다름 / 확인불가 | 다르면 양쪽 값 |
|---|---|---|---|
| `AM`/`AJ` 토큰의 7번째 문자가 `X` 또는 `N`이면 상업/홈 멀티 zone (`Code.js:490-493`), 또는 품명에 `멀티|MULTI` (`Code.js:714`) | `DiscountRevalidator.java:223-233` | 같음 | 해당 없음 |
| `if (item._fixedDc != null) { expectRate = Math.round(item._fixedDc * 100); }` (`Code.js:721-723`) | `MonthEndCloseService.java:426-429,449-456`; `DiscountRevalidator.java:114-121,197-202` | 같음(업무값) | 해당 없음 — 고정DC 우선. 저장 표현만 레거시 비율 공간(예: 0.50), 현행 percent 공간(예: 50.00) |
| 상업은 `Math.round((discInfo.commRate || 0.45) * 100)`, 홈은 `homeRate || 0.45` (`Code.js:723-726`) | 거래처 전역DC 조회는 **없음**; `DiscountRevalidator.java:116`은 고정DC null이면 45 | 다름 | 레거시: 거래처 전역DC(예: **48%**) 또는 **45%**. 현행: 항상 **45%**. 예시 차이 **3%p** |
| zone 불명 멀티는 `expectRate = 45;` (`Code.js:727-729`) | `DiscountRevalidator.java:114-121` | 같음 | 해당 없음 — 고정DC가 없다면 **45%** |
| `item['확인'] = (actualRate === expectRate);` (`Code.js:718-731`) | `DiscountRevalidator.java:170-179,213-215` | 같음 | 해당 없음 — 실제율과 기대율을 각각 정수 %로 반올림한 뒤 완전일치 |
| 최종 `else { item['확인'] = true; }` (`Code.js:733-735`) | `DiscountRevalidator.java:133-134`, 단 그 전에 NOT_FOUND/AMBIGUOUS/MISSING_REFERENT 단락(`DiscountRevalidator.java:86-95`) | 다름 | 레거시: 위 분기에 안 든 품목은 가격 결측 여부와 무관하게 `true`. 현행: 정상 매칭·가격이 있을 때만 기타 default `true`; 결측은 `verified=null` |

## 확인 8 — 대조 대상에서 빠지는 항목과 결과 포함 범위

- **금액 대조 없이 `확인=true`인 레거시 항목**: 운임·절삭(`Code.js:669-670`), `isMultiApplied === false`일 때의 구형·부자재·멀티(`Code.js:672-685,715-716`), 싱글 본체가 전표에 없을 때의 판넬·리모컨·자재(`Code.js:690-692`), SINGLE zone의 기타 class(`Code.js:711-712`), 모든 최종 기타 품목(`Code.js:733-735`).
- **전역DC만 제외되고 세트 금액 대조에는 남는 항목**: 거래처 `할인제외 품목`과 일치하는 구성품이 든 세트(`Code.js:603-607,619-620`), `AR...S`·`AF...S` 세트(`Code.js:621-624`). 이들은 행 자체를 빼는 것이 아니라 할인액을 **0원**으로 두고 세트 합계는 계속 비교한다.
- **회계반영일자에 따른 결과 분리**: 날짜 형식이면 `pre`, 아니면 `main`에 넣고(`Code.js:737-740`), 반환 `sum`은 `main.concat(pre)`다(`Code.js:744`). 따라서 회계반영일자 있는 행도 금액 판정 대상에서 제외되지 않는다.
- 현행의 운임·절삭 무조건 통과는 동일(`DiscountRevalidator.java:80-84`). 레거시의 멀티 적용 OFF, 본체 없는 싱글 부속, 할인제외 세트 및 세트 역할별 제외/전파는 **없음**이다. 이는 단순 grep 추정이 아니라 `MonthEndCloseService.revalidateProductLines`의 전체 입력 조립(`MonthEndCloseService.java:401-471`)과 `DiscountRevalidator.revalidate` 전체 분기(`DiscountRevalidator.java:68-135`)를 읽고, 관련 구조명도 main/test에서 별도 검색해 확인했다.

## Index.html 호출 계약 및 최종 결론

- `Index.html:232-233`에서 `isMultiApplied=false`, `isBeforeHike=false`로 시작하고, `Index.html:968`에서 두 값을 그대로 `processDailyData(ecountData, isMultiApplied, isBeforeHike)`에 전달한다. 따라서 기본 UI 실행은 구형·부자재·멀티 검증 OFF(해당 분기 무조건 true), 인상 전 강제 OFF(2026-07-01 이후 데이터면 `_단가인상` 가격표 선택)다.
- **G-A:** 존속. PR #991은 가격 기준일을 설정 조회로 바꿨지만 거래처 전역DC는 연결하지 않았다. 레거시 48% 대 현행 45%, **3%p** 차이와 판정 반전이 그대로 가능하다.
- **G-B:** 종전의 `OUT_OF_SCOPE` 반환은 소멸했다. enum 이름만 남았고 실제 반환 0건이다. 그러나 현행의 새 산출은 개별 품목 `출고가-납품가` 대조이며, 레거시 세트 합계 및 1way 전역DC **50,000원**은 여전히 없다.
- “없음” 판정은 `MonthEndCloseService.java`, `DiscountRevalidator.java`의 관련 경로 전문과 accounting-service main/test의 구조명 검색을 함께 사용했다. 외부 서비스 내부 구현이나 런타임 결과를 “찾지 못함”에서 “없음”으로 확대하지 않았다.
- 사용자 제한에 따라 git, Docker, DB, 빌드, 테스트는 실행하지 않았다. 본 보고서는 정적 소스 대조 결과다.
