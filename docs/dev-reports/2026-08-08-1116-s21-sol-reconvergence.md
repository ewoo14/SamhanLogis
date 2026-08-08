# #1116 S21 SOL 재수렴 — S20 오차단 축소·정적 한계 적대적 검증

## 판정

**BLOCK — S19 결함 1~3은 닫혔지만, 새 도달성 결함 4건과 의도적으로 남긴 false-negative 2건, 합계 6건이다.**

현재 HEAD는 `ca368b2b2`다. S19의 Python 주석·한 줄 문자열과 Batch `REM` 주석은 더 이상 writer로 오인되지 않았고, 주석에만 `_local`을 둔 Python writer는 정확히 RED였다. 실제 저장소의 격리 marker를 쓰는 Python writer 2개도 기준 전체 실행에서 계속 green이었다.

그러나 읽지 못한 untracked writer는 내부 배열에만 넣고 아무 경고 없이 건너뛰어 G3a가 green이다. 이는 Codex가 untracked 파일을 만들고 PM이 나중에 add·commit하는 이 저장소 흐름에서 사람이 목록을 볼 방법이 없으므로 충분하지 않다. Python triple-quoted 문서 문자열은 여전히 writer로 오차단한다. 반대로 quoted Batch 목적지는 문자열 마스킹 때문에 writer 모집단에서 빠지고, marker와 `write`가 같은 도움말 문자열에 있다는 이유만으로 무관한 실제 Python writer가 면제된다.

S20의 저장소 실측 0은 독립 확인 결과 맞다. tracked Python 6개와 Batch 2개에서 `Path('docs') / 'qa'` 직접·변수 조립 및 `%OUT%` 목적지 writer는 모두 0건이었다. 하지만 이는 현재 스냅샷의 부재만 증명한다. 이 가드는 미래 변경의 커밋 증거 직접 쓰기를 막는 회귀 가드이므로, 알려진 표준 형태가 추가되어도 green인 계약은 닫히지 않았다. 특히 두 예시는 임의 런타임 값을 완전 해석해야 하는 문제가 아니라 상수 `Path` 조립과 같은 파일 안의 단순 Batch 변수 전이다.

코드·커밋·push·Docker·`.gitguardian.yaml`은 건드리지 않았다. 검증 probe는 모두 제거했고 최종 신규 파일은 이 보고서 1건이다.

## S19 결함 1~3 재판정

| S19 결함 | S21 재현 | 결과 | 판정 |
|---|---|---:|---|
| 정상 잠금 non-writer가 전체 가드를 RED | untracked harmless `.mjs`와 untracked writer `.mjs`를 각각 Windows `FileShare.None`으로 동시에 잠그고 G3a 실행 | exit 0 | **원래 오차단은 종결**, 단 결함 1의 false-green 발생 |
| Python/Batch 주석·문자열 오탐 | S19의 Python 주석, Python 한 줄 문자열, Batch `@rem` probe를 함께 실행 | 위반 목록에 0건 | **해당 세 형태 종결** |
| 주석의 `_local`로 실제 writer 우회 | S19와 같은 `_local` 주석 + `open/write` probe 실행 | exit 1, `marker-comment-writer.py → text writer` | **종결** |

같은 결합 실행의 실제 위반 목록에는 테스트 자체의 `s14` 양성 대조군 외에 `locked-writer.mjs`와 `marker-comment-writer.py`만 있었다. 세 benign 주석·한 줄 문자열 probe는 없었다. 이후 양성 probe를 제거하고 false-negative probe만 둔 실행은 exit 0이었다.

## 결함 1 — 읽지 못한 untracked writer가 목록 노출 없이 green이다

다음 untracked 실제 writer와 harmless 파일을 Windows `FileShare.None`으로 잠근 채 G3a를 실행했다.

```js
const OUT = 'docs/qa/.s21-locked-writer.png'
fs.writeFileSync(OUT, 'probe')
```

```js
export const harmless = true
```

결과는 1/1 green이었다.

```text
Tests 1 passed | 55 skipped
S21_UNTRACKED_LOCKED_WRITER_AND_NONWRITER_EXIT=0
```

출력에는 두 파일 경로도, `unreadEvidenceCandidates`도, skip 경고도 없었다. 구현은 배열에 경로를 추가할 뿐 G3a 단언이나 사용자 출력에 연결하지 않는다. 따라서 “목록화 후 사람이 본다”는 운영 계약이 성립하지 않는다.

이 저장소에서는 Codex가 새 파일을 만든 뒤 PM이 add·commit하는 순서가 실제 흐름이다. add 전 가드가 green이고 목록도 보이지 않으면 PM은 위반 writer의 존재를 알 수 없다. 이후 add하면 fail-closed 대상이 되지만, add 이후 반드시 동일 가드를 재실행한다는 별도 강제 계약도 이 변경에는 없다.

## tracked source 잠금 판정

기존 tracked `clients/desktop/scripts/qa-output-path-guard.test.cjs`를 같은 방식으로 잠그자 G3a는 exit 1이었고 전체 경로를 출력했다.

```text
unable to read tracked evidence source: C:\dev\Samhan-Public\.claude\worktrees\t1116\clients\desktop\scripts\qa-output-path-guard.test.cjs
S21_TRACKED_LOCK_EXIT=1
```

이는 읽지 못한 tracked source에 대해 검증 완전성을 증명할 수 없다는 evidence-integrity 실패다. 편집기나 백신이 tracked source를 배타 잠글 가능성은 있으나, 해당 파일을 검사하지 않고 green을 내는 것보다 RED가 계약에 맞다. 따라서 이 라운드에서는 tracked 잠금 자체를 오차단 결함으로 세지 않았다.

## 결함 2 — Python triple-quoted 문서 문자열을 writer로 오차단한다

S20은 한 줄 따옴표 문자열만 마스킹한다. Python에서 일반적인 multiline docstring은 마스킹되지 않는다.

```python
HELP = """
Documentation example only:
with open('docs/qa/example.png', 'wb') as handle:
    handle.write(b'example')
"""
VALUE = 1
```

G3a 결과는 exit 1이었다.

```text
tools/s21-probes/triple-docstring-only.py → text writer
S21_TRIPLE_DOCSTRING_EXIT=1
```

따라서 “Python 문자열 속 writer 언급은 writer로 판정하지 않는다”는 S20 보고서의 범위는 한 줄 문자열에만 참이다. 이번 probe에서 주석 제거가 실제 코드 여러 줄을 삼키는 현상은 재현하지 않았지만, Python 문자열 문법을 불완전하게 처리해 정상 문서를 차단하는 새 표면은 남아 있다.

## 결함 3 — quoted Batch 직접 목적지가 writer 모집단에서 빠진다

동적 변수 없이 목적지를 리터럴로 직접 쓴 Batch다.

```bat
@copy nul "docs\qa\.s21-quoted-target.txt"
```

S20의 `maskStringLiterals`는 quoted 목적지 전체를 공백으로 바꾼 뒤, 같은 `code`에서 `copy ... docs\qa`를 찾는다. 따라서 경로 존재 확인은 원문에서 통과하지만 writer 정규식에서는 목적지가 사라진다. marker-string 우회 probe와 이 파일만 둔 G3a는 exit 0이었다.

```text
Tests 1 passed | 55 skipped
S21_FALSE_NEGATIVE_COMBINATION_EXIT=0
```

Batch에서 공백 안전성을 위해 목적지를 따옴표로 감싸는 것은 정상 문법이다. 이는 S19의 `%OUT%`와 다른 조합이며 S20 문자열 오탐 fix가 만든 회귀다.

## 결함 4 — marker와 `write`가 같은 도움말 문자열이면 실제 writer를 면제한다

다음 Python은 marker가 실제 출력 대상과 이어지지 않는다.

```python
NOTE = "_local writer example"
OUT = 'docs/qa/.s21-marker-string-bypass.png'
with open(OUT, 'wb') as handle:
    handle.write(b'probe')
```

`hasRelatedIsolationMarker`는 marker가 있는 줄을 마스킹 전 `source`로 검사하고, 같은 줄에 `write`라는 부분 문자열이 있으면 즉시 `true`를 반환한다. 실제 `OUT`과 연결됐는지 보지 않는다. 이 probe와 quoted Batch writer를 함께 둔 G3a는 exit 0이었다.

이는 S19의 “주석에 `_local`”과 다른 조합이다. 주석은 제거됐지만, 도움말 문자열의 marker·writer 단어가 파일 전체의 실제 writer를 면제한다.

## 의도적으로 남긴 결함 5·6 — 실측 0은 맞지만 회귀 가드는 false-green이다

가드 구현과 별개로 `git ls-files`의 tracked `.py`·`.bat` 전수를 읽어 독립 집계했다.

```text
S21_TRACKED_PY_FILES=6
S21_PATH_DIRECT_COUNT=0
S21_PATH_VIA_VAR_COUNT=0
S21_TRACKED_BAT_FILES=2
S21_BATCH_VAR_TARGET_COUNT=0
```

즉 S20의 “현재 저장소 0건”은 정확하다. 그러나 S19 probe를 그대로 다시 두면 다음 두 writer는 여전히 G3a green이다.

```python
from pathlib import Path
ROOT = Path('docs')
OUT = ROOT / 'qa' / '.s21-path-composed.png'
OUT.write_bytes(b'probe')
```

```bat
@set OUT=docs\qa\.s21-variable-target.txt
@echo probe>%OUT%
```

현재 표본 0은 기존 파일 회귀가 없다는 증거이지, 새 위반 파일을 막는 회귀 가드의 충분조건이 아니다. 모든 동적 경로를 정규식으로 완전 해석할 필요는 없지만, 이미 알려진 두 정적 형태를 green으로 두는 결정은 이 가드의 목적과 맞지 않는다. 정규식 추가의 반복 비용이 문제라면 AST/제한된 상수 전이 또는 실행 전후 커밋 증거 경로 오염 검사가 설계 대안이며, false-green을 허용하는 근거는 아니다.

## 실제 marker 보유 Python/Batch 파일 전수

tracked Python 6개와 Batch 2개 중 새 marker 연결 판정의 실제 대상은 다음 Python writer 2개였다.

- `docs/qa/sp-08-6-3-sales-slip-soft-delete/screenshots/gen_png.py`
- `docs/qa/sp-08-6-5-accounting-daily-ledger/gen_pngs.py`

둘 다 `resolve_qa_shots_dir(...)` 반환값을 `OUT_DIR`/`OUT`에 넣고 그 변수를 실제 `.save(...)`에 사용한다. `scripts/lib/qa_shots_dir.py`는 marker helper 자체이며 커밋 증거 writer가 아니다. Batch marker writer는 0개다. 기준 전체 56건과 G3a 기준 실행이 green이므로 현 저장소의 정당한 marker writer 2개는 S20 판정에 의해 거부되지 않았다.

## 지정 전체 명령과 시간

probe 없는 기준을 `clients/desktop`에서 파이프 없이 실행하고 PowerShell `Stopwatch`로 wall time을 쟀다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts

Test Files 1 passed (1)
Tests 56 passed (56)
Vitest Duration 22.68s
S21_BASELINE_EXIT=0
S21_BASELINE_WALL_SECONDS=24.15
```

보고서 작성과 probe 정리 후 같은 명령을 다시 실행한 최종 결과도 green이었다.

```text
Test Files 1 passed (1)
Tests 56 passed (56)
Vitest Duration 25.61s
S21_FINAL_EXIT=0
S21_FINAL_WALL_SECONDS=27.18
```

## probe 정리와 파일 상태

검증 중 만든 `tools/s21-probes/**`는 모두 제거했다. 제거 직전 디렉터리 child count는 0, 제거 후 `Test-Path`는 `False`였다. intent-to-add나 다른 index 변경은 만들지 않았다.

최종 `git status --short`에서 신규 파일은 이 보고서 1건만 남아야 하며, 가드 소스와 `.gitguardian.yaml`의 diff는 0이어야 한다.

## 이 라운드가 보지 않은 것

- Python AST 전체 문법과 Batch 전체 문법을 열거하지 않았다. triple-quoted 문자열, quoted Batch 리터럴, marker 도움말 문자열이라는 결정적 반례만 실행했다.
- Linux/macOS의 권한·잠금 동작은 실행하지 않았다. 잠금 probe는 Windows `FileShare.None`이었다.
- sparse checkout, broken symlink, 파일 생성→삭제 경합을 실행하지 않았다.
- add 후 동일 가드 재실행을 강제하는 외부 PM/CI 절차가 있는지는 검증하지 않았다. 현재 테스트 출력과 이 변경 안에는 그런 강제가 없다.
- 결과 기반 `docs/qa` 오염 검사를 구현하거나 성능 측정하지 않았다.
- GitHub CI, 제품 UI/API, 공유 Docker 스택은 보지 않았다.
