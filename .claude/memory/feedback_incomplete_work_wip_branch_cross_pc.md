---
name: feedback_incomplete_work_wip_branch_cross_pc
description: 타 PC 재개(집↔회사) 세션 정리 시 미완·미검증 산출물은 stash 가 아니라 원격 WIP 브랜치로 격리 — stash 는 원격에 안 넘어가 타 PC 가 못 봄. feature 브랜치는 청결 유지.
metadata:
  type: feedback
---

세션을 **다른 PC 에서 재개**(집↔회사)하는 조건으로 정리할 때, 워킹트리에 남은 **미완·미검증 산출물**(중단된 fix 에이전트 결과 등)의 처리:

**🚫 `git stash` 금지 — 원격에 안 넘어간다.** stash 는 로컬 전용이라 타 PC 는 `git pull` 로 절대 못 받는다. 같은 PC 재개면 stash 참조가 유효하지만([[feedback_codex_detached_write_settle]] 의 codex-exec stash 선례), **타 PC 재개면 무의미**하다.

**✅ 원격 WIP 브랜치로 격리한다:**
```bash
git checkout -b wip/<issue>-<what>-incomplete   # 현재 워킹트리(미완) 흡수
git add -A && git commit -F <msg>               # "WIP·미검증·신뢰불가·참조용" 명시
git push -u origin wip/<issue>-<what>-incomplete
git checkout <feature-branch>                    # 워킹트리 clean·HEAD 원위치
```
결과: **feature 브랜치 원격 HEAD 는 마지막 검증본 그대로**(CI·리뷰 대상 청결 유지·미검증 커밋 미오염), 미완은 별도 브랜치로 타 PC 가 **참조 가능**.

**Why:** 미완 산출물을 feature 브랜치에 커밋하면 CI red·리뷰 혼선·"완료 착각" 위험. 버리면 에이전트 작업 손실. WIP 브랜치가 [[feedback_canonical_workflow]] 청결과 작업 보존을 동시 충족. (2026-07-16 #809 R8 fix 2차: "R8-QA-12 유닛 테스트 추가" 직전 중단·gradle 미검증 12파일을 `wip/809-r8-fix2-incomplete` 로 격리, feature 는 `e8f558cd4` 청결 유지.)

**How to apply — 핸드오프에 반드시 박제:** ① WIP 브랜치명·SHA ② **"완료로 착각 금지·미검증"** 경고 ③ **fresh 재디스패치**하되 WIP diff 는 참조만([[feedback_codex_detached_write_settle]] 정신) ④ feature HEAD SHA + 원격 sync(0 0) 확인. 다음 세션은 [[feedback_agent_origin_main_sync]] 대로 **`git pull` + sync 카운트 먼저 읽어** stale 핸드오프 물림 방지. 🚨 이번 세션 초반 실제로 로컬 16커밋 뒤처진 걸 못 읽고 stale "R4 착수" 핸드오프를 믿어 R4/R8 혼동 발생 → git pull 후 R8 이 정답으로 판명.

---

## 🚨 세션 재개 시 **각 워크트리의 `git status` 까지** 볼 것 — 미추적 잔여물이 다음 라운드 증거로 위장된다 (2026-07-22 실측)

**무엇이 부족했나:** 세션 시작 시 `git worktree list` 로 워크트리 HEAD 와 **PR HEAD 일치만** 확인하고 *"미커밋 WIP 없음"* 으로 판단했다. 그러나 **HEAD 일치는 tracked 변경이 없다는 뜻일 뿐, 미추적(untracked) 파일에는 아무 말도 하지 않는다.**

**실제 사고 직전까지 간 경위(#864 R4):** 직전 세션(마감 커밋 21:58:09)이 `docs/qa/825-s5-r4-liveqa/` 에 PNG 7장을 **21:43 에** 남겼다(미추적). 다음 세션의 CODEX LUNA fix(22:09 시작)가 마침 `SHOTS` 상수를 **바로 그 경로로 옮기는 fix**(과거 라운드 증거 덮어쓰기 차단)를 했다. 그대로 커밋했다면 **오늘 fix 이전 코드로 찍힌 캡처가 `r4-liveqa` 라는 이름으로 R4 라이브QA 증거가 될 뻔했다.** 구현자는 *"실 서버 라이브QA 는 실행하지 않았다"* 고 정직 고지했고 dev-report 에서도 그 캡처를 언급하지 않았다 — **아무도 거짓말하지 않았는데 커밋 한 번으로 위조 증거가 되는 구조**였다.

**Why 위험한가:** QA 캡처 디렉토리는 이름 자체가 주장(claim)이다. `825-s5-r4-liveqa/` 안에 있으면 읽는 사람은 "R4 라이브QA 결과" 로 읽는다. 파일이 진짜 캡처이고(합성 아님) 해시 재활용도 아니어도, **라운드가 다르면 거짓 증거**다. [[feedback_no_fake_data_ever]] 의 경계는 "합성이냐" 가 아니라 **"주장과 출처가 일치하냐"** 이다.

**How to apply:**
- 🚨 **재개 절차에 `git status --short` 를 워크트리마다 추가**한다. `git worktree list` + PR HEAD 대조만으로는 미추적 잔여물을 못 본다.
- **커밋 전 미추적 파일은 전수 mtime 검증** — 이번 라운드 디스패치 시작 시각보다 **이전**이면 잔여물 의심. `Get-Item .LastWriteTime` vs 라운드 시작 시각(codex rollout 생성 시각·에이전트 spawn 시각)이 실용적 기준.
- **QA 캡처는 추가로 해시 대조** — 커밋된 이전 라운드 캡처와 SHA-256 이 겹치면 재활용, 안 겹쳐도 **mtime 이 라운드 밖이면 여전히 거짓 증거**다(이번 건이 정확히 후자: 중복 0건인데도 제외가 정답).
- 잔여물은 **삭제하지 말고 세션 스크래치패드로 격리**한 뒤 PR 에 경위를 공개한다(은폐 금지).
- `git add -A` 를 쓰지 않는 이유가 하나 더 늘었다 → [[feedback_parallel_agent_gradle_shared_tree_contention]] 의 커밋 오염 항목과 같은 계열.
