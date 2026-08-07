# #1116 S13 SOL 재수렴 — 하네스 거짓 green 가드 도달성

## 판정

**BLOCK — 이 가드는 잡아야 할 것을 일부 놓치고, 저장소 밖의 것은 잡는다. 결함 4건이다.**

- 정상 동작: 무마커 `.mjs` writer 3형(`'docs/qa/...'`, `path.join('docs', 'qa', ...)`, 템플릿 리터럴)과 루트 `scripts/*.ps1` writer는 실제로 RED가 됐다.
- 거짓 green: 무마커 `.ts`, 중첩 `scripts/**/*.ps1`, skip basename 아래의 `.mjs`, 동일 `mtimeMs + size`로 치환된 writer를 놓쳤다.
- 오차단: 워크트리 밖을 가리키는 directory junction을 따라가 외부 파일을 저장소 모집단으로 판정해 RED가 됐다.
- 정상 대조군: 주석만 `docs/qa`를 언급한 파일, 문자열 예시만 가진 파일, 문서 파일, `resolveQaShotsDir` 마커가 있는 writer는 RED를 유발하지 않았다.

대상 HEAD는 `0c36d1028`이다. 커밋·push·제품 코드 수정·Docker 조작은 하지 않았다.

## 결함 1 — 동일 mtime·크기 치환은 같은 프로세스에서 거짓 green

`discoveredEvidenceWriters()`는 파일별 캐시 키로 `mtimeMs`와 `size`만 사용한다. 두 값이 같으면 내용을 다시 읽지 않고 이전 `isEvidenceWriter`를 재사용한다.

실제 probe는 같은 프로세스에서 다음 순서로 실행했다.

1. writer 문자열과 정확히 같은 byte 길이의 non-writer를 기록했다.
2. mtime을 고정하고 discovery에서 제외됨을 확인했다.
3. 같은 길이의 `const OUT = 'docs/qa/x.png'`로 치환했다.
4. mtime을 같은 값으로 복원했다.
5. 치환 전후 `size`와 `mtimeMs`가 각각 완전히 같다는 단언은 통과했다.
6. 두 번째 discovery가 writer를 포함해야 한다는 단언만 실패했다.

격리 실행 원문:

```text
npx vitest run src/renderer/test-utils/.s13-sol-cache-probe.test.ts -t "S13 probe"
Test Files  1 failed (1)
Tests       1 failed | 53 skipped (54)
expected [...] to include 'clients/desktop/scripts/.s13-sol-same-stat-probe.mjs'
VITEST_EXIT_CODE=1
```

이는 기존 S10의 일반 내용 변경 테스트가 잡는 경우와 다르다. 일반 저장은 mtime 또는 size가 달라져 재판정되지만, 파일시스템 timestamp 해상도·보존 복사·의도적 timestamp 복원처럼 두 fingerprint가 같으면 실제 위반 내용이 들어와도 이전 non-writer 판정이 남는다.

## 결함 2 — 발견 모집단과 실제 격리 판정의 확장자·위치 도달성이 끊겨 있다

다음 두 파일을 동시에 둔 상태에서 지정 전건이 **53/53 green, exit 0**이었다.

```text
tools/.s13-sol-probes/deep/ts-writer/probe.ts
  const OUT = 'docs/qa/.s13-sol/ts-false-green.png'
  fs.writeFileSync(OUT, 'probe')

scripts/.s13-sol-probes/deep/nested-writer.ps1
  $OutputDir = "docs/qa/.s13-sol/ps1-false-green"
```

실행 원문:

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
Test Files  1 passed (1)
Tests       53 passed (53)
VITEST_EXIT_CODE=0
```

도달이 끊기는 지점은 명확하다.

- discovery walk 자체는 모든 파일을 읽지만 `walkG3Sources()`가 결과를 `\.(cjs|mjs|js)$`로 다시 좁힌다. 따라서 저장소 임의 위치의 `.ts` writer는 G3a에 도달하지 않는다.
- PowerShell 위반 검사는 `scripts` 바로 아래의 `readdirSync()` 결과 중 `.ps1`만 본다. 하위 디렉터리의 `.ps1`은 도달하지 않는다.
- G8c는 `const discovered = derivedEvidenceWriters()` 후 `guardRootFor(f, discovered)`로 같은 배열의 `includes(f)`를 검사한다. 발견된 writer가 실제 격리 판정에 연결됐는지는 확인하지 않으므로 위 두 누락을 RED로 바꾸지 못한다.

대조로 같은 무마커 writer를 다음 형태로 만들었을 때는 모두 정확히 RED였다.

```text
clients/desktop/scripts/.s13-sol-probes/direct-literal.mjs
qa/.s13-sol-probes/a/b/c/template-literal.mjs
tools/.s13-sol-probes/deep/join/split-literal.mjs
scripts/.s13-sol-root-probe.ps1
```

G3a 실패 목록에 `.mjs` 3개가 모두 개별 표시됐고, G3c 실패 목록에 루트 `.ps1`이 표시됐다. 해당 실행은 `51 passed / 2 failed`, `VITEST_EXIT_CODE=1`이었다.

## 결함 3 — `DISCOVERY_SKIP_DIRS`는 실제 source writer도 basename만으로 제외한다

다음 실행 가능한 source probe를 두었다.

```text
tools/.s13-sol-probes/build/deep/writer.mjs
  const OUT = 'docs/qa/.s13-sol/skipped-build-dir.png'
  fs.writeFileSync(OUT, 'probe')
```

파일이 generated output인지 확인하지 않고 중간 디렉터리 이름이 `build`라는 이유만으로 재귀가 중단됐다. 지정 전건 결과는 **53/53 green, exit 0**이었다.

```text
Test Files  1 passed (1)
Tests       53 passed (53)
VITEST_EXIT_CODE=0
```

따라서 `build`, `out`, `target`, `bin` 등 흔한 basename 아래에 실제 저장소 source/script가 있으면 모집단에서 조용히 빠진다. 이번 probe는 그중 `build`를 실측했다.

## 결함 4 — 외부 directory link를 따라가 저장소 밖 파일을 오차단

워크트리 내부 `tools/.s13-sol-external-link`를 워크트리 밖의 다음 디렉터리로 연결했다.

```text
C:/dev/Samhan-Public/.claude/s13-sol-external-target/writer.mjs
```

외부 파일에는 무마커 `docs/qa` writer를 넣었다. 지정 전건은 G3a에서 다음 경로를 위반으로 보고 RED가 됐다.

```text
../../s13-sol-external-target/writer.mjs → const OUT
Test Files  1 failed (1)
Tests       1 failed | 52 passed (53)
VITEST_EXIT_CODE=1
```

즉 symlink/junction 디렉터리를 따라가는 보완은 순환만 막고 canonical directory가 `REPO_ROOT` 안인지 확인하지 않는다. 저장소 밖 vendor checkout, 공용 작업 디렉터리, 개인 임시 디렉터리가 연결돼 있으면 그 파일이 이 저장소의 가드 모집단을 오염시킨다. Windows directory junction으로 실측했으며, 현재 코드가 `Dirent.isSymbolicLink()` 후 `statSync()`로 재귀하는 바로 그 경로다.

## 오차단 대조군

다음 4개를 동시에 둔 지정 전건은 **53/53 green, exit 0**이었다.

- `.mjs` 주석에서만 `docs/qa` 언급
- `.mjs` 일반 문자열 값으로만 `docs/qa` 언급
- `docs/qa` 아래 `.md` 문서
- `resolveQaShotsDir('docs/qa/...')`를 거친 마커 보유 `.mjs` writer

따라서 이 네 정상 형태에서는 오차단을 재현하지 못했다. 확인된 오차단은 저장소 밖 directory link 모집단 오염이다.

## 기준 실행

probe가 없는 HEAD 기준 지정 명령은 파이프 없이 실행했고 종료코드 0이었다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
Test Files  1 passed (1)
Tests       53 passed (53)
Duration    61.12s
VITEST_EXIT_CODE=0
```

## 생성·정리한 probe 파일

아래 probe는 모두 정리했으며 저장소와 외부 경로에 남아 있지 않다.

- `clients/desktop/scripts/.s13-sol-probes/direct-literal.mjs`
- `tools/.s13-sol-probes/deep/join/split-literal.mjs`
- `qa/.s13-sol-probes/a/b/c/template-literal.mjs`
- `scripts/.s13-sol-root-probe.ps1`
- `tools/.s13-sol-probes/deep/ts-writer/probe.ts`
- `scripts/.s13-sol-probes/deep/nested-writer.ps1`
- `tools/.s13-sol-probes/build/deep/writer.mjs`
- `tools/.s13-sol-probes/normal/comment-only.mjs`
- `tools/.s13-sol-probes/normal/string-only.mjs`
- `docs/qa/.s13-sol-probes/readme.md`
- `tools/.s13-sol-probes/normal/isolated-writer.mjs`
- `clients/desktop/src/renderer/test-utils/.s13-sol-cache-probe.test.ts`
- `clients/desktop/scripts/.s13-sol-same-stat-probe.mjs`
- 외부 `C:/dev/Samhan-Public/.claude/s13-sol-external-target/writer.mjs`
- junction `tools/.s13-sol-external-link`

이 라운드의 유일한 잔여 신규 파일은 본 보고서다.

## 이 라운드가 보지 않은 것

- Linux 실제 심볼릭 링크에서의 동일 외부 오염 재실행은 하지 않았다. Windows directory junction으로 `isSymbolicLink() → statSync() → 재귀` 경로와 외부 canonical 파일 유입을 실측했다.
- `DISCOVERY_SKIP_DIRS`의 모든 이름을 하나씩 probe하지 않았다. `build` 한 이름으로 basename 기반 전역 제외가 실제 source writer를 누락시키는 것을 확인했다.
- `.py`, `.sh`, `.cjs`, `.js`, `docs/manual` 변형은 새 probe로 재실행하지 않았다.
- 증거 파일을 실제로 쓰는 스크립트를 실행해 tracked 파일이 덮이는지는 보지 않았다. 이번 라운드는 정적 가드가 해당 writer 파일을 RED/GREEN으로 판정하는 도달성만 봤다.
- CI 43/43은 사용자 제공 사실로만 두었고 GitHub check를 재조회하지 않았다.
