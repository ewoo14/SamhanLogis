---
name: feedback-worktree-missing-gitignored-inputs
description: git worktree add 는 gitignore 된 파일을 새 워크트리에 넣지 않는다 — 이카운트 raw·.env·node_modules 가 없어 검증이 "원본 부재"로 막힌다 (2026-07-29 #984 실측)
metadata:
  type: feedback
---

# 🚨 새 워크트리에는 gitignore 된 **입력 데이터**가 없다

**2026-07-29 #984 실측.** 검증자가 정직하게 보고했다.

> *"실 이카운트 CSV 원본 부재로 2회 임포트 및 diff 는 미실행·미판정"*

메인 트리에는 있었다. `docs/migration/ecount-data/raw/` 는 **민감정보라 gitignore** 되어 있고, `git worktree add` 는 추적 파일만 체크아웃하므로 새 워크트리에는 `.gitkeep` 만 있었다.

## 무엇이 빠지는가

`git ls-files` 에 안 잡히는 것 전부다. 이 저장소에서 검증을 막는 대표적인 것:

| 경로 | 없으면 |
|---|---|
| `docs/migration/ecount-data/raw/**` | 이카운트 임포트 검증이 **422 / 원본 부재**로 막힘 |
| `.env` · `infrastructure/docker-compose.qa-override.yml` | 실서버 기동·시트 sync 자격 없음 |
| `node_modules/` | `estimate-app` 등은 `npm ci` 선행 필요 |

## 왜 오진하기 쉬운가

증상이 **기능 결함처럼 보인다.** 422 를 받으면 "구현이 틀렸나" 부터 의심하게 되는데, 실제로는 **입력이 없는 것**이다. 반대로 검증자가 "부재" 라고 보고하면 PM 이 *"그럴 리 없다, 메인엔 있는데"* 로 넘기기 쉽다 — 둘 다 맞다. 보는 트리가 다를 뿐이다.

## 적용

- **워크트리를 만들면 그 트랙에 필요한 gitignore 입력을 먼저 복사**한다. 브리핑 전에 한다 — 안 그러면 라운드 하나를 통째로 날린다.
- 복사는 `Copy-Item -Recurse -Force`로 하되, **추적 파일을 덮지 않았는지 확인**한다. 실측에서 `raw/*` 를 통째로 복사하며 추적 파일 `.gitkeep` 을 덮어써 `git status` 에 `M` 이 떴다 (`git restore` 로 원복).
- 검증자가 **"원본 부재"·"자격 없음"** 으로 미판정 보고하면, **구현을 의심하기 전에 워크트리에 입력이 있는지부터** 본다.
- 이런 미판정 보고는 **정직한 것이지 실패가 아니다.** 없는 데이터를 지어내 GREEN 을 만드는 것보다 훨씬 낫다 — 그 자리에서 입력을 채우고 같은 스레드로 이어가면 된다.

관련: [[feedback_incomplete_work_wip_branch_cross_pc]] · [[feedback_no_fake_data_ever]] · [[feedback_check_tracked_before_delete]]
