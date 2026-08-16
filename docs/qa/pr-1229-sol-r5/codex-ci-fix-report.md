# PR #1229 CI 실패 1건 수정 보고

## ① 환경 확인

```text
HEAD=ead1f35350e1bc78cca43ee447d20307bb35e4f1
git status --porcelain (시작 시)=비어 있음
```

## ② RED 원문

```text
FAIL src/renderer/test-utils/harness-false-green-guard.test.ts
× G3a: clients/**/scripts·루트 scripts/ 의 JS/CJS/MJS 캡처 목적지도 _local 격리를 거친다
  docs/qa/pr-1229-sol-r5/full-liveqa.cjs → const OUT
  docs/qa/pr-1229-sol-r5/liveqa.cjs      → const OUT
× H2b: docs/qa/**/*.{js,cjs,mjs,ts} 의 캡처 목적지도 _local 격리를 거친다
  docs/qa/pr-1229-sol-r5/full-liveqa.cjs → const OUT
  docs/qa/pr-1229-sol-r5/liveqa.cjs      → const OUT
```

## ③ 근원

두 하네스가 `path.join(__dirname, 'screenshots')`로 커밋 증거 디렉터리를 직접 가리켰습니다. 같은 디렉터리의 `fail-closed-liveqa.cjs`와 `inspect-ui.cjs`도 형제 PNG를 직접 지정하고 있어 함께 점검했습니다.

## ④ 고친 것

네 개의 캡처 writer가 공용 `scripts/lib/qa-shots-dir.cjs`의 `resolveQaShotsDir(__dirname)`를 사용하도록 변경했습니다. 기본 목적지는 `docs/qa/pr-1229-sol-r5/_local`입니다. 커밋 증거 경로와 파일명은 변경하지 않았고, 캡처가 없는 `opaque-regression-liveqa.cjs`는 변경하지 않았습니다.

## ⑤ 가드 전체 통과 원문

```text
RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/wwh/clients/desktop
✓ src/renderer/test-utils/harness-false-green-guard.test.ts (62 tests)
Test Files  1 passed (1)
Tests       62 passed (62)
```

추가 회귀 검증: `npm test` exit code 0, `npm run typecheck` exit code 0, `npm run lint` exit code 0 (0 errors, 196 warnings), `npm run build` exit code 0.

## ⑥ `tools/s14-probes` 연쇄 여부 판정 근거

연쇄가 아닌 가드 자기검사용 임시 fixture입니다. G3a가 `tools/s14-probes/source/deep` 아래 fixture를 생성하고, `finally`에서 `fs.rmSync(path.resolve(REPO_ROOT, 'tools/s14-probes'), { recursive: true, force: true })`로 전체 정리합니다. `git ls-files tools/s14-probes` 결과도 0건이며 별도 위반은 발견되지 않았습니다.

## ⑦ 스크린샷 10장 보존 확인

```text
docs/qa/pr-1229-sol-r5/screenshots 파일 수=10
00-initial.png
01-ar-ch01-catalog.png
01-ar-ch01-final.png
01-ar-ch01-preview.png
01-ar-ch01-result.png
02-pair-catalog.png
02-pair-final.png
02-pair-preview.png
02-pair-result.png
03-price-preview-503-fail-closed.png
```

기존 파일명과 `report.md` 참조를 그대로 보존했습니다.

## ⑧ 회귀

가드 62/62, desktop 단위 테스트 전체, typecheck, lint, build를 검증했습니다. lint의 196건은 기존 warning이며 error는 0건입니다.

## ⑨ 최종 `git status --porcelain` 원문

```text
 M docs/qa/pr-1229-sol-r5/fail-closed-liveqa.cjs
 M docs/qa/pr-1229-sol-r5/full-liveqa.cjs
 M docs/qa/pr-1229-sol-r5/inspect-ui.cjs
 M docs/qa/pr-1229-sol-r5/liveqa.cjs
?? docs/qa/pr-1229-sol-r5/codex-ci-fix-report.md
```

커밋·push·add는 실행하지 않았습니다.

## 프로세스 회수

이번 세션에서 기동한 검증 프로세스는 모두 종료됐습니다. worktree 경로 기준 잔여 검증 프로세스는 0개입니다.
