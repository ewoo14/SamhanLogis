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

---

## 🚨 2026-08-11 재발 — QA 자격 파일. **워크트리 5개 전부 없었다**

```text
증상   구현자가 "QA_DEV_DEFAULT_PASSWORD 부재로 인증 단계 중단, PNG 생성 미검증" 보고
원인   scripts/lib/qa-credentials.cjs:4
         REPO_ENV_FILE = <repo>/infrastructure/.env.local
       이 파일은 .gitignore:62 대상이라 **워크트리에 딸려오지 않는다**
실측   main 워크트리에만 있음 · w1051 · wdg7 · w1068 · wdg1s4 · wdg2 **전부 없음**
```

⟹ 라이브QA 가 **머지 게이트**인데, 워크트리를 만들 때마다 조용히 못 돌게 되어 있었다.
   "관측 불가" 보고의 진짜 원인이 여기였던 경우가 더 있을 수 있다.

### 워크트리 생성 직후 PM 이 할 것 (체크리스트)

```bash
git worktree add -b <branch> .claude/worktrees/<w> origin/main
cp infrastructure/.env.local .claude/worktrees/<w>/infrastructure/.env.local
git -C .claude/worktrees/<w> check-ignore infrastructure/.env.local   # 무시되는지 확인
```

🔑 **gitignore 된 입력은 "있는 것" 으로 가정하지 마라.** 워크트리는 tracked 파일만 가져온다.
그 목록에는 `.env.local` 류 외에 `node_modules`·빌드 산출물·Playwright 브라우저 경로 설정도 들어간다.

### 🚩 함께 관찰된 것 — blocker 보고가 옳았다

구현자는 허위 스크린샷을 만들지 않고 **실패 원문을 남겼다**. PM 이 원인을 찾아 5개 워크트리에 배포하는 것으로 해소됐다. 이 세션 정직한 blocker 보고 **5회**째이고 전부 옳은 처리였다.

관련: [[feedback_live_qa_use_playwright_not_browser_runtime]] · [[feedback_qa_environment_verification_first]] · [[feedback_no_fake_data_ever]]
