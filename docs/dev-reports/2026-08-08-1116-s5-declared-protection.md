# PR #1138 / 이슈 #1116 — S5 선언형 보호 축

## 결론

호출자가 보호 여부를 선언하도록 변경했다. 기본값은 보호(`protect: true`)이며, 재생성 목적만 `protect: false`를 명시한다.

- 보호 경계의 `^qa(?:-.+)?$` 이름 정규식을 제거했다.
- `docs` 바로 아래 경계는 보호 선언이 켜진 경우에만 물리 경계로 사용한다.
- `tools/manual-capture` 3개 호출자는 재생성 선언을 추가했다.
- `QA_ALLOW_OVERWRITE=1`, 기본 `<committedDir>/_local`, 저장소 밖 경로, UNC/junction/subst 계약은 유지했다.

## RED-first 원문

수정 전 실패 테스트:

```text
✖ S5 RED-B docs/dev-reports도 호출자의 보호 선언 기본값으로 차단된다
  AssertionError [ERR_ASSERTION]: Missing expected exception:
  docs/dev-reports 커밋 증거 루트가 보호되지 않습니다
```

실행:

```text
node --test --test-name-pattern="S5 RED-B" clients/desktop/scripts/qa-output-path-guard.test.cjs
exit code: 1
```

## 행위 기반 반열거 울타리

`git ls-files -z -- docs/**/*.png docs/**/*.jpg docs/**/*.jpeg`로 커밋 캡처를 계산했다. 현재 입력 집합은 6,716장, docs 하위 최상위 8개 루트다.

| 계산된 루트 | 캡처 수 | 분류 결과 |
|---|---:|---|
| `docs/character` | 8 | 보호 기본값 |
| `docs/design` | 13 | 보호 기본값 |
| `docs/dev-reports` | 23 | 보호 기본값 |
| `docs/manual` | 161 | 도구 호출부가 재생성 선언 |
| `docs/migration` | 16 | 보호 기본값 |
| `docs/qa` | 6,042 | 보호 기본값 |
| `docs/qa-shots` | 452 | 보호 기본값 |
| `docs/templates` | 1 | 보호 기본값 |

행위 울타리는 위 루트들을 소스 목록에 하드코딩하지 않고 Git에서 계산한 뒤, 기본 resolver가 보호하는지 확인한다. 재생성 호출자는 `protect: false` 선언을 별도로 확인한다. 새 캡처 루트가 추가되면 이 테스트가 분류 누락을 실패시킨다.

## 6종 동일 입력 대조표

공통 입력: `committedDir = QA_SHOTS_DIR = docs/dev-reports/__1116-s5-matrix__`.

| 구현 | 보호 기본값 | 동일 입력 결과 | 재생성 선언 |
|---|---|---|---|
| `.ts` | `options.protect !== false` | BLOCK | `{ protect: false }` |
| `.mjs` | `options.protect !== false` | BLOCK | `{ protect: false }` |
| `.cjs` | `options.protect !== false` | BLOCK | `{ protect: false }` |
| `.ps1` | `-ProtectionMode Protect` | BLOCK | `-ProtectionMode Regenerate` |
| `.sh` | 두 번째 인자 `protect` | BLOCK | 두 번째 인자 `regenerate` |
| `.py` | `protect=True` | BLOCK | `protect=False` |

직접 실행 결과:

```text
.ps1  BLOCK
.sh   BLOCK
.py   BLOCK
```

재생성 경로(`docs/manual/screenshots`)에 같은 방식으로 선언했을 때 6종 모두 `ALLOW`를 확인했다. 커밋된 매뉴얼 PNG는 덮어쓰지 않았다.

## 검증

```text
node --test clients/desktop/scripts/qa-output-path-guard.test.cjs
53 passed, 0 failed

git diff --check
exit code: 0
```

물리 경로 회귀에서 평문·슬래시·혼합 구분자·자기 UNC·subst·junction은 BLOCK, 외부 UNC는 ALLOW였다.

`git diff --stat` 기준 삭제 줄 수: **36줄**.

## 변경 파일

- `scripts/lib/qa-shots-dir.{cjs,mjs,ps1,sh}`
- `scripts/lib/qa_shots_dir.py`
- `clients/desktop/playwright/support/qa-screenshot-dir.{ts,mjs}`
- `qa/playwright/utils/screenshot.ts`
- `clients/desktop/src/main/capture.ts`
- `tools/manual-capture/{sync-screenshots.js,generate-mobile-placeholders.js,capture-manual-all.js}`
- `clients/desktop/scripts/qa-output-path-guard.test.cjs`
- 신규: `docs/dev-reports/2026-08-08-1116-s5-declared-protection.md`

커밋·push는 수행하지 않았다.
