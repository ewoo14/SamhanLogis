---
name: desktop-typecheck-command
description: clients/desktop 검증 = npm run typecheck(tsconfig.node+web) + npm run lint + build 셋 다 — CI "Frontend Desktop (typecheck+lint+build)" 와 동일. typecheck/vitest green ≠ CI green (PR #386 TS2367, A2-1b#554 lint FAIL 회고)
metadata:
  type: feedback
---

# clients/desktop 타입검증 = `npm run typecheck` (raw tsc 금지)

clients/desktop 변경 검증 시 **반드시 `cd clients/desktop && npm run typecheck`** (= `tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit`)를 실행한다. 루트 기본 `npx tsc --noEmit` 은 더 느슨해 일부 에러를 놓친다.

**Why:** PR #386 에서 mock.ts 에 `role === 'MASTER'` 비교(계정 role 타입 = `'MANAGER'|'SALES'|'DISPATCH'`, overlap 없음 → TS2367)가 들어갔는데 로컬 `npx tsc --noEmit` 통과·CI `npm run typecheck`(tsconfig.web strict) fail. "Frontend Desktop (typecheck + lint + build)" 잡 1건 fail 로 머지 1라운드 지연.

**A2-1b #554 재발(2026-06-21)**: `// eslint-disable-next-line jsx-a11y/no-autofocus`(미등록 룰 참조)가 lint 하드에러(`Definition for rule ... was not found`)인데 **typecheck + vitest 만 돌려 green 으로 PR 주장 → CI Frontend Desktop FAIL**. `npm run lint` 누락이 false-green. 머지 전 lint 필수.

**How to apply:** desktop fix/리뷰 후 = `npm run typecheck` (+ `npm run lint` 0 error, `npm run build` 성공). subagent 디스패치 prompt 에도 raw tsc 대신 **`npm run typecheck` 명시**. CI 잡 "Frontend Desktop (typecheck + lint + build)" 와 동일 명령으로 사전 재현. 관련 [[feedback_korean_path_jdk]], [[feedback_preauth_migration_lessons]].

**🚨 워크트리 로컬 typecheck 유령 오류 = design-system `dist` stale (2026-07-23 #908 실증):** 워크트리에서 `npm run typecheck` 가 `SlipFormPage.tsx` 등에 **15건+ TS2339/TS2353** 을 뿜었는데, 그 파일들은 **해당 PR 이 건드리지도 않았다**(`git diff`·`git status` 모두 공백). 원인은 `clients/web/design-system/dist/index.d.ts` 가 **소스보다 오래된 빌드**여서 `LineDraft` 가 아예 export 되지 않은 것 — 소스(`LineRow.tsx:78`)에는 `supplyAmount` 가 있었다. `npm run build` 로 design-system 을 재빌드하니 **typecheck RC=0 · error 0**.

🔑 **CI 는 fresh 빌드라 애초에 green 이었다**(같은 SHA 에서 35/35). 즉 이 오류는 **로컬 환경 전용 유령**이며, 구현자가 "기존 오류가 남아 있다" 고 보고해도 그대로 믿으면 안 되고 **PR 이 그 파일을 건드렸는지부터 확인**해야 한다. 반대로 진짜 회귀를 "stale 탓" 으로 무마하는 것도 금지 — 판정 근거는 **재빌드 후 재측정**이다.

**How to apply:** ① 워크트리에서 desktop typecheck 가 **건드리지 않은 파일**에 오류를 내면 먼저 `cd clients/web/design-system && npm run build` 후 재실행. ② 오류가 design-system 이 export 하는 타입(`LineDraft`·`PartnerOption` 등)에 몰려 있으면 stale dist 를 강하게 의심. ③ 병렬 트랙에서 design-system 을 바꾼 슬라이스가 먼저 머지되면 다른 워크트리의 dist 가 즉시 낡는다([[feedback_parallel_agent_gradle_shared_tree_contention]] 계열). ④ `node_modules/@samhan/design-system` 은 **자기 워크트리** 의 `clients/web/design-system` 을 가리키는 심볼릭 링크다 — 링크가 깨진 게 아니라 **링크 대상의 dist 가 낡은** 것이라 [[feedback_rename_filedep_junction]] 과는 별개 함정이다.
