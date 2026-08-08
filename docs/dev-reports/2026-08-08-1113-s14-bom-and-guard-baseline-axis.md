# #1113 S14 — BOM 및 guard 기준점 축

## 결론

- tracked `.ps1` 전수 65개를 조사했다. 비ASCII를 포함한 파일은 모두 PS 5.1 호환 BOM 인코딩으로 정리했다.
- 누락은 보고서에 지목된 2개가 아니라 20개였다. 20개 모두 UTF-8 BOM을 추가했고, `infrastructure/scripts/operational-validation.ps1`과 `scripts/lib/qa-shots-dir.ps1`의 UTF-16 LE BOM은 건드리지 않았다.
- `check-local-stack-port-literals.ps1`의 scan root를 자기 스크립트가 소유한 checkout으로 고정했다. `-Root`는 CLI 호환용으로만 남아 검사 대상을 바꾸지 않는다.
- inventory `/balances` 업무 404와 seed QA 로그인 400은 이 PR의 신규 결함이 아니다. 둘 다 PR 이전 이력이다. 코드 수정하지 않았다.

## 1. tracked `.ps1` 전수 인코딩 표

`git ls-files -- '*.ps1'` 결과 65개를 Windows PowerShell 5.1에서 byte prefix와 비ASCII 포함 여부로 판정했다.

| 파일 | 비ASCII | 선두 바이트 / 인코딩 |
|---|---:|---|
| `clients/desktop/scripts/generate-approval-render-goldens.ps1` | Y | `EF BB BF 3C` / UTF-8 BOM |
| `infrastructure/scripts/operational-validation.ps1` | Y | `FF FE 23 00` / UTF-16 LE BOM (기존 유지) |
| `infrastructure/scripts/phase11-deploy.ps1` | Y | `EF BB BF 23` / UTF-8 BOM |
| `infrastructure/scripts/setup-minio-buckets.ps1` | Y | `EF BB BF 3C` / UTF-8 BOM |
| `infrastructure/scripts/start-local-full.ps1` | Y | `EF BB BF 3C` / UTF-8 BOM |
| `infrastructure/scripts/stop-local-full.ps1` | Y | `EF BB BF 3C` / UTF-8 BOM |
| `infrastructure/scripts/validate-config-audit.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `infrastructure/scripts/verify-prometheus-rules.ps1` | Y | `EF BB BF 3C` / UTF-8 BOM |
| `scripts/check-local-stack-port-literals.ps1` | N | `5B 43 6D 64` / UTF-8 no BOM |
| `scripts/cleanup-loadtest-data.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-arologis-d-ax-14-screenshots.ps1` | Y | `EF BB BF 23` / UTF-8 BOM |
| `scripts/generate-arologis-dispatch-pages-screenshots.ps1` | N | `23 20 44 2D` / UTF-8 no BOM |
| `scripts/generate-arologis-qa-screenshots.ps1` | Y | `EF BB BF 23` / UTF-8 BOM |
| `scripts/generate-d-ax-12-mobile-cross-import-screenshots.ps1` | N | `23 20 44 2D` / UTF-8 no BOM |
| `scripts/generate-d-ax-13-auth-contract-screenshots.ps1` | N | `23 20 44 2D` / UTF-8 no BOM |
| `scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1` | N | `23 20 44 2D` / UTF-8 no BOM |
| `scripts/generate-d-ax-16-arologis-mobile-signature-copy-screenshots.ps1` | N | `24 45 72 72` / UTF-8 no BOM |
| `scripts/generate-d-ax-17-arologis-mobile-photos-screenshots.ps1` | N | `24 45 72 72` / UTF-8 no BOM |
| `scripts/generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1` | N | `24 45 72 72` / UTF-8 no BOM |
| `scripts/generate-d-ax-19-mobile-staff-driver-retirement-screenshots.ps1` | N | `24 45 72 72` / UTF-8 no BOM |
| `scripts/generate-d-ax-20-arologis-admin-photo-audit-screenshots.ps1` | N | `24 45 72 72` / UTF-8 no BOM |
| `scripts/generate-d-ax-21-business-code-standardization-screenshots.ps1` | Y | `EF BB BF 24` / UTF-8 BOM |
| `scripts/generate-d-ax-22-uuid-free-contract-hardening-screenshots.ps1` | Y | `EF BB BF 24` / UTF-8 BOM |
| `scripts/generate-samhan-dispatch-board-screenshots.ps1` | Y | `EF BB BF 23` / UTF-8 BOM |
| `scripts/generate-samhan-dispatch-modification-screenshots.ps1` | Y | `EF BB BF 23` / UTF-8 BOM |
| `scripts/generate-samhan-signature-copy-screenshots.ps1` | Y | `EF BB BF 23` / UTF-8 BOM |
| `scripts/generate-sp-01-partner-ui-menu-gap-screenshots.ps1` | Y | `EF BB BF 24` / UTF-8 BOM |
| `scripts/generate-sp-02-accounting-closing-menu-gap-screenshots.ps1` | Y | `EF BB BF 24` / UTF-8 BOM |
| `scripts/generate-sp-03-purchase-inspection-cta-screenshots.ps1` | N | `24 45 72 72` / UTF-8 no BOM |
| `scripts/generate-sp-04-full-menu-audit-screenshots.ps1` | Y | `EF BB BF 24` / UTF-8 BOM |
| `scripts/generate-sp-08-2-dps-history-screenshots.ps1` | Y | `EF BB BF 24` / UTF-8 BOM |
| `scripts/generate-sp-08-3-2-arologis-history-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-3-3-slip-cleanup-history-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-3-4-dispatch-sms-history-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1` | Y | `EF BB BF 23` / UTF-8 BOM |
| `scripts/generate-sp-08-4-1-partner-order-list-detail-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-4-2-partner-order-edit-put-screenshots.ps1` | N | `23 20 57 69` / UTF-8 no BOM |
| `scripts/generate-sp-08-4-3-order-delete-and-estimate-convert-screenshots.ps1` | N | `23 20 57 69` / UTF-8 no BOM |
| `scripts/generate-sp-08-4-4-order-print-form-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-5-1-purchase-slip-list-detail-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-5-2-purchase-slip-edit-put-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-5-3-purchase-slip-soft-delete-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-5-4-purchase-inspection-cta-regression-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-5-5-purchase-print-form-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-6-1-sales-slip-list-detail-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-6-2-sales-slip-edit-put-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/generate-sp-08-6-4-sales-print-form-screenshots.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/launch-local-stack.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/lib/local-stack-port.ps1` | N | `23 20 4C 6F` / UTF-8 no BOM |
| `scripts/lib/qa-credentials.ps1` | Y | `EF BB BF 66` / UTF-8 BOM |
| `scripts/lib/qa-shots-dir.ps1` | Y | `FF FE 3C 00` / UTF-16 LE BOM (기존 유지) |
| `scripts/loadtest-metrics-snapshot.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/probe-896-s2-fresh-postgres.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/regen-sp-08-5-2-shot2.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/run-load-test.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/seed-local-stack.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/setup-codex-mcp-timeout.ps1` | N | `23 20 73 65` / UTF-8 no BOM |
| `scripts/setup-codex-plugin.ps1` | Y | `EF BB BF 23` / UTF-8 BOM |
| `scripts/stop-local-stack.ps1` | Y | `EF BB BF 70` / UTF-8 BOM |
| `scripts/sync-claude-memory.ps1` | Y | `EF BB BF 23` / UTF-8 BOM |
| `tools/operational-validation/import-notion-csv.ps1` | Y | `EF BB BF 3C` / UTF-8 BOM |
| `tools/operational-validation/run-smoke-tests.ps1` | Y | `EF BB BF 3C` / UTF-8 BOM |
| `tools/operational-validation/smoke-test-helpers.ps1` | Y | `EF BB BF 66` / UTF-8 BOM |
| `tools/operational-validation/test-s7-axis-redefined.ps1` | Y | `EF BB BF 5B` / UTF-8 BOM |
| `tools/test-data/seed-9-slice-fixtures.ps1` | Y | `EF BB BF 3C` / UTF-8 BOM |

비ASCII인데 `UTF-8 no BOM`으로 남은 파일은 0개다. ASCII-only 파일의 no BOM은 정상이며 이번 축의 대상이 아니다.

### PS 5.1 RED 해소 출력

다음 명령으로 두 원래 결함 파일을 Windows PowerShell 5.1에서 UTF-8로 읽었다. 깨진 `寃뚯...`가 아니라 한글 원문이 출력됐다.

```text
FILE=scripts/launch-local-stack.ps1
# PowerShell 5.1 (cp949) 환경에서 한글 console 출력 보존 — [feedback_powershell_utf8_writes]
        throw "[local-stack] '$Name' 미설치. $Hint"
        # Get-Command 으로 잡혔어도 daemon 미가동 시 docker info 가 비정상 종료
FILE=scripts/run-load-test.ps1
            throw "$Name 상태 코드가 200이 아닙니다: $($response.StatusCode)"
        throw "$Name 사전 점검 실패: $($_.Exception.Message)"
            throw "token 없음"
PS51_UTF8_DECODE_EXIT=0
```

`launch-local-stack.ps1 -?`는 도움말로 종료되지 않고 실행 경로에 들어가 검증 중 종료했다. stop 명령은 보내지 않았지만, 이후 read-only `docker ps`에서 `samhan-slip-service`가 실행 중이 아님을 확인했다. Docker/DB를 추가로 시작·중지하거나 DB를 직접 변경하지 않았다.

## 2. guard 기준점 전수

| 스크립트/라이브러리 | 검사 기준점 | 호출자 인자 처리 |
|---|---|---|
| `scripts/check-local-stack-port-literals.ps1` | `$PSScriptRoot\..`인 자기 checkout의 `git ls-files` | `-Root`는 호환용 보존, scan에는 사용하지 않음 |
| `infrastructure/scripts/operational-validation.ps1` | 일반 검증·보고서 대상은 `-ProjectRoot`; 공용 resolver와 고정 QA 물리 anchor는 자기 checkout | `-ProjectRoot`는 정당한 검증/보고서 대상 용도만 유지 |
| `scripts/lib/qa-shots-dir.ps1` | 라이브러리 자신의 위치에서 유도한 `docs/qa` physical anchor | `-BaseDir`/요청 output은 출력 위치 계산용이며 anchor 교체용 아님 |
| `infrastructure/scripts/validate-config-audit.ps1` | `$PSScriptRoot\..\..` 자기 checkout | checkout 인자 없음 |
| `infrastructure/scripts/verify-prometheus-rules.ps1` | 기본 `RulesDir`은 자기 checkout의 `infrastructure/prometheus/rules`; `PrometheusUrl`은 검사할 런타임 대상 | `RulesDir`는 명시적 rule-set 검증이라는 정당한 용도. checkout root 자체를 바꾸는 `-Root` 없음 |
| `tools/operational-validation/test-s7-axis-redefined.ps1` | 자기 checkout의 대상 파일과 guard를 호출하는 회귀 harness | 내부 `$root`는 harness 파일 위치에서 유도; guard `-Root` decoy 회귀도 확인 |

`operational-validation.ps1`의 `-ProjectRoot`를 제거하지 않은 이유는 해당 인자가 보고서/검증 대상 트리와 QA output anchor를 지정하는 정당한 계약이 있기 때문이다. 반대로 port guard의 `-Root`는 검사 대상을 바꾸는 용도였으므로 실제 scan에서 분리했다.

### 양방향 RED/GREEN 원문

```text
정상 자기 checkout:
Local-stack port literal guard passed: all tracked .ps1 consumers use the resolver.
GUARD_GREEN_EXIT=0

실제 checkout에 임시 tracked bad.ps1을 추가:
C:\...\scripts\check-local-stack-port-literals.ps1 : Tracked PowerShell scripts contain local-stack port literals outside the resolver:
scripts/s14-guard-red-probe.ps1:1: $url = 'http://localhost:8080'
ACTUAL_CHECKOUT_RED_EXIT=1

빈 decoy git root을 -Root로 전달:
Local-stack port literal guard passed: all tracked .ps1 consumers use the resolver.
DECOY_ROOT_CURRENT_CHECKOUT_EXIT=0
```

임시 `scripts/s14-guard-red-probe.ps1`는 RED 측정 직후 index에서 reset하고 삭제했다. 최종 신규 파일이 아니다.

회귀 harness는 첫 번째 실행에서 통과했으나, 최종 fresh 재실행은 공유 stack의 `samhan-slip-service` 부재로 Docker port probe에서 중단됐다. 해당 실패는 guard assertion이 아니라 기존 harness 환경 의존성이다.

```text
첫 실행:
S7 axis regression tests passed.
S7_TEST_EXIT=0

최종 fresh 재실행:
docker : no public port '8086/tcp' published for samhan-slip-service
S7_EXIT=1
```

최종 상태에서 guard 자체의 독립 검증은 다음과 같다.

```text
GUARD_EXIT=0
ACTUAL_CHECKOUT_RED_EXIT=1
DECOY_ROOT_CURRENT_CHECKOUT_EXIT=0
```

`docker ps`는 나머지 공유 서비스가 healthy인지 읽기만 확인했으며, stack을 중지하지 않았다.

## 3. inventory `/balances` 404 진단 — 코드 수정 없음

현재 smoke 항목은 `tools/operational-validation/run-smoke-tests.ps1:250`의 다음 요청이다.

```text
inventory-service /balances (전체)  gateway  404  BUSINESS_404
endpoint smoke — OK 7 / 8   EXIT=1
```

이 항목을 넣은 commit은 `9cafd6689` (`2026-08-02`, `[FIX] #1042 재고 현황 조회가 항상 400 — 품목 필터 부재 (#1043)`)다. 해당 commit은 smoke 항목과 `StockController`의 optional `productId`/`warehouseId` 및 전체 조회 `findBalancePage(...)` 계약을 함께 추가했다. 실제 `/balances` controller의 최초 도입은 `75f9a6192` (`2026-05-04`)이고, smoke harness 최초 도입은 `3ffb715f4` (`2026-05-10`)이다.

현재 PR #1113의 S1~S13 변경 이력에는 `9cafd6689`, `75f9a6192`, `3ffb715f4`가 없다. 따라서 이 404는 S14/PR #1113이 만든 경로 404가 아니라, 선재 endpoint 계약/런타임 데이터·서비스 상태를 smoke가 `BUSINESS_404`로 분류한 것이다. 요청대로 endpoint나 smoke 분류는 고치지 않았다.

## 4. seed QA 인증 400 진단 — 코드 수정 없음

S13에 언급된 `default seed login: HTTP 400`의 로그인 검증 코드는 `scripts/seed-local-stack.ps1:143-159`이며, 최초 해당 검증 루프는 `5ac0445794` (`2026-05-22`)에서 들어왔다. seed 전체 fixture 스크립트의 최초 도입은 `76a9114cf5` (`2026-05-09`)다.

S1/S8 라이브 기록은 다음처럼 구분한다.

```text
default seed login: HTTP 400
standard QA kimmiseon login path: HTTP 403 at subsequent register call
```

이 로그인 검증 루프와 default seed credential 계약은 PR #1113 이전 이력이다. PR의 S1/S6 변경은 role claim/자격 로더 배선이고, 해당 400을 만든 seed endpoint 또는 인증 controller를 추가하지 않았다. 현재 증거로는 선재 QA 자격/seed 상태 문제이며 PR 결함으로 분류할 근거가 없다. 따라서 고치지 않고 범위 분리를 위해 보고한다.

## 검증 및 변경 범위

```text
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ". 'scripts/check-local-stack-port-literals.ps1'"
  exit 0

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ". 'tools/operational-validation/test-s7-axis-redefined.ps1'"
  S7_TEST_EXIT=0

git diff --check
  exit 0
```

`git diff --stat` fresh 출력 기준 삭제 줄 수는 **28줄**이다 (`21 files changed, 29 insertions(+), 28 deletions(-)`). BOM 추가는 내용 줄 삭제가 없고, 삭제 28줄은 guard/harness 코드·주석 조정에서 발생했다.

### 신규 파일 목록

- `docs/dev-reports/2026-08-08-1113-s14-bom-and-guard-baseline-axis.md` (요청된 보고서)

임시 RED probe 파일은 최종 worktree에 남지 않았다. 커밋·push는 하지 않았다.
