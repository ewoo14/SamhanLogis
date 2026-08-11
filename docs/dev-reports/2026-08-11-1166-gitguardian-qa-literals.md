# PR #1166 격리QA 리터럴 GitGuardian 대응

## 결론

선택지는 **A — 리터럴 제거**다.

값 단위 예외를 `.gitguardian.yaml`에 추가하는 B보다, 격리QA 전용 자격을 저장소에 남기지 않고 실행 시 주입·생성하는 A가 안전하다. 따라서 GitGuardian의 탐지 범위를 줄이지 않으며, 이후 `clients/desktop/playwright/` 아래에 진짜 자격이 추가되어도 기존 가드가 계속 탐지한다.

## 원인 확인

- 탐지된 세 값은 지정된 `1166-order40-*-real-qa` 스펙 3개에만 존재했다.
- 저장소 전체에서 동일 값이 서비스 설정, compose 설정, 환경 템플릿과 일치하는 흔적은 확인되지 않았다.
- 현재 실행 환경에도 해당 격리 서비스 컨테이너는 없었고, 남아 있던 것은 `sol3-1166-*` PostgreSQL 컨테이너뿐이었다.
- 따라서 실제 서비스 자격 rotation이 필요한 상황으로 판단할 근거는 없었다.

## 변경 내용

| 대상 | 변경 | 검증 계약 |
|---|---|---|
| `1166-order40-fix3-real-qa.spec.ts` | 브라우저 전용 토큰을 `randomBytes(32)`로 실행 시 생성하고 `addInitScript` 인자로 전달 | HTTP 헤더와 주문·화면 단언은 그대로 유지 |
| `1166-order40-sol-review2-real-qa.spec.ts` | JWT HMAC 키를 필수 `SAMHAN_QA_JWT` 환경변수에서 읽음 | 기존 HS256 서명·claims·검증 흐름 유지 |
| `1166-order40-sol-review3-real-qa.spec.ts` | 내부 토큰을 필수 `SAMHAN_QA_INTERNAL_TOKEN` 환경변수에서 읽고 브라우저 전용 토큰은 실행 시 생성 | `X-Internal-Token` 요청과 모든 가격·저장·화면 단언 유지 |

실행 시 격리 환경은 다음 두 환경변수를 주입해야 한다.

```text
SAMHAN_QA_JWT=<격리 서비스와 동일한 JWT HMAC 키>
SAMHAN_QA_INTERNAL_TOKEN=<격리 서비스와 동일한 내부 토큰>
```

두 값은 명령행이나 저장소에 기록하지 않는다. 환경변수가 없으면 스펙이 모호하게 인증 실패하지 않고 명시적으로 중단된다.

## RED-A / 검증 원문

### 리터럴 제거 회귀 검증

변경 전에는 지정된 세 스펙에서 secret-like QA 리터럴 4건이 검출되어 의도대로 RED가 발생했다.

변경 후 원문:

```text
GREEN: no secret-like QA literals found in all 3 target specs
```

### 스펙 수집

```text
1166-order40-sol-review2-real-qa.spec.ts: 2 tests in 1 file
1166-order40-fix3-real-qa.spec.ts: 1 test in 1 file
1166-order40-sol-review3-real-qa.spec.ts: 2 tests in 1 file
```

### 타입·격리 스코프

```text
npx tsc -p tsconfig.node.json --noEmit
Exit code: 0

npm run typecheck:real-qa
tests 51
pass 51
fail 0
```

### 라이브 실행 시도

RED-A의 라이브 통과 실행은 현재 워크트리의 격리 인프라 부재로 완료하지 못했다. 임시로 기존 PostgreSQL 컨테이너와 서비스 jar를 기동해 세 스펙을 실행하려 했으나, 두 번 모두 Playwright assertion 단계 전에 하네스 기동이 중단됐다.

```text
proxy node -e: SyntaxError: Unexpected end of input
dc-config-service: FATAL: password authentication failed for user "sol3qa"
retry: PostgreSQL port 55432 did not become ready
```

첫 번째 원인은 임시 프록시 인자 전달과 기존 DB role 준비 순서였고, 두 번째 시도는 DB ready 대기 자체에서 중단됐다. 이 실패들은 변경된 스펙의 assertion 실패가 아니며, QA 프로세스·서비스·컨테이너는 정리했다. 따라서 이 세션에는 라이브 `passed` 원문이 없다. 격리 서비스가 정상 기동된 환경에서 아래 명령을 실행해야 한다.

```powershell
cd clients/desktop
$env:SAMHAN_QA_JWT = '<격리 서비스 JWT 키>'
$env:SAMHAN_QA_INTERNAL_TOKEN = '<격리 서비스 내부 토큰>'
npx playwright test --config=playwright/1166-order40-sol-review2-real-qa/playwright.config.ts --reporter=line
npx playwright test --config=playwright/1166-order40-fix3-real-qa/playwright.config.ts --reporter=line
npx playwright test --config=playwright/1166-order40-sol-review3-real-qa/playwright.desktop.config.ts --reporter=line
```

## 불변식 확인

- 저장소에 secret-like 격리QA 값 0건.
- 실제 JWT 서명 방식과 claims, 내부 토큰 헤더, 테스트 단언은 변경하지 않았다.
- `-real-qa` 디렉토리·파일명 규약은 유지했다.
- `.gitguardian.yaml`은 변경하지 않았고, `clients/desktop/playwright/**` 같은 넓은 `ignored-paths`도 추가하지 않았다.
- 따라서 향후 해당 경로의 진짜 secret은 GitGuardian이 계속 검사한다.
