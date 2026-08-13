---
name: feedback_electron_postinstall_ci_flake
description: 🚨 CI 실패가 electron postinstall 이면 인프라다 — socket hang up / 503 이 하룻밤 10회 이상, 뒤따르는 silent-skip 가드 실패까지 같은 원인 (2026-08-13 실측)
metadata:
  type: feedback
---

# 🚨 `electron` postinstall 실패 = 인프라. 코드를 고치지 마라

## 실측 — 2026-08-12~13 하룻밤 **10회 이상**

```text
npm error path clients/desktop/node_modules/electron
npm error command failed
npm error command sh -c node install.js
npm error RequestError: socket hang up
npm error HTTPError:  Response code 503 (Service Unavailable)
```

영향받은 체크 — `Frontend Desktop` · `Desktop Playwright` · `Harness Guard` · `Docs Guard`

## 🔑 판별법

```text
실패 스텝이  '의존성 설치' / 'npm ci'
경로가       node_modules/electron
⟹ 인프라. gh run rerun <id> --failed
```

🚩 **연쇄 실패에 속지 마십시오.** 설치가 죽으면 그다음 스텝이 이렇게 찍힌다.

```text
[guard] results.json 없음 — 테스트 미실행 의심:
        ENOENT: no such file or directory, open 'playwright-json/results.json'
```

이건 **가드가 잡은 결함이 아니라 설치 실패의 후속**입니다.

🚩 **반대로 "통과" 가 찍혀도 job 은 실패일 수 있습니다.** `Harness Guard` 로그 끝에
`[docs/qa 결과 검사] 통과` 가 보이는데도 job 은 FAILURE 였습니다 — 앞 스텝(설치)이 죽은 것이라
**로그 꼬리만 보지 말고 어느 스텝이 죽었는지** 세십시오.

## How to apply

**CI 실패를 보면 스텝 이름부터 본다**
> `gh run view --job <id> --log-failed | grep -i "npm error\|node_modules/electron"`
> 걸리면 재실행. **코드 진단으로 넘어가지 마십시오.**

**같은 SHA 의 직전 결과와 비교한다**
> 같은 코드로 직전 SHA 가 green 이었고 새 커밋이 문서·스크린샷만 추가했다면 인프라입니다.

**재실행이 안 되는 경우가 있다**
> `This workflow run cannot be retried` 가 나오면 job 단위(`gh run rerun --job <id>`)나
> run id 를 다시 조회해 시도하십시오.

관련: [[feedback_ci_setup_job_failure_is_github_outage]] · [[feedback_ci_test_filter_false_green]] · [[feedback_qa_harness_commit_breaks_ci]]
