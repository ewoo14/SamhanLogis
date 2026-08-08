# PR #1138 / 이슈 #1116 슬라이스 1 — QA 증거 루트 축 가드

## 결함

`resolveQaShotsDir` 계열 resolver가 `docs/qa`만 물리 경로 가드의 기준으로 사용해,
커밋된 두 번째 증거 루트인 `docs/qa-shots/**`를 `QA_ALLOW_OVERWRITE` 없이 허용했다.
루트 목록에 새 항목을 추가하는 방식은 다음 증거 루트가 생길 때 같은 결함을 반복하므로
채택하지 않았다.

## RED-first 원문

추가한 테스트:

```text
D-3 [E] 새 커밋 QA 증거 루트도 모집단 축에 따라 자동 차단한다
```

기존 CJS resolver에 대한 수정 전 직접 재현:

```text
RED FAILURE: resolver allowed C:\dev\Samhan-Public\.claude\worktrees\t1116b\docs\qa-shots\new-root-fixture
```

초기 전체 테스트 실행은 구현 결함 전 `typescript` 개발 의존성 부재로 중단됐다.
워크트리 의존성을 복원한 뒤 위 RED 테스트가 실제로 허용을 재현하는 것을 확인하고 수정했다.

## 구현

각 resolver가 개별 루트를 열거하지 않고, 커밋 QA 증거 루트의 공통 저장 축인
`<repo>/docs`를 `QA_EVIDENCE_AXIS`로 물리 경로 판정한다. 따라서 `docs/qa`,
`docs/qa-shots`, 그리고 향후 `docs` 아래에 추가되는 증거 루트가 동일한 가드에 자동 포함된다.

유지한 계약:

- `QA_SHOTS_DIR` 미지정 기본값은 `<committedDir>/_local`
- `QA_ALLOW_OVERWRITE=1`이면 명시 경로 허용
- `docs` 밖의 저장소 외부 임시·로컬 경로는 허용
- 물리 경로, junction, subst, UNC 표기 판정은 기존 방식 유지

같은 계약을 다음 10개 resolver 표면에 반영했다.

- `clients/desktop/playwright/support/qa-screenshot-dir.ts`
- `clients/desktop/playwright/support/qa-screenshot-dir.mjs`
- `clients/desktop/src/main/capture.ts`
- `qa/playwright/utils/screenshot.ts`
- `scripts/lib/qa-shots-dir.cjs`
- `scripts/lib/qa-shots-dir.mjs`
- `scripts/lib/qa-shots-dir.ps1`
- `scripts/lib/qa-shots-dir.sh`
- `scripts/lib/qa_shots_dir.py`
- `clients/desktop/scripts/qa-output-path-guard.test.cjs`

## 검증

```text
node --test clients/desktop/scripts/qa-output-path-guard.test.cjs
48 passed / 48 failed 0

npm test -- src/renderer/test-utils/harness-false-green-guard.test.ts --run
61 passed / 61 failed 0

npm run typecheck
exit 0
  real-QA cleanup scope: 2 passed / 0 failed
  real-QA scope: 50 passed / 0 failed
```

가드 전수 스위트의 경로 매트릭스에서 평문·슬래시·혼합·UNC·subst·junction은 BLOCK,
외부 UNC는 ALLOW로 유지됐다. `docs/qa-shots/new-root-fixture`는 새 루트 회귀 테스트에서
BLOCK되고, 동일 경로는 `QA_ALLOW_OVERWRITE=1`일 때 통과한다.

## 변경량

`git diff --stat` 기준:

```text
40 insertions(+), 24 deletions(-)
```

삭제 줄 수: **24**

커밋·push는 수행하지 않았다. 커밋된 456개 `docs/qa-shots` 파일도 이동·수정하지 않았다.
