---
name: feedback_exit_code_measurement_traps
description: 🚨 파이프 뒤의 $? 는 마지막 명령 것이고 이 환경의 npm run 은 성공해도 127 을 낸다 · 🆕테스트 실패 목록은 잘려 나오므로 "grep 해서 없으면 없는 것" 이 아니다 — 근거를 잘못 재는 함정들 (2026-08-06 · 08-09 PM 자가 적발)
metadata:
  type: feedback
---

# 🚨 종료코드를 증거로 쓸 때의 두 함정

2026-08-06 회사PC 세션에서 PM 이 **한 세션에 네 번** `typecheck exit 0` 이라고 커밋 메시지·PR 코멘트에 적었는데, **그 값을 잰 적이 없다.**

## 함정 1 — 파이프 뒤의 `$?` 는 **마지막 명령** 것이다

```bash
npm run typecheck 2>&1 | tail -6; echo "TYPECHECK_EXIT=$?"
#                        ^^^^^^                    ^^ tail 의 종료코드. 항상 0
```

`tail` 은 거의 언제나 0 이므로 **무조건 0 이 찍힌다.** 실패해도 0 이다.

```bash
# 올바른 방법
npm run typecheck > /tmp/tc.log 2>&1; echo "EXIT=$?"
# 또는
npm run typecheck 2>&1 | tail -6; echo "EXIT=${PIPESTATUS[0]}"
```

## 함정 2 — 이 환경의 `npm run <script>` 는 성공해도 **127** 을 낸다

```text
node -e "process.exit(0)"          → 0
npm --version                       → 0
npm run typecheck:real-qa           → 127   ← 로그에는 2 pass · 0 fail
npm run typecheck                   → 127   ← 로그에는 네 단계 완주 · TS 오류 0
```

Git Bash(Windows)에서 `npm run` 래퍼가 내는 값이고 **스크립트의 실제 결과가 아니다.**

## 함정 3 — 🆕 **실패 목록은 잘려 나온다. 거기서 grep 해서 "없다" 고 하면 틀린다** (2026-08-09)

main 이 하네스 가드로 red 였다. 구현자가 스크립트에서 이렇게 썼다.

```js
const baselineDir = 'docs' + '/qa/896-parity-run2/sheet/run2';
```

PM 은 이것을 "스캐너 회피" 로 보고 평범한 리터럴로 되돌린 뒤 커밋했다. 근거는 로컬 실행이었다.

```bash
npx vitest run ...guard.test.ts -t "G3a" | sed -n '/위반 목록/,/⎯⎯⎯/p' > /tmp/g3a.txt
grep -c "generate-896" /tmp/g3a.txt   # → 0    "없다"
```

**틀렸다.** 가드는 워킹트리를 훑으므로 로컬에는 `.claude/tmp/**` 같은 **untracked 잔재가 124건** 섞였고, vitest 는 assertion 메시지를 **잘라서** 낸다. 잘린 앞부분만 받아 놓고 "없다" 고 결론냈다. CI(클린 체크아웃)는 정확히 그 파일을 잡았다.

```
scripts/generate-896-p0-golden-manifest.mjs → const baselineDir
```

구현자의 문자열 분할은 **불필요한 회피가 아니라 유일한 수단**이었고, PM 이 근거 없이 되돌려 main 을 다시 깼다.

🔑 **부재를 증명하려면 목록이 온전한지부터 확인해야 한다.** 특히:
- 목록이 **길면 잘린다** — 총 건수와 받은 줄 수를 대조하라
- 로컬 스캔 결과는 **untracked 잔재로 부풀어 있다** — 판별축은 파일명이 아니라 `git ls-files` 추적 여부다
- 그래서 판정은 **"목록을 파일로 받아 전건을 추적 여부로 분류하고 추적분이 0인가"** 이지, grep 한 번이 아니다

## 그래서 무엇을 근거로 쓰는가

```text
1  🥇 CI          이 저장소의 권위다. typecheck 는 CI 잡이 돌린다
2  🥈 로그 내용    `error TS` · `failed` · `✖` 가 있는지 직접 본다
                   네 단계(real-qa-scope → tsc node → tsc web → typecheck:real-qa)가
                   **모두 출력에 나타났는지** 확인한다 — 중간에서 끊기면 그 앞이 실패한 것
3  🥉 종료코드     위 두 개로 갈리지 않을 때만. 반드시 파이프 없이 재고,
                   npm 은 이 환경에서 신뢰하지 않는다
```

## Why

`exit 0` 은 **강한 단정**이다. 그것을 커밋 메시지에 적으면 다음 라운드가 그 위에 선다. 재지 않은 값을 적으면 **증거 무결성 위반**이고, SOL 이 같은 계열(gradle `UP-TO-DATE` 를 강제 재실행 증거로 제시)을 이미 한 번 잡았다.

## How to apply

- 커밋 메시지·PR 코멘트에 종료코드를 쓸 때는 **그 값을 어떻게 얻었는지**가 재현 가능해야 한다.
- 파이프를 쓸 거면 `${PIPESTATUS[0]}`, 아니면 파일로 리다이렉트하고 `$?`.
- `npm run` 은 이 환경에서 종료코드를 쓰지 말고 **로그 내용**으로 판정하고 **CI 로 확정**한다.
- gradle 은 `--rerun-tasks` 없이 `UP-TO-DATE` 가 나오면 실행이 아니라 캐시다 — 같은 계열.
- 🆕 **부재("위반 없음"·"0건")를 단정하기 전에 목록이 온전한지 확인**한다. 총 건수 대비 받은 줄 수, 그리고 `git ls-files` 로 전건 분류. 잘린 출력에 grep 한 결과는 근거가 아니다.
- 🆕 **구현자가 이상해 보이는 코드를 썼으면 그것이 무엇을 피하고 있는지부터 확인**한다. 되돌리기 전에 되돌린 상태를 실제로 재라 — CI 로.

관련: [[feedback_business_meaning_needs_confirmation_not_inference]] · [[feedback_quoted_output_splice_forgery]] · [[feedback_changed_line_count_misreport]] · [[feedback_qa_harness_commit_breaks_ci]]

---

## 🚨 CI 완료 판정 함정 셋 (2026-08-11 실측 · 하루에 둘을 겪음)

```text
① conclusion 이 null 이 아니라 **빈 문자열**이다
   ❌ select(.conclusion==null)|length == 0  →  아직 도는데 "완료" 로 읽힘
   ✅ select(.status!="COMPLETED")|length

② 🚨 잡 레코드가 **좀비 in_progress** 로 남는다 — 런은 이미 success 인데
   실측(#1166): 워크플로 런 5개 전부 completed/success · updated 14:27:01
                그런데 체크런 3개가 in_progress · completed_at=null
                **그 잡들의 모든 스텝은 completed/success (Complete job 포함)**
   ⟹ status 만 보면 영원히 안 끝난다. 대기 루프가 무한히 돈다

③ 앱 체크(GitGuardian 등)는 워크플로와 **별개 생명주기**다
   런이 다 끝난 뒤에 시작하기도 한다
```

### 판정 절차 (이 순서로)

```bash
sha=$(gh pr view <n> --json headRefOid -q .headRefOid)
# 1) 워크플로 런의 conclusion — 이것이 1차 근거
gh api "repos/<o>/<r>/actions/runs?head_sha=$sha" \
  --jq '.workflow_runs[]|"\(.status)/\(.conclusion) \(.name)"'
# 2) in_progress 로 남은 체크런이 있으면 **스텝 단위로** 확인
gh api "repos/<o>/<r>/actions/runs/<runId>/jobs?per_page=100" \
  --jq '.jobs[]|select(.status!="completed")|"\(.name)\n  "+([.steps[]|"\(.name)=\(.status)/\(.conclusion//"-")"]|join("\n  "))'
#    모든 스텝이 completed/success 면 **기록 오류**이지 미완이 아니다
# 3) 남은 것이 앱 체크뿐인지 확인
```

🔑 **런 conclusion 과 스텝 결과가 근거이고, 잡의 status 필드는 근거가 아니다.**
