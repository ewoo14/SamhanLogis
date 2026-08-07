---
name: feedback_verifier_measurement_is_authoritative
description: 🚨 PM 이 준 수치를 검증자의 STOP 기준으로 걸면 PM 오류가 라운드를 태운다 — 검증자 실측을 정본으로 삼게 하라 (2026-08-07 #1083 R9 두 번 중단)
metadata:
  type: feedback
---

# 🚨 검증자 실측이 정본이다 — PM 수치를 STOP 기준으로 걸지 마라

2026-08-07 집PC. `#1083` 라이브QA 를 SOL 에 발주하면서 브리핑에 이렇게 적었다.

```text
🚨 전제가 틀리면 고치지 말고 중단·보고
   ...
   표본 건수가 제가 준 수치와 다르다 → 중단
```

**SOL 이 두 번 중단했고 두 번 다 SOL 이 옳았다.** 라운드 두 개를 태웠는데 산출물은 0 이었다.

| 회차 | SOL 이 멈춘 이유 | 실제 |
|---|---|---|
| 1 | 이미지 생성 시각이 `01:28:46` 인데 PM 은 `01:28:50` 이라 했다 | **둘 다 맞다.** PM 이 잰 건 *컨테이너* 생성, SOL 이 잰 건 *이미지* 생성. PM 이 라벨을 틀렸다 |
| 2 | 표본이 `HQ-001 896` 인데 PM 은 `871` 이라 했다 | **SOL 이 맞다.** PM 이 `head -20` 으로 잘린 출력에서 눈으로 합산했다 |

## 두 가지가 겹쳤다

### ① PM 의 증거 무결성 — 잘린 출력에서 합산

```bash
psql -c "SELECT swc, slip_type, status, COUNT(*) ... GROUP BY 1,2,3 ORDER BY 4 DESC" | head -20
#                                                                                     ^^^^^^^
# 이 출력을 눈으로 더해 "HQ-001 871" 이라고 이슈·PR 에 적었다. 실제는 896 이고 `00003` 3건은 통째로 빠졌다
```

집계가 필요하면 **집계를 SQL 에 시켜라.** `GROUP BY` 를 잘라서 더하지 마라.
→ [[feedback_exit_code_measurement_traps]] 과 같은 가족(재지 않은 값을 근거로 제시)의 새 변종.

### ①-b 같은 날 세 번째 — **페이지네이션된 첫 페이지를 전체로 셌다**

`#1083` 게이트 ② 를 판정하며 *"exact SHA 에서 13잡이 안 돌았다"* 고 PR 에 적었는데 **틀렸다.**

```bash
gh api repos/.../commits/<sha>/check-runs --jq '.check_runs|length'
#  → 30    ← "30개가 돌았다" 가 아니라 "첫 페이지가 30개" 다 (기본 per_page=30)

# 올바른 측정
gh api "repos/.../commits/<sha>/check-runs?per_page=100" --jq '.total_count'
#  → 43    ← 전부 돌았고 전부 success 였다
```

`gh pr checks` 는 43 인데 위가 30 이라 13개가 누락된 것으로 읽었다.
**머지 게이트를 잘못 닫을 뻔했다** — 실제로는 진작 충족돼 있었다.

🔑 잡이 정말 그 SHA 에서 돌았는지는 **run 단위로** 확인하는 것이 확실하다.
```bash
gh api repos/.../actions/runs/<runId> --jq '"\(.name) event=\(.event) head_sha=\(.head_sha) \(.conclusion)"'
```

### 세 번의 공통점 — **"도구가 보여준 것" 과 "실제 값" 의 혼동**

```text
1  컨테이너 생성시각을 이미지 생성시각이라 라벨       → 검증자가 적발
2  head -20 으로 잘린 GROUP BY 를 눈으로 합산        → 검증자가 적발
3  페이지네이션된 첫 30개를 전체로 셈                 → 자가 적발
```
셋 다 **값 자체는 도구가 정확히 준 것**이고, 그것이 무엇을 세고 있는지를 PM 이 틀렸다.
🔑 수치를 커밋·PR 에 쓰기 전에 **"이 숫자는 무엇의 개수인가"** 를 한 번 소리내어 말할 것.

### ② STOP 기준 설계 — PM 오류가 검증자를 멈춘다

*"제 전제가 틀리면 중단·보고"* 는 좋은 규칙이고 실제로 여러 번 작동했다
(→ [[feedback_pm_verifies_round_and_directs_next_fix]]). **그러나 무엇을 전제로 거느냐가 문제다.**

PM 이 준 **수치**를 STOP 조건으로 걸면, PM 이 한 자리라도 틀린 순간 검증자가 멈춘다.
게다가 이 저장소의 DB 는 **병렬 트랙이 함께 쓰는 공유 DB** 라 수치는 라운드 중에도 움직인다
(→ [[feedback_qa_rounds_pollute_shared_data]]).

## How to apply — 브리핑에 이렇게 쓴다

```text
🔑 당신이 잰 값이 제 값보다 우선합니다. 제 수치는 참고이고 보고서에는 당신 실측을 쓰십시오.

🛑 중단한다      표본이 0 이다 · 자릿수가 다르다(896 vs 89) · 표가 통째로 없다
                배포본에 fix 식별자가 없다 · 렌더러가 mock 을 호출한다 · 컨테이너가 unhealthy
                ⟹ **일을 할 수 없게 만드는 것**만 중단 사유다

✅ 적고 진행한다  수 건~수십 건 차이 · 같은 사실을 다른 필드로 잰 것
                → 환경 확인 절에 당신이 잰 값과 **측정 시각**을 적고 그것을 정본으로 삼으십시오
```

즉 **STOP 은 "PM 과 다르다" 가 아니라 "이 조건에서는 판정이 불가능하다" 에 걸어야 한다.**

## Why

병목은 토큰이 아니라 **라운드 개수**다(→ [[feedback_canonical_workflow]]).
PM 이 실측을 넘기는 목적은 검증자가 **표본을 찾느라 헤매지 않게** 하려는 것이지,
검증자의 관측을 PM 값에 맞추라는 것이 아니다. 수치를 게이트로 걸면 목적이 뒤집힌다.

🔑 **검증자가 PM 수치와 다른 값을 관측하는 것은 정상이고, 그것이 오히려 PM 오류를 잡는다.**
이번에도 SOL 이 잡아 준 덕에 이슈 `#1099` 와 PR `#1083` 의 잘못된 수치를 정정할 수 있었다.
멈추지 말고 **적고 진행**하게 했으면 정정도 하고 QA 도 끝났을 것이다.

관련: [[feedback_exit_code_measurement_traps]] · [[feedback_real_data_label_points_elsewhere]] ·
[[feedback_qa_rounds_pollute_shared_data]] · [[feedback_pm_verifies_round_and_directs_next_fix]] ·
[[feedback_narrow_briefing_completes_wide_times_out]]
