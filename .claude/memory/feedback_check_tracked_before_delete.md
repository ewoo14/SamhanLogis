---
name: feedback-check-tracked-before-delete
description: 파일·디렉터리를 지우기 전에 git ls-files 로 커밋 여부를 먼저 확인하라 — 하위에 _local 이 있다고 상위 전체가 throwaway 가 아니다 (2026-07-28 #957 실측)
metadata:
  type: feedback
---

# 🚨 지우기 전에 `git ls-files` 로 커밋 여부부터 확인하라

**2026-07-28 #957 실측.** QA 산출물 정리 중 `rm -rf docs/qa/local-load-soak-test` 를 실행해 **커밋된 파일 33개**(README · k6 raw 로그 · summary JSON)가 삭제됐다. `git status` 로 즉시 발견해 `git checkout -- <경로>` 로 HEAD 에서 복구했고, 복구 완전성을 PM 이 직접 확증했다(`git diff --stat HEAD -- docs/qa` 빈 출력 · 추적 33 = 디스크 33 · 누락 0).

## 왜 이렇게 되는가

그 디렉터리 **안에** `timeseries/_local` 이 있었다. `_local` 은 이 저장소의 throwaway 관례이므로, **"하위에 `_local` 이 있으니 이 디렉터리는 작업 산출물"** 로 오인한 것이다.

**반대다.** `docs/qa/<슬러그>/` 는 **커밋된 QA 증거**이고, 그 안의 `_local` **한 칸만** throwaway 다. 구조가 정확히 그렇게 설계돼 있다(커밋 증거 옆에 로컬 캡처를 두되 커밋본을 덮지 않게).

## 적용

- **`rm -rf` 대상이 저장소 안이면 실행 전에 `git ls-files <경로>` 를 먼저 돌린다.** 출력이 1줄이라도 있으면 **커밋된 것이 섞여 있다** — 지우지 말고 대상을 좁힌다.
- **`_local` 은 경로의 마지막 칸에서만 throwaway 다.** 상위 디렉터리로 확대 해석 금지.
- 임시 산출물은 애초에 **`os.tmpdir()` / 스크래치패드**에만 만든다. 저장소 안에 만들면 정리 시점에 이 실수가 난다.
- 실수했다면 **즉시 `git status` 로 확인하고 `git checkout --` 로 복구한 뒤 자진 신고**한다. 커밋된 증거를 파괴된 채 두는 것이 git 명령 제약을 지키는 것보다 나쁘다. (신고 없이 넘어가면 다음 라운드가 "왜 파일이 없지"로 시작한다.)
- **PM 은 복구 보고를 릴레이하지 말고 직접 확증**한다 — `git diff --stat HEAD -- <경로>` · `git ls-files <경로> | wc -l` 대 디스크 실재 수 · 추적 파일 중 누락 목록.

## 가드가 이걸 막지 못한다

같은 PR 이 만든 QA 오염 가드는 **`QA_SHOTS_DIR` 를 경유한 쓰기**를 막는다. **사람(또는 에이전트)이 직접 지우는 것은 막지 않는다.** 두 위협은 표면이 다르다 — 가드가 있다고 안심하지 말 것.

**Why:** 커밋된 QA 증거는 재생성 비용이 크고(실서버·실 GUI 캡처), 일부는 재현 자체가 불가능하다(그 시점의 부하 테스트 원본 로그).

**How to apply:** 저장소 경로에 대한 삭제는 `git ls-files` 확인을 선행 조건으로 삼는다. 관련 — [[feedback_screenshot_restore_scope_destroys_edits]](같은 계열의 대량 훼손) · [[feedback_qa_live_shared_data_readonly]](공유 실데이터 write 금지) · [[feedback_ungated_surface_and_mock_covering_defect]](가드가 안 보는 표면).
