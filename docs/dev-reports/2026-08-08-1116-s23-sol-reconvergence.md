# #1116 S23 SOL 재수렴 — S22 범위 제한 수정 적대적 검증

## 판정

**BLOCK — 범위 내 도달성 결함 3건이다.**

S22가 고친 두 축의 기본 동작은 재현됐다. 읽지 못한 untracked 후보는 이제 경로 목록을 출력하고, 정상적으로 닫힌 Python triple-quoted 문서 문자열은 writer 분석과 discovery 양쪽에서 제외된다. 그러나 경고는 동일 후보 하나를 전체 suite에서 21회 반복해 사람이 보는 신호를 소음으로 만들며, Python 주석에 `"""`가 한 번 등장하면 triple-string 제거기가 주석 뒤의 실제 writer 코드 전부를 삼켜 G3a가 green이다.

또한 S13 회귀 probe 중 skip basename 아래의 tracked writer가 다시 green이다. clean tree의 `git ls-files -co --exclude-standard -z` 출력이 1,244,201 bytes인데, `directoryContainsTrackedFile()`의 `execFileSync`에는 `maxBuffer`가 없다. 기본 buffer 초과 `ENOBUFS`를 catch한 뒤 tracked 모집단을 빈 집합으로 바꾸므로 `build/out/bin/target` 아래의 실제 tracked source가 전부 닫힌다.

코드·커밋·push·Docker·`.gitguardian.yaml`은 건드리지 않았다. 검증 probe와 임시 index entry는 모두 제거했고 최종 신규 파일은 이 보고서 1건이다.

## S22 수정 1 — 목록 노출은 됐지만 같은 목록을 21회 반복한다

S21과 같은 실제 untracked writer를 Windows `FileShare.None`으로 잠근 채 지정 전체 58건을 실행했다.

```js
const OUT = 'docs/qa/.s23-unreadable-untracked.png'
fs.writeFileSync(OUT, 'probe')
```

suite는 exit 0이었고 경고에 상대 경로가 실제로 포함됐다. 따라서 S21의 “조용히 green”은 닫혔다. 그러나 같은 한 경로가 다음처럼 반복됐다.

```text
S23_WARN_FULL_EXIT=0
S23_WARN_BLOCK_COUNT=21
S23_WARN_PATH_REPEAT_COUNT=21
```

`discoveredEvidenceWriters()`는 결과 cache가 같아도 discovery를 다시 수행하고, 매 호출마다 `unreadEvidenceCandidates`를 비운 뒤 같은 `console.warn`을 출력한다. 한 번의 정상 전체 실행에서 같은 목록이 21회 나오므로 PM이 확인해야 할 경고가 호출 횟수만큼 증폭된다.

probe가 없는 기준 전체 실행에서도 suite 자체가 만드는 unreadable 후보 두 개 때문에 경고 블록이 2회 출력됐다. 이는 서로 다른 테스트 후보였고, 실제 저장소 후보가 반복된 위 21회와는 구분했다.

## S22 수정 2 — 정상 docstring 오차단은 닫혔지만 주석 delimiter가 실제 코드를 숨긴다

S21 원형의 정상 `"""..."""` 문서 문자열은 S22 내장 회귀 테스트에서 writer 분석과 discovery 양쪽 모두 비위반이었다. 정상 docstring 뒤에 실제 writer를 둔 대조군은 G3a가 정확히 RED였다.

```python
HELP = """
Documentation example only.
"""
OUT = 'docs/qa/.s23-regression-post-docstring.png'
with open(OUT, 'wb') as handle:
    handle.write(b'probe')
```

반면 같은 실제 writer 앞에 Python 주석 한 줄만 추가하면 green으로 바뀌었다.

```python
# Documentation delimiter example: """
OUT = 'docs/qa/.s23-triple-comment-writer.png'
with open(OUT, 'wb') as handle:
    handle.write(b'probe')
```

```text
주석 없음: S23_TRIPLE_CONTROL_EXIT=1
주석 있음: S23_TRIPLE_COMMENT_BYPASS_EXIT=0
```

`stripPythonTripleQuotedStrings()`가 Python 주석 제거보다 먼저 실행되므로 주석 속 `"""`도 triple-string 시작으로 해석한다. 닫는 delimiter가 없으면 이후 실제 코드가 EOF까지 제거된다. 이는 triple-quoted 제외가 새로 만든 실제 writer false-green이다.

## 회귀 결함 — skip basename 아래 tracked writer가 ENOBUFS로 다시 green이다

S13의 `build` basename probe를 “generated output”과 구분하기 위해 파일을 정확히 stage한 뒤 단독 실행했다.

```text
tools/.s23-build-only/build/deep/tracked-writer.mjs
  const OUT = 'docs/qa/.s23-build-only.png'
  fs.writeFileSync(OUT, 'probe')

git status --short:
A  tools/.s23-build-only/build/deep/tracked-writer.mjs

S23_TRACKED_BUILD_ONLY_EXIT=0
Tests 1 passed | 57 skipped
```

같은 clean tree에서 git 모집단을 독립 측정하고, 구현과 같은 기본 `execFileSync` 호출도 재현했다.

```text
S23_CLEAN_GIT_LS_FILES_BYTES=1244201
S23_CLEAN_DEFAULT_BUFFER_ERROR=ENOBUFS
```

`directoryContainsTrackedFile()`은 이 예외를 잡아 `trackedRepoFilesAvailable=false`로 만들고, skip basename을 열지 않는다. 따라서 staged/tracked writer가 discovery와 G3a에 도달하지 않았다. 반면 별도 ignored `build/deep/generated.cjs`는 계속 green이어서, 이번 결과는 ignored output 오차단이 아니라 tracked source 누락이다.

## S13·S15·S17·S19·S21 회귀 표

| 과거 probe 축 | S23 결과 | 판정 |
|---|---:|---|
| 동일 stat 치환 후 내용 변경 | 내장 content-hash cache 회귀 테스트 통과 | 유지 |
| 무마커 `.ts` writer | G3a exit 1, 정확한 경로 출력 | 유지 |
| 중첩 `scripts/**/*.ps1` writer | G3a/G3c exit 1, 정확한 경로 출력 | 유지 |
| skip basename 아래 tracked writer | 단독 G3a exit 0 | **회귀** |
| 저장소 밖 junction writer | G3a exit 0 | 외부 오차단 없음 |
| ignored generated output | G3a 위반 목록 0건 | 오차단 없음 |
| Python `open/write` writer | G3a exit 1, 정확한 경로 출력 | 유지 |
| `.cts` writer | G3a exit 1, 정확한 경로 출력 | 유지 |
| `.bat` 직접 목적지 writer | G3a exit 1, 정확한 경로 출력 | 유지 |
| 주석의 `_local` 뒤 실제 Python writer | G3a exit 1, 정확한 경로 출력 | 유지 |
| 읽지 못한 tracked source | 내장 S18 fail-closed 테스트 통과 | RED 유지 |
| 읽지 못한 untracked writer | 전체 suite exit 0 + 경로 경고 | S22 계약대로 목록 노출, 단 21회 반복 결함 |

## 오차단 대조군

다음 항목을 함께 둔 G3a는 exit 0이었다.

- Python 주석에서만 `docs/qa`와 `open/write` 언급
- Python 한 줄 문자열에서만 writer 예제 언급
- Python 정상 triple-quoted 문서 문자열에서만 writer 예제 언급
- Batch `REM` 주석에서만 writer 예제 언급
- `docs/qa` 아래 Markdown 문서
- `resolve_qa_shots_dir(...)`와 실제 write가 연결된 정상 marker writer
- ignored `build/deep/generated.cjs`
- 저장소 밖 target을 가리키는 directory junction

실제 marker-comment writer와 정상 docstring 뒤의 실제 writer는 같은 결합 실행에서 각각 RED였으므로 benign 대조군이 양성 writer를 가려서 green이 된 것은 아니다.

## 지정 전체 명령과 시간

probe 없는 기준을 `clients/desktop`에서 파이프 없이 실행하고 PowerShell `Stopwatch`로 wall time을 쟀다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts

Test Files 1 passed (1)
Tests 58 passed (58)
Vitest Duration 24.31s
S23_BASELINE_EXIT=0
S23_BASELINE_WALL_SECONDS=25.73
```

보고서 작성과 probe 정리 후 같은 명령을 다시 실행한 최종 결과도 exit 0이었다.

```text
Test Files 1 passed (1)
Tests 58 passed (58)
Vitest Duration 25.77s
S23_FINAL_EXIT=0
S23_FINAL_WALL_SECONDS=27.23
```

## probe 정리와 파일 상태

다음 probe 계열과 외부 target/junction을 제거했다.

- `tools/.s23-probes/**`
- `tools/.s23-regression/**`
- `tools/.s23-ignored/**`
- `tools/.s23-build-only/**`
- `scripts/.s23-regression/**`
- `docs/qa/.s23-regression/**`
- `tools/.s23-external-link`
- `C:/dev/Samhan-Public/.claude/s23-external-target`

tracked build probe의 stage/intent-to-add 항목도 제거했다. probe 정리 직후 `git status --short`는 비어 있었다. 최종 상태에서는 이 보고서만 신규 파일이어야 하며 가드 소스와 `.gitguardian.yaml`의 diff는 0이어야 한다.

## 이 라운드가 보지 않은 것

- PM이 명시적으로 제외한 quoted Batch 목적지 미탐은 다시 실행·판정하지 않았다.
- PM이 명시적으로 제외한 marker와 `write`가 같은 도움말 문자열의 실제 writer 면제는 다시 실행·판정하지 않았다.
- PM이 명시적으로 제외한 Python `Path('docs') / 'qa'` 조립 경로는 다시 실행·판정하지 않았다.
- PM이 명시적으로 제외한 Batch `%OUT%` 변수 목적지는 다시 실행·판정하지 않았다.
- Python tokenizer 전체 문법, unusual escaped delimiter, prefix 조합, f-string/nested expression을 열거하지 않았다. 이번에는 S22가 만든 순서 문제인 “주석 속 triple delimiter 뒤 실제 코드”만 실행했다.
- Linux/macOS의 잠금·symlink 동작은 실행하지 않았다. 잠금은 Windows `FileShare.None`, 외부 link는 Windows directory junction이었다.
- GitHub CI, 제품 UI/API, 공유 Docker 스택은 보지 않았다.
