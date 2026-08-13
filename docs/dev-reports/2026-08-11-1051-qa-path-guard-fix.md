# 2026-08-11 PR #1171 — QA 증거 경로 가드 fix1

## 변경 범위

라이브QA 스펙 2개의 캡처 목적지만 `resolveQaShotsDir()`를 경유하도록 수정했다.

- `clients/desktop/playwright/1051-broken-ref-real-qa/1051-broken-ref-real-qa.spec.ts`
- `clients/desktop/playwright/1051-sol-first-adversarial-real-qa/1051-sol-first-adversarial-real-qa.spec.ts`

두 파일 모두 기존 `docs/qa/<slug>`를 `resolveQaShotsDir(path.resolve(...))`에 전달한다. 기본 실행 출력은 `<slug>/_local`이며, 가드·allowlist·probeNames·skip은 변경하지 않았다.

## RED-A — 수정 전 원문

실행:

```text
cd clients/desktop
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
```

결과:

```text
1 failed file · 2 failed · 60 passed (62)

H-2: 캡처 목적지로 쓰이는 docs/qa 경로 상수는 전부 resolveQaShotsDir 를 경유한다
1051-broken-ref-real-qa/1051-broken-ref-real-qa.spec.ts → const SHOTS
1051-sol-first-adversarial-real-qa/1051-sol-first-adversarial-real-qa.spec.ts → const SHOTS

G3a: clients/**/scripts·루트 scripts/ 의 JS/CJS/MJS 캡처 목적지도 _local 격리를 거친다
clients/desktop/playwright/1051-broken-ref-real-qa/1051-broken-ref-real-qa.spec.ts → const SHOTS
clients/desktop/playwright/1051-sol-first-adversarial-real-qa/1051-sol-first-adversarial-real-qa.spec.ts → const SHOTS
```

## RED-A — 수정 후

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts

Test Files  1 passed (1)
Tests       62 passed (62)
```

가드 우회 없이 H-2/G3a를 포함한 62개가 통과했다.

## 라이브QA 재실행 확인

renderer `:5175`와 `samhan-inventory-service`를 로컬에서 기동한 뒤 신규 스펙을 실제 실행했다.

```text
npx playwright test --config=playwright.real-qa.config.ts --reporter=line \
  playwright/1051-sol-first-adversarial-real-qa/1051-sol-first-adversarial-real-qa.spec.ts

Running 1 test using 1 worker
Error: QA 자격이 없습니다: ...\infrastructure\.env.local에 QA_DEV_DEFAULT_PASSWORD를 입력하거나 표준 환경변수를 설정하십시오.
code: QA_CREDENTIAL_MISSING
1 failed
```

이 워크트리에는 `QA_DEV_DEFAULT_PASSWORD` 환경변수·`infrastructure/.env`·`infrastructure/.env.local`이 모두 없었다. 따라서 인증 이후의 화면 검증과 PNG 생성은 실행하지 못했으며, 자격 증명을 우회하거나 가짜 증거를 만들지 않았다. 스펙 모듈 로딩 시 helper가 생성한 출력 루트는 다음 `_local` 경로다.

```text
docs/qa/2026-08-11-1051-real-qa/_local/
docs/qa/2026-08-11-1051-sol/_local/
```

기존 커밋 증거 PNG는 원본 `docs/qa/<slug>/`에 그대로 보존된다.

## Desktop 검증

```text
npm run build       exit 0
npm run typecheck   exit 0
npm run lint        exit 0 — 0 errors, 158 pre-existing warnings
npm test            exit 0
```

Vitest JSON 집계:

```text
653 test files
2,182 tests · 2,181 passed · 0 failed · 1 skipped
```

요청 기준 `2,201 passed 이상`보다 20건 적은 로컬 집계이며, 이를 green으로 과장하지 않는다. 이번 변경은 두 Playwright 캡처 경로만 수정했다.

검증 후 이 세션에서 기동한 renderer와 `samhan-inventory-service`는 중지했다.

## PM blocker 해소 후 후속 라이브QA

PM이 `infrastructure/.env.local`을 복사한 뒤, 5173·5175·5181 점유가 없음을 확인하고 이 워크트리의 renderer(:5175)와 `samhan-inventory-service`만 기동했다. 두 스펙을 같은 명령으로 실제 실행한 결과는 다음과 같다.

```text
npx playwright test --config=playwright.real-qa.config.ts --reporter=line \
  playwright/1051-broken-ref-real-qa/1051-broken-ref-real-qa.spec.ts \
  playwright/1051-sol-first-adversarial-real-qa/1051-sol-first-adversarial-real-qa.spec.ts

Running 2 tests using 1 worker
1 passed (16.6s)
1 failed
```

첫 번째 스펙은 `resolveQaShotsDir()` 출력 경로에 PNG를 생성했다. 직접 확인한 PNG에는 로그인 화면이나 빈 화면이 아니라 `재고 현황` 제목, 창고 조회 UI, `참조 끊김`·`제품 마스터 없음` 행과 수량 표가 표시되어 있었다.

```text
docs/qa/2026-08-11-1051-real-qa/_local/1051-broken-reference-balance-screen.png
```

두 번째 스펙은 로그인 및 `재고 현황` 화면 도달 후 다음 기존 데이터 전제 단정에서 실패했다.

```text
Expected substring: "총 55건"
Received string:  "총 102건이전1 / 3다음"
at 1051-sol-first-adversarial-real-qa.spec.ts:58
```

현재 공유 DB의 본사창고 조회 결과는 102건·3페이지다. 스펙은 `warehouseId`를 선택해 API에 전달하고 있으며, 공유 DB는 쓰지 않았다. 따라서 55건 전제를 임의로 완화하거나 DB를 변경하지 않았고, 두 번째 확정 PNG는 생성되지 않았다. renderer와 `samhan-inventory-service`는 후속 검증 후 중지했다.

## 공유 DB 비결정성 수정

개발책임자 지시에 따라 라이브QA 스펙의 공유 DB 절대값 단정을 제거했다.

### 단정하는 관계와 이유

- 두 스펙 모두 창고 옵션이 로드된 뒤 `본사창고`를 선택한다. 전체 창고 조회의 환경별 변동을 피하면서, 끊긴 참조가 관찰되는 동일 업무 경계를 명시한다.
- 끊긴 행과 `제품 마스터 없음` 표시가 존재하고, 정상 행도 함께 존재하는지 단정한다. 이는 관용 처리가 누락 행 때문에 정상 잔액을 버리지 않는다는 핵심 증거다.
- 총 건수와 페이지 수의 관계를 `ceil(total / 50) == totalPages`로 검증한다. 실제 총량이나 실제 페이지 수는 단정하지 않는다.
- 현재 페이지 행 수는 `1..50` 범위만 검증하고, 다음 페이지로 이동한 뒤 이전 페이지로 돌아와 끊긴 행과 페이지 상태가 유지되는지 검증한다.
- 끊긴 행의 가용·실재고 수량이 0으로 채워지지 않고 `가용 == 실재고`인지를 검증한다. 복사 결과도 고정 창고 코드 대신 실제 행의 창고 코드를 사용한다.

이 관계들은 공유 데이터가 55건이든 102건이든 유지되어야 하는 동작 계약이며, `lookupAllowMissing`이 없으면 끊긴 행 자체가 사라지므로 단순 존재 확인보다 강한 검증이다.

첫 번째 스펙에도 같은 이유로 `본사창고` 옵션 로딩·선택을 추가했다. 절대 건수 단정은 추가하지 않았다.

### 정상 구현 GREEN

```text
npx playwright test --config=playwright.real-qa.config.ts --reporter=line \
  playwright/1051-broken-ref-real-qa/1051-broken-ref-real-qa.spec.ts \
  playwright/1051-sol-first-adversarial-real-qa/1051-sol-first-adversarial-real-qa.spec.ts

Running 2 tests using 1 worker
2 passed (4.5s)
```

생성·직접 확인한 로컬 PNG:

```text
docs/qa/2026-08-11-1051-real-qa/_local/1051-broken-reference-balance-screen.png
docs/qa/2026-08-11-1051-sol/_local/1051-sol-first-adversarial-real-qa.png
```

두 PNG 모두 로그인/빈 화면이 아니라 `재고 현황` 화면이며, `본사창고`, 정상 품목 행, `참조 끊김`·`제품 마스터 없음` 행, 0이 아닌 재고 수량이 보인다.

### 뮤테이션 RED 원문

검증을 위해 `StockService`의 단 한 줄을 임시로 `lookupAllowMissing(chunkIds)`에서 `lookup(chunkIds)`로 바꾸고 inventory-service를 재빌드·재기동했다. 공유 DB에는 쓰지 않았다.

```text
npx playwright test --config=playwright.real-qa.config.ts --reporter=line \
  playwright/1051-sol-first-adversarial-real-qa/1051-sol-first-adversarial-real-qa.spec.ts

Running 1 test using 1 worker
1 failed

Expected substring: "참조 끊김"
Received string: "품목코드품목명창고코드창고명창고구분가용재고예약재고실재고조회 결과가 없습니다."
at 1051-sol-first-adversarial-real-qa.spec.ts:56
```

strict lookup 뮤테이션에서 누락 제품을 관용 표시하지 못하고 결과가 사라져 RED가 됐다. 검증 직후 소스를 `lookupAllowMissing`으로 원복하고 inventory-service 정상 이미지를 재빌드·재기동했다.

## 최종 상태

- 하네스 거짓 green 가드: `62 passed (62)`, exit 0.
- Desktop typecheck: exit 0. 앞서 같은 변경 범위에서 build와 lint도 exit 0, lint는 기존 warning 158건·error 0건이었다.
- Vitest: `2,181 passed / 0 failed / 1 skipped`로 확인했다.
- 뮤테이션 뒤 `StockService`의 실제 소스는 `lookupAllowMissing(chunkIds)`로 복원되어 있다.
- `git diff --check` 통과. 가드 테스트 파일은 수정하지 않았고 allowlist·probeNames·skip도 추가하지 않았다.
- 최종 PNG는 각각 326,358 bytes와 316,476 bytes이며, 두 라이브QA 종료 후 전용 renderer와 `samhan-inventory-service`를 중지했다. 확인 대상 포트 5173·5175·5181에는 남은 listener가 없다.
