# D-02 일마감 회계전표 생성 정찰 보고서

작성일: 2026-08-17
브랜치: `feat/daily-closing-accounting-slip`
기준: `origin/main` / `ea6aa39df`

## ① 과거 기록 정찰 결과

착수 전에 다음을 확인했다.

- `gh issue list --state all --limit 400 --search "회계전표"`
  - **#1144 CLOSED** — `[FEAT] 회계전표(매출·매입) 생성·연결 체계 — 개발책임자 명세 전수 반영`
  - **#1072 CLOSED** — 계정과목 정본을 이카운트 체계로 전환
  - **#1142 CLOSED** — 검수완료 전표 되돌림 경로
- `gh issue list --state all --limit 400 --search "매출전표 매입전표"`
  - 별도 미완료 생성 모델 이슈는 없었고, 위 #1144가 해당 요구를 이미 포괄한다.
- `git log --all --grep="회계전표" -i --oneline`
  - `4498d1f20` — #1144 회계전표 생성·연결 체계의 read model/eligibility 트랙
  - `585e28037` — #1144 생성 orchestration 및 삭제/재생성 수명주기 트랙
  - `d2e88f75c` — #1144 회계전표 명세 반영
  - `ea62efe6e` — 회계 정본·계정과목 및 생성·연결 트랙

이미 만들어진 것:

- 매출/매입 회계전표 생성 API와 DRAFT 생성 경로
- 원천 전표 allocation 및 중복 연결 eligibility
- 일마감 검증/잠금 게이트를 포함한 accounting-service orchestration
- 기존 회계전표가 있으면 `ALREADY_ALLOCATED`로 차단하는 서버 판정
- 매출·매입 회계전표 작성 화면과 권한 코드

`services/accounting-service/README.md` 및 관련 서버 코드를 확인했으며, D-02를 위해 새 엔티티 필드나 마이그레이션을 만들 근거가 없다. 이번 정찰에서 엔티티를 건드리지 않았으므로 “필드는 어느 이슈가 왜 만들었나”에 해당하는 신규 필드는 0개다.

## ② RED 원문

요구된 양방향 RED 테스트는 **실행하지 않았다**. 구현 전에 필수 입력 누락이 확인되어 작업 조건의 “만들 수 없는 입력이면 구현하지 말고 보고”에 걸렸기 때문이다.

정찰에서 확인한 기존 생성 요청의 필수 입력:

```text
CreateSalesAccountingSlipRequest / CreatePurchaseAccountingSlipRequest
  slipDate
  partnerId
  partnerCode
  partnerName
  taxType
  lines[].productCode
  lines[].productName
  lines[].qty
  lines[].unitPrice
  lines[].allocations[].sourceSlipId
  lines[].allocations[].sourceSlipNo
  lines[].allocations[].sourceLineId
  lines[].allocations[].sourceLineNo
  lines[].allocations[].allocatedQty
  lines[].allocations[].allocatedAmount
```

RED 테스트를 먼저 추가하면 위 누락을 임의값으로 채우는 구현을 전제하게 되므로, 안전한 RED→GREEN 대상이 아직 정의되지 않는다.

## ③ 구현 내용

구현하지 않았다. 이유는 다음과 같다.

`DailyClosingSourceRow`가 제공하는 값은 `partnerCode`, `partnerName`, `slipDate`, `seqNo`, `productName`, 수량·금액, `accountingPostedAt`, 선택적 `slipId`, `lineId` 등이다. 다음 필수 입력은 계약상 없다.

- `partnerId`: 거래처 UUID/내부 식별자
- `productCode`: 회계전표 line 상품 코드
- `taxType`: `TAXABLE` / `ZERO_RATED` / `EXEMPT`
- `sourceSlipNo`: 사용자용 원천 전표번호
- `sourceLineNo`: 원천 전표 라인번호

따라서 일마감 합계행에서 기존 API를 호출할 수 없으며, 코드에 새 API·컬럼·임의 기본값을 추가하지 않았다. 금액 편집, 양방향 할인율 동기화, 회계반영 후 편집 잠금, 전표별 소계/전체합계, 필터·정렬·다중선택 복사도 변경하지 않았다.

## ④ GREEN

실행하지 않았다. production 변경과 RED 테스트가 없으므로 GREEN을 주장할 수 없다.

현재 상태:

- desktop typecheck/lint/build: 미실행
- 서버 테스트: 미실행
- 변경 파일: 이 보고서 1개
- 마이그레이션: 0개

## ⑤ 라이브 캡처 목록과 행 수

Playwright 라이브 QA는 실행하지 않았다. 생성 기능의 필수 입력이 없어 화면에서 실제 회계전표 생성을 수행할 수 없으므로, 빈 표/stub 캡처를 정상 증거로 남기지 않았다.

- 캡처: 0장
- 행 수: 측정하지 않음
- `resolveQaShotsDir()` 호출: 없음
- 생성 회계전표: 0건

## ⑥ 일마감 행에서 만들 수 없는 입력

현재 계약으로는 다음 입력을 만들 수 없다.

1. `partnerId`
2. `productCode`
3. `taxType`
4. `sourceSlipNo`
5. `sourceLineNo`

개발책임자 판단이 필요한 최소 결정은 “일마감 원본행 API가 위 값을 함께 반환하도록 계약을 확장할 것인지”다. 특히 `partnerId`와 상품/라인 식별자는 기존 회계전표 생성·중복 연결의 정합성에 직접 사용되므로, 화면에서 코드로 추정하거나 상수로 대체하면 안 된다.

## ⑦ 프로세스 회수

이번 작업에서는 서버, 컨테이너, Playwright, 기타 장기 실행 프로세스를 기동하지 않았다.

- 새로 기동한 프로세스: 0개
- 회수한 프로세스/컨테이너: 0개
- 공유 DB에 생성한 회계전표: 0건
- 공유 DB 잔재: 없음

## 2026-08-17 재개 작업 추가 기록

PM 실측을 반영해 구현을 재개했다. 기존 호출자와 서버 DTO에서 `sourceLineNo`는 전표 내 라인 순번이며, 기존 `SlipSummary.of()`가 `1`부터 부여하는 1-based 순번임을 확인했다.

변경한 범위:

- 기존 `/slips/query/daily-closing` 조회에 `slipType` 선택을 추가해 OUTBOUND/INBOUND를 같은 기존 endpoint에서 조회
- 일마감 응답에 회계전표 요청에 필요한 원천 식별자와 라인 순번 전달
- 전표별 소계행에서 기존 매출/매입 회계전표 생성 API 호출
- 이미 `accountingPostedAt`가 있으면 생성 버튼을 막고, 성공/실패 결과를 화면에 표시
- 다중 라인을 하나의 회계전표 요청으로 변환
- 신규 변환 함수 양방향 테스트 추가

검증 결과:

```text
./gradlew :services:slip-service:compileJava --no-daemon       BUILD SUCCESSFUL
./gradlew :services:slip-service:test --tests DailyClosing...  BUILD SUCCESSFUL
npm run typecheck                                               exit 0
npx vitest run .../dailyClosingAccountingSlip.test.ts          2 passed
```

RED 원문은 최초 실행에서 로컬 의존성(`vitest/config`, `@typescript-eslint/parser`) 누락으로 로더 전에 실패했다. `npm ci` 후 신규 테스트는 2/2 통과했다.

라이브 QA는 `d02-daily-closing-accounting-slip-real-qa` 스펙으로 headless Chromium을 실행했으나, 로그인 후 일마감 원본행 수가 **0건**이었다. 스펙은 빈 표를 정상으로 세지 않고 다음 오류로 실패했다.

```text
Error: 일마감 원본행이 0건이면 stub으로 간주
Expected: > 0
Received: 0
```

따라서 실제 생성 클릭·성공/실패 캡처·중복 생성 확인은 수행하지 못했다.

추가로, 현재 slip-service의 기존 product-service 요약 DTO에는 PM이 실측한 `products.tax_type`를 전달하는 필드가 없고, `DailyClosingRowResponse`의 productCode도 원본 `product_id`를 product-service 코드로 변환하는 경로가 아직 연결되지 않았다. 현재 작업본은 이를 임의값으로 저장하지 않았으며, 라이브 QA 전 이 두 값을 기존 product-service 응답에서 정확히 전달하도록 보완해야 한다.

## 재개 최종 정정 기록 (2026-08-17)

위 재개 기록 중 상품 DTO 미연결과 날짜에 행 없음은 PM 추가 지시에 따라 정정한다.

### ① 과거 기록·기존 필드 정찰 정정

- `sourceLineNo`는 기존 `SlipSummary.of()`의 `lineNo = 1; lineNo++` 방식과 동일한 전표 내 1-based 순번으로 확정했다.
- `partnerId`, `slipNo`는 기존 `slips` 원본 필드에서 전달한다.
- `productCode`, `taxType`은 저장 필드를 만들지 않고 기존 `ProductClient.lookupByModelNames(List<String>)` 벌크 경로로 해소한다. 100건 배치 상한을 유지한다.
- `ProductSummaryResponse`에 기존 `Product.getTaxType()`를 응답하는 `taxType`만 추가했다. 새 API·클라이언트·마이그레이션·엔티티 저장 필드는 없다.

### ② RED 원문

상품 벌크 연결 전 추가한 서버 RED 테스트의 실제 실패 원문:

```text
SlipQueryServiceTest > 일마감은_모델명을_상품서비스에_한번만_벌크조회해_상품코드와_세율을_응답한다() FAILED
org.opentest4j.AssertionFailedError
Expecting actual: []
to contain exactly (and in same order): ["PRD-A", "PRD-A"]
```

양방향 클라이언트 테스트는 생성 요청 변환 1건과 `accountingPostedAt` 중복 차단 1건을 단정하며 최종 `2 tests passed`다.

### ③ 구현 내용 정정

- OUTBOUND/INBOUND를 기존 일마감 조회 endpoint의 `slipType`으로 연결했다.
- 한 날짜 조회에서 모델명을 중복 제거해 product-service 벌크 조회를 한 번 호출하고 응답을 모델명 map으로 연결한다.
- 전표별 소계행의 매출/매입 생성 버튼, 다중 라인 요청, 성공/실패/기존 반영 결과 표시를 연결했다.
- `accountingPostedAt`가 있는 전표는 생성 요청 전에 차단한다.
- 금액 편집 및 회계반영 후 잠금 경로는 유지했다.

### ④ GREEN

```text
./gradlew :services:product-service:compileJava --no-daemon                         BUILD SUCCESSFUL
./gradlew :services:slip-service:test --tests ...DailyClosing... --no-daemon        BUILD SUCCESSFUL
npx vitest run src/renderer/routes/dailyClosingAccountingSlip.test.ts                2 passed
npm run typecheck                                                                    exit 0
npm run lint                                                                         exit 0 (기존 warning만 존재)
VITE_MOCK_MODE=0 npm run build:web                                                   exit 0
git diff --check                                                                     exit 0
```

### ⑤ 라이브 캡처·행 수 및 남은 블로커

공유 DB를 read-only SQL로 확인한 결과 원본 전표는 존재한다.

```text
slip_db / slips
2026-08-14 OUTBOUND: 19건 (CONFIRMED 10, DELIVERED 1, COMPLETED 2 포함)
2026-08-14 INBOUND : 16건 (CONFIRMED 12, COMPLETED 2 포함)
```

그러나 Playwright 인증 방식으로 로그인 직후 동일 endpoint를 읽으면 모든 날짜 요청이 `401`이다.

```text
파일: clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/
      d02-daily-closing-accounting-slip-real-qa.spec.ts:14-31
요청: GET /slips/query/daily-closing?slipDate=2026-08-14
응답: 401
범위: 2026-07-30 ~ 2026-08-29 전 날짜 401
```

stub 방지 가드는 유지했고 빈 표를 정상 증거로 사용하지 않았다.

- 캡처: 0장
- 유효 화면 행 수: 0건(401로 화면 원본 조회 불가)
- 생성 회계전표: 0건
- 공유 DB에 남긴 QA 회계전표: 0건

### ⑥ 일마감 행에서 만들 수 없는 입력

코드·원본 데이터 경로 기준으로 만들 수 없는 입력은 없다. 라이브 확인을 막은 것은 입력 누락이 아니라 인증 블로커다. 임의 토큰·임의 날짜·임의 상품코드로 우회하지 않았다.

### ⑦ 프로세스 회수

이번 세션에서 기동한 Vite preview(5942)를 종료했다. 종료 확인 결과 5942 listen 잔여는 0개다. 공유 Docker 서비스·DB는 기동/종료하지 않았으며, 새로 생성한 회계전표와 DB 잔재는 0건이다.

## 2026-08-17 CODEX LUNA 라이브 QA 최종 기록

### ① 사용한 날짜와 근거

- 공유 DB read-only 조회에서 전표가 있는 날짜를 확인했다. `2026-08-14`는 OUTBOUND 18건·INBOUND 16건이었다.
- Playwright 날짜 탐색은 2026-07-30부터 첫 비어 있지 않은 날짜를 선택하므로 실제 화면 QA 날짜는 **2026-08-03**이다.
- 해당 날짜 API 응답은 OUTBOUND 원본행 4건, INBOUND 원본행 4건이었다. 빈 표/stub은 정상으로 판정하지 않았다.

### ② 캡처 목록과 행 수

캡처는 `resolveQaShotsDir()`에 `QA_SHOTS_DIR`를 지정한 `d02-daily-closing-accounting-slip-real-qa/screenshots` 아래에 저장했다. `_local`에는 증거를 남기지 않았다.

| 캡처 | 화면 원본행 | 비고 |
|---|---:|---|
| `01-daily-closing-before-create.png` | 4건 | 선발행 탭, 소계 1건·합계 1건 표시 |
| `02-daily-closing-create-blocked.png` | 4건 | 생성 버튼 disabled 상태 |

### ③ 중복 차단 확인

실제 회계전표 생성은 수행하지 못했다. 공유 slip-service 응답에서 다음 생성 필수값이 누락되어 버튼이 disabled였다.

`slipNo`, `partnerId`, `productCode`, `sourceLineNo`, `taxType`

따라서 중복 생성 클릭·`ALREADY_ALLOCATED` 응답 캡처는 **미검증**이다. 임의값으로 우회하지 않았다.

### ④ 회계반영 잠김 확인

회계전표를 생성하지 못했으므로 회계반영 후 금액 편집 잠금은 **미검증**이다. 생성 전 화면의 금액 입력은 캡처에서 확인했다.

### ⑤ 공유 DB에 남긴 것

- 생성한 회계전표: **0건**
- 변경한 원본 전표/금액: **0건**
- 공유 DB 잔재: **없음**
- 공유 컨테이너: **건드리지 않음**

### ⑥ 프로세스 회수

- QA용 Vite preview 5942: 종료 완료
- 5942 listen 잔여: **0개**
- D-02 Playwright/preview 잔여: **0개** (확인용 PowerShell 프로세스 자체는 제외)
- Playwright 라이브 스펙: 1 passed (행 존재·생성 차단 가드 확인)

결론: 라이브 QA에서 원본행과 생성 차단 상태까지 확인했으나, 공유 서비스가 생성 필수 원천 식별자를 반환하지 않아 매출·매입 실제 생성, 중복 차단, 회계반영 후 잠금의 완료 판정은 보류한다.

## 2026-08-17 브랜치 격리 slip-service 재검증 기록

### ① 사용한 날짜와 근거

- 요청에 따라 공유 DB를 read-only로 확인하고 **2026-08-03**을 유지했다. 격리 `slip-service`의 동일 날짜 조회는 OUTBOUND 4건, INBOUND 4건이었다.
- 격리 DB는 공유 `slip_db`·`product_db`를 읽기 전용 dump로 복제했으며, 공유 컨테이너와 공유 DB에는 쓰기 요청을 보내지 않았다.
- 격리 OUTBOUND 조회 응답에는 `slipNo`, `partnerId`, `productCode`, `sourceLineNo`, `taxType`가 모두 채워진 4건이 확인되어, 이전 공유 스택의 disabled 원인과 브랜치 응답 차이를 확인했다.

### ② 캡처 목록과 행 수

- 기존 유지 캡처 `01-daily-closing-before-create.png`, `02-daily-closing-create-blocked.png`: 각 화면 원본행 4건.
- 브랜치 격리 스택에서 생성·중복·잠금 완료 캡처는 **0장**이다.
- Playwright 재실행은 `POST /auth/login` HTTP 500에서 중단되어 화면 진입 전에 종료됐다. 따라서 로그인 실패 뒤 생성 버튼을 임의 활성화하거나 임의 토큰으로 우회하지 않았다.

### ③ 중복 차단 확인

미검증. 실제 생성 요청을 보내지 못했고, 격리 `accounting_db`의 생성 결과는 다음과 같이 모두 0건이다.

```text
sales_accounting_slips: 0
sales_accounting_slip_lines: 0
sales_accounting_slip_allocations: 0
purchase_accounting_slips: 0
purchase_accounting_slip_lines: 0
purchase_accounting_slip_allocations: 0
```

### ④ 회계반영 뒤 금액 편집 잠김 확인

미검증. 회계전표를 만들지 못했으므로 잠금 상태를 판정하지 않았다.

### ⑤ 차단 원문과 파일 위치

공유 `auth-service` 컨테이너 로그에 다음 원문이 남았다.

```text
POST /auth/login { loginId: [마스킹], password: [마스킹] }
HTTP 500
ERROR: relation "accounts" does not exist
```

read-only 확인에서는 `auth_db.public.accounts` 테이블이 존재했으나, auth-service의 로그인 쿼리는 같은 이름의 relation을 찾지 못했다. 이 환경 불일치는 `clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/d02-daily-closing-accounting-slip-real-qa.spec.ts:36-40`의 로그인 단계에서 재현됐다. 자격 값은 보고서에 기록하지 않았다.

### ⑥ 공유 DB 잔재

- 생성한 회계전표: **0건**
- 공유 원본 전표·금액 변경: **0건**
- 격리 `accounting_db` 생성 전표: **0건**
- 공유 DB·공유 컨테이너: **건드리지 않음**

### ⑦ 프로세스·컨테이너 회수

- 격리 Java 서비스 포트 18084/28086/28087 잔여: **0개**
- QA 프록시 28100, Vite preview 5942 잔여: **0개**
- 격리 PostgreSQL `d02qa-postgres`: **0개**
- 격리 Docker volume/network: **0개**
- 공유 컨테이너는 계속 실행 중이며 내리지 않았다.
- 임시 격리 compose override와 프록시 파일은 제거했다. JAR·바이너리를 QA 산출물에 추가하지 않았다.

결론: 브랜치 격리 `slip-service`의 필드 응답과 원본행 4건까지는 확인했지만, 공유 auth-service의 `accounts` relation 오류로 인증 단계가 재차 차단됐다. 그러므로 매출·매입 실제 생성, 중복 차단, 회계반영 후 잠금은 **완료 판정하지 않는다**.
