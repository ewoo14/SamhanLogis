# PR #1241 — 거래처별 DC 3대상 통일 보고서

실행일: 2026-08-17 · 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wgas1` · 브랜치: `feat/gas-parity-order-web`

## ① 레거시 원문 — 출고전표 DC

지정된 `docs/dev-reports/2026-08-17-duplication-audit/P1-02-evidence.md`는 이 워크트리에 존재하지 않았습니다. 대신 추적된 `docs/qa/1241-price-relocation/CODEX-SOL-PRICE-PATH-INVESTIGATION.md`와 `tools/legacy-gas` 원문을 대조했습니다.

레거시 종합견적서의 계산 순서는 `tools/legacy-gas/종합견적서/index.html:3927-3971`(홈 DC → 반올림), `3989-4035`(싱글 정액 DC), `3030-3051`(단위처리)입니다. 출고전표 전송 시에는 화면에서 계산된 `it.price`를 `priceVat`로 읽어 `USER_PRICE_VAT`에 그대로 넣습니다(`tools/legacy-gas/종합견적서/Code.js:1844-1853`, `1892-1899`). 즉 저장/전송 시 다시 거래처 DC를 재계산하지 않고 화면 확정값을 사용했습니다. 이번 구현은 레거시의 계산 결과를 보존하되, 서버가 같은 결과임을 확인한 경우에만 저장하도록 했습니다.

## ② RED 원문

먼저 추가한 테스트는 다음 기능 부재로 실패했습니다.

```text
error: cannot find symbol
symbol: method verifyClientPrices(String,List<Line>,Map<String,BigDecimal>)
location: variable calculator of type SlipDiscountCalculator
3 errors
```

테스트는 세 방향을 고정했습니다: 정상 서버값=클라이언트값은 통과, 불일치는 거부, DC 서버 조회 실패는 저장 거부입니다.

## ③ 고친 내용

- `SlipDiscountCalculator.verifyClientPrices()`를 추가해 서버 DC 결과와 클라이언트 단가를 비교합니다.
- DC RPC가 불가능하거나 결과 라인이 없으면 `DC 서버 계산 결과를 확인할 수 없습니다`로 거부합니다.
- `SlipService.create()` 출고 경로에서 `partnerCode`를 확정한 뒤 상품 정가·품목군·고정DC로 서버 계산을 수행하고, 검증된 서버 단가를 전표 라인에 전달합니다.
- 입고 경로와 거래처 코드가 없는 호환 경로는 변경하지 않았습니다.
- 기초품목 정본은 판단하지 않았습니다. 기존 조사 근거상 `partner-service.basicDiscountRate`는 production 가격 계산 사용처가 0이고 관리자 CRUD 잔존값이며, 실제 계산은 `dc-config-service`가 담당합니다. 다만 두 서비스가 다른 UUID 집합과 구형 거래처 FK를 읽는 문제가 있어, 어느 값을 정본으로 확정하려면 별도 개발책임자 결정이 필요합니다. 이번 변경은 그 결정을 대신하지 않습니다.

## ④ GREEN

```text
./gradlew :services:slip-service:test --tests '*DiscountPriceCalculatorTest' --no-daemon
BUILD SUCCESSFUL

clients/desktop npm run typecheck
exit 0

clients/desktop npm run lint
exit 0 (출력상 error 없음)

clients/desktop npm run build
exit 0 (Vite 경고 및 legacy source 없음 안내는 있었으나 build 성공)
```

## ⑤ 라이브 캡처 목록 및 행 수

Playwright는 `clients/desktop` 패키지 안에서 Chromium headless로 실행했고, 스펙은 `1241-save-path-real-qa` 디렉터리, `resolveQaShotsDir()`, `resolveQaCredential()`, `page.addInitScript(window.samhanAuth)`를 사용했습니다.

```text
docs/qa/1241-save-path-luna/screenshots/_local/04-login-blocked.png
행 수: 0 — 견적품목/구성품 표에 진입하지 못했으므로 정상 화면으로 판정하지 않음
```

고정금액·반올림 단위 저장/재조회, 출고전표 DC 단가 대조, desktop/estimate-app 금액 일치 캡처는 인증 게이트가 해소되지 않아 생성하지 못했습니다.

## ⑥ 막힌 것과 응답 원문

로그인은 성공했습니다.

```text
POST http://127.0.0.1:8080/auth/login
HTTP 200
data keys: token,userId,role,displayName,partnerCode,groups
role: MASTER · token length: 352 (토큰 본문은 비공개)
```

동일 토큰의 API 호출은 다음과 같았습니다.

```text
GET /api/v1/products
HTTP 401
본문: <빈 문자열>

GET /api/v1/partners
HTTP 401
본문: <빈 문자열>
```

첫 실행은 쿠키만 주입해 `#/login`에 남았고, `addInitScript(window.samhanAuth)`로 수정한 두 번째 실행은 `/products/AC110CS6PBH1SY/edit`까지 이동했으나 API 401로 화면 행 수 0에서 중단됐습니다. 렌더러 응답에는 다른 워크트리 `w1237` 경로의 Vite 모듈이 포함되어 있어, 해당 서버는 이 워크트리의 변경을 반영하지 않은 공유 실행물입니다.

## ⑦ 프로세스 회수

이번 세션에서 장기 실행으로 기동한 별도 컨테이너는 없습니다. Playwright·Gradle·npm 자식 프로세스는 명령 종료 후 회수됐습니다. 공유 스택(`8080`, 기존 `5943`)은 다른 작업의 프로세스이므로 건드리지 않았습니다. 확인 가능한 이번 작업 잔여 프로세스는 0개, 공유 DB 변경 및 QA 데이터 잔재는 0건입니다.

커밋·push·git add는 수행하지 않았습니다.
