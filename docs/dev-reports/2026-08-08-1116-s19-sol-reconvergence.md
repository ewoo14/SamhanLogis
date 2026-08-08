# #1116 S19 SOL 재수렴 — S18 fail-closed·확장자 census 적대적 검증

## 판정

**BLOCK — 도달성 결함 4건과 evidence-integrity 오차단 1건, 합계 5건이다.**

S17에서 지적한 세 결함 자체는 닫혔다. 같은 형태의 Python `open/write`, `.cts`, `.bat` writer는 각각 G3a를 RED로 만들었다. Windows `FileShare.None`으로 잠근 `.mjs` writer도 이제 RED이며 오류에는 읽지 못한 파일의 전체 경로가 나온다.

확장자 census도 현 tracked 16,613개 파일의 실제 48개 확장자를 관할 또는 제외로 전부 분류했고, 이미 tracked인 `.md` 3,231개와 `.png` 6,503개가 있는 기준 실행은 green이다. intent-to-add한 신규 `.s19probe`는 census를 RED로 만들었다.

그러나 fail-closed는 writer가 아닌 정상 후보의 일시 잠금도 전체 가드를 죽인다. 새 Python/Batch 원문 휴리스틱은 주석·문자열을 실행 코드로 오인하고, 반대로 `_local` 단어 하나, Python 경로 조립, Batch 변수 목적지로 실제 writer를 숨길 수 있다. 세 false-negative writer와 ignored generated output·문서를 함께 둔 지정 전체 명령은 **56/56 green**이었다.

기준 HEAD는 `1102afa38129be89957b2469455604403bdfaa5b`다. 코드·커밋·push·Docker 조작은 하지 않았다.

## S17 결함 3건 재판정

| S17 결함 | S19 probe | 결과 | 판정 |
|---|---|---:|---|
| 읽기 실패가 non-writer로 조용히 탈락 | 실제 위반 `.mjs`를 Windows `FileShare.None`으로 잠근 채 G3a 실행 | exit 1, `unable to read evidence candidate: C:\dev\...\locked-writer.mjs` | **종결** |
| `.cts`·`.bat` 관할 밖 | S17과 같은 `writeFileSync` `.cts`, `echo > docs\qa` `.bat`를 각각 실행 | 각 exit 1, 정확한 probe 경로 표시 | **종결** |
| `.py` 일반 파일 쓰기 미탐 | S17과 같은 `open(OUT, 'wb')` + `handle.write(...)` | exit 1, `python-open-writer.py → text writer` | **종결** |

## 결함 1 — 정상 잠금 non-writer도 전체 가드를 RED로 만든다

다음 파일에는 증거 경로도 쓰기 호출도 없다.

```js
export const harmless = true
```

이 비-ignored 미추적 `.mjs`를 다른 프로세스가 쓰는 정상 상황을 재현하기 위해 Windows `FileShare.None`으로 연 채 G3a를 실행했다. 결과는 writer 잠금과 똑같이 exit 1이었다.

```text
S19_LOCKED_NON_WRITER_EXIT=1
unable to read evidence candidate: C:\dev\Samhan-Public\.claude\worktrees\t1116\tools\.s19-probes\source\locked-non-writer.mjs
```

discovery는 `git ls-files -co --exclude-standard` 모집단, 즉 non-ignored 미추적 소스까지 매 호출 읽는다. 따라서 QA/빌드 프로세스가 소스 확장자 임시 파일을 생성해 배타적으로 쓰는 동안 가드가 겹치면 위반과 무관하게 CI가 RED다. 파일 생성 후 삭제되는 경합도 `readdirSync`와 `realpathSync/readFileSync` 사이에 같은 경로를 탄다.

메시지는 **무엇을 못 읽었는지** 전체 경로를 알려 준다. 다만 catch가 원래 예외를 버리고 `{ cause: undefined }`로 다시 던져 `ENOENT`·`EACCES`·sharing violation 중 무엇인지는 남기지 않는다. CI에서 임시 파일이 이미 사라진 뒤에는 원인 구분이 불가능하다.

## 결함 2 — Python/Batch의 주석·문자열 언급을 실제 writer로 오차단한다

Python 판정 `hasPythonEvidenceWrite(raw)`와 Batch 판정 `hasBatchEvidenceWrite(raw)`는 `stripComments` 전 원문에 정규식을 적용한다. 다음 세 benign probe를 각각 두고 G3a를 실행했다.

```python
# Documentation example only: with open('docs/qa/example.png', 'wb') as handle:
#     handle.write(b'example')
VALUE = 1
```

```python
HELP = "with open('docs/qa/example.png', 'wb') as handle: handle.write(b'example')"
VALUE = 1
```

```bat
@rem copy harmless.txt docs\qa\example.txt
@echo harmless
```

세 실행은 모두 exit 1이었다.

```text
comment-only.py → text writer
string-only.py → text writer
comment-only.bat → text writer
```

즉 주석과 도움말 문자열만 추가해도 가드가 무관한 변경을 차단한다.

## 결함 3 — `_local` 단어 하나가 실제 Python writer를 면제한다

`hasUnisolatedTextEvidenceWrite`는 원문 어디든 `_local`, `QA_SHOTS_DIR`, `resolve...qa...shots...dir`가 있으면 실제 경로와 호출을 보기 전에 `false`를 반환한다. 다음 probe는 `_local`이 주석에만 있고 실제 출력은 커밋 증거 경로다.

```python
# The word _local is documentation only.
OUT = 'docs/qa/.s19-marker-bypass.png'
with open(OUT, 'wb') as handle:
    handle.write(b'probe')
```

G3a는 exit 0이었다.

```text
S19_PY_MARKER_BYPASS_EXIT=0
Tests 1 passed | 55 skipped
```

모집단에는 들어오지만 G3a 위반 판정에서 단순 단어 면제를 받아 실제 writer가 도달하지 않는다.

## 결함 4 — Python `Path` 경로 조립 writer가 모집단에서 빠진다

S18은 `Path.write_bytes` 호출 자체를 추가했지만 목적지 신호는 여전히 연속된 `docs/qa` 또는 JS식 `path.join('docs', 'qa')` 표기를 요구한다. 다음 일반적인 pathlib 조합은 실제 `docs/qa`를 쓰지만 G3a가 exit 0이었다.

```python
from pathlib import Path
ROOT = Path('docs')
OUT = ROOT / 'qa' / '.s19-path-composed.png'
OUT.write_bytes(b'probe')
```

```text
S19_PY_PATH_COMPOSED_EXIT=0
Tests 1 passed | 55 skipped
```

`hasPythonEvidenceWrite`의 첫 `docs[/\\]qa` 조건에서 탈락하고 `isEvidenceWriter`도 같은 리터럴 부재로 false가 되어 discovery writer 모집단에 들어오지 않는다.

## 결함 5 — Batch 변수 목적지 writer가 위반 판정에서 빠진다

Batch 판정은 redirection/copy가 있는 **같은 줄 뒤쪽**에 `docs\qa` 또는 `docs\manual`이 있어야 한다. 목적지를 변수로 선언하는 일반 형태는 실제 증거를 쓰지만 G3a가 exit 0이었다.

```bat
@set OUT=docs\qa\.s19-variable-target.txt
@echo probe>%OUT%
```

```text
S19_BAT_VARIABLE_TARGET_EXIT=0
Tests 1 passed | 55 skipped
```

`isEvidenceWriter`는 `OUT=` 신호로 파일을 모집단에 넣지만 `hasBatchEvidenceWrite`가 변수 전이를 하지 않아 G3a 위반 목록에는 넣지 않는다.

## 확장자 census 전수 대조와 신규 확장자 probe

가드와 동일하게 `git ls-files -z`를 NUL로 분리해 독립 집계했다.

```text
tracked files: 16,613
actual extensions: 48
관할·명시 제외 어디에도 없는 확장자: 0
.md: 3,231
.png: 6,503
```

따라서 현재 저장소의 `.md`·`.png` 등 제외 확장자는 기준 실행을 오차단하지 않는다. `.java` 등 제외된 실행 가능 언어에서 `docs/qa|docs/manual` 리터럴도 전수 검색했다. 발견된 Java/YAML 항목은 Javadoc·주석의 매뉴얼/QA 출처 언급이었고 현 tracked 표본에서 제외 확장자의 증거 writer는 발견하지 못했다.

census가 새 확장자를 실제로 막는지는 다음 순서로 확인했다.

1. `tools/s19-census-probe.s19probe`를 생성했다.
2. `git add -N`으로 intent-to-add하여 `git ls-files` 모집단에 넣었다.
3. census 테스트만 실행했다.
4. 인덱스와 파일을 원상복구했다.

결과는 의도한 RED였다.

```text
S19_CENSUS_PROBE_LISTED=tools/s19-census-probe.s19probe
expected [ '.s19probe' ] to deeply equal []
S19_CENSUS_NEW_EXTENSION_EXIT=1
S19_CENSUS_INDEX_RESTORED=True
```

## ignored output·generator 경계와 유지 항목

S17과 같은 경계를 다시 두었다.

```text
tools/.s19-probes/build/deep/generated.cjs
  .gitignore:3:build/ 로 ignored

tools/.s19-probes/source/generator.mjs
  같은 docs/qa 산출물을 writeFileSync
```

G3a 실패 목록에는 non-ignored `generator.mjs`만 나타났고 exit 1이었다. ignored generated output은 나타나지 않았다.

무프로브 기준 전체 56건에서 다음 도달성 계약도 계속 green이었다.

- 내용 SHA-256 기반 cache invalidation 테스트
- `.ts` 및 중첩 `.ps1` discovery
- 저장소 내부 link canonical target 추적과 저장소 밖 target 제외
- 문서·기존 marker 보유 파일의 비위반 경로

## 지정 전체 명령과 시간

무프로브 기준을 `clients/desktop`에서 파이프 없이 실행했다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts

Test Files 1 passed (1)
Tests 56 passed (56)
Vitest Duration 20.42s
S19_BASELINE_EXIT=0
S19_BASELINE_WALL_SECONDS=21.98
```

결함 3·4·5의 실제 writer, ignored generated output, 문서 언급을 동시에 둔 채 같은 전체 명령을 다시 실행했다.

```text
Test Files 1 passed (1)
Tests 56 passed (56)
Vitest Duration 21.87s
S19_COMBINED_FALSE_GREEN_EXIT=0
S19_COMBINED_FALSE_GREEN_WALL_SECONDS=23.64
```

이 두 번째 green은 기준 통과가 아니라 실제 writer 3건의 미탐 재현이다.

모든 probe와 index entry를 정리하고 보고서만 남긴 최종 재실행도 파이프 없이 확인했다.

```text
Test Files 1 passed (1)
Tests 56 passed (56)
Vitest Duration 20.32s
S19_FINAL_EXIT=0
S19_FINAL_WALL_SECONDS=21.89
```

## probe 정리와 파일 상태

검증 중 생성한 다음 probe 계열은 모두 제거했다.

- `tools/.s19-probes/**`
- `tools/s19-census-probe.s19probe` 및 해당 intent-to-add index entry

`.gitguardian.yaml`은 수정하지 않았고 allowlist `match:` 줄도 건드리지 않았다. 가드 소스의 diff는 0이며, 최종 신규 파일은 이 보고서 1건이다.

## 이 라운드가 보지 않은 것

- SHA-256 충돌 자체는 시도하지 않았다.
- Linux/macOS의 잠금·권한 오류는 실행하지 않았다. 실제 잠금 probe는 Windows `FileShare.None`이었다.
- 생성→삭제 경합을 확률적으로 반복 실행하지 않았다. 정상 실패 오차단은 결정적인 배타 잠금 non-writer로 재현했고, 삭제 경합은 동일 catch 경로의 코드 추적까지만 확인했다.
- Python AST 전체, Batch 전체 문법, subprocess가 실행하는 간접 writer의 모든 변형을 열거하지 않았다.
- GitHub CI와 제품 UI/API 도달성은 보지 않았다.
- 공유 Docker 스택은 조회·재기동하지 않았다.
