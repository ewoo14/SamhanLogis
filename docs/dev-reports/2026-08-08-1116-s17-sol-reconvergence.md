# #1116 S17 SOL 재수렴 — S16 내용 해시 적대적 검증

## 판정

**BLOCK — 도달성 결함 3건이다.**

S15의 stat 위조는 종결됐다. Windows에서 같은 byte 길이 치환 후 `mtime`과 Win32 `ChangeTime`까지 원값으로 복원해 `size/mtime/ctime`이 모두 같음을 단언했지만, 내용 SHA-256이 바뀌어 writer를 다시 발견했다. ignored generated output 제외도 의도대로 동작했고, 그 산출물을 만드는 non-ignored `.mjs` generator는 G3a가 차단했다.

그러나 `.py`의 `open/write` 형태, 저장소에 실제 존재하는 `.cts`·`.bat` 확장자, 읽기 실패 파일이 모집단에서 빠진다. 세 위반 probe와 ignored generated output을 함께 둔 지정 전체 명령은 **53/53 green**이었다.

기준 HEAD는 `6315fcd7f3178949390e5d8115b9b045eae4186c`다. 코드·커밋·push·Docker 조작은 하지 않았다.

## S15 결함 3건 재판정

| S15 결함 | S17 결과 | 판정 |
|---|---|---|
| stat fingerprint 위조 | 같은 길이 non-writer를 writer로 치환하고 고정 `mtime`과 최초 `ChangeTime`을 복원했다. `size`, `mtimeNs`, `ctimeNs`가 모두 최초 값과 같아진 뒤 같은 프로세스의 discovery가 writer를 발견했다. | **종결** |
| ignored generated output 오차단 | `.gitignore:3:build/`인 `tools/.s17-probes/build/deep/generated.cjs`는 discovery/G3a에서 제외됐다. | **종결** |
| `.py` 관할 부재 | `.py` 확장자는 들어왔지만 `open(..., 'wb')` + `handle.write(...)` writer는 53/53 green이었다. | **부분 fix, 미종결** |

## 내용 해시 — S15 Windows 조건 그대로 재실행

임시 Vitest probe는 다음 순서로 같은 프로세스에서 실행했다.

1. writer와 정확히 같은 byte 길이의 공백 non-writer를 썼다.
2. 고정 `mtime`을 설정하고 discovery가 non-writer로 판정하게 했다.
3. `const OUT = 'docs/qa/.s17-content-cache-probe.png'` writer로 같은 길이 치환했다.
4. 같은 `mtime`을 다시 설정했다.
5. Windows `SetFileInformationByHandle(FileBasicInfo)`에 `FILE_WRITE_ATTRIBUTES` 권한으로 최초 `ChangeTime`을 복원했다.
6. bigint stat의 `size`, `mtimeNs`, `ctimeNs`가 최초 값과 모두 같음을 단언했다.
7. discovery가 writer를 포함하는지 단언했다.

결과는 PASS였다.

```text
Tests 1 passed | 53 skipped
S17_WINDOWS_HASH_EXIT=0
Vitest Duration 5.02s
S17_WINDOWS_HASH_WALL_SECONDS=6.66
```

구현도 후보마다 `readFileSync(canonical, 'utf-8')` 후 SHA-256을 계산하고, 이전 해시와 같을 때만 기존 `isEvidenceWriter` 결과를 재사용한다. timestamp/stat을 보고 읽기를 건너뛰는 경로는 남아 있지 않다. 해시 충돌은 시도하지 않았다.

## ignored output과 generator 경계

ignored 파일에 진짜 위반이 있어도 이 가드는 영구적으로 보지 않는다. 다음 파일은 `git check-ignore -v`에서 `.gitignore:3:build/`에 걸렸고 G3a는 green이었다.

```text
tools/.s17-probes/build/deep/generated.cjs
  const OUT = 'docs/qa/.s17-ignored-generated.png'
  fs.writeFileSync(OUT, 'generated')
```

이 경계 자체는 **수용 가능한 설계**로 판정한다. generated output은 직접 고칠 원본이 아니며, ignored 산출물 내용을 스캔하면 S15 오차단이 재발한다. 대신 generator가 관할되는지가 필수다. 동일 산출물을 쓰는 non-ignored `tools/.s17-probes/source/generator.mjs`를 두자 G3a는 정확한 경로를 명시하고 RED였다.

```text
tools/.s17-probes/source/generator.mjs → const OUT
S17_GENERATOR_EXIT=1
```

단, generator가 아래 결함의 `.cts`, `.bat`, `.py open/write` 형태이면 generator 자체도 빠진다. 따라서 ignored 경계는 맞지만 generator 관할은 아직 완전하지 않다.

## 결함 1 — `.py`의 일반 파일 쓰기가 53/53 green이다

S15에서 썼던 실제 형태를 다시 두었다.

```python
OUT = 'docs/qa/.s17-python-open-false-green.png'
with open(OUT, 'wb') as handle:
    handle.write(b'probe')
```

`DISCOVERY_SOURCE_EXT`에는 `.py`가 있지만 `isEvidenceWriter`와 G3 텍스트 판정의 Python 쓰기 신호는 `\.save\(`/`savefig\(`뿐이다. 공용 `WRITE_CALL`에도 Python `open`, file handle `.write`, `Path.write_bytes/write_text`, `cv2.imwrite` 등이 없다. 따라서 파일은 discovery writer 모집단에 들어오지 않았고 지정 전체 명령이 green이었다.

현재 tracked `.py` 6건 중 실제 이미지 writer 2건은 Pillow `.save()` 형태라 잡힌다. 이는 현재 표본을 덮을 뿐 Python의 증거 쓰기 형태를 덮지 않는다.

## 결함 2 — 실제 저장소 확장자 `.cts`·`.bat`가 관할 밖이다

`git ls-files -z` 기준 tracked 파일 16,610건을 확장자별로 다시 셌다. S16 registry 관련 수치는 다음과 같다.

| 확장자 | tracked 수 | S16 registry |
|---|---:|---|
| `.ts` | 976 | 포함 |
| `.tsx` | 540 | 포함 |
| `.js` | 87 | 포함 |
| `.mjs` | 63 | 포함 |
| `.ps1` | 61 | 포함 |
| `.cjs` | 58 | 포함 |
| `.sh` | 9 | 포함 |
| `.py` | 6 | 포함 |
| `.ejs` | 1 | 포함 |
| `.cts` | 1 | **누락** |
| `.bat` | 2 | **누락** |

S16 보고서의 `.js` 60건과 달리 현 HEAD의 실제 `git ls-files -z` 집계는 87건이다. `.cts` 실 파일은 `scripts/lib/qa-credentials.d.cts`, `.bat`는 루트와 Android의 `gradlew.bat`다. 현재 세 파일 자체는 QA evidence writer가 아니지만, 둘 다 저장소에서 이미 사용하는 실행 가능 언어 계열이다.

다음 실제 위반 probe를 두었다.

```text
tools/.s17-probes/source/missing-writer.cts
  const OUT = 'docs/qa/.s17-cts-false-green.png'
  require('node:fs').writeFileSync(OUT, 'probe')

tools/.s17-probes/source/missing-writer.bat
  @echo probe>docs\qa\.s17-bat-false-green.txt
```

둘 다 `DISCOVERY_SOURCE_EXT`, `JS_CAPTURE_EXT`, `TEXT_CAPTURE_EXT` 밖이어서 G8 모집단에도 나타나지 않았고 전체 53/53 green이었다. `.java` 3,464, `.html` 158, workflow `.yml/.yaml` 44 등도 registry 밖이지만, 현재 저장소에서 이 가드가 대상으로 삼는 로컬 QA 증거 직접 writer 언어라는 실증은 없어서 결함 수에 넣지 않았다.

## 결함 3 — 읽기 실패가 writer 누락으로 조용히 바뀐다

`discoveredEvidenceWriters()`는 후보의 `realpathSync` 또는 `readFileSync`가 실패하면 `catch { continue }`로 파일을 다음 `Map`에서 제거한다. 오류도 기록하지 않고 테스트도 실패시키지 않는다.

실제 `.mjs` 위반 파일을 Windows `FileShare.None` 핸들로 잠근 채 G3a를 실행했다. 잠금이 없으면 위 generator와 같은 형태로 RED가 되는 파일이다. 잠금 중에는 1/1 green이었다.

```text
tools/.s17-probes/source/locked-writer.mjs
  const OUT = 'docs/qa/.s17-locked-false-green.png'
  fs.writeFileSync(OUT, 'probe')

Tests 1 passed | 52 skipped
S17_LOCKED_WRITER_EXIT=0
Vitest Duration 2.93s
S17_LOCKED_WRITER_WALL_SECONDS=4.43
```

이는 evidence integrity의 거짓 green이다. 일시 잠금, ACL, 동시 삭제, `ERR_STRING_TOO_LONG` 같은 후보 읽기 예외가 모두 같은 fail-open을 탄다.

인코딩도 별도 silent 표면이 있다. `readFileSync(..., 'utf-8')`는 잘못된 UTF-8을 예외로 만들지 않고 replacement character로 디코딩한다. 실제 tracked 후보 중 `infrastructure/scripts/operational-validation.ps1`과 `scripts/lib/qa-shots-dir.ps1`은 UTF-16 BOM/혼합 byte를 포함한다. Node가 UTF-8로 읽은 결과는 각각 NUL 39,893개/12,547개였고 `docs/qa`, `OutDir`, `ReportPath`, `WriteAllText` 신호가 모두 보이지 않았다. 두 파일은 별도 `qa-output-path-guard.test.cjs`가 명시 관할하므로 현 HEAD의 그 파일들만으로 즉시 무방비라고 판정하지는 않는다. 그러나 discovery 자체는 같은 인코딩의 신규 writer를 non-writer로 조용히 버린다. 이 표면은 읽기 실패 fail-open과 같은 결함으로 묶었다.

## 대형 파일·성능·캐시 수명

해시 대상은 “모든 저장소 파일”이 아니라 registry 후보 전수다. tracked 후보는 1,801건, 합계 31,137,165 bytes다. 가장 큰 파일은 `clients/web/estimate-app/views/index.ejs` 13,559,353 bytes다. 호출마다 각 후보를 동기식으로 전체 UTF-8 문자열화하고 해시한다. size 상한, streaming hash, binary/encoding 검증은 없다.

- 큰 후보는 파일 크기만큼 문자열 메모리와 해시용 UTF-8 변환 비용을 매 discovery에서 낸다.
- 정상 read가 지나치게 커서 OOM으로 프로세스가 죽으면 red이므로 거짓 green은 아니다.
- `readFileSync`가 `ERR_STRING_TOO_LONG` 등 catch 가능한 예외를 던지면 위 결함 3의 `continue`로 writer만 누락돼 green이 될 수 있다.
- 바이너리 bytes를 writer 확장자로 두면 UTF-8 replacement decode 후 텍스트 휴리스틱을 탄다. 인코딩을 검증하지 않으므로 non-UTF-8 executable source의 의미를 보존하지 못한다.

캐시는 프로세스 수명 동안 무한 성장하지 않는다. 매 discovery가 `next = new Map()`을 만들고 현재 canonical 후보만 채운 뒤 전역 `discoveredEvidenceWritersCache = next`로 교체한다. 삭제 파일·과거 content hash는 남지 않고 junction alias는 canonical key로 합쳐진다. 캐시 상한은 명시돼 있지 않지만 크기는 현재 발견 가능한 후보 파일 수에 묶인다. `trackedRepoFiles`도 최초 `git ls-files` 결과 한 세트만 보유하므로 성장 문제는 없다.

## 유지 확인

S16 테스트와 별도 대조 결과로 다음은 유지됐다.

- `.ts` 및 중첩 `scripts/**/*.ps1` 도달
- 저장소 내부 junction/link canonical target 추적, 저장소 밖 target 제외
- 주석·문자열 언급·문서·`resolveQaShotsDir` 마커 파일 green
- ignored generated output 제외
- non-ignored `.mjs` generator RED

## 지정 전체 명령과 소요 시간

`.py open/write`, `.cts`, `.bat`, ignored generated output 네 probe를 함께 둔 채 `clients/desktop`에서 파이프 없이 실행했다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts

Test Files 1 passed (1)
Tests 53 passed (53)
Vitest Duration 18.28s
S17_FALSE_GREEN_FULL_EXIT=0
S17_FALSE_GREEN_FULL_WALL_SECONDS=19.73
```

이 green은 기준 통과가 아니라 위 결함 1·2의 재현 결과다.

probe와 임시 테스트를 전부 제거한 뒤 같은 명령을 다시 실행한 최종 기준은 다음과 같다.

```text
Test Files 1 passed (1)
Tests 53 passed (53)
Vitest Duration 18.16s
S17_FINAL_BASELINE_EXIT=0
S17_FINAL_BASELINE_WALL_SECONDS=19.70
```

## 생성·정리한 probe와 link

검증 중 생성한 다음 항목은 모두 제거했다.

- `clients/desktop/scripts/.s17-content-cache-probe.mjs`
- `tools/.s17-restore-ctime.ps1`
- `tools/.s17-probes/source/python-open-writer.py`
- `tools/.s17-probes/source/missing-writer.cts`
- `tools/.s17-probes/source/missing-writer.bat`
- `tools/.s17-probes/source/generator.mjs`
- `tools/.s17-probes/source/locked-writer.mjs`
- `tools/.s17-probes/build/deep/generated.cjs`

S17은 junction/link를 새로 만들지 않았다. 임시로 삽입한 Windows cache probe 테스트도 원문으로 복원했고 가드 파일의 `git diff HEAD`는 0이다. `.gitguardian.yaml`은 수정하지 않았다. 기존 미추적 S13 보고서는 건드리지 않았다. 최종 신규 파일은 이 보고서 한 건이다.

## 이 라운드가 보지 않은 것

- SHA-256 자체의 충돌은 시도하지 않았다.
- Linux/macOS의 파일 잠금·권한 실패 동작은 실행하지 않았다. 읽기 실패 실측은 Windows `FileShare.None` 경로다.
- 수백 MB~GB 후보 파일을 실제 생성해 OOM/`ERR_STRING_TOO_LONG` 임계값을 실측하지 않았다. 현재 13.56MB tracked `.ejs`와 코드의 무상한 동기 read 경로까지만 확인했다.
- `.java`, `.html`, `.yml/.yaml`을 신규 evidence writer 언어로 확장해야 하는지는 판정하지 않았다. 저장소에 실제 확장자가 있고 로컬 파일 쓰기가 가능한 `.cts`·`.bat`까지만 probe했다.
- `clients/desktop/scripts/qa-output-path-guard.test.cjs` 전체 suite, GitHub CI, 제품 UI/API 도달성은 보지 않았다.
- Docker 스택은 조회·재기동하지 않았다.
