# PR #996 기능 회귀 검토 — S-04 shadow-only 2차 재수렴

- 검증일: 2026-07-31 KST
- 검증 대상 HEAD: `da132a04a72123a8728d4046252acf22fc1fde29`
- 역할: 기능 회귀 검토자(구현·코드 수정 없음)
- 제약 준수: Git 쓰기, Docker 이미지 재빌드, 백엔드 재기동, 공유 DB 쓰기 없음

## 1. 최종 판정 — **BLOCK**

| 머지 게이트 | 결과 | 근거 |
|---|---|---|
| ① 실 사용자 경로 재현 가능 오작동 0 | **실패** | 실제 order-app 로그인 직후 규칙 GET이 공유 gateway에서 **404 1/1**, 같은 PARTNER 신원으로 product-service 직결 시 **403 1/1**이었다. shadow 관측 상태는 `error 1/1`이다. |
| ② exact SHA CI green | 통과 | PR head와 로컬 HEAD가 모두 `da132a04...`; check-run **42/42 SUCCESS**, 실패·대기 0. |
| ③ 라이브QA 실서버 실행 | 실행함 | 실제 order-app `5223`과 공유 gateway `8080`·product-service `8084`를 사용했다. 다만 금지 조건에 따라 백엔드 이미지를 exact HEAD로 재빌드·재기동하지 않았다. |

독립적인 BLOCK 근거는 A-01 변경으로 거래처의 정상 shadow 관측 경로가 끊긴 점이다. 화면과 주문 준비는 legacy 경로로 계속 동작하지만, 이 PR이 표방한 관측 기능은 거래처 사용자에게 도달하지 않는다.

추가로, `legacyRef=S-03`만 가진 일반 규칙도 shadow-only로 오인되어 품목 상태·카테고리·구성품 무결성 검사에서 제외되는 도달 가능 경로가 남아 있다.

## 2. 문제 1 — 거래처 주문 화면의 shadow 관측이 100% 실패함

### 실 사용자 경로와 재현 절차

1. `clients/web/order-app`의 Vite 프로세스가 요청된 포트 `5223`과 이 워크트리에서 이미 실행 중임을 확인했다. 제공된 `src/main.ts`를 직접 조회해 `VITE_APP_VERSION=2026/07/31-1`과 `VITE_API_BASE_URL=http://localhost:8080/api/v1` 주입을 확인했다.
2. 실제 Chromium에서 `http://localhost:5223/`을 열고 공유 DB의 활성 거래처 `2118712345`를 사업자번호 입력란에 넣어 조회했다.
3. 실제 `GET /api/v1/auth/partner-status`는 **200**과 `NEED_PW_INPUT`을 반환했다.
4. 실제 로그인 POST는 세션·로그인 시도·최종 로그인 시각을 쓰므로 공유 DB 쓰기 금지에 따라 브라우저에서만 정상 서명된 개발용 PARTNER JWT 응답으로 대체했다. 로그인 UI의 비밀번호 입력과 `접속` 버튼, 이후 실제 post-login 코드는 그대로 실행했다.
5. 수량 규칙 GET은 mock하지 않았다. 앱이 실제로 다음 요청을 전송했다.

   ```text
   GET http://localhost:8080/api/v1/quantity-sync-rules
       ?estimateCategory=SINGLE_SET&page=0&size=50
   ```

### 관측된 잘못된 결과와 영향 수치

| 관측 항목 | 실측 |
|---|---:|
| order-app → 공유 gateway 규칙 GET | **404 1/1** |
| 같은 PARTNER 신원 → product-service 직결 | **403 1/1** |
| MASTER → product-service 직결 | **200 1/1**, 응답 `[]`, 규칙 0건 |
| 앱 shadow 상태 | `status=error` **1/1**, `Request failed with status code 404` |
| 사용자 화면 오류 문구 | **0건** |
| console-only 관측 실패 로그 | **1건** |
| 공유 DB 활성 규칙 | **0건** |
| 접근 가능한 활성 거래처 | `NEED_PW_INPUT` **2건** |
| 실제 UI로 실행한 거래처 | **1건** |
| SINGLE_SET 카탈로그 / 수량 입력 | **197행 / 195개** |
| 현 S-03 관련 카탈로그 | source 4행 + target 1행 = **5행** |
| 현재 잘못 계산된 주문 | 활성 규칙이 없어 **0건** |

실제 gateway의 404는 현재 실행 이미지에 quantity-sync route가 없는 상태다. HEAD 소스에는 route가 존재한다. 그러나 HEAD controller가 PARTNER self-service를 제거했고 product-service 직결이 403을 반환하므로, gateway를 HEAD로 올리면 404가 403으로 바뀔 뿐 거래처 관측은 복구되지 않는다.

### 화면 파손·주문 진행 여부

규칙 조회 실패 후에도 legacy 경로는 계속 동작했다.

1. `싱글중대형` 화면 진입: 성공 **1/1**.
2. `AC072BSCPBH2SY` 수량 1 입력: 성공 **1/1**.
3. 파생 펌프를 포함한 선택 배지: `선택 2건`.
4. `견적/주문하기`: `disabled=false`.
5. 미리보기 dialog: open, DOM 행 **5개**, `주문하기 disabled=false`.
6. 주문정보 화면 진입: 성공 **1/1**.

따라서 화면이 깨지거나 주문 준비가 막히지는 않는다. 잘못된 결과는 관측 기능만 조용히 포기해 설정과 legacy 수량을 비교할 수 없게 된 것이다. 브라우저가 발생시킨 로그 POST 3건은 모두 차단했고 최종 주문 발송은 실행하지 않았다.

### 243건 통과와 실제 호출의 관계

- 전체 `243/243`은 fresh 재현됐다.
- `samhanApi.fetchQuantitySyncRules` 테스트는 axios 전체를 mock하고 **200/OK 규칙 배열**을 주입한다: `clients/web/order-app/src/__tests__/samhanApi.test.ts:5-25`, `:62-90`.
- S-03 통합 테스트는 HTTP가 아니라 fixture와 legacy 하네스를 직접 실행한다: `clients/web/order-app/src/__tests__/quantitySyncS03Integration.test.ts:5-21`.
- 따라서 243건은 실제 PARTNER 403이나 공유 gateway 404를 실행하지 않는다. 수치 자체는 맞지만 라이브 관측 단절과 동시에 성립한다.

### 남은 가치 판정

관측 기능이 거래처에게 도달하지 않으므로 이 PR의 사용자 런타임 관측 가치는 현재 **0**이다. 남는 가치는 다음의 서버측 데이터 위생뿐이다.

- legacy와 다른 canonical S-03 저장 거부
- 이미 응답을 받은 클라이언트에서 잘못된 계수 선택 거부
- canonical S-03이 정상 품목 변경을 막지 않도록 하는 guard 예외

실제 주문 수량은 계속 하드코딩 legacy 경로가 결정하므로 주문 계산 회귀는 없지만, 설정 기반 수량과 legacy 결과를 비교한다는 shadow-only 목적은 수행되지 않는다.

### 파일:행 근거

- 정상 소비 호출: `clients/web/order-app/src/samhanApi.ts:188-190`
- 오류를 shadow state로 삼키는 경계: `clients/web/order-app/src/main.ts:61-78`
- console-only 처리와 로그인 직후 호출: `clients/web/order-app/index.html:5545-5557`, `:8548-8571`
- PARTNER self-service 제거: `services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java:40-46`
- HEAD gateway route: `services/api-gateway/src/main/resources/application.yml:387-393`

## 3. 두 번째 각도 — 새 S-03 저장 검증의 정당성

### 판정

현 명세의 canonical S-03은 이름/모델에 `실링`인 싱글세트 수량 합계에 펌프를 **×1**로 붙이는 규칙이다. target도 하나다: `docs/superpowers/specs/2026-07-27-896-survey.md:79`, `:855-860`.

따라서 현재 계약에서 `factor × multiplier != 1`이면서 정당한 canonical S-03은 발견하지 못했다. 소수 표현도 `0.5 × 2 = 1`이면 허용되므로 단순히 factor가 1이 아니라는 이유로 거부하지 않는다.

### 실 DB 전수 조회

| 항목 | 건수 |
|---|---:|
| 전체 규칙 | 0 |
| 비삭제 규칙 | 0 |
| 활성 규칙 | 0 |
| 활성 S-03(`ruleKey` 또는 `legacyRef`) | 0 |
| 새 validator 불통과 기존 활성 S-03 | **0** |

따라서 지금 수정·교체가 막히는 기존 행은 **0건**이다. 만약 불일치 행이 있었다면 동일한 잘못된 계수를 유지한 PUT은 거부되지만, parity 값으로 교정하는 PUT이나 soft-delete는 가능하다.

### fresh 저장 검증

`QuantitySyncRuleSurfaceFixIT`의 실제 MockMvc POST가 `.28 × 25`를 보내고 **400 1건**, 본문 `legacy`, 저장 **0건**을 단정한다. 이번 전체 재실행에서 해당 testcase를 포함한 SurfaceFixIT `3/3`이 통과했다.

파일 근거:

- POST/PUT 저장 전 validator 호출: `QuantitySyncRuleService.java:265-310`
- target 하나와 모든 source의 parity 검사: `QuantitySyncRuleValidator.java:491-504`
- 400·저장 0 단정: `QuantitySyncRuleSurfaceFixIT.java:91-115`

## 4. 문제 2 — `legacyRef=S-03` 일반 규칙이 무결성 guard에서 제외됨

### 실 사용자 경로

관리자가 다음처럼 canonical key가 아닌 일반 규칙을 등록할 수 있다.

```text
ruleKey=GENERIC_S03_REF_BYPASS
legacyRef=S-03
enabled=true
estimateCategory=SINGLE_SET
source factor=1
target multiplier=1
target 1개
```

`legacyRef`에는 nonblank·길이 제한만 있고 `ruleKey`와의 결속 검사가 없다. parity가 1이면 validator도 통과한다. 이후 품목 관리자가 source/target을 단종·비노출·카테고리 제외하거나, BUNDLE source에 target을 구성품으로 추가하면 일반 enabled 규칙은 409 보호 대상이어야 한다. 그러나 `legacyRef=S-03` OR 비교 때문에 shadow-only로 오인되어 guard 후보 **1건이 0건**으로 줄어든다.

### 실 DB에서 확인한 도달 조합

- 상태·카테고리 경로의 활성·노출·비-BUNDLE source/target 순서쌍:
  - COMMERCIAL_MULTI **112,560**
  - HOME_MULTI **14,280**
  - SINGLE_SET **272**
  - 합계 **127,112쌍**
- BUNDLE source에 현재 구성품이 아닌 활성·노출 SINGLE target을 추가할 수 있는 조합:
  - COMMERCIAL_MULTI **24,055**
  - HOME_MULTI **120**
  - SINGLE_SET **4,415**
  - 합계 **28,590쌍**

구체적인 SINGLE_SET 조합도 존재한다.

- 상태·카테고리: `AIM-A01N` → `SI-AL700a`
- 구성품: BUNDLE `AC072BSCPBH2SY` → `SI-AL700a`

두 품목은 현재 활성·노출·SINGLE_SET이고 서로 다르다. `SI-AL700a`는 현재 `AC072BSCPBH2SY`의 구성품 5개에 포함되지 않는다. 따라서 일반 ruleKey + `legacyRef=S-03` + `1×1` 요청은 현재 그래프 조건을 만족하지만, 생성 후 품목 무결성을 깨는 쓰기에서 보호 대상이 사라진다.

공유 DB 쓰기 금지 때문에 이 조합을 실제 POST한 뒤 후속 PATCH/구성품 PUT까지 실행하지는 않았다. 위 수치는 공유 DB read-only 전수 조회와 exact HEAD의 요청 DTO→서비스→validator→guard 코드 경로로 확인한 도달 범위다.

### 파일:행 근거

- 임의 `legacyRef` 입력: `QuantitySyncRuleRequest.java:28-40`
- POST/PUT identity 결속 없이 저장: `QuantitySyncRuleService.java:265-310`
- validator의 `ruleKey OR legacyRef` S-03 판별: `QuantitySyncRuleValidator.java:466-504`
- 상태·카테고리 guard 예외: `QuantitySyncRuleService.java:177-197`
- BUNDLE 구성품 guard 예외: `QuantitySyncRuleService.java:211-239`
- 예외 OR 본문: `QuantitySyncRuleService.java:248-250`
- 실제 품목 guard 호출: `ProductService.java:741-755`
- 실제 구성품 guard 호출: `BundleComponentService.java:743-750`
- order-app은 canonical ruleKey가 정확히 하나여야 선택: `clients/web/order-app/src/quantitySync.ts:105-116`

즉 ref-only 일반 규칙은 order-app에서는 canonical S-03으로 채택되지 않지만, 무결성 guard에서만 S-03 예외가 된다.

## 5. 변경 9파일 전수

`git show --numstat da132a04a`의 9파일을 모두 확인했다.

| 파일 | 변경이 연 표면과 판정 |
|---|---|
| `clients/web/order-app/src/__tests__/quantitySyncS03.test.ts:132-149` | 불일치 계수를 selection error로 바꾼 테스트 표면. 실제 HTTP는 실행하지 않는다. |
| `clients/web/order-app/src/quantitySync.ts:153-165` | 응답을 받은 뒤 factor×multiplier parity를 검사한다. PARTNER 403/실 gateway 404에서는 규칙 데이터가 여기까지 오지 않는다. |
| `docs/dev-reports/2026-07-31-896-s4-r-rule-surface-fix.md` | 변경 보고서. 원문 수치 재현 결과는 §6에 기록했다. |
| `QuantitySyncRuleValidator.java:242,484-504` | canonical S-03 저장 parity를 보강했다. 동시에 `ruleKey OR legacyRef` identity 혼동을 사용한다. |
| `QuantitySyncRuleService.java:177-250` | 상태·카테고리·BUNDLE 구성품 guard에서 shadow 규칙을 제외한다. ref-only 일반 규칙도 함께 제외된다. |
| `QuantitySyncRuleController.java:40-46` | 전역 목록의 PARTNER self-service를 제거해 order-app 정상 GET을 거부한다. |
| `QuantitySyncRuleControllerPermissionTest.java:11-21` | annotation의 PARTNER false를 고정하는 테스트 표면. |
| `QuantitySyncRuleSurfaceFixIT.java:91-163` | 격리 DB에서 R-01 400, canonical R-02 PATCH 200, A-01 PARTNER 403을 고정한다. ref-only 일반 규칙 조합은 포함하지 않는다. |
| `QuantitySyncRuleValidationTest.java:148-169` | `.28×25` legacy 불일치 단위 검증을 추가한다. |

## 6. 보고서 수치 fresh 재현

| 원문 주장 | 재현 명령/근거 | 결과 |
|---|---|---|
| product-service 621 | `./gradlew :services:product-service:test --rerun-tasks --no-build-cache --no-daemon` 후 JUnit XML 61개 합산 | **621/621**, failures/errors/skipped 0, `BUILD SUCCESSFUL in 3m 7s` |
| order-app 243 | `npm test` | **243/243**, 20 files, exit 0 |
| order-app typecheck | `npm run typecheck` | exit 0 |
| shadow 60/60 | `node scripts/quantity-sync-s03-shadow.mjs` | resultCount **60**, quantity/subtotal/payload 모두 true |
| 400 1건 | SurfaceFixIT R-01 | **400 1/1**, `legacy`, 저장 0 |
| exact SHA CI | GitHub check-runs | **42/42 SUCCESS**, 비성공 0 |

요청된 `621건`·`243건`·`60/60`·`400 1건`은 모두 원문과 일치했다.

## 7. 이 라운드가 보지 않은 것

- 실제 partner-login POST는 공유 DB 쓰기를 피하려고 실행하지 않았다. 실제 로그인 UI는 사용했지만 성공 응답만 정상 서명 개발 JWT로 대체했다.
- exact HEAD의 gateway/product-service 이미지를 재빌드·재기동하지 않았다. 따라서 exact HEAD 전체 배포 스택의 end-to-end는 보지 않았다.
- ref-only 일반 규칙을 실제 API로 저장한 뒤 상태 PATCH·단종·삭제·구성품 PUT을 실행하지 않았다. 공유 DB 쓰기 금지 때문에 read-only 데이터 조합과 exact HEAD 코드 경로까지만 확인했다.
- 주문정보 화면 이후 주소 입력·전송목록·최종 주문 발송은 보지 않았다.
- C-01 soft-delete 거래처 잔존과 C-02 세션 토큰 문제는 이번 9파일 변경면 밖이라 재검증하지 않았다.
- staging/production DB와 배포 환경은 보지 않았다.
- 내장 브라우저는 사용 가능 항목이 0개였다. 저장소에 설치된 실제 Playwright Chromium을 headless로 실행하고 주문정보 화면을 이미지로 직접 확인했다.

## 8. 종료 상태

- 공유 `product_db` 재확인: 규칙 전체/활성/S-03/검증 불통과 행 모두 0건.
- 브라우저의 쓰기 요청 3건은 모두 차단했고 공유 DB 쓰기는 수행하지 않았다.
- Docker 이미지 재빌드·백엔드 서비스 재기동 없음.
- Git add/commit/push/checkout/stash 등 Git 쓰기 없음.
- 5223 Vite 프로세스는 이 검토 시작 전부터 같은 워크트리에서 실행 중이었으므로 종료하지 않고 그대로 두었다.
