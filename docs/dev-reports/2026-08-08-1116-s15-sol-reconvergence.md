# #1116 S15 SOL 재수렴 — S14 적대적 검증

## 판정

**BLOCK — 도달성 결함 3건이다.**

S13의 네 결함 중 `.ts`·중첩 `.ps1`, tracked source가 있는 skip basename, 저장소 밖 junction은 의도한 방향으로 도달했다. 그러나 `ctimeMs` 캐시는 Windows에서 우회할 수 있고, git 기반 skip 보강은 ignored generated output을 오차단한다. 별도 조합의 `.py` writer는 실제 위반인데도 53/53 green이었다.

기준 HEAD는 `cbd85cb778dedfd7fddb3054ff712888851aefef`이다. 코드·커밋·push·Docker 조작은 하지 않았다.

## S13 결함 4건 재실행

| # | 재실행 결과 | 판정 |
|---|---|---|
| 1. 동일 `mtimeMs`+`size` 치환 | 같은 byte 길이 non-writer를 writer로 치환하고 `mtimeMs`를 복원했다. 보통의 `writeFileSync`에서는 `ctimeMs`가 달라져 writer로 재판정됐다. 그러나 아래 Windows `ChangeTime` 복원 probe에서는 다시 거짓 green이었다. | **미종결** |
| 2. `.ts`·중첩 `scripts/**/*.ps1` | S13 원형 `tools/.s13-sol-probes/deep/ts-writer/probe.ts`, `scripts/.s13-sol-probes/deep/nested-writer.ps1`을 동시에 두자 G3a/G3c가 두 경로를 각각 명시하고 exit 1이었다. | 종결 |
| 3. `build` basename 아래 source | S13 원형 `tools/.s13-sol-probes/build/deep/writer.mjs`가 G3a 위반 목록에 들어가 exit 1이었다. 다만 이 파일은 `.gitignore:3:build/`에 의해 ignored였고 `git ls-files -co --exclude-standard`에는 없었다. 즉 원 결함의 도달은 생겼지만 새 오차단도 생겼다. | 원 결함 종결, **회귀 발생** |
| 4. 저장소 밖 link | 저장소 밖 target을 가리키는 `tools/.s13-sol-external-link`가 있는 실행에서 외부 writer는 위반 목록에 없었다. 같은 실행의 내부 위반만 RED였다. | 종결 |

S13 원형 2·3·4 동시 실행은 `51 passed / 2 failed`, `S15_S13_CLEAN_PROBES_EXIT=1`, duration `65.56s`였다. 실패는 내부 `.ts`/`build .mjs`를 묶은 G3a와 중첩 `.ps1`의 G3c뿐이었다.

## 결함 1 — Windows에서 `ctimeMs`까지 복원하면 stale non-writer cache가 유지된다

S13과 같은 조건으로 같은 프로세스 안에서 실행했다.

1. writer와 정확히 같은 byte 길이의 공백 non-writer를 썼다.
2. 고정 `mtimeMs`를 설정한 뒤 discovery가 non-writer로 캐시하게 했다.
3. 같은 길이 writer `const OUT = 'docs/qa/.s15-cache-target.png'`로 치환했다.
4. `mtimeMs`를 같은 값으로 복원했다.
5. Windows `SetFileInformationByHandle(FileBasicInfo)`에 일반 `FILE_WRITE_ATTRIBUTES` 권한으로 원래 `ChangeTime`을 복원했다.
6. `size`, `mtimeMs`, `ctimeMs` 세 값이 모두 이전 값과 같음을 단언한 뒤 discovery를 다시 호출했다.

결과는 writer가 발견 목록에 **없었다**. 의도적으로 stale 결과를 단언한 probe는 통과했다.

```text
S15 exact same-size replacement plus mtime restoration ... PASS
S15 Windows FILE_BASIC_INFO can restore ctime and preserve the stale non-writer cache ... PASS
Tests 2 passed | 53 skipped
S15_CACHE_PROBE_EXIT=0
Duration 33.09s
```

독립 stat probe에서도 `AFTER_WRITE`의 `ctimeMs`가 달라진 뒤 `AFTER_RESTORE`가 최초 값과 정확히 같아졌고 PowerShell exit는 0이었다. Windows/NTFS에서는 `ctimeMs`가 내용 fingerprint가 아니다. POSIX의 일반 `utimensat`/`utimes`는 inode ctime을 직접 과거로 설정하지 못하므로 같은 일반 사용자 경로를 Linux/macOS에서 재현했다고 말할 수는 없다.

## 결함 2 — ignored generated output이 `git ls-files` 결과와 무관하게 오차단된다

다음 generated probe 하나만 만들었다.

```text
tools/.s15-ignored/build/deep/generated.cjs
  const OUT = 'docs/qa/.s15-sol/ignored-generated.png'
  fs.writeFileSync(OUT, 'generated')
```

VCS 판정과 가드 결과는 서로 모순됐다.

```text
git check-ignore -v → .gitignore:3:build/
git ls-files -co --exclude-standard -- <probe> → 빈 출력
G3a → tools/.s15-ignored/build/deep/generated.cjs → const OUT
S15_IGNORED_GENERATED_EXIT=1
```

원인은 `directoryContainsTrackedFile()`이 git 집합에서 근거를 찾지 못해도 마지막에 `directoryContainsSourceWriter()`를 호출하는 데 있다. `build/out/bin/target`은 영구 제외 집합에서도 빠졌으므로 ignored generated writer가 있으면 디렉터리를 열고 G3a가 차단한다. “tracked/non-ignored source가 있을 때만 skip basename을 연다”는 S14 보고와 실제 동작이 다르다.

## 결함 3 — 새 조합의 `.py` writer가 53/53 green이다

S13에서 쓰지 않은 조합으로 `qa/.s15-sol-probes/deep/python-writer.py`를 만들었다.

```python
OUT = 'docs/qa/.s15-sol/python-false-green.png'
with open(OUT, 'wb') as handle:
    handle.write(b'probe')
```

이 파일이 존재한 채 지정 전체 명령은 `53 passed`, `S15_NEW_WRITER_AND_CONTROLS_EXIT=0`, duration `66.44s`였다. discovery는 `.py`를 후보 확장자로 읽고 `OUT =`을 writer 신호로 취급하지만, G3a는 `JS_CAPTURE_EXT`의 `.cjs|.mjs|.js|.ts`만 검사한다. G8c는 `discovered.filter(f => !guardRootFor(f, discovered))`이고 `guardRootFor`가 같은 배열의 `includes(f)`를 반환하므로 이 언어별 검사 공백을 차단하지 않는다.

## git 상태 의존 표면

- non-ignored untracked: S13 `.ts`와 중첩 `.ps1`은 `git ls-files -co --exclude-standard` 출력에 실제 포함됐고 둘 다 RED였다.
- ignored untracked: `build/deep/generated.cjs`는 출력에 없었지만 fallback content walk가 스캔해 오차단했다.
- git 실행 불가: `PATH`에서 git을 제거하고 절대경로 Node로 G3a만 실행했다. catch 이후 빈 집합+content fallback으로 S14 자체 probe가 도달해 `1 passed / 52 skipped`, `S15_GIT_UNAVAILABLE_EXIT=0`이었다. 즉 git 부재는 hard-fail이 아니라 VCS 구분을 버리고 content walk로 바뀐다. 저장소가 아닌 복사본도 `git -C REPO_ROOT ls-files` 실패 후 같은 catch 경로를 탄다.
- 호출 횟수: `trackedRepoFiles`는 모듈 전역에서 한 번 채워지므로 정상 프로세스에서 `git ls-files`를 디렉터리마다 반복 호출하는 구조는 아니다.

## link와 canonical 경계

- 저장소 밖 junction writer는 제외됐다.
- 저장소 안 target을 `..`가 포함된 target 문자열로 연결한 junction probe는 canonical `tools/.s15-link-target/writer.cjs`를 G3a가 명시하고 exit 1이었다. 내부 정상 경로가 repo 밖 판정으로 빠지지 않았다.
- 기준 전체 실행에 포함된 S14 내부 junction 추가·삭제 cache 검사도 통과했다.

## 정상 대조군

`.py` 거짓 green과 같은 전체 실행에 다음 네 대조군을 함께 두었고 별도 오차단 없이 53/53 green이었다.

- `.cjs` 주석에서만 `docs/qa` 언급
- `.ts` 일반 문자열에서만 `docs/qa` 언급
- `docs/qa/**/readme.md` 문서
- `resolveQaShotsDir('docs/qa/...')` 마커를 거친 `.js` writer

따라서 지난 라운드의 주석·문자열·문서·마커 정상 대조군은 이번 변경으로 깨지지 않았다.

## 성능과 기준 실행

probe 없는 지정 전체 명령을 파이프 없이 실행했다.

```text
Test Files 1 passed (1)
Tests 53 passed (53)
Duration 65.33s
S15_BASELINE_EXIT=0
S15_BASELINE_WALL_SECONDS=66.90
```

226초 제한 안이다. S14 보고 `65.51s`와 같은 구간이다.

보고서 작성과 probe 정리 후 동일 명령을 다시 실행한 최종 기준도 `53/53`, `S15_FINAL_BASELINE_EXIT=0`, duration `65.61s`, wall `67.16s`였다.

## 생성·정리한 파일과 link

검증용 `.s13-*`, `.s15-*` 파일, 내부/외부 junction, 외부 target, ctime P/Invoke helper는 모두 제거했다. 최종 신규 파일은 이 보고서 `docs/dev-reports/2026-08-08-1116-s15-sol-reconvergence.md` 한 건이다. 기존 미추적 S13 보고서는 건드리지 않았다. `.gitguardian.yaml`은 수정하지 않았다.

## 이 라운드가 보지 않은 것

- Linux/macOS 파일시스템에서 ctime 우회가 실제 가능한지는 실행하지 않았다. Windows 11/NTFS의 `SetFileInformationByHandle` 경로만 실측했다.
- 저장소 메타데이터 자체가 없는 별도 복사본에서 전체 53개를 실행하지 않았다. git 실행 불가 시 동일 catch/fallback 경로가 동작하는 것은 G3a로 실측했다.
- 새 위반 조합은 `.py`를 사용했다. `.sh` writer의 별도 도달성은 다시 probe하지 않았다.
- GitHub CI, 전체 43 checks, 제품 UI/API 도달성은 보지 않았다.
- Docker 스택은 조회·재기동하지 않았다.
