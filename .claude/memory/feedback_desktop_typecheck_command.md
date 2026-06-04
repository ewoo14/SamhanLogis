---
name: desktop-typecheck-command
description: clients/desktop 타입검증은 raw tsc 가 아닌 npm run typecheck(tsconfig.node+web)로 — CI Frontend Desktop 회귀 방지 (PR #386 TS2367 회고)
metadata:
  type: feedback
---

# clients/desktop 타입검증 = `npm run typecheck` (raw tsc 금지)

clients/desktop 변경 검증 시 **반드시 `cd clients/desktop && npm run typecheck`** (= `tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit`)를 실행한다. 루트 기본 `npx tsc --noEmit` 은 더 느슨해 일부 에러를 놓친다.

**Why:** PR #386 에서 mock.ts 에 `role === 'MASTER'` 비교(계정 role 타입 = `'MANAGER'|'SALES'|'DISPATCH'`, overlap 없음 → TS2367)가 들어갔는데 로컬 `npx tsc --noEmit` 통과·CI `npm run typecheck`(tsconfig.web strict) fail. "Frontend Desktop (typecheck + lint + build)" 잡 1건 fail 로 머지 1라운드 지연.

**How to apply:** desktop fix/리뷰 후 = `npm run typecheck` (+ `npm run lint` 0 error, `npm run build` 성공). subagent 디스패치 prompt 에도 raw tsc 대신 **`npm run typecheck` 명시**. CI 잡 "Frontend Desktop (typecheck + lint + build)" 와 동일 명령으로 사전 재현. 관련 [[feedback_korean_path_jdk]], [[feedback_preauth_migration_lessons]].
