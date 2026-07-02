---
name: feedback_pr_screenshot_sha_pinned_urls
description: "PR 코멘트 스샷 인라인은 커밋 SHA 고정 raw URL 필수 — 브랜치 경로 URL 을 push 직후 게시하면 GitHub camo 가 빈 응답을 캐시해 \"모두 하얀 이미지\"로 보임 (2026-07-02 PR"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4e351f20-d917-4c50-b83e-9d751404530f
---

PR #700(E2 기둥2)에서 라이브 QA 스샷 7장을 `raw.githubusercontent.com/<repo>/<브랜치명>/...` URL 로 push 직후 코멘트에 인라인 → 개발책임자 화면에서 **전부 하얀 빈 이미지**. 커밋 blob·raw 서빙은 정상(바이트 일치 실증)이었고, 원인은 **GitHub camo 프록시가 게시 시점(raw CDN 전파 전)의 빈 응답을 캐시**한 것.

**Why:** GitHub 는 코멘트 이미지를 camo.githubusercontent.com 으로 프록시하고 첫 fetch 결과를 캐시한다. push 직후엔 raw CDN 미전파로 빈 응답일 수 있어, 그 "하양"이 캐시에 박힌다. 스샷이 안 보이면 리뷰 게시 자체가 안 된 것처럼 보여 신뢰를 깨뜨린다.

**How to apply:**
1. 스샷 커밋 push 후, 인라인 URL 은 반드시 **full 커밋 SHA 고정 경로** 사용: `https://raw.githubusercontent.com/<owner>/<repo>/<full-SHA>/docs/qa/...png` (`git rev-parse <short>` 로 full SHA 확보 — 축약/추정 SHA 금지).
2. 이미 브랜치 경로로 게시해 하얗게 보이면: `gh api repos/<o>/<r>/issues/comments/<id> -X PATCH -F body=@<수정본>` 으로 URL 만 SHA 경로로 치환 — URL 변경 = camo 캐시 키 갱신 = 재fetch.
3. 게시 전 `curl -s -o /dev/null -w "%{http_code}" <SHA-URL>` 200 확인.
