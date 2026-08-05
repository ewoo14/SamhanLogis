# 이슈 #1013 라운드 2 — 전표번호 형식 sweep 보고서

## 1. 원인

`Frontend Desktop (typecheck + lint + build)`의 mock 계약 가드가 `src/renderer/routes/DispatchSmsPage.test.ts`의 `slipNo` 값 3건을 탐지했습니다. `전표-001`, `전표-002`, `전표-003`은 백엔드 `SlipNumberService`/`JournalNumberService`의 실제 형식인 `yyyy/MM/dd-N`이 아니므로, 가드를 완화하지 않고 fixture를 수정했습니다.

## 2. 전수 sweep

`clients/desktop` 전체(의존성·dist·coverage 제외)를 검색했습니다.

- `slipNo`/`journalNo` 따옴표 문자열 대입: **183건**, **33파일**
- 비표준 `전표-`/`분개-` 대입: **3건**
- 수정 후 비표준 잔여: **0건**

가드의 탐지 규칙과 예외 목록은 변경하지 않았습니다.

## 3. 고친 목록

- `clients/desktop/src/renderer/routes/DispatchSmsPage.test.ts`
  - `전표-001` → `2026/08/02-1`
  - `전표-002` → `2026/08/02-2`
  - `전표-003` → `2026/08/02-3`

## 4. 검증

실행 위치: `C:/dev/Samhan-Public/.claude/worktrees/t1013b/clients/desktop`

1. `npm run typecheck` — exit code 0
   ```text
   ℹ todo 0
   ```
2. `npx vitest run src/renderer/api/mock.test.ts` — exit code 0
   ```text
         Tests  128 passed (128)
   ```
3. `npm run lint` — exit code 0
   ```text
   ✖ 111 problems (0 errors, 111 warnings)
   ```
4. `npm run build` — exit code 0
   ```text
   ✓ built in 5.11s
   ```

## 5. 변경 파일별 실측

추적 변경은 `git diff --numstat`, 신규 파일은 동일한 numstat 형식의 `git diff --no-index --numstat /dev/null <파일>`로 실측한 결과입니다.

| 파일 | 추가 +N | 삭제 −M |
|---|---:|---:|
| `clients/desktop/src/renderer/routes/DispatchSmsPage.test.ts` | +3 | −3 |
| `docs/dev-reports/2026-08-02-1013-r2-ci-format-sweep.md` | +50 | −0 |
