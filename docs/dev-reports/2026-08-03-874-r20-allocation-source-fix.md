# PR #1057 선재 결함 흡수 보고서

- 작업일: 2026-08-03
- 대상: `feat/874-set-riusage-global-dc`, HEAD `27aa1d4b6`
- 범위: 회계 매출전표 배분 원천 조회의 실 모드 경로 결함 1건
- 금지 범위: riUsage R14~R19 산출물 미변경, git commit/push 및 Docker 재기동 금지

## 작업 로그

### 단계 0 — 작업 보고서 생성

작업 시작 전에 본 보고서를 생성했습니다. 이후 조사·RED 재현·수정·검증 단계 종료 시 이 문서에 즉시 append합니다.

### 단계 1 — 현재 상태 확인 완료

- 작업 경로와 HEAD를 확인했습니다: `D:\dev\Samhan-Public\.claude\worktrees\w1057`, `27aa1d4b6`.
- 작업 트리에는 기존 사용자 산출물인 `docs/dev-reports/2026-08-03-874-live-qa.md`, `clients/desktop/playwright/874-riusage-global-dc-real-qa/`, `docs/qa/874-riusage-global-dc-real-qa/`가 있어 보존합니다.
- 이번 라운드 신규 보고서만 추가했으며, 커밋·푸시·Docker 명령은 수행하지 않았습니다.
- `AGENTS.md`, `docs/handoff/CURRENT-WORK.md`, `.codex/AGENTS.md`, `investigate/SKILL.md`를 읽고 조사 규칙과 작업 제약을 적용합니다.

### 단계 2 — 계열 sweep·근본 원인·RED 완료

#### 근본 원인

1. `clients/desktop/src/renderer/api/slipAllocationSourceApi.ts:140-147`은 mock 모드에서 `MOCK_SOURCE_SLIPS`를 반환하므로 결함을 덮었습니다.
2. mock OFF 분기 `:149-157`은 사용자 세션을 붙이는 공용 `apiClient`로 `GET /internal/slips/by-period`를 호출했습니다.
3. `services/api-gateway/src/main/resources/application.yml:411-413`은 P0-A 하드닝에 따라 `/internal/**`를 게이트웨이에 노출하지 않습니다. `/slips/**` 사용자 라우트는 이미 `:607-612`에 존재합니다.
4. `services/slip-service/.../SlipInternalController.java:71,472-483`의 원본 endpoint는 존재하지만 `SecurityConfig`의 `/internal/**` principal gate와 `@PreAuthorize("hasRole('MASTER')")`를 요구합니다. 사용자 `apiClient`의 세션 헤더를 내부 토큰으로 대체할 수 없습니다.

**Root cause hypothesis:** 화면 클라이언트가 사용자-facing gateway 경로가 아닌 service-to-service 전용 `/internal/**`를 호출하도록 배선되어, mock OFF 실 모드에서 gateway 404가 발생했습니다. 내부 endpoint나 gateway 하드닝의 결함이 아닙니다.

#### `/internal/**` 공용 `apiClient` 계열 sweep

클라이언트 소스 전체에서 `/internal/` 문자열을 찾은 뒤 `apiClient` HTTP 메서드의 실제 호출 인자까지 교차 확인했습니다. 실제 소비는 1건뿐입니다.

| 단정 내용 | 파일 | 처리 | Linux(ubuntu-latest)에서도 참인가 |
|---|---|---|---|
| `apiClient.get`가 실제 `/internal/**`를 호출 | `clients/desktop/src/renderer/api/slipAllocationSourceApi.ts:154-156` | 이번 라운드에서 사용자-facing 경로로 변경 | 예. `rg`/정적 소스 확인과 Vitest는 OS 독립 |
| `/internal/**`를 금지한다고만 적은 주석이며 실제 호출 아님 | `clients/desktop/src/renderer/api/groupwareApprovalTemplate.ts:174-177` | 기존 `/groupware/approval-templates/active` 호출 유지, 변경 없음 | 예. 호출 인자 정적 확인 |
| 나머지 `clients/**` 매치는 테스트 fixture·문서·브리지 문자열이며 공용 `apiClient` 호출 아님 | `clients/web/**`, `clients/arologis-mobile/**`, `clients/desktop/playwright/**` 등 | 처리 대상에서 제외, 별도 회귀 영향 없음 | 예. 파일/문자열 검색 결과는 OS 독립 |

#### RED 원문

프론트 RED:

```text
npm run test -- slipAllocationSourceApi.real-path.test.ts
[로컬 파생물 신선도 확인 실패] ... out\\main\\index.js ... npm run build
```

기존 pretest 신선도 게이트가 먼저 중단되어 `npx vitest run slipAllocationSourceApi.real-path.test.ts`로 테스트만 실행했습니다.

```text
1 test failed
AssertionError: expected "spy" to be called with arguments: [ Array(1) ]
Received:
- "/slips/by-period?type=OUTBOUND&from=2026-08-03&to=2026-08-03"
+ "/internal/slips/by-period?type=OUTBOUND&from=2026-08-03&to=2026-08-03"
```

백엔드 RED:

```text
./gradlew :services:slip-service:test --tests '...SlipPermissionControllerIT.allocationSource_realPath_withAccountingPermission_returnsApiResponse' --no-daemon
1 test completed, 1 failed
Status expected:<200> but was:<400>
Handler: SlipController#getOne(UUID, String, String, String)
ResolvedException: MethodArgumentTypeMismatchException
Request URI: /slips/by-period
```

둘 다 새 사용자-facing 매핑이 없어서 발생하는 의도된 RED입니다. 새 단정(프론트 호출 경로, 백엔드 매핑)은 Linux에서 동일한 TypeScript/Vitest 및 Spring MockMvc 계약으로 재현 가능합니다.

### 단계 3 — 하드닝 보존 수정 및 1차 GREEN 완료

#### 수정

- 신규 `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipAllocationSourceController.java`를 추가했습니다.
  - `GET /slips/by-period?type=OUTBOUND` → `accounting.sales-slip.list VIEW`
  - `GET /slips/by-period?type=INBOUND` → `accounting.purchase-slip.list VIEW`
  - 기존 `SlipRepository.findByPeriodWithLines`와 `SlipSummary` projection만 재사용합니다.
- `clients/desktop/src/renderer/api/slipAllocationSourceApi.ts:156`의 mock OFF URL을 `/slips/by-period`로 바꿨습니다.
- `SlipPermissionControllerIT`에 사용자 세션 + 회계 권한 경로의 MockMvc 회귀 테스트를 연결했습니다.

#### 하드닝 유지

- 기존 `GET /internal/slips/by-period`와 `SlipInternalController`는 변경하지 않았습니다.
- 게이트웨이 `application.yml`도 변경하지 않았습니다. 새 경로는 이미 JWT 인증이 붙은 `/slips/**` 라우트를 사용합니다.
- 새 사용자-facing 경로는 `X-Internal-Token`을 받거나 우회하지 않고, Spring `anyRequest().authenticated()`와 회계별 `@RequirePermission`을 통과해야 합니다.
- `X-User-Id`가 없거나 권한이 없으면 `@RequirePermission`이 fail-closed로 거부합니다. 내부 endpoint는 계속 `X-Internal-Token` + `system-internal` principal 전용입니다.

#### GREEN 원문

프론트:

```text
npx vitest run slipAllocationSourceApi.real-path.test.ts
Test Files  1 passed (1)
Tests       1 passed (1)
```

백엔드:

```text
./gradlew :services:slip-service:test --tests '...SlipPermissionControllerIT.allocationSource_realPath_withAccountingPermission_returnsApiResponse' --no-daemon
BUILD SUCCESSFUL in 31s
18 actionable tasks: 3 executed, 15 up-to-date
```

새 단정(새 `/slips/by-period` 매핑이 사용자 권한으로 200과 ApiResponse 배열을 반환)은 Linux에서도 Spring MockMvc로 동일하게 검증됩니다.

### 단계 4 — 반대급부 보안·INBOUND 회귀 검증 완료

- `SlipPermissionControllerIT` 전체를 실행해 OUTBOUND와 INBOUND 사용자-facing 분기 모두 `BUILD SUCCESSFUL`로 확인했습니다.
- `SlipInternalControllerIT.findByPeriod_missingInternalToken_returns403`를 실행해 기존 내부 전용 경로가 토큰 누락 시 계속 403임을 확인했습니다.
- 프론트 mock OFF 실 경로 테스트도 재실행해 `1 test passed`입니다.

이번 단계의 단정:

| 단정 | Linux(ubuntu-latest)에서도 참인가 |
|---|---|
| OUTBOUND는 `accounting.sales-slip.list` 권한 경로로 200 | 예. Spring MockMvc 테스트 계약 |
| INBOUND는 `accounting.purchase-slip.list` 권한 경로로 200 | 예. Spring MockMvc 테스트 계약 |
| 기존 `/internal/slips/by-period`는 `X-Internal-Token` 없이 403 | 예. SpringBoot/Testcontainers 기반 내부 보안 테스트 |

### 단계 5 — Desktop typecheck 완료

필수 명령을 6분 제한으로 재실행했고 전체 GREEN입니다.

```text
npm run typecheck
[로컬 파생물 신선도] typecheck 대상 확인 완료
tsc -p tsconfig.node.json --noEmit                 GREEN
tsc -p tsconfig.web.json --noEmit                  GREEN
real-qa-cleanup-scope.test.cjs: 2 passed
real-qa-scope.test.cjs: 50 passed, 0 failed
Process exited with code 0
```

실행 시간은 258.6초였습니다. 중간의 184초 timeout은 실패가 아니라 이 Windows 환경에서 50개 real-QA scope 테스트가 제한시간을 초과한 첫 시도였습니다. 최종 재실행은 통과했습니다. 출력 중 LF→CRLF warning은 기존 fixture 파일을 Git이 touch할 때의 경고이며, 이 라운드에서 해당 파일을 수정하지 않았습니다.

이번 단계의 단정:

| 단정 | Linux(ubuntu-latest)에서도 참인가 |
|---|---|
| Desktop TypeScript node/web project가 컴파일된다 | 예. `tsc --noEmit`는 Linux CI에서도 동일한 계약 |
| real-QA scope 회귀 52건이 통과한다 | 예. Node test와 파일/프로세스 경로는 OS 독립 계약이며, Linux에서는 Windows 경로 warning이 사라질 뿐 |

### 단계 6 — 변경 모듈 테스트 재확인 완료

```text
REAL_QA_SKIP_FRESHNESS_CHECK=1 npm run test -- slipAllocationSourceApi.real-path.test.ts
Test Files  1 passed (1)
Tests       1 passed (1)
```

`npm run test` 기본 실행은 기존 `out/main/index.js` 부재로 pretest 신선도 게이트에서 중단되므로, 이 라운드의 변경 모듈만 검증할 때는 명시된 skip 플래그를 사용했습니다. 테스트 자체는 mock OFF 분기에서 `apiClient.get` 호출 URL을 검증하며 mock fixture를 거치지 않습니다.

이 단정은 Linux(ubuntu-latest)에서도 참입니다. Vite/Vitest의 URL 인자·mock OFF 테스트 계약은 OS별 경로 차이에 의존하지 않습니다.

### 단계 7 — 변경 후 전수 스윕·권한 회귀·작업 트리 확인 완료

변경 후 `clients/**`에서 `/internal/`과 공용 `apiClient` 조합을 다시 검색했습니다. 실제 공용 `apiClient`의 `/internal/**` 호출은 0건입니다. `groupwareApprovalTemplate.ts`의 `internal` 문자열은 게이트웨이 비노출 정책을 설명하는 주석이고 실제 호출은 공개 `/groupware/approval-templates/active`입니다. `clients/web/estimate-app`의 `/internal/**` 호출은 별도 서버 측 `axios` 브리지이며 `X-Internal-Token`을 유지하는 기존 서버 간 호출이라 이번 공용 클라이언트 sweep 대상과 섞지 않았습니다.

최신 회귀 검증:

```text
./gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.it.SlipPermissionControllerIT' --no-daemon
BUILD SUCCESSFUL in 29s

./gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.it.SlipInternalControllerIT.findByPeriod_missingInternalToken_returns403' --no-daemon
BUILD SUCCESSFUL in 48s

git diff --check
passed
```

`SlipPermissionControllerIT`는 OUTBOUND/INBOUND 각각의 허용 경로와 권한 거부 경로를 포함합니다. 기존 `/internal/slips/by-period`는 내부 토큰 누락 시 계속 403입니다. 이 단정들은 Linux(ubuntu-latest)에서도 Spring MockMvc/Gradle 테스트 계약과 동일하게 참입니다.

이 라운드의 새 표면은 사용자 세션 JWT와 회계 화면별 `@RequirePermission`으로 보호되는 `GET /slips/by-period?type=OUTBOUND|INBOUND&from=...&to=...` 공개 읽기 경로 하나입니다. 기존 내부 경로와 게이트웨이의 `/internal/**` 비노출 하드닝은 변경하지 않았습니다.
