---
name: feedback_pr_screenshot_sha_pinned_urls
description: "PR 코멘트 스샷 인라인은 커밋 SHA 고정 raw URL 필수 — 브랜치 경로 URL 을 push 직후 게시하면 GitHub camo 가 빈 응답을 캐시해 \"모두 하얀 이미지\"로 보임 (2026-07-02 PR"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4e351f20-d917-4c50-b83e-9d751404530f
---

## 🚨 최우선: SendUserFile(사용자 전송) ≠ PR 인라인 — 둘 다 매 라운드 필수 (2026-07-05 개발책임자 반복 지적)

라이브 QA 스샷은 **두 곳 모두**에 올려야 완결: ①`SendUserFile`로 사용자(채팅) 인라인, ②**PR 코멘트에 SHA-pinned raw URL 로 인라인 박기**. `SendUserFile` 만 하고 PR 인라인을 빠뜨리는 실수를 **반복**함("계속 잊는것 같아"). PR 인라인이 없으면 리뷰 근거가 PR에 남지 않아 개발책임자가 PR만 봐선 검증 불가. **매 리뷰 라운드 QA 스샷 = SendUserFile + docs/qa 커밋 + SHA-pinned PR 인라인 게시(+curl 200) 3스텝을 한 세트로 항상 실행.**

---

PR #700(E2 기둥2)에서 라이브 QA 스샷 7장을 `raw.githubusercontent.com/<repo>/<브랜치명>/...` URL 로 push 직후 코멘트에 인라인 → 개발책임자 화면에서 **전부 하얀 빈 이미지**. 커밋 blob·raw 서빙은 정상(바이트 일치 실증)이었고, 원인은 **GitHub camo 프록시가 게시 시점(raw CDN 전파 전)의 빈 응답을 캐시**한 것.

**Why:** GitHub 는 코멘트 이미지를 camo.githubusercontent.com 으로 프록시하고 첫 fetch 결과를 캐시한다. push 직후엔 raw CDN 미전파로 빈 응답일 수 있어, 그 "하양"이 캐시에 박힌다. 스샷이 안 보이면 리뷰 게시 자체가 안 된 것처럼 보여 신뢰를 깨뜨린다.

**How to apply:**
1. 스샷 커밋 push 후, 인라인 URL 은 반드시 **full 커밋 SHA 고정 경로** 사용: `https://raw.githubusercontent.com/<owner>/<repo>/<full-SHA>/docs/qa/...png` (`git rev-parse <short>` 로 full SHA 확보 — 축약/추정 SHA 금지).
2. 이미 브랜치 경로로 게시해 하얗게 보이면: `gh api repos/<o>/<r>/issues/comments/<id> -X PATCH -F body=@<수정본>` 으로 URL 만 SHA 경로로 치환 — URL 변경 = camo 캐시 키 갱신 = 재fetch.
3. 게시 전 `curl -s -o /dev/null -w "%{http_code}" <SHA-URL>` 200 확인.

---

## 🚨 2026-08-11 재발 — **59장 누락**. 그리고 리뷰 1:1 누락과 **같은 병**이었다

개발책임자: *"라이브 QA도 스크린샷을 게시하도록 되어있는데"* (리뷰 1:1 누락을 지적한 직후, 같은 세션)

```text
#1166  25장  #1168  21장  #1170  13장   →  PR 인라인 **0장**
전부 docs/qa 에 커밋돼 있었고 보고서에도 경로가 적혀 있었다. **게시만 없었다.**
```

### 🔑 두 누락의 공통 원인 — **"산출물을 만든 것" 을 "게시한 것" 으로 셌다**

```text
리뷰 1:1 누락 16라운드  ← 커밋 메시지를 길게 쓰고 채팅 보고를 했다
스샷 게시 누락 59장     ← docs/qa 에 커밋하고 보고서에 경로를 적었다
둘 다 "기록은 남겼다" 는 감각이 게시 욕구를 없앴다.
🚨 개발책임자는 **PR 만 본다.** 워크트리 파일도 채팅도 커밋 로그도 보지 않는다.
```

### 감사법 — 라운드 수가 아니라 **디렉토리 수**로 센다

```bash
# 오늘 만든 QA 디렉토리 (= 라운드 수)
ls -d .claude/worktrees/<wt>/docs/qa/$(date +%Y-%m-%d)-* | wc -l
# PR 코멘트에 박힌 인라인 URL 수
gh api repos/<o>/<r>/issues/<n>/comments --jq '.[].body' | grep -c raw.githubusercontent
```

두 수가 어긋나면 누락이다.

### 게시 절차 (검증 포함)

```bash
sha=$(git -C <wt> rev-parse HEAD)          # full SHA — 축약 금지
# 본문 생성 후 **게시 전에 전 URL 200 을 확인**한다
for u in $(grep -oE 'https://raw[^)]*' body.md); do curl -s -o /dev/null -w "%{http_code} $u\n" "$u"; done
gh pr comment <n> -F body.md
```

실측: 59장 전수 `curl 200` 확인 후 게시 — 하나라도 실패하면 게시하지 않는다(camo 가 하양을 캐시한다).

관련: [[feedback_review_post_one_to_one_enforcement]] · [[feedback_qa_screenshots_inline_to_user]] · [[feedback_live_qa_every_round_screenshots]]
