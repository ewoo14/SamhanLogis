---
name: feedback_exit_code_measurement_traps
description: 🚨 파이프 뒤의 $? 는 마지막 명령 것이고 이 환경의 npm run 은 성공해도 127 을 낸다 — 종료코드를 근거로 쓸 때 두 함정 (2026-08-06 PM 자가 적발)
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

관련: [[feedback_business_meaning_needs_confirmation_not_inference]] · [[feedback_quoted_output_splice_forgery]] · [[feedback_changed_line_count_misreport]] · [[feedback_qa_harness_commit_breaks_ci]]
