# SP-09-1 NTS e-Tax 발행 shell — Codex DevOps Cycle 1 후반 리뷰

브랜치: `feat/sp-09-1-nts-etax-emit-shell`  
HEAD: `7363a729`  
범위: Section E — env, Flyway, IT isolation, CI

## 결론

**cycle 2 진입 권고.** Claude DevOps cycle 1의 ENV 문서 누락, 기존 IT `@MockBean ETaxClient`, V16 unique index는 반영됐다. 남은 DevOps 리스크는 placeholder API key가 NTS 모드 runtime guard를 통과한다는 점과, backend compile/test 검증이 로컬 Gradle wrapper lock 접근 거부로 확인되지 않았다는 점이다.

## 결함

### MEDIUM — `PLACEHOLDER_DEV_ONLY`가 NTS runtime key guard를 통과함

- 위치: `infrastructure/env-templates/accounting-service.env:37-39`, `ETaxClientImpl.java:105-113`
- 현상: env template은 `NTS_API_KEY=PLACEHOLDER_DEV_ONLY`를 둔다. `submitNts()`는 blank 여부만 검사하므로 placeholder를 유효한 키처럼 취급한다.
- 영향: 운영자가 `ETAX_SUBMIT_METHOD=NTS`만 전환하면 “키 미설정”이 아니라 미구현/외부 호출 실패로 진행된다. Phase 11 AWS/운영 PC 전환 때 설정 사고 감지가 늦어진다.
- 권고: NTS 모드에서 `PLACEHOLDER_DEV_ONLY`를 명시 거부하거나, `NTS_API_KEY` 기본값을 빈 값으로 두고 문서에만 placeholder 예시를 둔다.

### MEDIUM — backend compile/test 검증 미확인

- 위치: Gradle wrapper runtime
- 현상: `.\gradlew.bat :services:accounting-service:compileJava :services:accounting-service:compileTestJava` 실행이 `C:\Users\user\.gradle\wrapper\dists\...\gradle-8.10.2-bin.zip.lck (액세스가 거부되었습니다)`로 실패했다.
- 영향: PR #236 head `7363a729`에 대해 Codex 환경에서 accounting-service 컴파일 검증을 완료하지 못했다. CI green 여부와 별도로 cycle 1 후반 local evidence가 부족하다.
- 권고: 잠금 프로세스 정리 후 compile/test 재실행 또는 GitHub checks evidence로 대체 확인한다.

### LOW — `.github/workflows/ci.yml` 변경 없음은 적절하나 PR-specific Playwright 경로는 CI hard gate가 아님

- 위치: `.github/workflows/ci.yml` 변경 없음, `clients/desktop/playwright/sp-09-1-nts-etax-emit-shell/...`
- 현상: 이번 PR은 별도 Playwright spec을 추가했지만 CI matrix 변경은 없다. 기존 정책상 PR별 QA screenshot 산출물로 보완하는 패턴은 가능하나, spec 자체가 CI hard gate인지 확인되지 않는다.
- 영향: T5/T1/T3 같은 QA spec 결함이 CI에서 merge blocker로 잡히지 않을 수 있다.
- 권고: PR 본문에 실행 명령/결과를 명확히 남기고, 장기적으로 slice-specific Playwright spec discovery를 CI에 포함한다.

## Claude cycle 1 fix cross-check

| Claude 항목 | Codex 판정 | 근거 |
|---|---|---|
| D1 ENV 템플릿/문서 미갱신 | FIXED | `accounting-service.env`, `dev-environment-setup-multi-pc.md`에 ETAX/NTS 추가 |
| D2 기존 IT `ETaxClient @MockBean` 미추가 | FIXED | `rg` 기준 accounting IT 다수에 `@MockBean ETaxClient` 추가 확인 |
| D3 partial UNIQUE 인덱스 미존재 | FIXED | V16 추가 |
| D4 FE `REAL` vs BE `NTS` 불일치 | FIXED | FE 타입 정정 |
| credential plaintext guard | PASS(정적) | `sk-`, `AKIA`, JWT-like secret 패턴은 신규 ETAX 영역에서 확인되지 않음 |
| CI workflow 변경 없음 | PASS | 신규 env/test/doc 범위라 workflow 변경 불필요 판단 가능 |

## 검증

- `npm run typecheck` (`clients/desktop`) — PASS
- Gradle compile/test — 미완료. wrapper `.lck` 접근 거부로 실행 실패

## TM 결정안

**cycle 2 진입 권고.** DevOps merge blocker는 placeholder runtime guard 또는 운영 전환 명시화다. 로컬 backend compile은 환경 lock 해소 후 재검증 필요.
