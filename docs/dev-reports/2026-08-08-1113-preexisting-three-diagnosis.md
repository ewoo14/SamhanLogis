# PR #1119 선재 운영검증 3건 진단

- 조사일: 2026-08-08
- 조사 기준: `fix/1113-smoke-jwt-role-claim` (`388cc0917`)
- PR 기준 merge-base: `0a78de740eb33aa0bdca358f8756809d531101c5`
- 조사 범위: 원인 진단만 수행. 서비스 코드 수정, 커밋, push, Docker 재기동·중지 없음. DB 조회는 `SELECT`만 수행.

## 결론 요약

| 항목 | PR #1119 원인 여부 | 실제 사용자 영향 | 필요한 수정 범위 | 판단 |
|---|---|---|---|---|
| inventory `/balances` 업무 404 | 아니오 | **예 — 현재 공유 로컬 데이터 기준** | **여러 서비스 데이터 정합화·마이그레이션/재시드** | PR과 분리하되 우선순위 높음 |
| seed QA 자격 400 | 아니오 | 아니오 — 개발·QA seed 작업자에게만 영향 | 한 스크립트 수 줄 | PR과 분리 가능한 하네스 결함 |
| k6 `http_req_failed` 1.39~1.94% | 아니오 | 아니오 — 잘못 구성된 부하 actor의 실패 | 부하 하네스 1~2개 파일 | PR과 분리 가능한 하네스 결함 |

SOL의 “세 건 모두 PR #1119 선재” 분류는 확인 결과 맞다. 다만 inventory는 단순한 검증 오탐이 아니다. 전체 조회 기능은 구현되어 있으나, 현재 공유 로컬 DB에서 inventory와 product의 식별자가 대부분 어긋나 실제 API가 404가 된다.

## 1. inventory `/balances` 업무 404

### 실제 계약

`GET /balances`의 두 필터는 모두 선택 사항이다.

- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockController.java:71-90`
  - `productId`, `warehouseId`가 모두 없으면 전체 재고를 조회한다고 Javadoc에 명시되어 있다.
  - 두 `@RequestParam` 모두 `required = false`이고, `stockService.findBalancePage(productId, warehouseId, pageable)`를 호출한다.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/StockBalanceRepository.java:37-65`
  - 두 인자가 `null`이면 전체 조회라고 명시한다.
  - JPQL도 `:productId IS NULL`, `:warehouseId IS NULL` 조건으로 필터 생략을 지원한다.
- `tools/operational-validation/run-smoke-tests.ps1:249-250`
  - smoke 역시 “productId 없이 전체 재고 현황 조회”를 명시적으로 검증한다.

따라서 **productId 없이 호출하는 것은 지원되는 정상 사용법이며 smoke의 기대가 맞다.** 경로 또는 기능 부재 때문에 나는 404가 아니다.

### 404의 정확한 조건

조회 흐름은 다음과 같다.

1. `StockService.findBalancePage`가 활성 재고 행을 조회한다 (`StockService.java:76-78`).
2. 결과의 product UUID를 최대 100개씩 묶어 product-service의 `POST /products/internal/lookup`을 호출한다 (`StockService.java:112-123`, `ProductClient.java:82-96`).
3. product-service가 돌려준 제품 수가 요청한 UUID 수보다 작으면 inventory-service가 `ErrorCode.NOT_FOUND`를 던진다 (`ProductClient.java:114-117`).
4. 공통 예외 처리기가 `NOT_FOUND`를 HTTP 404로 변환한다.

현재 실제 응답의 핵심은 다음과 같다.

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "일부 제품을 찾을 수 없습니다 (요청 100, 응답 1)"
}
```

gateway와 inventory-service 직결 호출이 같은 업무 404를 반환하므로 gateway routing 문제가 아니다. `docs/dev-reports/2026-08-08-1113-s16-sol-premerge-reconvergence.md:101-114`에도 동일한 원문이 남아 있다.

### 실데이터 SELECT 결과

공유 Docker DB를 변경하지 않고 다음 항목을 `SELECT`했다.

```sql
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE is_deleted = false) AS active_rows,
       count(DISTINCT product_id) FILTER (WHERE is_deleted = false) AS active_product_ids,
       count(DISTINCT warehouse_id) FILTER (WHERE is_deleted = false) AS active_warehouse_ids
FROM stock_balances;
```

결과:

- 재고 행: 전체 201, 활성 201
- 활성 재고 product UUID: 101개
- 활성 warehouse UUID: 2개
- 활성 수량 합계: 가용 46,668, 예약 32, 전체 46,700
- product DB 활성 제품: 3,083개
- 활성 재고 product UUID 101개 중 product DB와 일치: **1개**
- product DB에 없는 활성 재고 product UUID: **100개**

즉 표본이 0이라서 404가 나는 것이 아니다. 조회할 재고는 201행 존재한다. 첫 100개 묶음의 제품 보강 조회가 1개만 돌려주기 때문에 코드의 정확한 `요청 100, 응답 1` 조건에 걸린다.

개발 seed에서도 이 불일치가 생길 수 있는 구조가 확인된다. `StockBalanceSeeder.java:17-44,143-179`는 product seeder와 맞춘 결정적 UUID로 재고를 생성하지만, `HvacProductSeeder.java:143-155`는 같은 모델명이 이미 있으면 결정적 UUID 제품 삽입을 건너뛴다. 현재 product DB에는 해당 표본 HVAC seed 모델이 없고 import 제품만 남은 반면 inventory DB에는 예전 결정적 UUID 재고가 남아 있다. 따라서 현상은 **전체 조회 기능 부재가 아니라 공유 DB의 product/inventory 참조 정합성 붕괴**다.

### 언제부터였는가

- productId 없는 전체 조회 지원은 `9cafd6689` (2026-08-02, PR #1043)에서 들어왔다. `git blame`상 controller의 선택 필터와 repository의 전체 조회 조건이 모두 이 커밋이다.
- 해당 커밋 기록에는 당시 활성 재고 201행을 `HTTP 200`, `totalElements=201`로 실검증한 내용이 있다. 즉 기능은 실제로 동작한 적이 있다.
- PR #1119 merge-base부터 현재 HEAD까지 inventory-service 변경은 0건이다.
- 현재 404는 2026-08-02 이후 공유 로컬 데이터의 재적재/seed 조합이 달라지며 발생한 것으로 좁혀진다. 정확히 어느 DB 작업에서 100개 UUID가 고아가 되었는지는 DB 변경 이력이 없어 커밋 하나로 특정할 수 없다.

### 필수 판단

```text
이 PR 이 만든 것인가?           아니오 — PR diff에 inventory-service 변경이 없고, 전체 조회 계약은 2026-08-02부터 존재했다.
사용자에게 실제로 영향이 있는가?  예 — 현재 공유 로컬 환경에서는 재고 201행이 있어도 전체 재고 API/화면이 업무 404가 된다. 실제 운영 DB도 같은지는 판단 불가다.
고치는 데 필요한 범위는?         여러 서비스·데이터 마이그레이션/재시드 — inventory 100개 고아 product UUID를 product master와 정합화해야 한다. 단순 controller 수 줄 수정 문제가 아니다.
```

## 2. `seed-local-stack.ps1 -SkipReimport` QA 자격 400

### 실제 요청과 응답

현재 스크립트가 환경변수 없이 보내는 요청을 동일하게 재현했다. 비밀번호 값은 보고서에서 치환했다.

```http
POST http://localhost:8080/api/auth/login
Content-Type: application/json

{"loginId":"dev_master","password":"<redacted>"}
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"success":false,"code":"INVALID_INPUT","message":"password: must not be blank","data":null,"timestamp":"2026-08-08T..."}
```

이전 S16 실행에서는 같은 빈 값에 `password: size must be between 8 and 100`이 반환되었다. `@NotBlank`와 `@Size`가 동시에 실패할 때 어느 제약 메시지가 먼저 선택되느냐의 차이일 뿐, 요청이 계약 위반이라는 사실은 같다.

### 요청과 서버 계약

- `scripts/seed-local-stack.ps1:81-87`
  - `SEED_LOGIN_PW`가 없으면 `$seedLoginPw`를 빈 문자열로 둔다.
  - 그 값을 그대로 `/login`의 `password`로 POST한다.
- `services/auth-service/src/main/java/com/samhanair/logis/auth/web/dto/LoginRequest.java:7-10`
  - `password`는 `@NotBlank`이고 길이는 8~100이어야 한다.

따라서 **서버 계약이 최근 바뀐 것이 아니라 seed 요청이 잘못되었다.** smoke/load 스크립트가 쓰는 표준 QA 자격 해석 경로를 seed 스크립트는 사용하지 않는다.

### 언제부터였는가

- 서버의 `LoginRequest` 검증은 초기 커밋 `75f9a6192` (2026-05-04)부터 동일하다.
- seed 스크립트의 “환경변수가 없으면 빈 비밀번호” 동작은 `076d569a3` (2026-05-30)에서 평문 seed 비밀번호를 제거하면서 들어왔다.
- PR #1119의 seed 스크립트 변경은 로컬 스택 port resolver 추가뿐이며 `scripts/seed-local-stack.ps1:81-87`의 자격 처리 줄은 건드리지 않았다.

400에서 스크립트가 중단되므로 이후 사용자 등록/검증/reimport 단계까지 진행되지 않는다. 이는 애플리케이션 로그인 기능의 장애가 아니라 로컬 seed 운영 절차의 결함이다.

### 필수 판단

```text
이 PR 이 만든 것인가?           아니오 — 빈 값 fallback은 2026-05-30부터 있었고 PR #1119는 해당 줄을 변경하지 않았다.
사용자에게 실제로 영향이 있는가?  아니오 — 애플리케이션 최종 사용자 요청이 아니다. 다만 개발·QA 작업자는 seed가 즉시 중단되는 직접 영향을 받는다.
고치는 데 필요한 범위는?         한 파일 몇 줄 — seed 스크립트가 표준 QA 자격 해석을 쓰거나 자격 누락을 명확히 fail-fast하면 된다. 서버 변경은 필요 없다.
```

## 3. k6 `http_req_failed` 1.39~1.94%

### 실패 요청의 endpoint별 분해

실패는 고르게 퍼지지 않는다. 진단 실행에서 **모든 실패가 다음 요청에 집중**되었다.

```text
POST /api/v1/partner-orders/drafts  -> HTTP 401
```

관측값:

| 실행 시각 | `http_req_failed` | 최종 4xx | 해석 |
|---|---:|---:|---|
| 2026-08-08 03:37:59 | 4/287 = 1.39% | 2 | 논리 draft 실패 2건, 재로그인 후 재시도로 HTTP 실패 4건 |
| 2026-08-08 03:45:32 | 6/308 = 1.94% | 3 | 논리 draft 실패 3건, 재시도로 HTTP 실패 6건 |
| 2026-08-08 04:11:13 | 4/313 = 1.27% | 2 | 논리 draft 실패 2건, 재시도로 HTTP 실패 4건 |

`perf/k6/mixed-load.js:184-210`은 401이면 재로그인 후 한 번 재시도한다. 직원 토큰의 권한/claim은 재로그인해도 같으므로 같은 401이 한 번 더 집계된다. endpoint-tag 진단에서 다른 endpoint의 실패는 0이었다.

### 왜 이 endpoint만 실패하는가

- smoke profile은 2 VU, 1분이며 역할 배분상 두 VU 모두 `sales` 직원이다 (`mixed-load.js:22-45,60-78`).
- write flow는 일정 확률로 partner draft 생성을 선택하고, 직원 토큰과 임의 `X-Partner-Code`를 보내 `POST /api/v1/partner-orders/drafts`를 호출한다 (`mixed-load.js:340-359,458-472`).
- gateway JWT filter는 spoofing 방지를 위해 클라이언트가 보낸 `X-Partner-Code`를 먼저 제거하고, **서명된 partner JWT claim이 있을 때만** 다시 넣는다 (`gateway-service/.../JwtAuthenticationFilter.java:220-244`).
- partner-order-service는 전달받은 partnerCode가 null/blank이면 `UNAUTHORIZED`, 메시지 `partnerCode 필수`를 던진다 (`PartnerOrderDraftService.java:58-62`).

즉 서버가 정상적인 보안 계약을 수행한 결과다. `dev_sales` 직원 JWT에 partner claim이 없으므로, k6가 임의 header로 partner 사용자를 흉내 내는 방식이 더 이상 유효하지 않다.

### 임계값과 근거

- `perf/k6/mixed-load.js:34-46`: smoke는 2 VU, 1분, `http_req_failed: rate<0.01`이다.
- 따라서 허용 임계값은 **1% 미만**이다. 1.39%, 1.94%, 1.27%는 모두 exit 99를 만든다.
- `docs/qa/local-load-soak-test/README.md:31-48`은 smoke 목적을 기본 흐름 검증, 공통 실패율 기준을 1% 미만으로 설명한다. 이 수치가 통계적으로 산출된 별도 근거는 저장소에 없고, 2026-06-08 최초 하네스 도입 때 정한 QA 기준이다. 로컬 수치는 AWS 운영 SLO가 아니며 AWS에서 재측정하도록 문서화되어 있다.

### 최근 악화 여부와 이력

보존된 raw/summary의 smoke 추이는 다음과 같다.

| 시각 | 실패율 |
|---|---:|
| 2026-06-08 00:51:01 | 104/389 = 26.73% |
| 2026-06-08 01:00:05 | 35/311 = 11.25% |
| 2026-06-08 01:05:28 | 0/256 = 0% |
| 2026-08-07 18:33:40 | 2/263 = 0.76% |
| 2026-08-08 02:23:01 | 2/302 = 0.66% |
| 2026-08-08 03:37:59 | 4/287 = 1.39% |
| 2026-08-08 03:45:32 | 6/308 = 1.94% |
| 2026-08-08 04:11:13 | 4/313 = 1.27% |

최근에 단조롭게 나빠진 패턴이 아니다. draft write가 확률적으로 선택되어 짧은 1분 smoke에서 0건, 1건, 2건, 3건이 섞이고, 재시도로 각 논리 실패가 HTTP 실패 2건이 된다. 그래서 같은 결함이 임계값 아래로 숨기도 하고 위로 드러나기도 한다.

- mixed-load 하네스와 1% threshold, draft write, 401 retry는 `5e749f15b` (2026-06-08)에서 도입되었다.
- gateway가 신뢰할 수 없는 identity header를 제거하도록 강화된 것은 `9305ee564` (2026-06-12)다. 그 뒤 k6 draft actor가 partner JWT 방식으로 갱신되지 않았다.
- PR #1119는 `perf/k6/mixed-load.js`를 변경하지 않았다. `scripts/run-load-test.ps1` 변경도 고정 port 대신 탐지한 gateway port를 쓰게 한 것뿐이다.

따라서 현재 1.39~1.94%의 메커니즘은 PR #1119보다 앞선 2026-06-12부터 존재했다. 실제 partner 사용자라면 서명된 partner claim으로 gateway가 `X-Partner-Code`를 구성하므로, 이번 실패는 partner API 장애를 입증하지 않는다. 대신 현재 smoke가 partner draft 성공 경로를 올바르게 검증하지 못한다.

### 필수 판단

```text
이 PR 이 만든 것인가?           아니오 — 실패 하네스와 보안 계약은 2026-06-08/12부터 있었고 PR #1119는 mixed-load.js를 변경하지 않았다.
사용자에게 실제로 영향이 있는가?  아니오 — 실패 주체는 partner가 아닌 dev_sales가 spoofed header로 partner API를 호출한 경우다. merge gate와 QA 신뢰도에는 영향이 있다.
고치는 데 필요한 범위는?         부하 하네스 1~2개 파일 — 올바른 partner JWT actor를 쓰거나 직원 flow에서 해당 호출을 제거해야 한다. 서비스·DB 마이그레이션은 필요 없다.
```

## 개발책임자 판단용 정리

세 건 모두 PR #1119가 만든 회귀는 아니므로 “이번 PR의 기능 변경과 직접 관련된 merge blocker”로 묶을 근거는 없다.

다만 분리 시 우선순위는 달라야 한다.

1. inventory는 실제 공유 환경에서 재고 전체 조회를 막는 데이터 정합성 결함이며 범위도 크다. 별도 이슈/슬라이스로 즉시 추적하는 편이 안전하다.
2. seed 400은 한 스크립트의 자격 해석 결함이다.
3. k6는 실제 서비스 오류가 아니라 잘못된 actor 때문에 merge gate가 확률적으로 red가 되는 하네스 결함이다.

신규 파일은 이 진단 보고서 1개뿐이다.
