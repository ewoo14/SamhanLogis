# PR #1077 / 이슈 #1069 — SOL R34 표면 재수렴

검증 HEAD: `9d889a5834b00f33c1579a8bf68af3aab7d6166e`
판정 기준: 검증 품질이 아니라 실 사용자 도달성. DB와 배포 컨테이너에는 읽기만 수행했다.

## 결론

**실 사용자 경로로 재현 가능한 신규 결함은 0건이다. R34 표면은 수렴했고 머지 권고다.**

R34가 바꾼 것은 `options == null`일 때 버려지던 `setUnitOverride`를 기본 옵션과 함께
`BundleExpander`로 전달하는 한 경계다. 실제 판매전표 화면은 바로 이 형태로
`POST /slips/expand-line`을 호출하므로 `1,590,000`을 `1,660,000`으로 되돌리던 종전 동작이
정정됐다. 저장 경로와 견적 경로는 같은 `ProductClient.expand()` 및 product-service
`BundleExpander`를 사용한다. 다른 운영 호출자의 의도하지 않은 결과 변경이나 정상 입력 오차단은
재현되지 않았다.

실데이터에는 활성 BUNDLE 계보 구성행이 전표 `342행 / 160문서`, 견적 `50행 / 28문서`, 합계
`392행 / 188문서` 있다. R34는 요청 시 계산만 바꾸고 기존 행을 갱신하지 않으므로 배포만으로 금액이
바뀌는 기존 문서는 **0건**이다.

## 1. `/products/internal/expand` 소비자 전수조사

다음 두 검색을 생산 코드와 테스트에서 전수 실행했다.

```text
rg '/products/internal/expand' services clients shared
rg 'productClient\.expand' services clients shared
```

운영 HTTP 구현은 `slip-service`의 `ProductClient.expand()` 한 곳이다
(`ProductClient.java:316-360`). 이 구현은 `setUnitOverride != null`이면 항상 body에 넣고,
`options != null`이면 옵션 5개를 모두 body에 넣는다. 운영 호출부는 정확히 네 곳이다.

| 소비자 | 실제 전달 | R34 결과 변화 | 도달성 판정 |
|---|---|---|---|
| 판매전표 화면 `SlipLookupController.expandLine` (`:60-75`) | 화면은 `options` 생략, 확정 부모 `unitPrice` 전달 | 예. 종전 카탈로그가로 회귀하던 것을 화면 확정가로 정정 | 현재 실 사용자 핵심 경로. R36 및 이번 배포본 조회에서 정상 |
| 직접 전표 저장 `SlipService.addSlipLinesExpanded` (`:150-238`) | BUNDLE 부모 요청이면 동일 `setOptions`, `unitPrice` 전달 | `setOptions == null`인 API 요청도 요청 단가를 존중하도록 정정 | 의도된 정정. 정상 구성품 저장을 오차단하지 않음 |
| 견적 저장 `EstimateService` (`:86-158`) | 동일 `setOptions`, `unitPrice` 전달 | 데스크톱은 BUNDLE에 정규화된 options 객체를 보내므로 R34 전후 불변. options를 생략한 API 호출만 요청 단가 존중으로 정정 | 회귀 없음 |
| `MobileQuotationService` (`:145-186`) | 항상 `options=null`, 모바일 입력 `unitPrice` 전달 | 예. 종전 product 기본가 대신 모바일 입력가를 사용 | 계산 의미상 일반 견적과 맞아지는 정정. 다만 현재 배포 클라이언트에서는 진입 불가 |

### 셋째 가능성 — 모바일 소비자는 있으나 현재 사용자 진입면이 아니다

`MobileQuotationService`는 별도 소비자이므로 단순히 “다른 소비자 없음”이라고 결론내리면 틀린다.
그러나 현재 `clients/mobile-staff/App.tsx` → `AppRootNavigator.tsx`는
`EstimateWebViewScreen` 하나만 렌더한다. 잔존 `SalesTabNavigator`와
`QuotationCreateScreen`은 import되지 않는다. 더구나 잔존 RN API는
`POST /api/v1/quotations/mobile`과 `partnerId/productCode` 계약을 사용하지만 현재 서버 컨트롤러는
`POST /mobile/sales/quotations`과 `partnerCode/productId` 계약이다. 따라서 현 배포 소스 기준으로
이 네 번째 소비자는 실 GUI에서 발화되지 않는다. 그럼에도 서버 계산 자체는 모바일 입력 단가를
존중하는 방향으로 일반 견적과 같아졌으므로 R34 회귀가 아니다.

## 2. 화면 전개와 저장 경로

판매전표 화면의 실제 전개 요청은 다음 값이다.

```json
{"parentModelCode":"AC060CS6PBH1SY","quantity":1,"unitPrice":"1590000"}
```

`SlipLookupController`는 이를 그대로 `productClient.expand(model, qty, null, unitPrice)`로 보낸다.
화면에서 만들어진 구성행을 저장할 때는 각 행이 이미 SINGLE 제품이며 `parentSetModel`, `setHead`,
`bundleParentProductId`, `bundleParentUnitPrice`, `setOptions` 계보를 가진다. 따라서
`SlipService.addSlipLinesExpanded()`의 비-BUNDLE 분기에서 금액을 재전개하지 않고 그 구성행과 계보를
그대로 저장한다(`SlipService.java:173-198`). 화면 결과와 저장 결과 사이에 두 번째 가격 계산이 없다.

서버에 BUNDLE 부모를 직접 저장하는 별도 API 입력은 BUNDLE 분기에서 화면과 같은
`ProductClient.expand()`를 호출하며 `setOptions`와 `unitPrice`도 같은 인자 위치로 전달한다
(`SlipService.java:202-208`). 이 경로에서도 options 생략은 “옵션 기본값”만 뜻하고 입력 단가를
버린다는 뜻이 아니다.

R36 저장 원문의 `bundleParentUnitPrice":"1590000"`과 재오픈 구성행
`588,975 + 883,050 + 104,060 + 13,915 = 1,590,000`은 이 흐름과 일치한다.

## 3. 견적 경로

견적 생성·수정은 `EstimateService`의 같은 라인 생성 함수로 수렴하며
`productClient.expand(summary.modelCode(), quantity, opts, unitPrice)`를 호출한다
(`EstimateService.java:125-130`). 즉 전표와 전개 엔진은 같다.

데스크톱 `EstimateFormPage`는 BUNDLE 저장 시 `toApiBundleSetOptions()`로 options 5개를 갖춘 객체를
보낸다(`EstimateFormPage.tsx:1483-1501`). 따라서 정상 데스크톱 견적은 R34의
`options == null` 분기를 타지 않아 값이 바뀌지 않는다. API 호출자가 `setOptions`를 생략한 경우에는
R34 이후 요청 `unitPrice`가 반영되며, 이는 같은 입력의 일반 견적·전표와 답을 맞추는 변화다.

## 4. 부분 options와 기본값

생산 `ProductClient`는 options 객체가 있으면 다섯 필드를 모두 JSON에 넣는다
(`ProductClient.java:327-334`). 따라서 저장소 내 생산 호출자에는 `remoteOption`만 보내는 식의 부분
options 호출이 없다.

내부 endpoint를 직접 부분 호출하면 Jackson이 누락 문자열을 `null`, primitive boolean을 `false`로
만든다. 이는 R34 전후 동일하다. `panelShape360`의 endpoint 기본값은 options 전체 생략일 때
`"원형"`이고, 부분 객체에서는 `null`이다. 다만 활성 SINGLE_SET 271개 전수 배포본 비교에서 다음을
실측했다.

```text
TOTAL|271
PARTIAL_REMOTE_ONLY_DIFF_FROM_OMITTED|0
FULL_DEFAULTS_DIFF_FROM_OMITTED|0
```

즉 현재 활성 데이터에서는 `options={"remoteOption":""}` 부분 호출, options 전체 생략, 기본값 5개
명시 호출의 구성품과 단가가 모두 같았다. 부분 options로 인한 현재 실 사용자 결과 차이는 없다.

## 5. R29 `SINGLE_SET` 차단과 `pickedFilter`

`pickedFilter`는 발통·숨김자재를 제거하고 패널/리모컨/자재를 선별한 뒤
`redistribute()`가 실내기와 실외기 존재를 검사한다. 따라서 원천 구성표에 양쪽 본체가 있어도 분류
오염으로 본체가 패널·리모컨·자재·발통으로 선별 제거되는 셋째 가능성을 따로 셌다.

product DB의 실제 helper 조건을 SQL로 옮긴 읽기 결과:

```text
active_single_set_bundle|271
raw_missing_side|0
picked_missing_side|0
```

이어 활성 271개 각각에 실제 `delivery_price`를 명시 override로 넣어 배포된 내부 expand를 호출했다.

```text
TOTAL|271
OK|271
BLOCKED|0
```

따라서 현재 활성 SINGLE_SET 중 옵션 선별 뒤 본체 한쪽이 사라져 R29
`INVALID_INPUT`에 오차단되는 제품은 **0개**다. PM의 “271개 중 원천 한쪽 누락 0개”도 재현됐고,
그보다 뒤 단계인 picked 결과 0개까지 확인했다.

## 6. 실데이터 영향

활성 부모 문서와 활성 구성행에 `parent_set_model`이 있는 행을 읽었다.

```text
slip_component_rows|342
slip_documents|160
slip_bundle_groups(set_head)|145
estimate_component_rows|50
estimate_documents|28
estimate_bundle_groups(set_head)|22
```

상태별 원문:

```text
slip_status|COMPLETED|3문서|12행
slip_status|DRAFT|152문서|310행
slip_status|INSPECTING|1문서|4행
slip_status|SENT|4문서|16행
estimate_status|QUOTE_DRAFT|28문서|50행
```

옵션 문맥은 전표 구성행 `342행` 중 `44행`만 non-null이고 `298행`은 null이다. 견적 구성행 `50행`은
모두 null이다. 이는 과거 저장본 현황이며 R34가 갱신하는 대상이 아니다. 현재 저장된 188문서는
배포만으로 재계산·수정되지 않으므로 자동 금액 변경 건수는 **0건**이다. 새 전개 또는 BUNDLE 부모를
직접 다시 입력하는 미래 요청에서만 R34 계산이 적용된다.

## 7. 증거 무결성 — 제시 수치 재측정

측정 시각: `2026-08-06T20:20:18.8098226Z` (`2026-08-07 05:20:18 KST`).
배포된 `samhan-product-service`의 내부 expand를 읽기 호출했다.

```text
AC060CS6PBH1SY|override=1590000|options=omitted|rows=4
588975+883050+104060+13915=1590000

AC060CS6PBH1SY|override 없음|options=omitted|rows=4
616975+925050+104060+13915=1660000

AM360AXVGHC1SY|override 없음|options=omitted|rows=2
4418315+6403320=10821635
```

제시된 세 수치는 모두 재현됐다. 이미지 생성 시각은
`2026-08-06T19:49:39.311925729Z`, 컨테이너 생성 시각은
`2026-08-06T19:49:49.210650085Z`로, 제시된 `2026-08-06T19:49:49Z` 배포 식별 시각과 일치한다.
`/actuator/info`는 빈 객체를 반환하므로 이 시각은 Docker 이미지·컨테이너 메타데이터로 확인했다.

## 8. fix 지시서 — 결과 불변식만

이번 라운드에서 고칠 도달 결함은 없다. 추가 코드 변경은 지시하지 않는다. 이후 이 표면을 수정할 때는
다음 결과 불변식을 동시에 지켜야 한다.

1. `options` 생략은 옵션 5개의 기본값 적용만 뜻한다. 독립 필드인 `setUnitOverride`를 제거하거나
   product 기본가로 대체해서는 안 된다.
2. 같은 부모·수량·override에서 options 생략과 기본 options 명시는 같은 구성품·단가를 반환해야 한다.
3. 화면 전개, 직접 전표 저장, 견적 생성·수정은 같은 부모 modelCode·수량·options·override에 대해 같은
   `BundleExpander` 답을 사용해야 한다. 화면에서 확정한 부모 단가가 저장 경계에서 다시 카탈로그가로
   바뀌면 안 된다.
4. override가 없으면 기존 `delivery_price` 결과를 보존하고, 재배분하지 않는
   `COMMERCIAL_MULTI` 구성품 개별 단가도 바뀌면 안 된다.
5. 명시 override가 있는 SINGLE_SET은 `pickedFilter` 뒤 실내·실외 본체가 실제로 없는 경우에만
   `INVALID_INPUT`이어야 한다. 정상 양쪽 본체를 가진 제품을 옵션 선별 때문에 오차단하면 안 된다.
6. 기존 저장 문서는 배포만으로 재계산하거나 갱신하지 않는다.

## 9. 양방향 RED

### RED-A — 결함 재발 검출

- `options` 생략 + `setUnitOverride=1,590,000`인 AC060 결과 합이 `1,590,000`이 아니면 RED.
- 동일 입력의 `/slips/expand-line` 화면 결과와 BUNDLE 직접 저장 전개 결과가 다르면 RED.
- 데스크톱 견적 BUNDLE의 저장 전개가 동일 부모·수량·단가의 전표 전개와 다르면 RED.
- 활성 SINGLE_SET 271개 중 picked 후 실내·실외가 모두 있는데 명시 override 호출이
  `INVALID_INPUT`이면 RED.

### RED-B — 반대급부 보존

- override 없는 AC060 합이 `1,660,000`이 아니면 RED.
- override 없는 AM360AXVGHC1SY 합이 `10,821,635`가 아니거나 구성품 개별 단가가 바뀌면 RED.
- options 생략과 기본값 명시가 다른 구성품·단가를 반환하면 RED.
- SINGLE/KEEP 또는 이미 저장된 구성행이 R34 때문에 재계산·차단·자동 갱신되면 RED.
- 모바일 간소 견적을 서버 API로 호출했을 때 명시 입력 단가 대신 product 기본가가 저장되면 RED.

이번 HEAD에서 좁게 실행한 두 경계 단위 테스트는 `BUILD SUCCESSFUL in 6s`였다.

```text
ProductInternalControllerTest.expand_withoutOptions_preservesSetUnitOverride
ProductInternalControllerTest.expand_withoutSetUnitOverride_keepsNullOverride
```

## 이번 라운드가 보지 않은 것

- R28 FE 단가 전송, R29 내부 override 존중, R32 전환당 1회, R36 S-A~S-F는 이미 판정된 것으로
  재실행하지 않았다.
- 테스트 강도, 계약 게이트 완전성, 문서 표현, CI 범위 같은 검증 품질은 찾거나 판정하지 않았다.
- DB write, 라이브 컨테이너 write 요청, 컨테이너 재빌드·재기동, 전체 테스트 스위트는 수행하지 않았다.
- 현재 앱에서 진입 불가한 잔존 RN `SalesTabNavigator`의 화면 품질과 구버전 설치 앱의 실제 보급 현황은
  검증하지 않았다.
- 실제 사용자 옵션 조작 UI는 현재 판매전표 `SlipFormPage`에 노출되지 않으므로 별도 GUI 옵션 조작은
  수행하지 않았다. 부분 options는 허용된 내부 expand 조회로만 전수 비교했다.

## 신규 파일

- `docs/dev-reports/2026-08-07-1069-sol-r34-reconvergence.md`
