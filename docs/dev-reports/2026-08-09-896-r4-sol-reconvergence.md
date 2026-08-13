# PR #1126 R4 적대검증 재수렴 — SOL 5.6

일시: 2026-08-09 KST  
질문: **실 사용자 경로로 재현 가능한 R3 표면 결함이 있는가**  
결론: **있다 — 1건.** 홈멀티 `리모컨 제외` 옵션이 서버 수량 동기화 규칙에 의해 무시되어
`AWR-WE13N` 수량이 0이 아니라 2로 되살아난다.

## 0. 환경 확인

| 항목 | 실측 |
|---|---|
| 워크트리 | `C:\dev\Samhan-Public\.claude\worktrees\t1126` |
| 브랜치 | `feat/896-qty-sync-chip-track` — 요청 라벨과 일치 |
| Git HEAD | `03e0c34cdb44fad820a113f7f7bf90678c54f8d7` |
| 종합견적서 | `http://127.0.0.1:5317`, 실제 Node/EJS 앱 HTTP 200 |
| product-service | `127.0.0.1:8084`, `samhan-product-service`, healthy. 이미지 revision label은 없지만 2026-08-09 21:46 KST 생성된 `codex-t1126-product:local`이며 R3 신규 경로가 200, 떠난 경로가 500이라 R3 route fix 포함은 실호출로 확인 |
| R3 partner-order-service | `127.0.0.1:28088`, 현재 워크트리에서 `bootJar`한 뒤 격리 기동, container revision=`03e0c34cdb44fad820a113f7f7bf90678c54f8d7`, healthy |
| order-app 소비자 | `127.0.0.1:5320`, `VITE_API_BASE_URL=/api/v1`; same-origin Vite proxy가 bootstrap 한 경로만 실제 `28088`로 전달 |
| 격리 | QA partner-order의 Redis는 전용 컨테이너 사용. 공유 DB는 SELECT 성격의 서비스 조회만 수행했고 INSERT/UPDATE/DELETE 없음 |

기존 `samhan-partner-order-service:18088`은 2026-08-08 04:54 KST 생성 이미지라 R3 fallback code가
없었다. 따라서 그 배포본 수치를 R4 판정에 쓰지 않고, HEAD bootJar를 별도 28088에 기동했다.

mock 여부를 네트워크로 확인했다.

```text
order-app source network: VITE_API_BASE_URL=/api/v1
GET http://127.0.0.1:5320/api/v1/partner-orders/bootstrap
  -> same-origin proxy -> http://127.0.0.1:28088
  -> partner-order-service actual EstimateCatalogClient
  -> product-service actual /products/internal/estimate-catalog/*

GET http://127.0.0.1:8084/products/internal/estimate-catalog/quantity-sync-rules
  -> samhan-product-service actual HTTP response
```

Playwright route interception과 응답 mock은 사용하지 않았다.

## 1. 도달 결함 — `리모컨 제외`가 서버 규칙에 의해 무시됨

### 재현 절차

1. 실제 종합견적서 `5317/?email=dev_master%40samhan-air.com` 진입.
2. 홈멀티 화면에서 리모컨 옵션을 `제외`로 선택.
3. 실내기 `AM052BN6PBH1` 수량을 2로 입력하고 blur.
4. 실제 `AWR-WE13N` 행의 수량·금액을 읽음.

Playwright 원문:

```text
[R4 option=제외] AM052BN6PBH1=2 AWR-WE13N=2

Error: 리모컨 제외 옵션이면 AWR-WE13N 수량은 0이어야 한다
Expected: "0"
Received: "2"
```

화면 원문:

```text
옵션: 리모컨 = 제외
AWR-WE13N | 유선(통합) | 수량 2 | 단가 45,375 | 소계 90,750
```

캡처:

- `docs/qa/2026-08-09-896-r4/04-excluded-option.png`
- `docs/qa/2026-08-09-896-r4/04-excluded-AWR-WE13N-row.png`

### 파일:줄과 원인

- 옵션 계약: `clients/web/estimate-app/views/index.ejs:7804-7806`
  - 홈 리모컨 선택지는 `기본 / 유선 / 컬러 / 제외`다.
- 서버 규칙 적용: 같은 파일 `:8335-8356`
  - evaluator 입력은 규칙·카탈로그·수량뿐이고 `#home_remote` 값은 전달하지 않는다.
- 조기 종료: 같은 파일 `:8360-8368`
  - 서버 evaluator가 Map을 반환하면 즉시 return해 아래 legacy 옵션 계산으로 내려가지 않는다.
- 실제 제외 분기: 같은 파일 `:8227-8254`
  - legacy `recomputeHomeRemotes()`는 `opt === '제외'`이면 리모컨을 추가하지 않는다.

즉 R3가 복구한 서버 규칙 도달 자체는 기본값 외 조합에서도 살아 있다. 그러나 규칙의 `when={}`가
옵션을 모르는 채 모든 target을 강제하고, 성공 시 legacy 옵션 계산을 건너뛰므로 `제외` 계약을 깨뜨린다.

### 실 데이터 영향 건수

- 라이브 enabled 규칙: 1건 (`UI_HOME_MULTI_AM052BN6PBH1`)
- source: 1개 (`AM052BN6PBH1`), target: 3개
- 이번 실표본의 잘못 추가된 품목: 1개 (`AWR-WE13N`)
- 잘못 추가된 수량/금액: 2개 / **90,750원**
- 저장된 견적 이력 전체 영향 건수는 공유 DB write 금지 및 종합견적서 비저장 경로라 산출하지 않았다.

기본·유선·컬러에서도 직접 재현한 값은 모두 `AWR-WE13N=2`였다. 컬러의 대체 모델 정합성은 이번
단일 질문보다 넓혀 세지 않았고, 확정 결함은 기대값이 명백한 `제외` 1건만 집계했다.

## 2. ① endpoint 이동 표면

### 인증·필터·예외·CORS·트랜잭션

실 HTTP 원문:

```text
NEW + token 없음  -> HTTP 401
{"success":false,"code":"UNAUTHORIZED","message":"내부 인증 토큰이 유효하지 않습니다"}

NEW + wrong token -> HTTP 401
{"success":false,"code":"UNAUTHORIZED","message":"내부 인증 토큰이 유효하지 않습니다"}

NEW + valid token -> HTTP 200, rule 1건, target 3건
OLD + valid token -> HTTP 500
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,...}

OPTIONS NEW token 없음 -> HTTP 401
OPTIONS OLD token 없음 -> HTTP 401
```

두 controller base는 각각 `ProductInternalController.java:51`의 `/products/internal`,
`EstimateCatalogInternalController.java:65-67`의 `/products/internal/estimate-catalog`라 모두 같은
`/products/internal/` prefix다. 실제 filter는
`shared/security/src/main/java/com/samhanair/logis/security/InternalTokenFilter.java:48-76`에서 URI prefix와
`X-Internal-Token`을 동일하게 검사한다. 두 method 모두 controller-local `@CrossOrigin`과
`@Transactional`이 없고 같은 서비스의 `GlobalExceptionHandler`를 통과한다. 이동으로 조용히 열리거나
막힌 인증/CORS/트랜잭션 차이는 재현되지 않았다.

응답 shape도 이동 전과 같은 `ApiResponse<List<QuantitySyncRuleResponse>>`이며, 현재 method는
`EstimateCatalogInternalController.java:361-367`에 있다. 라이브 응답은 `success/code/message/data/timestamp`
envelope 안에 기존 rule/source/target DTO를 그대로 반환했다.

### 떠난 자리 호출자 전수

검색 범위: repo 전체 hidden 포함, `node_modules`·`build`·금지 경로 `tools/legacy-gas/**` 제외.

| 범주 | `/products/internal/quantity-sync-rules` 실 호출자 | 근거/실측 |
|---|---:|---|
| estimate-app | 0 | `db-catalog.js:34,52-53`은 base `/products/internal/estimate-catalog` + suffix `/quantity-sync-rules` |
| gateway route | 0 | 사용자 API `/api/v1/quantity-sync-rules`는 별도 route/controller |
| 다른 서비스 client/Feign | 0 | exact literal 0건 |
| scripts/fixtures/curl | 0 | 실행 스크립트 exact literal 0건 |
| 문서 | 실행 호출 0, 역사 원문 4 | `2026-08-09-896-bootstrap-500-diagnosis.md:11,68,380,389`의 R2/R3 전 진단 기록 |

떠난 자리에는 valid internal token으로 직접 호출했고 위 원문처럼 500이었다. 따라서 죽은 경로를 실제로
부르는 잔존 소비자는 없으며, 문서 4건은 당시 500을 보존한 역사 증거라 현재 curl 안내가 아니다.

## 3. ② 카테고리별 fallback과 키 누락 소비자 반응

### 제시 전제와 다른 셋째 가능성

**최종 bootstrap payload에서는 키가 빠지지 않는다.** R3가 키를 생략하는 대상은 내부
`productCatalogCache`용 Map이다. `BootstrapService.java:201-223`은 최종 응답을 만들 때 18개 `CACHE_KEYS`를
전부 순회하고, product key가 없으면 sheet, 그다음 V2 seed/default로 반드시 다시 넣는다.
default도 같은 파일 `:226-233`에서 Map 또는 빈 List를 만든다.

자연 실패 표본은 지시된 `OUT_OF_STOCK` 잔재를 사용했다. 이것은 #1133 소관으로 결함 수에 넣지 않았다.

```text
category=COMMERCIAL_MULTI -> product-service 500, null fallback
category=SINGLE_SET -> product-service 500, null fallback
category=SINGLE_SET components -> product-service 500, null fallback
category=COMMERCIAL_MULTI components -> product-service 500, null fallback
product_db cache keys=[homemulti, homeInc, singleMatPrices, oldProducts, priceChangeSchedule]
```

현재 HEAD 28088 응답 원문 실측:

```text
HTTP 200
payload key count=18
homemulti=121
oldProducts=40
commercialMulti=0
singleSets=0
homeInc present=true
commInc present=true
singleInc present=true
```

따라서 성공한 HOME_MULTI 121건과 LEGACY 40건은 살아남았다. 실패한 원본 키도 소비자 응답에서는 빈
fallback으로 존재하고, 파생 키도 짝을 맞춰 존재한다. 원본만 빠지고 파생만 남는 shape는 발생하지 않았다.

실제 order-app Playwright 원문:

```text
[R4 order-app bootstrap 실측]
{"keys":["homemulti","singleSets","singleParts","homeDefaults","singleDefaults",
"singleMatPrices","commercialMulti","commercialParts","oldProducts","homeInc","commInc",
"singleInc","singlePartsInc","commPartsInc","specDetailMap","config","logoData",
"priceChangeSchedule"],"homemulti":121,"commercialMulti":0,"singleSets":0,
"homeIncPresent":true,"commIncPresent":true,"singleIncPresent":true}

1 passed (2.7s)
pageerror=[]
bootstrap console error=[]
```

캡처: `docs/qa/2026-08-09-896-r4/05-order-app-partial-fallback-consumed.png`.

결론: “키 누락 → client undefined/crash/조용한 0” 표면은 최종 REST 계약에서 생성되지 않는다.
빈 배열로 0행이 되는 것은 기존 sheet/V2 완전 fallback의 명시 동작이며, 부분 실패에서도 HOME 121건까지
0으로 버리던 R2 증상은 현재 HEAD에서 재현되지 않았다.

## 4. ③ R3 리모컨 근거 재검증

R3 보고서의 “기본 옵션에서 AWR-WE13N 동기화”는 재현됐다. 증거 무결성 위반 없음.

```text
기본: AM052BN6PBH1=2 -> AWR-WE13N=2
유선: AM052BN6PBH1=2 -> AWR-WE13N=2
컬러: AM052BN6PBH1=2 -> AWR-WE13N=2
제외: AM052BN6PBH1=2 -> AWR-WE13N=2  # 결함, 기대 0
```

기본값만 서버 규칙을 타고 다른 옵션이 fallback하는 결함은 아니다. 오히려 서버 규칙이 모든 옵션을 타면서
`제외`까지 덮는 위 1건이 실제 도달 결함이다. 옵션별 캡처 8장은
`docs/qa/2026-08-09-896-r4/01-*`부터 `04-*`에 있다.

## 5. 검증 실행 요약

```text
:services:partner-order-service:bootJar --rerun-tasks -> BUILD SUCCESSFUL
R4 order-app 부분 fallback 소비 -> 1 passed (2.7s)
R4 리모컨 제외 -> 1 failed, Expected "0", Received "2"
기본/유선/컬러 선행 실행 -> 3 passed, 각 AWR-WE13N=2
git commit/push -> 수행 안 함
shared DB write -> 0
```

## 6. 신규 생성 파일

- `docs/dev-reports/2026-08-09-896-r4-sol-reconvergence.md`
- `clients/desktop/playwright/896-r4-reconvergence-real-qa/896-r4-reconvergence-real-qa.spec.ts`
- `clients/desktop/playwright/896-r4-reconvergence-real-qa/vite.order-r4-real-qa.config.ts`
- `docs/qa/2026-08-09-896-r4/01-default-option.png`
- `docs/qa/2026-08-09-896-r4/01-default-AWR-WE13N-row.png`
- `docs/qa/2026-08-09-896-r4/02-wired-option.png`
- `docs/qa/2026-08-09-896-r4/02-wired-AWR-WE13N-row.png`
- `docs/qa/2026-08-09-896-r4/03-color-option.png`
- `docs/qa/2026-08-09-896-r4/03-color-AWR-WE13N-row.png`
- `docs/qa/2026-08-09-896-r4/04-excluded-option.png`
- `docs/qa/2026-08-09-896-r4/04-excluded-AWR-WE13N-row.png`
- `docs/qa/2026-08-09-896-r4/05-order-app-partial-fallback-consumed.png`

`_local` 캡처 디렉터리는 요청대로 제거했다. 자격·JWT·비밀번호 평문은 산출물에 없다.

## 7. 못 한 것 / 판정에서 제외한 것

- **정확히 한 카테고리만** 실패시키는 표본은 만들지 않았다. 공유 DB write 금지 상태의 자연
  `OUT_OF_STOCK` 표본은 COMMERCIAL_MULTI·SINGLE_SET와 두 components 호출을 함께 실패시킨다.
  path별 인위 500 proxy는 mock 오해 가능성이 있어 사용하지 않았다.
- **전 카테고리 실패**는 확정 증거로 만들지 못했다. `EstimateCatalogClient`가
  `@LoadBalanced` builder와 논리 host `http://product-service`를 사용해 단순 URL env override가 적용되지
  않았고, 첫 시도는 실제 product-service와 캐시를 읽었다. 이 수치는 전부 실패 증거에서 제외했다.
- product-service 이미지에는 revision label이 없어 exact SHA metadata 자체는 없었다. 다만 R3 신규 route
  200/구 route 500 및 R3 후 응답 shape를 실제 호출로 확인해 “R3 fix가 없는 배포본”은 아니었다.
- 코드 수정, 결함 fix, commit, push는 수행하지 않았다.

