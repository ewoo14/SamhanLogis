# #1116 S3 — 호출 지점에서 QA 증거 축 파생

- 대상 PR: #1138
- 대상 HEAD: `2a25e9f90`
- 판정: 구현 및 회귀 검증 완료
- 커밋·push: 하지 않음
- Docker/DB: 사용·변경 없음
- 커밋된 QA 증거: 덮어쓰기 없음

## RED-first

수정 전에 `clients/desktop/scripts/qa-output-path-guard.test.cjs`에 S3 RED-A를 추가하고 실행했다.

```text
✖ S3 RED-A 매뉴얼 캡처 경로는 committedDir 이 QA 증거 루트가 아니므로 통과한다
Error: [QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다:
C:\dev\Samhan-Public\.claude\worktrees\t1116b\docs\manual\screenshots.
```

수정 후에는 동일 테스트의 S3 RED-A·RED-B가 모두 통과했다.

## 변경 내용

기존 `docs` 전역 축을 제거하고, `committedDir`의 조상 중 `docs` 바로 아래에 있는 `qa` 또는 `qa-*` 디렉터리를 호출자 파생 증거 루트로 사용한다. 따라서 다음이 성립한다.

- `docs/qa/<slug>` 및 `docs/qa/<타 slug>`와 `docs/qa` 루트: 차단
- `docs/qa-shots/<slug>` 및 `docs/qa-shots` 루트: 차단
- 향후 `docs/qa-evidence/<slug>`처럼 `qa-*` 증거 루트를 committedDir로 사용하는 spec: 자동 차단
- `docs/manual/screenshots` 및 `docs/manual/screenshots/04-모바일`: 허용
- 기본값 `<committedDir>/_local`, `QA_ALLOW_OVERWRITE=1`, 저장소 밖 경로: 기존 계약 유지

같은 축을 다음 구현 사본에 반영했다.

1. `clients/desktop/playwright/support/qa-screenshot-dir.ts`
2. `clients/desktop/playwright/support/qa-screenshot-dir.mjs`
3. `clients/desktop/src/main/capture.ts`
4. `qa/playwright/utils/screenshot.ts`
5. `scripts/lib/qa-shots-dir.cjs`
6. `scripts/lib/qa-shots-dir.mjs`
7. `scripts/lib/qa-shots-dir.ps1`
8. `scripts/lib/qa-shots-dir.sh`
9. `scripts/lib/qa_shots_dir.py`

## S2가 확인한 비-QA 도구 3개 RED-A 고정

S2 보고서의 정확한 경로를 테스트 입력으로 고정했다.

| 도구 | committedDir / QA_SHOTS_DIR | 결과 |
|---|---|---|
| `tools/manual-capture/sync-screenshots.js` | `docs/manual/screenshots` | ALLOW |
| `tools/manual-capture/capture-manual-all.js` | `docs/manual/screenshots` | ALLOW |
| `tools/manual-capture/generate-mobile-placeholders.js` | `docs/manual/screenshots/04-모바일` | ALLOW |

## 동일 입력 집합 6종 대조

모든 resolver에 동일한 상대·정규화 입력 집합을 적용했다. 차단 판정은 `QA_ALLOW_OVERWRITE` 미설정 기준이다.

| 입력 케이스 | `.ts` | `.mjs` | `.cjs` | `.ps1` | `.sh` | `.py` |
|---|---:|---:|---:|---:|---:|---:|
| `docs/manual/screenshots` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `docs/qa/<자기 slug>` | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK |
| `docs/qa/<타 slug>` | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK |
| `docs/qa` 루트 | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK |
| `docs/qa-shots/<slug>` | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK |
| 저장소 밖 경로 | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |

물리 경로 대조는 기존 회귀 스위트의 평문·슬래시·UNC·subst·junction 케이스로 유지했고, `QA_ALLOW_OVERWRITE=1`은 각 구현에서 명시 경로를 그대로 허용한다.

## 반열거 울타리

테스트에 10개 resolver 소스를 동적으로 모아 다음을 고정했다.

- `QA_EVIDENCE_AXIS`/`qaEvidenceAxis`/`qa_evidence_axis` 전역 축이 없어야 함
- 호출자 파생 함수가 반드시 존재해야 함

따라서 옛 `docs` 전역 축을 되살리는 mutation은 이 테스트에서 RED가 된다. 새 `docs/qa-*` 루트는 목록 추가 없이 `committedDir`의 조상 규칙으로 보호된다.

## 검증

```text
node --test clients/desktop/scripts/qa-output-path-guard.test.cjs
ℹ tests 51
ℹ pass 51
ℹ fail 0
```

실행 중 생성된 junction/subst는 테스트가 회수했고, 잔류 프로세스는 없다.

## diff 통계

실행 명령: `git diff --stat`

```text
10 files changed, 164 insertions(+), 39 deletions(-)
```

삭제 줄 수는 **39줄**이다. PowerShell resolver는 저장소 원본의 UTF-16 형식을 보존했으며 Git은 해당 파일을 binary stat으로 표시한다.

신규 파일: `docs/dev-reports/2026-08-08-1116-s3-axis-from-caller.md` 1개. 기존 미추적 S2 보고서는 변경하지 않았다.
