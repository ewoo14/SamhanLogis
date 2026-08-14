---
name: feedback_qa_harness_must_pass_repo_guards
description: 🚨 QA 하네스를 커밋하기 전에 저장소 가드를 먼저 돌려라 — 하루에 세 번 하네스가 CI 를 깼고 세 번 다 "로컬에서는 통과" 였다 (2026-08-14)
metadata:
  type: feedback
---

# 🚨 QA 하네스가 CI 를 깬다 — **커밋 전에 가드를 먼저 돌려라**

2026-08-14 하루에 **세 번** 났다. 셋 다 기능 결함이 아니라 **내가 커밋한 검증 장치**가 원인이었다.

| PR | 무엇이 깼나 | 걸린 가드 |
|---|---|---|
| `#1211` | 캡처용 Playwright 스펙 (5201 포트 가정 + 범위 오류) | Desktop Playwright mock 회귀 hard gate |
| `#1212` | 검증 스크립트의 포트 리터럴 `8080` · `8097` | Local Stack Port Resolver Guard (#1113) |
| `#1180` | QA 하네스가 캡처를 형제 경로에 직접 씀 | 하네스 거짓 green 가드 G3a · H2b |

## 🔑 세 번 다 **"로컬에서는 통과"** 였다

```text
#1211  로컬에 ignored build/ 가 남아 있어 통과 · CI fresh checkout 에는 없다
#1212  Port Guard 스크립트가 git ls-files 를 부르는데 구현자는 git 금지라 못 돌렸다
#1180  가드 테스트를 아예 안 돌렸다 (그 테스트가 있는 줄 몰랐다)
```

🚩 **로컬 통과는 증거가 아니다.** 가드는 clean CI 를 전제로 만들어져 있고, 로컬에는 그 전제를 깨는 잔재가 남아 있다.

## 이 저장소의 하네스 가드 셋

```text
harness-false-green-guard.test.ts   캡처 목적지가 _local 격리를 거치는가
  🔑 왜 있나 — 하네스가 형제 PNG 를 직접 덮어쓰면
     커밋된 증거가 다음 실행에 조용히 덮인다
  ⟹ scripts/lib/qa-shots-dir.{cjs,mjs} 의 resolveQaShotsDir 를 쓴다
     _local 에 쓰고, 검증된 것만 tracked 경로로 승격한다

Local Stack Port Resolver Guard     포트를 리터럴로 박지 않았는가
  ⟹ Get-LocalStackPort 로 조회한다

Desktop Playwright mock hard gate   design-system 변경 시 걸린다
  ⟹ 새 스펙은 그 스위트의 기동 방식을 따른다 (혼자 다른 포트를 가정하지 마라)
```

## How to apply

```text
QA 하네스·검증 스크립트를 커밋하기 전에
  ① 그 표면의 가드를 먼저 돌린다
     harness-false-green-guard.test.ts / Port Guard / mock hard gate
  ② 가드가 검사하는 writer 전수 목록에 새 파일이 포함되는지 확인한다
  ③ 로컬 통과를 믿지 말고 원격 CI 로 확정한다
```

🚨 **가드를 고쳐서 통과시키지 마라.** 가드가 맞고 우리 하네스가 틀린 경우가 셋 다였다.
🚨 **하네스를 지워서 통과시키지도 마라.** 그것이 만든 캡처가 라이브QA 증거다.
   일회성이라 정말 지워도 되면 **그 판단과 근거를 대라.**

🚩 **가드가 못 잡는 형태도 있다.** `#1180` 의 `bounds.electron.cjs` 는 인라인 경로 형태라
정적 가드에 안 걸렸지만 같은 불변식을 위반했다. **가드에 안 걸린다고 괜찮은 것이 아니다** —
그 형태가 늘면 가드가 무력해진다.

관련: [[feedback_qa_harness_commit_breaks_ci]] · [[feedback_live_qa_artifacts_vanish_silently]] ·
[[feedback_design_system_playwright_mock_suite]] · [[feedback_ci_test_filter_false_green]]


## 🚨 2026-08-14 네 번째 — **규칙을 써 놓고도 브리핑에 안 넣어서 또 났다**

`#1210` 라이브QA 라운드에서 같은 가드가 또 걸렸다. 이번 원인은 구현자가 아니라 **PM 이다.**

```text
같은 날 #1211 · #1212 · #1180 에서 세 번 나서 이 메모리를 썼다
그 뒤 #1180 구현자 브리핑에는 넣었다
그런데 #1210 라이브QA 브리핑에는 빠뜨렸다  ⟹ 네 번째 발생
```

🔑 **규칙은 "PM 이 기억하는 것" 이 아니라 "브리핑에 들어가는 것" 이다.**
메모리에 적어 두는 것만으로는 실행되지 않는다. 브리핑에 문장으로 들어가야 구현자가 한다.

### How to apply — 브리핑 고정 항목으로 만들어라

**캡처·하네스·검증 스크립트를 만들게 하는 모든 브리핑**에 아래를 그대로 넣는다.

```text
🚩 캡처를 _local/ 에 두라 — scripts/lib/qa-shots-dir 의 resolveQaShotsDir 를 쓴다
   (형제 경로에 직접 쓰면 커밋된 증거가 다음 실행에 덮이고, 저장소 가드가 CI 를 막는다)
🚩 하네스를 추가하기 전에 가드를 먼저 돌려라
   cd clients/desktop && npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
🚩 포트·경로를 리터럴로 박지 마라 (Get-LocalStackPort 로 조회)
🚩 프로세스 ID·임시 로그 같은 잡파일을 커밋하지 마라 — 증거가 아니다
```

🚩 실측 — `#1210` 은 `vite.pid` 까지 커밋됐다. **프로세스 ID 는 증거가 아니다.**
   다음 실행에 무의미해지고, 확장자 census 가드에도 걸린다.
