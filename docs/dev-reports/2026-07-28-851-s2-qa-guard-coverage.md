# 2026-07-28 #851 S2 QA 출력 경로 가드 coverage

## 결론

기획서의 `qa/playwright` “13파일”은 `docs/qa` 문자열이 등장하는 파일 수였다. 실제 커밋 산출물 쓰기 도달성으로 다시 세면 다음과 같다.

| 측정 대상 | 실측값 | 세는 방법 |
|---|---:|---|
| `docs/qa` 문자열 참조 파일 | 13 | `rg -l "docs/qa" qa/playwright` |
| 초기 캡처 writer 파일 | 11 | `rg -l "page\\.screenshot|captureForQa" qa/playwright` |
| 초기 직접 `docs/qa` 목적지 표현식 | 14 | `rg -n "path: 'docs/qa" qa/playwright` |
| 초기 resolver 출력 루트 | 10 | `qa/playwright`의 9개 `.mjs` 생성 스크립트 + `utils/screenshot.ts` |
| 초기 쓰기 도달 경로 표현식 합계 | **24** | 직접 목적지 14 + resolver 출력 루트 10 |
| 수정 후 직접 `docs/qa` 목적지 | **0** | 같은 검색을 재실행 |
| 수정 후 저장소 resolver 선언 | **10** | 소스 선언을 동적으로 발견하는 contract test |

따라서 13은 쓰기 경로 수가 아니며, 이 슬라이스의 실제 coverage 기준은 초기 24개 쓰기 표현식과 현재 발견된 10개 resolver 선언이다(`scripts/lib/qa-shots-dir.ps1` 포함 — 2026-07-28 재수렴 정정: 이전 판은 9로 적었으나 이는 이 파일이 신설되기 전 시점의 수였다). 14개 직접 캡처는 모두 `qa/playwright/utils/screenshot.ts`의 `captureForQa`로 이전했다.

## RED-first 증거

의존성 준비 후, 먼저 `scripts/lib/qa-shots-dir.mjs`를 기존 물리 alias 적대 테스트에 연결하고 실행했다. 아직 `.mjs` 가드가 없으므로 RED가 나왔다.

```text
✔ ... 기존 정상 경로 테스트 7개
✖ 물리적으로 docs/qa 아래인 junction·extended·표기 변형은 세 resolver가 차단한다
AssertionError: Missing expected exception: root-mjs:junction-root 물리 경로가 차단되지 않음
```

그 상태에서 테스트를 통과시키도록 조정하지 않고, `qa/playwright` 직접 캡처와 helper 자체의 물리 가드도 RED 조건으로 추가했다. 구현 전 재실행에서 4개 assert 가 실패했다(`tests 10 / pass 6 / fail 4`).

> 📌 **2026-07-28 R1 fix 라운드 정정(대조-2)** — 아래 원래 인용 4줄 중 2~4번째 줄이 실제 소스의 assert 실패 메시지와 달랐다(R1 적대검증 대조 각도 적발 — `git log --all -p -S"<각 문구>"` 로 전체 히스토리를 뒤져도 이 dev-report 자신에만 존재해 재현 불가였다). 1번째 줄만 실제 원문과 일치했다. 정정: 나머지 세 줄은 각 assert 를 소스와 동일한 형태로 독립 재현해 얻은 실제 Node 출력으로 바꾼다.

실패 1 — 물리 alias(junction 등) 미차단, `qa-output-path-guard.test.cjs:249`(2026-07-28 R4 재수렴 정정 C —
R3 시점 `:241` 에서 이 라운드가 추가한 UNC admin-share 회귀 케이스만큼 아래로 밀림) 커스텀 메시지 템플릿(원래 인용과 일치, 재확인):
```text
AssertionError: Missing expected exception: root-mjs:junction-root 물리 경로가 차단되지 않음
```

실패 2 — `qa/playwright` captureForQa 가 물리 alias 목적지를 차단하지 않음. `:271-274`(2026-07-28 R4 재수렴
정정 C — R3 시점 `:242-245`에서 밀림) 의 `assert.rejects` 호출에는 커스텀 메시지 파라미터가 없어 Node 기본 문구만 남는다(정정 전 인용 "물리 alias 목적지를 차단하지 않음"은 이 assert 가 실제로 낸 적 없는 문구였다):
```text
AssertionError [ERR_ASSERTION]: Missing expected rejection.
```

실패 3 — `qa/playwright` 직접 `path: 'docs/qa/...'` 캡처 14건 존재(구현 전). `:318`(2026-07-28 R4 재수렴
정정 C — R3 시점 `:289`에서 밀림) 실제 메시지 템플릿(정정 전 인용 "캡처 14건이 발견됨"과 달리 실제로는 "남아 있습니다"):
```text
AssertionError [ERR_ASSERTION]: 직접 docs/qa 캡처 경로 14개가 남아 있습니다
```

실패 4 — `qa/playwright` resolver 에 물리 판정 마커 없음(구현 전). `:396`(2026-07-28 R4 재수렴 정정 C —
R3 시점 `:332`에서 밀림) 실제 메시지 템플릿(상대경로는 재현용 예시, 정정 전 인용 "DOCS_QA_ROOT 가드 마커가 없음"과 달리 실제로는 "물리 경로 판정이 없습니다"):
```text
AssertionError [ERR_ASSERTION]: qa/playwright/utils/screenshot.ts 에 물리 경로 판정이 없습니다
```

```text
ℹ tests 10
ℹ pass 6
ℹ fail 4
```

각 RED 실행 전후에 `git status --porcelain`과 `git diff -- docs/qa`를 확인했다. 당시 `git status`에는 테스트/계획 파일만 있었고 `git diff -- docs/qa`는 빈 출력이었다.

## 적용한 수단

- Node `.mjs`, Python, Bash, PowerShell, `qa/playwright` TypeScript helper에 같은 계약을 적용했다.
- 문자열/논리 경로 비교가 아니라 기존 부모까지 올라가 `realpath` 계열로 물리 경로를 해석한다.
- Windows 표기 변형인 junction, `\\?\\` 확장 길이 접두사, 대소문자, 상대경로를 같은 물리 위치로 판정한다.
- `QA_ALLOW_OVERWRITE=1`일 때만 명시적인 승격 경로를 허용하고, 기본값은 기존과 같이 커밋 디렉터리의 `_local`이다.
- `qa/playwright` 직접 `page.screenshot({ path: 'docs/qa/...' })` 14건을 `captureForQa(page, test.info(), slug)`로 이전했다.
- 테스트가 저장소 소스에서 resolver 선언을 동적으로 발견하고, 각 파일에 물리 판정 marker가 있는지 검사한다. 현재 inventory 원문은 다음과 같다.

> 📌 **2026-07-28 재수렴 정정** — 아래 원래 인용은 `scripts/lib/qa-shots-dir.ps1`이 빠진 `count=9`였다. 이 파일은 이 슬라이스가 `scripts/*.ps1` 30개를 공용 resolver로 옮기며 신설한 파일이라 반드시 인벤토리에 있어야 하는데, `.gitattributes`에 UTF-16 예외 등록이 빠져 체크아웃마다 바이트가 손상되고(신규 클론에서만 재현) 그 결과 `readSourceText`가 소스를 디코드하지 못해 발견에서 조용히 빠졌었다(D-A, 2026-07-28 재수렴 BLOCKING). `.gitattributes` fix 후 HEAD 기준 실측 원문으로 교체한다.

```text
[QA resolver inventory] count=10 clients/desktop/playwright/support/qa-screenshot-dir.mjs, clients/desktop/playwright/support/qa-screenshot-dir.ts, clients/desktop/src/main/capture.ts, infrastructure/scripts/operational-validation.ps1, qa/playwright/utils/screenshot.ts, scripts/lib/qa_shots_dir.py, scripts/lib/qa-shots-dir.cjs, scripts/lib/qa-shots-dir.mjs, scripts/lib/qa-shots-dir.ps1, scripts/lib/qa-shots-dir.sh
```

기획서 표에 없던 `clients/desktop/src/main/capture.ts`도 실제 inline resolver 선언으로 발견됐으므로 함께 가드했다. 사본을 무조건 중앙화하는 선택은 언어별 실행 경계와 기존 import 계약을 불필요하게 깨뜨릴 수 있어 이번에는 각 실행 경계의 계약을 맞추고, 동적 inventory로 새 사본 누락을 검출하는 방식을 골랐다. 단순 문자열 비교는 junction/extended/대소문자/상대경로를 놓치므로 버렸다.

## GREEN 원문

최종 `clients/desktop` 가드 테스트의 실행 원문이다.

> 📌 **2026-07-28 재수렴 정정** — 아래 원래 인용은 인벤토리 줄만 `scripts/lib/qa-shots-dir.ps1`이 빠진 `count=9`였다(원인은 위 정정과 동일한 D-A). 그 한 줄만 `.gitattributes` fix 후 HEAD 기준 실측으로 바꾼다 — 나머지(tests 12/pass 12 등)는 이 슬라이스 당시 실제 테스트 개수이므로 그대로 둔다(이후 재수렴 라운드가 N-1·N-2 테스트 2개를 추가해 현재는 14개다 — 그 실행 원문은 이 재수렴 라운드 자체의 보고에 있다).

```text
--- node --test scripts/qa-output-path-guard.test.cjs ---
✔ resolver 기본 출력(QA_SHOTS_DIR 미지정)은 <committedDir>/_local 이다 (3.0977ms)
✔ D-3 [B] 자기 슬러그 커밋 경로를 QA_SHOTS_DIR 로 지정하면 QA_ALLOW_OVERWRITE 없이는 차단한다 (회귀 없음) (1.292ms)
✔ D-3 [D] 자기 슬러그를 ".." 우회 표기로 지정해도 차단한다 (회귀 없음) (0.8781ms)
✔ D-3 [A] 다른 슬러그의 커밋 디렉터리를 QA_SHOTS_DIR 로 지정하면 차단한다 (R1 적대검증 원 지적 — fix 전 BLOCKED=FALSE 였다) (0.8188ms)
✔ D-3 [C] docs/qa 루트 자체를 QA_SHOTS_DIR 로 지정하면 차단한다 (R1 적대검증 원 지적 — fix 전 BLOCKED=FALSE 였다) (1.1039ms)
✔ D-3 A~D 전부 QA_ALLOW_OVERWRITE=1 이면 명시 경로를 그대로 사용한다 (승격 opt-in 은 유지) (3.7491ms)
✔ 물리적으로 docs/qa 아래인 junction·extended·표기 변형은 세 resolver가 차단한다 (62.6641ms)
✔ qa/playwright captureForQa도 물리적으로 docs/qa 아래인 목적지를 차단한다 (13.5715ms)
[QA resolver inventory] count=10 clients/desktop/playwright/support/qa-screenshot-dir.mjs, clients/desktop/playwright/support/qa-screenshot-dir.ts, clients/desktop/src/main/capture.ts, infrastructure/scripts/operational-validation.ps1, qa/playwright/utils/screenshot.ts, scripts/lib/qa_shots_dir.py, scripts/lib/qa-shots-dir.cjs, scripts/lib/qa-shots-dir.mjs, scripts/lib/qa-shots-dir.ps1, scripts/lib/qa-shots-dir.sh
✔ qa/playwright captureForQa의 기본 출력과 명시적 승격은 계속 통과한다 (17.0927ms)
✔ qa/playwright 캡처 호출은 실행 시 docs/qa 직접 경로를 사용하지 않는다 (14.2658ms)
✔ QA resolver 가드 표면은 저장소 소스에서 동적으로 발견되고 물리 판정을 선언한다 (1753.4498ms)
✔ resolver 3벌(.ts/.mjs/.cjs)이 같은 계약을 선언한다 — .ts 소스는 구조 마커로, .mjs 는 실행으로 대조 (19.5524ms)
ℹ tests 12
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2084.434
guardExit=0
```

기존 정상 경로와 승격 경로도 같은 실행의 다음 두 테스트로 확인했다.

```text
✔ qa/playwright captureForQa의 기본 출력과 명시적 승격은 계속 통과한다
✔ D-3 A~D 전부 QA_ALLOW_OVERWRITE=1 이면 명시 경로를 그대로 사용한다 (승격 opt-in 은 유지)
```

## 언어별 alias probe

모든 probe는 `os.tmpdir()` 아래 임시 경로만 사용했다. Python은 의도적으로 `RuntimeError`를 내므로 exit 1, Bash probe wrapper는 차단 메시지를 확인하고 exit 0이다.

```text
--- Python physical-alias probe ---
PYTHON BLOCKED
--- Bash physical-alias probe ---
BASH BLOCKED
pythonExit=1 bashExit=0
```

PowerShell도 물리 alias를 차단했다.

```text
--- PowerShell physical-alias probe ---
powershellExit=1
[QA 출력 경로 가드] ... overwrite ... <temp>\to-docs-qa ...
```

PowerShell 초기 probe에서는 기존 report 생성 시점이 가드보다 앞서 있던 결함을 발견해 임시 `docs/qa/REPORT.md`가 생겼다. 정확한 임시 파일을 즉시 제거하고, 가드를 report 생성 전으로 이동한 뒤 최종 probe를 재실행했다. 최종 확인은 `Test-Path docs/qa/REPORT.md`가 `False`였다.

## 커밋 산출물 보존 확인

각 설치/RED/GREEN/probe/검증 실행 전후에 다음 두 읽기 명령을 수행했다.

```text
git status --porcelain
git diff -- docs/qa
```

작업 중인 코드 변경이 있으므로 `git status --porcelain` 자체는 다음과 같이 의도된 파일 목록을 출력한다. 이를 빈 출력이라고 가장하지 않는다.

> 📌 **2026-07-28 재수렴 정정** — 아래 원래 인용(11 M + 1 ??, 12개)은 `scripts/*.ps1` 30개(공용 resolver로 전환하며 dot-source 한 줄을 추가한 스크립트 28개 `generate-*-screenshots.ps1` + `loadtest-metrics-snapshot.ps1` + `regen-sp-08-5-2-shot2.ps1`)와 신규 `scripts/lib/qa-shots-dir.ps1`·`scripts/lib/qa-shots-dir.cjs`가 빠져 있었다 — 이 슬라이스(#863 이월 흡수)의 핵심 변경 표면이 바로 그 30개 전환인데, 목록에서 누락된 것이다. 지금 이 문서를 커밋해 working tree 가 비어 있으므로, HEAD(`a34f4f277`)와 그 직전 기획 커밋(`2dde7f3bb`) 사이 `git diff --name-only 2dde7f3bb a34f4f277`로 이 슬라이스 전체의 실제 변경 파일을 다시 셌다 — **44개**(아래 "변경 파일" 절 참조). 이 정정을 실행한 재수렴 라운드 자체의 변경 사항은 포함하지 않는다(그 라운드의 변경 파일 목록은 그 라운드 보고에 별도로 있다).

모든 확인에서 `git diff -- docs/qa`는 빈 출력이었다. 최종 artifact check도 다음과 같았다.

```text
--- final docs/qa artifact check ---
False
True
--- final docs/qa diff before report ---
```

첫 PowerShell probe의 임시 사고 외에는 `docs/qa/**`에 쓰지 않았고, 그 파일도 최종 상태에는 남아 있지 않다. 캡처 테스트와 각 resolver probe는 모두 OS 임시 디렉터리를 사용했다.

## CI 및 문서

- `.github/workflows/qa-e2e.yml`의 desktop Playwright job에 `node --test scripts/qa-output-path-guard.test.cjs`를 실패 허용 없이 등재했다.
- `clients/desktop/README.md`의 공유 resolver 목록을 `scripts/lib/qa-shots-dir.{cjs,mjs}`로 고쳐 `.mjs`를 누락하지 않게 했다. 물리 경로 판정과 명시적 승격 규칙도 동기화했다.
- `qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts`는 helper 기반 캡처만 사용한다.
- 테스트 harness의 이월 목록에서 이미 이전한 파일을 제거해 G8d false-green guard가 실제 회귀를 계속 잡도록 했다.

기획서 §5 제외 항목은 건드리지 않았다. 확인만 한 미해결 사항은 `qa-e2e.yml`의 기존 `|| true`, desktop typecheck 범위 편입 여부, `assert-playwright-ran.mjs` 하한, mock parity이다.

## 최종 검증

### `qa/playwright` typecheck

```text
> @samhan/qa-playwright@0.1.0 typecheck
> tsc --noEmit
```

exit 0.

### 데스크톱 `npm test`

빌드 산출물 부재로 인한 최초 테스트 실패 후 design-system build와 desktop build를 실행했고, 재실행은 통과했다. 최종 요약 원문은 다음과 같다.

```text
Test Files  175 passed (175)
Tests       1637 passed (1637)
npmTestExit=0
```

> 📌 **2026-07-28 R4 재수렴 정정 A(증거 무결성 — 대조 각도 SONNET5 적발)** — 위 출력을 **무조건 green** 으로
> 제시한 것은 부정확하다. 같은 명령을 2회 독립 재실행하면 모두 `174 passed(175) / 1636 passed(1637)`
> 이었고, 매번 **다른 assertion**이 걸리는 `CodefImportScopeForm.test.tsx` 의 timeout 이었다 — 이 PR 이
> 변경한 44개 파일에 포함되지 않은 파일이다. 그 파일만 격리 실행(`vitest run
> src/renderer/pages/.../CodefImportScopeForm.test.tsx`)하면 **42/42 통과**한다 ⟹ 풀스위트를 동시에
> 실행할 때만 나타나는 **경합성(concurrency) flake** 이며 이 PR 의 결함이 아니다. "175/1637 모두 green" 은
> 단서 없이 재현 불가능한 주장이었으므로 이렇게 정정한다.

### 데스크톱 `npm run typecheck`

```text
> @samhan/desktop@0.1.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit

typecheckExit=0
```

> 📌 **2026-07-28 R4 재수렴 정정 B(증거 무결성 — 대조 각도 SONNET5 적발)** — 이 "clean" 결과는 **851-gate
> 워크트리에서 확증 불가**다. 원인은 이 PR 의 결함이 아니라 **교차 워크트리 공유 `node_modules`** —
> `@samhan/design-system` 심볼릭 링크가 메인 체크아웃의 **2026-07-23 시점 빌드 `dist`** 를 가리켜, `#902`
> (2026-07-26)가 추가한 `printableBody`·`excludedFromSave` prop 이 그 `dist` 에는 없다. 이 워크트리
> **자신의 소스**에는 두 prop 이 정상 존재하고, vitest 런타임(타입 체크가 아닌 실제 실행)은 57/57
> 통과한다 — 즉 타입 오류가 아니라 **오래된 빌드 산출물** 문제다. "clean" 을 이 환경에서는 확증할 수
> 없음을 명시한다 — 확정하려면 격리된 fresh install(CI)로 봐야 한다. (A3·#964 기획 검토도 독립적으로
> 같은 원인에 도달했다 — 3중 관측.)
>
> 📌 **2026-07-28 R5 재수렴 정정 A(증거 무결성 — SONNET5 대조 재현, 위 정정 B에 대한 시점 정정)** — 위
> "2026-07-23 시점 빌드 `dist`" 근거는 **이 확인 시점(2026-07-28 13시경) 기준으로는 재현되지 않는다**.
> 메인 트리 `clients/web/design-system/dist/index.js` 가 **2026-07-28 10:02 에 재빌드**돼(이 R5 라운드의
> R4 fix 커밋 시각 11:06 보다 앞섬) `printableBody`·`excludedFromSave` 가 **둘 다 실측 확인**된다(`grep -o
> printableBody dist/index.js` → 1건, `excludedFromSave` → 1건). 위조 근거는 아니다 — 원 관측(정정 B) 시점의
> `dist` 는 실제로 구버전이었을 것이고, 원저자도 "확정은 CI" 라 스스로 한정했다. 다만 "메인 체크아웃의
> `dist` 가 구버전이라 확증 불가"라는 서술은 **관측 시점에 종속된 사실**이므로, 이 문서를 읽는 시점마다
> 다시 확인해야 한다 — **851-gate 워크트리 자체 typecheck 결과의 확정은 여전히 CI(격리된 fresh install)
> 로만 가능**하다는 결론 자체는 바뀌지 않는다.

## 변경 파일

> 📌 **2026-07-28 재수렴 정정** — 아래 12개 목록은 `scripts/*.ps1` 30개 전환(이 슬라이스의 핵심 변경)과 신규
> `scripts/lib/qa-shots-dir.ps1`·`scripts/lib/qa-shots-dir.cjs`가 누락돼 있었다. `git diff --name-only
> 2dde7f3bb a34f4f277`(기획 커밋→ 이 슬라이스 HEAD)로 다시 센 전체 44개로 교체한다.

- `.github/workflows/qa-e2e.yml`
- `clients/desktop/README.md`
- `clients/desktop/scripts/qa-output-path-guard.test.cjs`
- `clients/desktop/src/main/capture.ts`
- `clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts`
- `docs/dev-reports/2026-07-28-851-s2-qa-guard-coverage.md`(이 파일 자신)
- `docs/superpowers/plans/2026-07-28-851-s2-qa-guard-coverage.md`
- `infrastructure/scripts/operational-validation.ps1`
- `qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts`
- `qa/playwright/utils/screenshot.ts`
- `scripts/generate-arologis-d-ax-14-screenshots.ps1`
- `scripts/generate-arologis-qa-screenshots.ps1`
- `scripts/generate-d-ax-21-business-code-standardization-screenshots.ps1`
- `scripts/generate-d-ax-22-uuid-free-contract-hardening-screenshots.ps1`
- `scripts/generate-samhan-dispatch-board-screenshots.ps1`
- `scripts/generate-samhan-dispatch-modification-screenshots.ps1`
- `scripts/generate-samhan-signature-copy-screenshots.ps1`
- `scripts/generate-sp-01-partner-ui-menu-gap-screenshots.ps1`
- `scripts/generate-sp-02-accounting-closing-menu-gap-screenshots.ps1`
- `scripts/generate-sp-03-purchase-inspection-cta-screenshots.ps1`
- `scripts/generate-sp-04-full-menu-audit-screenshots.ps1`
- `scripts/generate-sp-08-2-dps-history-screenshots.ps1`
- `scripts/generate-sp-08-3-2-arologis-history-screenshots.ps1`
- `scripts/generate-sp-08-3-3-slip-cleanup-history-screenshots.ps1`
- `scripts/generate-sp-08-3-4-dispatch-sms-history-screenshots.ps1`
- `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1`
- `scripts/generate-sp-08-4-1-partner-order-list-detail-screenshots.ps1`
- `scripts/generate-sp-08-4-2-partner-order-edit-put-screenshots.ps1`
- `scripts/generate-sp-08-4-3-order-delete-and-estimate-convert-screenshots.ps1`
- `scripts/generate-sp-08-4-4-order-print-form-screenshots.ps1`
- `scripts/generate-sp-08-5-1-purchase-slip-list-detail-screenshots.ps1`
- `scripts/generate-sp-08-5-2-purchase-slip-edit-put-screenshots.ps1`
- `scripts/generate-sp-08-5-3-purchase-slip-soft-delete-screenshots.ps1`
- `scripts/generate-sp-08-5-4-purchase-inspection-cta-regression-screenshots.ps1`
- `scripts/generate-sp-08-5-5-purchase-print-form-screenshots.ps1`
- `scripts/generate-sp-08-6-1-sales-slip-list-detail-screenshots.ps1`
- `scripts/generate-sp-08-6-2-sales-slip-edit-put-screenshots.ps1`
- `scripts/generate-sp-08-6-4-sales-print-form-screenshots.ps1`
- `scripts/lib/qa_shots_dir.py`
- `scripts/lib/qa-shots-dir.mjs`
- `scripts/lib/qa-shots-dir.ps1`(신규 — UTF-16LE+BOM, D-A 재수렴에서 `.gitattributes` 예외 추가)
- `scripts/lib/qa-shots-dir.sh`
- `scripts/loadtest-metrics-snapshot.ps1`
- `scripts/regen-sp-08-5-2-shot2.ps1`

(총 44개. `scripts/lib/qa-shots-dir.cjs`는 이 슬라이스 범위에서 내용 변경이 없어 diff 에 잡히지 않았다 — resolver
인벤토리 10개 중 하나이지만 이 slice 의 "변경 파일" 목록과는 별개다.)

