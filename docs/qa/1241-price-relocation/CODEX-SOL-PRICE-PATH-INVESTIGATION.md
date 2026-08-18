# 🔍 조사 — 가격이 두 웹에 반영되는 경로와 거래처 할인 연결

조사일: 2026-08-17  
대상: PR #1241, HEAD `19f62dddfb4abe980c8773c93338b44e671f2e6b`  
범위: 읽기 전용 코드·Google Sheets v4 readonly·공유 개발 DB 조회. 코드 수정, 마이그레이션 작성, DB write, `git add`·commit·push는 하지 않았다.

## ① 환경 확인

요청 명령 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD                 # 19f62dddf
git status --porcelain
```

원문 출력:

```text
19f62dddfb4abe980c8773c93338b44e671f2e6b
```

`git status --porcelain` 출력은 빈 문자열이었다.

## ② 두 웹의 금액 원천 비교표

### 결론

두 웹은 **최종적으로 같은 product-service 내부 API**인 `GET /products/internal/estimate-catalog/components`를 본다. 그러나 견적서웹은 페이지 요청마다 직접 읽고, 주문서웹은 partner-order-service의 기본 10분 bootstrap 캐시를 거친다. 두 웹 모두 브라우저에 받은 배열을 스냅샷으로 두고 JavaScript에서 세트 구성품 금액을 계산하므로, 열려 있던 화면은 자동 갱신되지 않는다.

| 항목 | 견적서웹 `clients/web/estimate-app` | 주문서웹 `clients/web/order-app` |
|---|---|---|
| 브라우저 진입 | `routes/index.js:23-32`의 매 GET `/`가 `code.bootstrap()` 호출 | `index.html:14-72`가 렌더 전 동기 GET `/api/v1/partner-orders/bootstrap`; 실패 시 `src/main.ts:111-125` fallback |
| 중간 서비스 | Node가 product-service 직접 호출 | `PartnerOrderBootstrapController.java:17-27` → `BootstrapService.fetch()` → `EstimateCatalogClient` |
| 최종 구성품 API | `lib/db-catalog.js:34-45,148-165` → `/products/internal/estimate-catalog/components` | `EstimateCatalogClient.java:40-52` → 같은 endpoint |
| 관계 단가 해석 | endpoint의 `deliveryPrice`를 `price`, `releasePrice`를 `list`로 유지 (`lib/db-catalog.js:148-165`) | `BootstrapService.java:426-445`에서 싱글은 납품가, 상업 구성품은 출고가 우선·납품가 fallback으로 `price` 생성 |
| 서버 캐시 | 카탈로그 가격 캐시 없음. 매 페이지 GET 때 재조회 (`lib/code.js:1822-1865`) | `@Cacheable("bootstrap")` + 내부 `productCatalogCache` (`BootstrapService.java:130-158`) |
| 캐시 갱신 | 새 페이지 요청 즉시 | `BootstrapCacheRefreshScheduler.java:37-51`, 기본 10분 fixed-delay (`application.yml:86-94`) |
| 브라우저 스냅샷 | EJS가 `HM_RAW/SS_RAW/SP_RAW/CM_RAW/CP_RAW`로 주입 (`views/index.ejs:2248-2311`) | `window.__SAMHAN_BOOTSTRAP__`에서 상수 배열 생성 (`index.html:1367-1455`) |
| 클라이언트 계산 | `explodeSetParts()`가 고정합을 빼고 실내·실외를 비율 배분 (`views/index.ejs:5209-5303`) | 같은 구조의 `explodeSetParts()` (`index.html:3359-3444`) |

product-service의 응답 경계는 V44 관계 납품가/출고가를 먼저 선택하고 NULL일 때 구성품 Product의 전역 납품가/출고가로 fallback한다 (`EstimateCatalogInternalController.java:289-368`, 특히 348-365). 따라서 **API 원천은 같지만 상업 구성품을 클라이언트 필드로 만드는 규칙과 캐시 시점은 다르다.**

추가로 주문 확정 서버는 싱글 세트 전개 라인의 `setAllocation=true` 단가를 권위값으로 사용한다. DC 계산 결과보다 브라우저가 보낸 구성품 배분 단가를 우선한다 (`PartnerOrderPriceCalculationService.java:130-146,170-181`).

## ③ 견적품목 저장 경로와 V44 컬럼 관계

### 품목 자체 출고가·납품가

1. 화면: `ProductFormPage.tsx:842-858`
2. mutation: `ProductFormPage.tsx:301-324`
3. HTTP: `productCatalogApi.ts:500-509`의 `PATCH /api/products/{id}`
4. 서비스: `ProductService.java:1306-1308` → `Product.changePrices()`
5. DB: `products.release_price`, `products.delivery_price` (`Product.java:213-219,763-770`)

이 값은 V44 관계값이 NULL일 때만 구성품 endpoint의 fallback으로 쓰인다. V44 관계값이 있으면 품목 자체 가격을 고쳐도 그 관계의 웹 표시 구성품 가격은 바뀌지 않는다.

### 구성품 고정 배분가

1. 화면: `ProductFormPage.tsx:998-1004`; 신규 구성품은 `FIXED/null` 전송 (`947-950`)
2. HTTP: `productCatalogApi.ts:685-720`의 `PUT /api/v1/products/{modelCode}/components`
3. Controller: `ProductCatalogController.java:435-467`
4. 서비스: `BundleComponentService.replaceComponents()` (`298-377`)
5. DB: `bundle_component.allocation_mode`, `allocation_weight`, `fixed_allocation_amount`

신규 FIXED 구성품의 `fixedAllocationAmount=null`은 서버가 구성품 Product의 현재 `deliveryPrice`로 채운다 (`BundleComponentService.java:315-320`).

### V44와의 관계 — 별개 컬럼이며 현재 우선순위가 연결되지 않음

| 구분 | V39 배분 계약 | V44 관계 단가 |
|---|---|---|
| 컬럼 | `allocation_mode`, `allocation_weight`, `fixed_allocation_amount` | `context_release_price`, `context_delivery_price` |
| 입력 원천 | 데스크톱 견적품목 메뉴 | Google Sheets 구성품 탭 sync/백필 |
| 데스크톱 요청·응답 노출 | 있음 (`BundleComponentRequest/Response`) | 없음 |
| 두 웹의 `/components` 응답에 사용 | **아니오** | **예**; V44 우선, 전역 Product 가격 fallback |
| `BundleExpander` 계산에 사용 | `fixedAllocationAmount` 참조 없음 | 관계 단가를 직접 사용 (`BundleExpander.java:146-159`) |

따라서 두 값은 같은 것이 아니다. 현 코드의 실제 우선순위는 **V44 관계 단가 → 전역 Product 가격**이며, `fixedAllocationAmount`는 그 경로에서 읽히지 않는다.

더 큰 단절도 확인됐다. 구성품 PUT은 기존 행을 전부 soft-delete하고 새 행을 만들면서 배분 필드만 복원한다 (`BundleComponentService.java:337-371`). 요청 DTO에 V44 필드가 없고 `changeContextPrices()`도 호출하지 않으므로, 구성품 메뉴에서 저장하면 기존 V44 관계 단가는 새 행에 보존되지 않는다. 이어 부모를 수기 편집 상태로 표시하고 (`374-377`), 시트 sync는 그 부모를 건너뛴다 (`ProductSheetSyncService.java:401-406`). 즉 **한 번의 구성품 저장으로 관계 단가가 사라지고, 이후 자동 sync로 복구되지 않는 경로**가 존재한다.

개발책임자가 확정한 “견적품목 메뉴에서 고치면 두 웹 모두 반영”은 현재 일반적으로 성립하지 않는다.

- `fixedAllocationAmount` 수정: 두 웹 가격 계산에서 미사용
- 품목 자체 납품가 수정: V44 관계값이 NULL인 관계에만 반영
- 구성품 목록 저장: V44 관계값을 소실시켜 전역 가격 fallback으로 전환

## ④ 저장 → 반영 사이 캐시

```text
데스크톱 저장
  → product-service DB
  ├─ 견적서웹: 다음 GET / → product-service 직접 조회 → 새 브라우저 스냅샷
  └─ 주문서웹: 다음 bootstrap 캐시 갱신(기본 10분) → 페이지 재진입/새로고침 → 새 스냅샷
```

- product-service의 저장 경로에서 partner-order-service `evictAll()`을 호출하는 배선은 없다. `evictAll()` 호출자는 주기 스케줄러뿐이다 (`BootstrapCacheRefreshScheduler.java:43-51`; 저장소 전체 참조 검색).
- 주문서웹 service worker의 runtime cache 정규식은 `/api/v1/(products|partner-orders/catalog)`만 대상으로 하며 `/partner-orders/bootstrap`은 포함하지 않는다 (`vite.config.ts:64-79`). 추가 브라우저 HTTP 캐시 계층은 확인되지 않았다.
- 서비스 재기동은 필요조건이 아니다. 견적서웹은 새 요청, 주문서웹은 성공한 다음 주기 갱신과 화면 재로딩으로 반영된다. 주문서웹 갱신 실패 시에는 다음 성공 주기까지 이전 값이 유지된다.

## ⑤ 거래처 할인 연결 상태와 레거시 순서

### 견적서웹

거래처 DC는 실제 연결돼 있다. `lib/code.js:1931-1980`이 dc-config-service의 `/internal/partner-dc-configs`를 읽어 10분 캐시하고, 사업자번호 우선·거래처코드 fallback으로 고객에 결합한다 (`1984-2005`). 거래처 선택 시 `views/index.ejs:16343-16355`가 `applyCustomerDiscounts()`를 호출해 홈/상업 비율, 6종 옵션 정액, 단위처리 값을 화면 계산 변수에 넣는다 (`2591-2649`).

실제 순서는 다음과 같다.

1. 홈·상업 변동 대상: 품목 고정 DC가 있으면 거래처 비율 대신 사용하고, 없으면 거래처 비율 적용 (`views/index.ejs:4351-4394,4462-4504`).
2. 변동 비대상: 저장된 납품가 사용. 견적서웹 상업 경로는 변동 비대상에서 고정 DC를 적용하지 않는다.
3. 싱글 옵션 대상: 기본가에서 일치하는 6종 정액을 순서대로 차감 (`4412-4458`). 홈·상업 본체에는 이 옵션 정액을 차감하지 않는다.
4. 마지막에 단위 반올림/버림/올림 (`3330-3349`).

이는 레거시 종합견적서의 홈 `tools/legacy-gas/종합견적서/index.html:3928-3970`, 싱글 옵션 `3989-4035`, 상업 `4039-4081`, 단위처리 `3031-3050` 순서와 같다.

### 주문서웹

거래처 로그인 응답의 DC 설정을 브라우저에 적용한다 (`src/samhanApi.ts:312-330,460-469`; `index.html:1536-1573`). 화면 계산은 레거시 거래처 주문서와 같은 구조다.

- 홈: 품목 고정 DC > 거래처 홈 비율 > 납품가 (`index.html:2720-2764`; 레거시 `거래처 발송 주문서/index.html:2437-2481`)
- 상업: 변동 대상이면 품목 고정 DC > 거래처 상업 비율, 변동 비대상이어도 품목 고정 DC가 있으면 고정 DC, 모두 없으면 납품가 (`index.html:2851-2892`; 레거시 `2555-2602`)
- 싱글 옵션: 액세서리를 제외하고 일치하는 정액을 순서대로 차감 (`index.html:2805-2847`; 레거시 `2509-2551`)
- 단위처리는 마지막 (`index.html:1775-1793`; 레거시 `1612-1630`)

미리보기·확정의 서버 권위 계산도 dc-config-service를 호출한다 (`PartnerOrderPriceCalculationService.java:122-150`). 서버 순서는 **품목 고정 DC → 고정값이 없을 때 거래처 카테고리 비율 → OTHER에만 옵션 정액 합계 차감 → 단위처리**다 (`PriceCalculationService.java:65-72,103-127,166-190`). 품목 고정 DC 자체는 수동 품목값 > 소분류 > 중분류 > 대분류 순으로 해소된다 (`Product.java:677-696`).

단, 싱글 세트 구성품의 `setAllocation=true` 단가는 서버 DC 결과를 건너뛰고 브라우저 배분값을 최종가로 사용한다 (`PartnerOrderPriceCalculationService.java:170-181`). 따라서 “거래처 할인 연결”은 일반 품목에는 서버까지 이어지지만, 이미 배분된 싱글 세트 구성품에는 동일하게 재적용되지 않는다.

### 확정 사항과의 충돌·보장 상태

| 확정 사항 | 확인 결과 |
|---|---|
| 선결제 할인은 총액을 깎지 않고 표기만 | **구조적으로 보장되지 않음.** 기본 `advanceDiscountRate`는 0이나 (`views/index.ejs:2357-2360`), 0보다 크게 설정되면 `applyEstimateTotalAdjustments()`가 음수 행을 추가해 총액을 차감한다 (`2574-2588`). |
| 운임·절삭은 제외 대상이 아님 | **충돌.** 두 웹의 `isHideMat`가 운임·절삭을 구성품 선택에서 제외한다 (`estimate-app/views/index.ejs:5209-5248`의 호출, `order-app/index.html:3353-3398`), 서버 `BundleExpander`도 제외한다 (`438-440` 및 picked filter). |
| 구제품 할인율 0.5 | 기본값과 실제 계산 경로가 0.5를 사용 (`views/index.ejs:2357,2475-2477,2886`). |
| 카드 수수료 3% | 기본값 0.03과 카드수수료 행 추가 경로 확인 (`views/index.ejs:2359,2479-2480,16936-16940`). |

단위처리에도 끊김이 있다. DB에는 `unit_processing_enabled`가 별도 Boolean으로 저장되지만 (`DcConfig.java:93-109`), partner-auth 전달 DTO에는 이 필드가 없고 (`PartnerConfigDto.java:37-49`), 서버 계산은 이 Boolean을 검사하지 않은 채 `unitRoundTo > 0`이면 단위처리를 수행한다 (`PriceCalculationService.java:183-190`). 즉 활성/비활성 설정은 두 웹 가격 계약에 끝까지 전달되지 않는다.

## ⑥ 고정/비율 구분 데이터

제공된 자격 파일은 존재 여부만 확인하고 내용을 출력하지 않았으며, Google Sheets v4 readonly로 읽었다. `싱글 구성품`과 `싱글 구성품_단가인상`의 2행 D열 헤더는 `구분`이고, 두 탭의 1,735개 데이터 행 분포는 동일했다.

| 시트 `구분` | 행 수 |
|---|---:|
| 세트 | 271 |
| 실내기 | 271 |
| 실외기 | 271 |
| 판넬 | 250 |
| 리모컨 | 320 |
| 자재 | 273 |
| 부자재 | 9 |
| 벽걸이 | 67 |
| 기타 | 2 |
| 펌프 | 1 |

DB는 원문 문자열이 아니라 `bundle_component.component_kind` enum으로 가진다: `INDOOR`, `OUTDOOR`, `PANEL`, `REMOTE`, `MATERIAL`, `ACCESSORY`, `FOOT` (`BundleComponent.java:40-47`). sync는 `구분`을 1순위로 보고 리모컨·판넬·발통·실내·실외·자재를 각각 enum에 매핑하며, 미매칭이면 이름+특징으로 다시 판정한다 (`ProductSheetSyncService.java:1111-1130`). 따라서 **시트의 `자재`는 DB의 `MATERIAL`**이다.

공유 개발 DB read-only 실측은 현재 Flyway V43 상태여서 PR의 V44 컬럼은 아직 없었다. 활성 관계의 `component_kind` 분포는 다음과 같았다.

| DB 값 | 활성 행 수 |
|---|---:|
| ACCESSORY | 81 |
| INDOOR | 271 |
| MATERIAL | 273 |
| OUTDOOR | 408 |
| PANEL | 250 |
| REMOTE | 315 |

이름/특징에 `자재`가 든 활성 273행은 전부 `MATERIAL`이었다. 활성 배분 계약은 `AUTO` 542행(고정 배분가 non-null 0), `FIXED` 1,056행(고정 배분가 non-null 1,056)이었다. 공유 DB에는 write하지 않았다.

현재 코드의 고정/비율 판정은 배분 계약 컬럼이 아니라 `component_kind`로 한다. `INDOOR`와 `OUTDOOR`만 비율 그룹이고 나머지는 모두 고정 그룹이다 (`BundleExpander.java:320-354,418-453`; 두 웹 JavaScript도 같은 분리). 이 때문에 판넬·리모컨·자재뿐 아니라 `ACCESSORY`, `FOOT`, 가정용 벽걸이 실내기도 고정으로 들어간다. 또한 선택된 모든 구성품에 V44 관계 납품가가 있으면 비율 재배분 자체를 생략한다 (`BundleExpander.java:129-159`). 확정한 “판넬·리모컨·자재 고정, 실내기·실외기 비율 자동 산출”과 정확히 같은 데이터 계약은 아직 아니다.

## ⑦ 판단 필요 지점과 선택지 — 선택하지 않음

1. **고정가 저장 권위**
   - 선택지 A: V39 `fixed_allocation_amount`를 두 웹·`BundleExpander`의 권위값으로 연결. 기존 데스크톱 UI를 그대로 쓰지만 V44와 중복값 정리 규칙이 필요하다.
   - 선택지 B: V44 관계 단가를 데스크톱 구성품 API/UI에 노출하고 replace-all 저장 시 보존·수정. 출고가/납품가 두 축을 유지하지만 화면·DTO 계약이 넓어진다.
   - 선택지 C: 두 필드를 유지하고 저장 시 명시적으로 동기화. 호환성은 크지만 어느 방향이 권위인지와 불일치 감지 규칙이 필요하다.

2. **V44 완전값과 비율 산출의 관계**
   - 선택지 A: 판넬·리모컨·자재 관계값만 저장하고 실내·실외 V44 값은 비워 비율 산출.
   - 선택지 B: 실내·실외 V44 값을 보관하되 계산 시 무시하고 세트 잔액을 비율 산출.
   - 선택지 C: V44 완전값을 계속 권위로 사용. 이 경우 확정한 실내·실외 자동 비율 산출과 충돌한다.

3. **고정 대상의 정확한 경계**
   - 선택지 A: `component_kind`를 권위로 하여 PANEL/REMOTE/MATERIAL만 고정하고 INDOOR/OUTDOOR만 비율, 나머지는 별도 정책 결정.
   - 선택지 B: `allocation_mode`를 권위로 하여 행별 명시. 시트 구분과 배분 모드의 불일치 검증이 필요하다.
   - 현재처럼 “실내·실외가 아니면 모두 고정”을 유지하면 확정 범위보다 고정 대상이 넓다.

4. **주문서웹 반영 시점**
   - 선택지 A: 기본 10분 유계 staleness와 화면 새로고침을 운영 계약으로 유지.
   - 선택지 B: product-service 저장 성공 후 partner-order bootstrap을 명시 무효화. 즉시성은 높지만 서비스 간 호출/이벤트와 실패 처리가 추가된다.

5. **할인 계약 단절**
   - 단위처리 활성 Boolean을 전 구간에 전달할지, `unitRoundTo`만을 권위로 둘지 결정이 필요하다.
   - 선결제는 표기 전용으로 강제할지, 현재 비율 설정과 총액 차감 코드를 유지할지 결정이 필요하다.
   - 운임·절삭을 현재 세트 필터에서 제거할 경우 레거시와 달라지는 선택·합계·주문 라인 범위를 함께 확정해야 한다.

## ⑧ 작업 트리 무변경 확인

조사 시작 시 `git status --porcelain`은 빈 출력이었다. 게시 직전 추적 파일 diff와 staged diff는 모두 0건이며, 최종 status에는 게시용으로 요구된 이 보고서 파일만 untracked로 남는다.

```text
?? docs/qa/1241-price-relocation/CODEX-SOL-PRICE-PATH-INVESTIGATION.md
```

코드·테스트·마이그레이션·기존 문서는 수정하지 않았고 `git add`·commit·push를 실행하지 않았다.

## ⑨ 프로세스 회수

이번 조사에서 장기 실행 프로세스나 격리 컨테이너를 기동하지 않았다. Google Sheets와 GitHub 조회는 일회성 프로세스로 종료됐다. 공유 `samhan-*` 및 다른 작업의 컨테이너·프로세스는 건드리지 않았다.

- 이번 조사 기동 프로세스 잔여: **0**
- 이번 조사 기동 격리 컨테이너 잔여: **0**

