# GAS 전수조사 — mobile 범위 (legacyOrderSource/Shim + legacyEstimateSource/Shim)

> 배정 범위: `clients/mobile/src/webview/legacyOrderSource.ts` + `legacyOrderShim.ts` +
> `clients/mobile-staff/src/webview/legacyEstimateSource.ts` + `legacyEstimateShim.ts` 전체.
> 분모 = `docs/dev-reports/2026-08-10-gas-function-inventory.md` 의 해당 4개 파일 절.
> 코드/테스트/스키마 변경 없음 · git 조작 없음. 읽기 전용 조사.

## 0. 완결성 집계 (assigned = classified)

| 파일 | 인벤토리 헤더 함수수 | 실제 나열 항목수 | 분류 완료 |
|---|---:|---:|---:|
| `clients/mobile/src/webview/legacyOrderSource.ts` | 6 | 6 | 6 |
| `clients/mobile/src/webview/legacyOrderShim.ts` | 8 | 8 | 8 |
| `clients/mobile-staff/src/webview/legacyEstimateSource.ts` | 6 | 6 | 6 |
| `clients/mobile-staff/src/webview/legacyEstimateShim.ts` | 8 | 8 | 8 |
| **합계** | **28** | **28** | **28** |

**assigned_count = 28**, **classified_count = 28** (일치).

4분류 합계:
| 분류 | 건수 |
|---|---:|
| business_rule | 0 |
| ui_only | 0 |
| infra_util | 16 |
| dead_code | 12 |
| **합계** | **28** |

**핵심 결론 — 이 범위에는 이식 대상 GAS 업무규칙(가격/할인/수량/분류)이 0건이다.**
4개 파일 전부 RN(React Native) 쪽 **WebView 호스팅 인프라**(진입 URL 결정 + 주입 JS shim)이며,
실제 견적/주문 GAS 로직(가격 계산·수량 동기화·분류·할인)은 그 WebView 가 그대로 embed 하는
`clients/web/estimate-app/**` 와 `clients/web/order-app/**` 안에 있다(다른 에이전트 배정 범위).
이 4개 파일 자체는 "구글 시트 컬럼을 읽어 값을 만드는" GAS 함수가 아니라, **우리 팀이 RN 용으로 새로
작성한 코드**이므로 스키마 이식 대상 자체가 없다.

## 1. 전수 분류표

### `clients/mobile/src/webview/legacyOrderSource.ts` (116줄)

| 줄 | 식별자 | 분류 |
|---:|---|---|
| 59 | `resolveBaseUrl(devOverride)` | infra_util |
| 62 | (59 내부) `const proc = ...process...` — env 접근 서브구문 | infra_util |
| 75 | `getLegacyOrderUri(opts)` | infra_util |
| 84 | `getOrderAppUrl()` | infra_util |
| 99 | `validateOrderAppUrl()` | dead_code |
| 101 | (99 내부) `const proc = ...` | dead_code |

### `clients/mobile/src/webview/legacyOrderShim.ts` (224줄)

| 줄 | 식별자 | 분류 |
|---:|---|---|
| 51 | `getInjectedOrderShim(config)` | infra_util |
| 69 | (51 내부, 주입 JS 안) `postToRN(type, payload)` | infra_util |
| 79 | (51 내부) `__SAMHAN_BRIDGE__.setAuth(next)` | dead_code |
| 83 | (51 내부) `__SAMHAN_BRIDGE__.handle(_msg)` — no-op stub | dead_code |
| 84 | (51 내부) `__SAMHAN_BRIDGE__.log(label, payload)` | dead_code |
| 167 | `setOrderAuthScript(next)` | dead_code |
| 191 | `buildOrderShim()` | infra_util |
| 193 | (191 내부) `const proc = ...` | infra_util |

### `clients/mobile-staff/src/webview/legacyEstimateSource.ts` (106줄)

| 줄 | 식별자 | 분류 |
|---:|---|---|
| 42 | `resolveBaseUrl(devOverride)` | infra_util |
| 45 | (42 내부) `const proc = ...` | infra_util |
| 59 | `getLegacyEstimateUri(opts)` | infra_util |
| 73 | `getEstimateAppUrl()` | infra_util |
| 89 | `validateEstimateAppUrl()` | dead_code |
| 91 | (89 내부) `const proc = ...` | dead_code |

### `clients/mobile-staff/src/webview/legacyEstimateShim.ts` (228줄)

| 줄 | 식별자 | 분류 |
|---:|---|---|
| 53 | `getInjectedEstimateShim(config)` | infra_util |
| 73 | (53 내부, 주입 JS 안) `postToRN(type, payload)` | infra_util |
| 83 | (53 내부) `__SAMHAN_BRIDGE__.setAuth(next)` | dead_code |
| 87 | (53 내부) `__SAMHAN_BRIDGE__.handle(_msg)` — no-op stub | dead_code |
| 88 | (53 내부) `__SAMHAN_BRIDGE__.log(label, payload)` | dead_code |
| 170 | `setEstimateAuthScript(next)` | dead_code |
| 195 | `buildShim()` | infra_util |
| 197 | (195 내부) `const proc = ...` | infra_util |

## 2. business_rule 상세

**해당 없음 (0건).** 4개 파일 전부 스크립트 진입 URL 선택(dev/prod/env override) 과
WebView 주입 JS(fetch monkey-patch 로 인증 헤더 첨부 + RN↔WebView postMessage 브릿지 + viewport
meta 태그/모바일모드 안전망) 만 담당한다. 구글 시트 컬럼, 품목 속성, 가격/할인율/수량 리터럴을
읽거나 계산하는 코드가 전무하다 — 그런 로직은 이 파일들이 embed 하는 `clients/web/estimate-app`
(`views/index.ejs` 642개 함수 + `lib/code.js` 171개 함수) 와 `clients/web/order-app` 안에 있으며
그쪽은 별도 에이전트 배정 범위다.

참고로 `getLegacyEstimateUri` 가 `?email=...` 쿼리스트링을 조건부로 붙이는 로직이 있으나 이는
"인증 식별자 전달 방식"이지 견적/주문 업무규칙(가격·수량·분류)이 아니라서 infra_util 로 분류했다.

## 3. infra_util 상세 (16건)

이식 대상 없음 — RN 앱이 자체적으로 만든 WebView 호스팅 배선이다. 요약:

| 항목 | 역할 |
|---|---|
| `resolveBaseUrl` ×2(order/estimate) + 내부 `const proc` | `EXPO_PUBLIC_ORDER_APP_URL`/`EXPO_PUBLIC_ESTIMATE_APP_URL` env override → `__DEV__` 분기(dev `localhost:4173`/`localhost:5183` · prod `order.samhan-air.com`/`estimate.samhan-air.com`) |
| `getLegacyOrderUri`/`getLegacyEstimateUri` | 위 base URL 반환(+estimate 는 `?email=` 옵션 부착) |
| `getOrderAppUrl`/`getEstimateAppUrl` | 무인자 wrapper — 화면(`MobileOrderWebViewScreen.tsx`/`EstimateWebViewScreen.tsx`)에서 직접 호출 확인 |
| `getInjectedOrderShim`/`getInjectedEstimateShim` | WebView 주입 JS 문자열 생성 — `window.fetch` monkey-patch(`/rpc/`, `/api/v1/` 요청에 `Authorization`/`X-Samhan-Partner`(주문) 또는 `X-Samhan-Staff`(견적) 헤더 첨부), `postToRN` 정의, viewport/mobile-mode 안전망 |
| `postToRN` ×2 | `window.ReactNativeWebView.postMessage` 래퍼 — `rpc-missing`/`rpc-error`/`legacy-loaded`/`shim-installed` 이벤트 전송. RN 쪽 `handleMessage` 가 `rpc-error`/`rpc-missing` 을 콘솔 경고로 소비(실사용 확인) |
| `buildOrderShim`/`buildShim` + 내부 `const proc` | `EXPO_PUBLIC_API_BASE_URL` env → default(`localhost:8080`/`api.samhan-air.com`) 로 `apiBaseUrl` 결정 후 `getInjected*Shim` 호출 — 화면에서 직접 호출 확인 |

## 4. dead_code 상세 (12건) — 호출부 grep 근거

경고에 따라 **전수 grep 명령과 결과**를 남긴다. 대상은 두 그룹:

**A. `validateOrderAppUrl` / `validateEstimateAppUrl`** (각 함수 + 내부 `const proc` 서브구문, 총 4건)

```
grep -rn "validate(Order|Estimate)AppUrl" C:\dev\Samhan-Public
→ clients\mobile\src\webview\legacyOrderSource.ts:99  (정의 자신)
→ clients\mobile-staff\src\webview\legacyEstimateSource.ts:89  (정의 자신)
→ docs\dev-reports\2026-08-10-gas-function-inventory.md (인벤토리 문서, 정의 인용)
```
전체 저장소(`clients/`, `docs/` 포함) 를 대상으로 검색했으나 **정의 자신과 인벤토리 문서 인용 외
호출부가 0건**. `MobileOrderWebViewScreen.tsx`/`EstimateWebViewScreen.tsx` 를 직접 읽어 import 목록을
확인했고(각각 `getOrderAppUrl`/`buildOrderShim`, `getEstimateAppUrl`/`buildShim` 만 import), 두 앱의
`src/webview/` 디렉터리에는 테스트 파일이 없음을 `find` 로 확인(`clients/mobile/src/webview` ·
`clients/mobile-staff/src/webview` 디렉터리 listing = 소스 파일 2개씩만 존재). e2e/detox 디렉터리도
`find clients/mobile -iname "*e2e*" -o -iname "*detox*"` / 동일 mobile-staff 커맨드로 확인 — 0건.

**B. `__SAMHAN_BRIDGE__` 오브젝트 (setAuth/handle/log) + 이를 호출하는 `setOrderAuthScript`/`setEstimateAuthScript`** (각 파일당 4건 × 2파일 = 8건)

```
grep -rn "__SAMHAN_BRIDGE__" C:\dev\Samhan-Public\clients
→ legacyOrderShim.ts:78   (정의: window.__SAMHAN_BRIDGE__ = {...})
→ legacyOrderShim.ts:176-177  (setOrderAuthScript 자신이 생성하는 문자열 안에서 호출)
→ legacyEstimateShim.ts:82   (정의)
→ legacyEstimateShim.ts:180-181  (setEstimateAuthScript 자신이 생성하는 문자열 안에서 호출)
```
즉 `__SAMHAN_BRIDGE__.setAuth` 를 실제로 호출하는 코드는 **`setOrderAuthScript`/`setEstimateAuthScript`
자기 자신이 만드는 문자열뿐**이고, 그 두 함수 자체를 호출하는 곳이 없으면 `setAuth` 도 함께 죽는다.

```
grep -rn "setOrderAuthScript|setEstimateAuthScript" C:\dev\Samhan-Public\clients
→ legacyOrderShim.ts:167 (정의)
→ legacyEstimateShim.ts:10 (주석 — "v2 RN 에서는 호출하지 않음")
→ legacyEstimateShim.ts:170 (정의)
→ clients\mobile-staff\README.md:188 (주석 — "SSO 통합 시 shim 의 setEstimateAuthScript 부활 가능성")
```
`MobileOrderWebViewScreen.tsx`/`EstimateWebViewScreen.tsx` 전문을 읽어 import 목록에
`setOrderAuthScript`/`setEstimateAuthScript` 가 없음을 확인(두 화면 모두 `buildOrderShim`/`buildShim` 과
`getOrderAppUrl`/`getEstimateAppUrl` 만 import). 두 파일의 주석 자체가 "v4/v2 default 흐름에서는 호출
없음"·"후속 SSO/push notification 통합 시 부활 가능"이라고 명시 — **설계상 의도된 미배선 확장 지점**이지
우발적 누락이 아니다.

`handle`(no-op stub) 역시 RN → WebView 방향 명령을 받는 자리인데, RN 쪽에서
`webViewRef.current.injectJavaScript(...)` 를 호출하는 곳이 있는지 확인:

```
grep -rn "injectJavaScript" C:\dev\Samhan-Public\clients\mobile\src
→ 0건
grep -rn "injectJavaScript" C:\dev\Samhan-Public\clients\mobile-staff\src
→ 0건
```
추가로 `clients/web/**` (legacy WebView 안에서 로드되는 실제 페이지, 다른 에이전트 배정 범위지만
호출부 판정을 위해 조회만 함) 에 `__SAMHAN_BRIDGE__`/`ReactNativeWebView` 참조가 있는지 확인:

```
grep -rn "__SAMHAN_BRIDGE__|__SAMHAN_AUTH__|__SAMHAN_..._SHIM_INSTALLED__" C:\dev\Samhan-Public\clients\web
→ 0건
grep -rn "ReactNativeWebView" C:\dev\Samhan-Public\clients\web
→ 0건
```
즉 legacy 웹페이지도 RN 쪽으로 `postMessage` 요청을 보내 브릿지를 트리거하는 코드가 없다.
**양방향 모두에서 `__SAMHAN_BRIDGE__.setAuth`/`.handle`/`.log` 를 실제로 호출하는 경로가 없다** —
`postToRN`(직접 4곳에서 호출·RN 쪽 `handleMessage` 가 소비, §3 참조)과는 대조적이다.

이 12건은 전부 **업무규칙이 아니라 향후 RN 인증/SSO 확장을 위해 미리 만들어 둔 배선**이며, 삭제해도
견적/주문 업무 로직(가격·할인·수량·분류)에는 영향이 없다. dead_code 로 분류했으나 코드 자체를
삭제하라는 권고는 아니다(문서화된 확장 지점 — 판단은 개발책임자/구현 담당 몫).

## 5. 견적품목 기본값 스키마 이식표

**해당 없음.** 이 범위에 business_rule 이 0건이므로 `products`/`classification`/
`quantity_sync_rule`/`bundle_component` 등 스키마에 이식할 상수·모델코드·조건표가 없다.

## 6. decisions_needed

없음 — 자동으로 정할 수 없는 기본값 자체가 발생하지 않았다(업무규칙이 없으므로).
