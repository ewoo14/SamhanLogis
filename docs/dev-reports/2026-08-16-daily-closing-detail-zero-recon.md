# 일마감 상세 0 표시 원인 정찰 (2026-08-16)

## 0. 환경

```text
cwd   C:/dev/Samhan-Public   (main, 읽기 전용)
HEAD  751e7738017c3eb53bb085e14e7673a50a7ba4e3
```

- 제품 코드·컨테이너·DB는 변경하지 않았다. 이 보고서만 작성했다.
- DB 계측은 모두 `BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;` 안에서 수행했다.
- 기준 집합은 실 관측과 정확히 일치한 `2026-08-14`, `OUTBOUND`, 상태 `CONFIRMED|DELIVERED|COMPLETED`의 13행이다.
- 보고서에는 UUID와 자격 값을 기록하지 않았다.

## 1. 결론

이 문제는 하나가 아니라 세 층이다.

1. `modelName`은 DB에 13/13 존재하지만 slip-service 응답 조립에서 빠졌다.
2. `categoryKey`, 시점 `deliveryPrice`, `expectedRate`의 근거 데이터는 대상 집합에서 대부분 또는 전부 비어 있다. DTO에 필드를 추가하는 것만으로는 값이 생기지 않는다.
3. 화면은 없는 값과 `null`을 `0`으로 합쳐 그린다. 따라서 “미수집/판정 불가”가 “모델 0·무료·할인율 0%·DC 0원”으로 바뀐다.

역사상 네 필드가 slip-service DTO에 있었다가 빠진 적은 없다. PR #1219의 한 커밋에서 FE가 존재하지 않는 필드를 타입과 화면에 동시에 추가했고, 같은 커밋에서 새로 만든 BE DTO에는 그 네 필드가 처음부터 없었다. 삭제 회귀가 아니라 **동일 커밋에서 생긴 FE↔BE 계약 불일치**다.

## 2. 여섯 칸별 데이터·응답·표시

| 화면 칸 | 데이터 정본/후보 | 13행 실측 | slip 응답 | 화면 fallback | 판정 |
|---|---|---:|---|---|---|
| 모델 | `slip_db.slip_lines.model_name` | 13/13 채움, 누락 0.0% | `DailyClosingRowResponse`에 필드 없음 | `DailyClosingPage.tsx:1091`, `row.modelName || '0'` | 데이터는 있고 응답 조립만 누락 |
| 카테고리 | 1차 snapshot `slip_db.slip_lines.category_key`; 대체 후보 `product_db.products.product_category` 또는 물리 `categories.code` 파생 | snapshot 0/13, 누락 100.0%; product에서 현 규칙으로 파생 가능한 행 1/13(7.7%) | 필드 없음 | `DailyClosingPage.tsx:1092`, `row.categoryKey || '0'` | API만 늘려도 13행 중 12행은 값 없음 |
| 기준 납품가 | 업무일 기준 `product_db.price_history.delivery_price`; 현재값 후보 `products.delivery_price` | 2026-08-14 적용 이력 1/13(7.7%); 현재값은 NOT NULL 13/13이나 12/13이 `0`이어서 의미 있는 비영(非零) 값은 1/13 | 필드 없음 | `DailyClosingPage.tsx:1093` → `formatLegacyNumber`; 함수가 null/undefined/NaN을 0으로 변환(`:418`) | “미가격”과 “0원”이 합쳐짐 |
| 기대율 | 저장 필드가 아니라 재검증 파생값. 후보는 `products.fixed_discount_rate`, `classification.fixed_discount_rate`, 거래처 `dc_config_db.dc_configs.home_discount_rate/commercial_discount_rate`, 그리고 레거시 기본 45% 규칙 | 대상 product 직접 고정율 0/13; 분류 125/125 전부 null; 대상 거래처 2곳 중 dc-config 매핑 0/2 | 필드 없음 | `DailyClosingPage.tsx:1094` → `formatLegacyNumber(...) + '%'` | 정확한 기대율 근거는 0%; 기본 45를 쓰면 데이터가 아니라 정책 가정 |
| DC액 | DB 컬럼 없음. 현재 slip DTO에서는 `price_history.release_price - slip_lines.unit_price_with_vat` 파생 | 파생 가능 1/13(7.7%), 그 1행도 계산값 0; 선발행 1행은 적용 가격 이력이 없어 파생 불가 | `dcAmount`는 존재하나 null 가능 (`DailyClosingRowResponse.java:32,79,86,109`) | `DailyClosingPage.tsx:1095` → `formatLegacyNumber` | 응답 부재가 아니라 null을 0원으로 오인 |
| 확인 사유 | DB 컬럼 없음. `출고가/DC조건/posted_at` 원천 누락을 `DailyClosingSourceResolver`가 문자열로 파생 | 대상 거래처 dc-config 0/2, 적용 가격 1/13, 회계 posted 1/13이므로 현재 HEAD+DB에서는 적어도 한 원천이 모든 행에서 빠져 사유가 생겨야 함 | `confirmationReason` 존재 (`DailyClosingRowResponse.java:30,81,107`) | `DailyClosingPage.tsx:1096`, `row.confirmationReason || '0'` | 관측된 `0`은 런타임 응답이 null/빈문자였다는 뜻이나, 현재 HEAD+DB의 파생 규칙과는 모순. 네 누락 키와 별개 런타임 불일치 |

### 2.1 넓은 모집단 계측

| 계측 | 채움/결측 |
|---|---:|
| 활성 `slip_lines.model_name` | 342/342 채움 |
| 활성 `slip_lines.category_key` | 0/342 채움, 누락 100.0% |
| 활성 `products.delivery_price` | null 0/3,084, 그러나 0원 2,275/3,084(73.8%) |
| 활성 `price_history.delivery_price` | null 0/2,242, 그러나 0원 624/2,242(27.8%) |
| 활성 `products.fixed_discount_rate` | null 2,917/3,084(94.6%) |
| 활성 `classification.fixed_discount_rate` | null 125/125(100.0%) |

`NOT NULL DEFAULT 0`은 “업무상 0원”을 보장하지 않는다. 이 데이터에서는 대상 13행의 현재 납품가 12건과 시점 가격 12건이 가격 미확보 상태다.

### 2.2 데이터 흐름 좌표

- 모델 snapshot: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:68-69`
- 카테고리 snapshot: 같은 파일 `:137-139`; V60은 기존 행 backfill을 일부러 하지 않는다(`V60__preserve_sales_category_axis.sql:1-4`).
- 현 납품가: `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:218`
- 시점 납품가: `services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:54-70`
- 품목 고정율: `Product.java:136-138`; 유효값은 product 수동값 → S → M → L 순서(`:677-696`).
- slip 일마감 원천 결합: `DailyClosingSourceResolver.java:22-32`는 release 가격, 거래처 DC 설명, 회계 posted 시각만 결합한다. 모델·카테고리·납품가·기대율은 결합하지 않는다.
- 최종 DTO 생성: `DailyClosingRowResponse.java:72-115`는 `line.getProductName()`은 쓰지만 `line.getModelName()`/`getCategoryKey()`를 쓰지 않는다.

## 3. 응답 DTO 역사

### 3.1 처음부터 없었다

- 커밋 `9cec90b50405c7b641cfc3cb0a42ae04de43ff78` (2026-08-16 00:24 KST), PR #1219 `[FEAT] 일마감 레거시 표시 구조 + 행 단위 상태·저장 경로`에서 `DailyClosingRowResponse.java`가 131줄 신규 생성됐다.
- 현재 canonical record(`DailyClosingRowResponse.java:13-38`)에는 `modelName`, `categoryKey`, `deliveryPrice`, `expectedRate`가 없다.
- 같은 커밋이 FE `DailyClosingSourceRow`에는 네 필드를 optional로 선언했고(`closingApi.ts:54-57`), 화면에서 즉시 소비했다(`DailyClosingPage.tsx:1091-1094`).
- `git log -S`와 `--follow` 결과 BE DTO에 `String modelName`이 존재했던 커밋은 0건이다. 파일 자체가 PR #1219 이전에는 없었다. 따라서 “있었다가 빠진 PR”은 없다.

### 3.2 혼동 가능한 다른 응답

accounting-service의 다른 endpoint가 반환하는 `DailyClosingDetailResponse.DailyProductLine`에는 모델·카테고리·납품가·기대율이 실제로 있다(`DailyClosingDetailResponse.java:57-75`). 그러나 문제 화면의 결과/선발행 표는 `/slips/query/daily-closing`을 호출하며(`closingApi.ts:60-66`), 이 endpoint는 slip-service `DailyClosingRowResponse`를 반환한다. 이름이 같은 다른 계약의 필드를 옮겨 적어도 런타임 응답에는 생기지 않는다.

## 4. 화면이 전부 0을 만드는 위치

```ts
// clients/desktop/src/renderer/routes/DailyClosingPage.tsx:418
export function formatLegacyNumber(value: string|number|null|undefined): string {
  return Math.round(Number(value)||0).toLocaleString()
}

// 같은 파일 :1091-1096
<span><strong>모델</strong> {row.modelName || '0'}</span>
<span><strong>카테고리</strong> {row.categoryKey || '0'}</span>
<span><strong>기준 납품가</strong> {formatLegacyNumber(row.deliveryPrice)}</span>
<span><strong>기대율</strong> {formatLegacyNumber(row.expectedRate)}%</span>
<span><strong>DC액</strong> {formatLegacyNumber(row.dcAmount)}</span>
<span><strong>확인 사유</strong> {row.confirmationReason || '0'}</span>
```

`Number(undefined)`와 `Number(null)`은 각각 `NaN`, `0`이 되고 뒤의 `|| 0`이 모두 0으로 만든다. 문자열 필드는 falsy fallback이 없음을 숫자 `0`이라는 문자열로 바꾼다. 금액 0은 무료, 비율 0%는 무할인으로 읽히므로 결측 표시가 아니다.

## 5. 레거시 GAS가 실제로 보여 주는 것

레거시의 화면 열 원문은 다음 17개뿐이다.

> `const FINAL_HEADERS = [`  
> `  'DC','일자','번호','창고명','품목명','수량','단가(VAT포함)','공급가액','부가세','합계',`  
> `  '거래처명','거래처코드','출고가','할인율','총계','확인','회계반영일자'`  
> `];`

출처: `tools/legacy-gas/일마감 프로그램/Code.js:11-14`. 브라우저도 같은 배열을 쓴다(`Index.html:207`).

따라서 여섯 칸의 레거시 대응은 다음과 같다.

| 현대 확장 칸 | 레거시 화면 |
|---|---|
| 모델 | 없음 |
| 카테고리 | 없음 |
| 기준 납품가 | 없음. 내부 판정값 `_deliveryPrice`로만 보존(`Code.js:551-558`) |
| 기대율 | 없음. 멀티 판정 중 지역변수 `expectRate`로만 계산(`:718-731`) |
| DC액 | 없음. 화면의 `DC`는 숫자 차액이 아니라 거래처 DC 조건 설명 |
| 확인 사유 | 없음. `확인` TRUE/FALSE만 표시(`Index.html:1128-1132`) |

원문상 납품가와 기대율은 사용자가 보는 열이 아니라 `확인`을 계산하기 위한 내부 referent다. `Code.js:680,688,707`은 단가와 `_deliveryPrice`를 비교하고, `:721-731`은 실제율과 `expectRate`를 비교한 뒤 최종적으로 `item['확인']`만 표에 낸다.

## 6. 같은 성격 전수

### 6.1 범위와 방법

- `clients/desktop/src/renderer/api`의 테스트/mock 제외 optional API 필드 907개를 추출했다.
- desktop route/component 및 arlogis/order/mobile client에서 `??`, `||`, 숫자 formatter로 0·빈값·대시를 만드는 소비 지점을 교차했다.
- 서버 `src/main` Java 응답 이름과 1차 대조하고, 이름이 다른 DTO에도 존재해 전역 문자열 검색이 숨길 수 있는 항목은 실제 endpoint/controller/record를 다시 대조했다.
- 의도된 nullable 필드, 구버전 호환 alias, 환경 bootstrap, 서버 DTO에 실제 존재하는 필드는 제외했다.

### 6.2 확정 목록

**확정 2개 화면, 5필드**다.

| 화면/경로 | endpoint | 화면이 기대하지만 응답에 없는 필드 | 표시 |
|---|---|---|---|
| 회계 → 일마감 → 결과/선발행 상세 | `GET /slips/query/daily-closing` | `modelName`, `categoryKey`, `deliveryPrice`, `expectedRate` | `0`, `0`, `0`, `0%` |
| 전표 상세 | 전표 단건 `SlipDetailResponse` | `ownerDepartment` | `-` (`SlipDetailPage.tsx:5131-5132`) |

전표 상세의 FE 타입은 “BE가 사용자 부서 lookup 후 전달”한다고 쓰지만(`api/slip.ts:159-160`), 실제 `SlipDetailResponse.java:70-145`에는 `ownerFullName`만 있고 `ownerDepartment`는 없다. `git log -S ownerDepartment` 결과 이 FE 필드와 화면은 저장소 최초 커밋 `d5622b70055ed088e60e32ce527def417b758739`부터 존재했고 BE 응답에 추가된 이력은 없다.

별도 집계: 일마감의 `dcAmount`, `confirmationReason` 2필드는 응답 계약에는 있으므로 위 5필드에 포함하지 않는다. 다만 null/빈값을 0으로 위장하는 같은 **표시 의미 결함**은 맞다. 이를 포함해 사용자가 오해할 수 있는 fallback 지점은 2개 화면, 7필드다.

## 7. 개발책임자 선택지 — 권고 없음

### 선택지 A. slip API에 여섯 칸을 모두 실어 보낸다

- 모델은 기존 snapshot을 그대로 전달할 수 있다.
- 카테고리·시점 납품가·기대율은 product/dc-config 조회와 명시적 결측 상태가 필요하다.
- 현재 데이터로는 카테고리 12/13, 시점 납품가 12/13, 고정/거래처 할인 근거 대부분이 비어 있어 API를 확장해도 많은 칸이 null이다.
- 일마감 한 번에 행별 타 서비스 호출을 하면 N+1과 부분실패 의미가 생기므로 bulk 계약·캐시·실패 상태가 필요하다.

### 선택지 B. 레거시에 없는 여섯 칸을 확장행에서 뺀다

- 레거시 17열과 정확히 맞고 가짜 0은 사라진다.
- #812·#991에서 추가한 가격 재검증의 설명 가능성(왜 확인/불일치인지)을 이 표에서는 잃는다.
- 재검증 정보가 필요한 경우 다른 상세 endpoint/표로 이동해야 한다.

### 선택지 C. 필드는 유지하고 결측을 `-` 또는 `미수집/판정 불가`로 표시한다

- 무료·무할인·DC 없음이라는 오해는 즉시 사라진다.
- 실제 값을 채우는 계약/데이터 문제는 그대로 남아 대부분 대시인 확장행이 된다.
- 0이 유효한 필드와 null인 필드를 구분하는 formatter와 테스트가 필요하다.

### 선택지 D. 현재 응답에 정직한 칸만 남긴다

- `dcAmount`·`confirmationReason`처럼 실제 DTO에 있는 칸만 두거나, DB에 100% 있는 모델만 API에 최소 추가하는 절충이다.
- 상세 열 구성이 데이터 확보 상황에 따라 비대칭이 되고, 이후 필드가 늘 때 다시 UX 결정을 해야 한다.
- 확인 사유의 현재 런타임 0 관측과 HEAD 파생 규칙 모순은 별도로 해소해야 한다.

### 선택지 E. 데이터 backfill/정본 확정 뒤 API와 화면을 함께 연다

- `category_key`, 적용 가격 이력, 고정/거래처 할인정책을 먼저 채우고 채움률 gate를 통과한 필드만 노출할 수 있다.
- 가장 긴 경로다. 카테고리를 “판매 당시 snapshot”으로 복원할지 “현재 product 분류”로 재해석할지 업무 결정이 필요하며, 과거값을 현재 마스터로 backfill하면 역사 왜곡 가능성이 있다.
- 데이터 이관·검증·운영 동기화 비용이 발생하고, 그동안 현재 화면의 가짜 0은 별도 처리가 없으면 남는다.

선택지는 **5개**다. 서로 배타적일 필요는 없지만, A/E는 데이터·계약 비용을 부담하고 B/C/D는 표시 정직성과 진단 정보량 사이의 대가를 부담한다.
