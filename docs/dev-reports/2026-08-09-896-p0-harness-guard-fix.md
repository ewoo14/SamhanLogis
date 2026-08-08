# #896 P0 하네스 가드 정밀화 — 2026-08-09

## 결론

`copyFileSync`의 첫 번째 인자는 읽기 원본이므로 쓰기 목적지 추적에서 제외하고, 두 번째 인자만 추적하도록 G3a machinery를 정밀화했다. `scripts/generate-896-p0-golden-manifest.mjs`의 `baselineDir`는 문자열 분할 없이 평범한 리터럴을 유지한다.

## PM이 red를 만든 경위와 CI 원문

직전 라운드에서 `const baselineDir = 'docs' + '/qa/896-parity-run2/sheet/run2';`를 스캐너 회피로 오판해 평범한 리터럴로 되돌렸다. 로컬 위반 목록 124건이 vitest 출력에서 잘렸는데도 목록에 없다고 판단한 것이 잘못이었다.

main `bcf9023d3`의 CI 원문:

```text
× G3a: clients/**/scripts·루트 scripts/ 의 JS/CJS/MJS 캡처 목적지도 _local 격리를 거친다
  → 커밋 QA 증거로 직접 쓰는 경로 상수 발견(clients/**/scripts, 루트 scripts/) — _local 격리 필수:
scripts/generate-896-p0-golden-manifest.mjs → const baselineDir
```

## 확정된 원인

기존 `collectWriteTargetIdentifiers`는 모든 쓰기 호출의 괄호 안 식별자를 전부 수집했다.

```js
fs.copyFileSync(path.join(root, baselineDir, file), path.join(goldenDir, file));
```

따라서 정의상 읽기 원본인 첫 번째 인자의 `baselineDir`도 쓰기 대상으로 수집됐다. 이후 전이 폐포가 선언 본문을 따라가므로 중간 변수를 추가해도 오탐이 멈추지 않는다. 읽기 원본을 `resolveQaShotsDir`로 감싸면 실제 입력 경로가 바뀌어 불변식 ③·④를 깨뜨린다.

## 고친 내용과 근거

- `splitTopLevelCallArguments`를 추가해 중첩된 `path.join(...)`, 배열, 객체 및 문자열 내부 쉼표를 보존하면서 최상위 호출 인자를 분리했다.
- `collectWriteTargetIdentifiers`에서 `copyFileSync`일 때만 두 번째 인자 이후를 식별자 추적 대상으로 사용했다.
- 나머지 `WRITE_CALL` 종류의 추적 방식은 변경하지 않았다.
- RED-A/RED-B 회귀 픽스처를 가드 테스트에 추가했다.
- 생성 스크립트는 수정하지 않았고, `baselineDir`는 다음 평범한 리터럴이다.

```js
const baselineDir = 'docs/qa/896-parity-run2/sheet/run2';
```

## RED-A / RED-B 동시 GREEN 실행 원문

TDD RED에서 기존 구현은 다음으로 실패했다.

```text
× MH3 RED-A/RED-B — fs.copyFileSync는 두 번째 인자만 쓰기 대상으로 수집한다
  → expected [ 'SOURCE', 'path', 'join', …(2) ] to not include 'SOURCE'
```

수정 후 실행:

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts -t "MH3 RED-A/RED-B"

✓ src/renderer/test-utils/harness-false-green-guard.test.ts (62 tests | 61 skipped) 2ms
Test Files  1 passed (1)
Tests       1 passed | 61 skipped (62)
```

픽스처의 의미:

- RED-A: `fs.copyFileSync(input, DEST)`에서 `DEST = 'docs/qa/committed-probe/output.json'`을 `true`로 잡는다.
- RED-B: `SOURCE = path.join('docs', 'qa', ...)`, `DEST = path.join('_local', ...)`인 복사에서 원본 `SOURCE`를 쓰기 대상으로 잡지 않아 `false`다.

## G3a 전체 실행 및 추적 파일 판정

요청한 명령의 로그를 파일로 받았다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts -t "G3a"
Test Files  1 failed (1)
Tests       1 failed | 61 skipped (62)
```

실패는 로컬 untracked 잔재가 포함된 결과다. 전체 위반 목록 파일:

```text
C:\Users\user\AppData\Local\Temp\samhan-g3a-violations-20260809.txt
```

그 파일의 각 경로를 저장소 루트에서 `git ls-files -- <path>`로 대조했다.

```text
violation_count=80
tracked_count=0
```

목록에는 `.claude/tmp/**`, 로컬 Playwright 잔재 및 테스트가 생성한 `tools/s14-probes/**`가 포함됐다. `scripts/generate-896-p0-golden-manifest.mjs` 또는 `baselineDir` 위반은 목록에 없었다. 다른 라운드 산출물은 삭제하지 않았다.

## P0 재현성 4항목

① 생성기 실행 성공:

```text
node scripts/generate-896-p0-golden-manifest.mjs
generate_exit=0
sourceRecords=4186
groupStatusCounts=DATA_OK 524 / DATA_PARTIAL 551 / CODE_ONLY 1560 / UNKNOWN 14
```

② 커밋 산출물 변경 없음:

```text
git status --porcelain -- docs/qa/896-p0-golden-manifest/
(빈 출력)
```

③ `_local/manifest.json`과 커밋 manifest 바이트 동일:

```text
committed_length=4703 local_length=4703 byte_equal=True
```

④ `_local/golden/` 재생성:

```text
01-catalog-and-categories.json
02-set-expansion.json
03-options-features-defaults.json
04-quantity-derived.json
05-price-scenarios.json
06-toggle-off-on.json
SHA256SUMS.txt
```

## 변경 파일

- `clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts`
- `docs/dev-reports/2026-08-09-896-p0-harness-guard-fix.md`

신규 파일은 없다. 커밋·push는 수행하지 않았다.
