# #1116 S28 최종 재수렴 — 공통 대량 출력 캡처기 적대 검증

## 판정

**BLOCK — 증거 무결성 결함 1건이다.**

S27이 직접 고친 15,316건 오염의 목록·정확한 총 건수·Git 실패의 fail-closed는 재현 probe를 통과했다. 정적 가드 61/61, 결과 검사 4/4, real-QA 회귀 50/50도 모두 통과했다.

그러나 새 공통 캡처기는 자식 실행 중의 `spawnSync` buffer 제한만 임시 파일로 옮겼을 뿐, 반환 시 stdout·stderr 전체를 다시 메모리에 올린다. 출력 크기 상한도 없고 스트리밍 집계도 아니다. 이 결함은 결과 검사와 real-QA 두 Git 집합 판정에 공통으로 도달하며, 대량 출력에서 진단 증거 자체를 잃을 수 있으므로 이번 라운드의 유일한 BLOCK이다.

## BLOCK 1 — 임시 파일에 받은 전체 출력을 다시 무상한 문자열로 읽는다

`scripts/capture-child-output.cjs`는 자식 stdout·stderr를 임시 파일로 직접 받지만, 자식 종료 뒤 다음 두 호출로 전체를 한 번에 문자열화한다.

```js
stdout: fs.readFileSync(stdoutPath, 'utf8'),
stderr: fs.readFileSync(stderrPath, 'utf8'),
```

따라서 `spawnSync`의 기본 약 1 MiB buffer에서 발생하던 `ENOBUFS`는 없어졌지만 메모리 상한이 생긴 것은 아니다. 8/32/96 MiB 출력을 같은 캡처기로 받은 독립 probe에서 다음처럼 출력 크기와 거의 같은 heap 증가가 측정됐다.

```text
requested 8 MiB  -> captured 8,388,608 bytes   heap +8.1 MiB   RSS +8.4 MiB
requested 32 MiB -> captured 33,554,432 bytes  heap +32.1 MiB  RSS +32.4 MiB
requested 96 MiB -> captured 100,663,296 bytes heap +96.1 MiB  RSS +96.0 MiB
exit 0, 임시 디렉터리 잔재 0
```

96 MiB를 `--max-old-space-size=64`로 실행한 추가 probe는 이 Node 버전에서 exit 0이었으므로, 이번 라운드는 특정 OOM 임계값을 재현했다고 주장하지 않는다. BLOCK의 근거는 코드상 상한 부재와 실측된 선형 메모리 증가다. Git 목록은 저장소 파일 수에 따라 계속 증가할 수 있고, 이 캡처기는 다음 세 도달 가능한 production 호출에서 공용이다.

- `scripts/check-docs-qa-clean.cjs`의 `git status`
- `clients/desktop/scripts/real-qa-scope.cjs`의 tracked `git ls-files`
- 같은 파일의 ignored-untracked `git ls-files`

즉 현재 2.5 MB/15,316건은 처리하지만, 충분히 큰 집합에서는 전체 문자열화가 프로세스 메모리 또는 Node 문자열 한계에 먼저 닿아 S26과 같은 “범인 목록 상실”로 되돌아갈 수 있다. exit가 non-zero이더라도 사람이 원인을 특정할 증거가 사라지는 결함이므로 일반 검증 품질이 아니라 증거 무결성 BLOCK으로 판정한다.

## S26 원 probe 재현 — 15,316건

작업 파일을 바꾸지 않고 별도 `GIT_INDEX_FILE`에 빈 index를 구성했다. 동일 상태에서 원본 Git 출력을 파일로 직접 받아 센 값과 결과 검사 보고값을 독립 대조했다.

```text
git read-tree --empty exit                         0
raw git status exit                               0
raw git status 항목                               15,316
raw git status bytes                              2,502,078
raw git status wall                               0.81초

check-docs-qa-clean exit                          1
check-docs-qa-clean wall                          0.54초
보고 총 건수                                      15,316
보고 생략 건수                                    15,116
원본 1번째 항목 표시                              true
원본 200번째 항목 표시                            true
원본 201번째 항목 표시                            false
`... 외 N건` 절단 표식                            true
ENOBUFS                                            false
```

따라서 앞 200건 절단은 사람이 전부로 오해하지 않게 표시되며, 절단 전 전체 배열 길이로 계산한 총 건수도 독립 원본과 정확히 일치한다.

## 공통 캡처기 엣지 동작

### 빈 출력

빈 Node 자식을 캡처했을 때 `status=0`, `stdout=''`, `stderr=''`였다. 전후 `samhan-child-output-*` 임시 디렉터리는 0개였다.

### 명령 실패와 Git 실패

일반 자식의 `exit 7`과 stderr `boom`은 그대로 보존됐다. 존재하지 않는 명령은 `status=null`, `error=ENOENT`로 반환됐다.

PATH에서 Git만 제거한 probe에서는 다음을 확인했다.

```text
check-docs-qa-clean exit 1
`git status 실행 실패` + ENOENT 명시
real-QA tracked 판정: 예외 발생 (`git ls-files --cached` 실패)
real-QA ignored 판정: 예외 발생 (`git ls-files --others --ignored` 실패)
```

Git 실패가 빈 문자열/깨끗함으로 흡수되는 경로는 재현되지 않았다.

### 타임아웃

캡처기에 `timeout: 150`을 직접 넘긴 자식은 다음으로 반환됐다.

```text
status=null
signal=SIGTERM
error=ETIMEDOUT
stdout='started'  # 타임아웃 전 부분 출력 보존
임시 디렉터리 잔재 0
```

다만 현재 세 production 호출은 timeout 값을 전달하지 않는다. 따라서 캡처기는 설정된 timeout은 보존하지만, 세 Git 호출 자체에는 시간 상한이 없다. S27 이전 호출도 timeout이 없었고 이번 probe에서 false-green이나 증거 변조는 확인되지 않아 별도 BLOCK으로 세지 않았다.

## real-QA 두 호출의 원동작 독립 확인

현재 저장소에서 공통 캡처기 결과와 기존 `spawnSync(..., encoding: 'utf8')` 방식의 원시 Git 결과를 이름 단위로 대조했다.

```text
tracked raw/new = 176/176, 완전 일치 true
ignored raw/new = 0/0, 완전 일치 true
```

ignored 집합이 실제로 비지 않은 경우도 별도 임시 Git 저장소로 확인했다. tracked 스펙 1개와 `.gitignore` 아래 ignored-untracked 스펙 1개를 만들었을 때 두 함수가 각각 정확히 해당 파일 하나만 반환했다. probe 저장소는 제거됐다.

Git 부재 시에는 위 두 함수가 각각 명시적 예외를 던졌으므로 빈 집합으로 조용히 축소되지 않는다.

## S13~S25 회귀

파이프 없이 원 명령을 실행하고 각 종료코드와 wall time을 따로 기록했다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
Tests 61 passed / 61
exit 0
wall 37.83초 (Vitest 내부 36.34초)

node --test scripts/check-docs-qa-clean.test.cjs
tests 4, pass 4, fail 0
exit 0
wall 1.08초

node --test clients/desktop/scripts/real-qa-scope.test.cjs
tests 50, pass 50, fail 0
exit 0
wall 19.33초
```

61건에는 S13~S24의 JS/TS·PowerShell·Python·Batch writer, tracked skip basename, 대량 `git ls-files`, 읽기 실패 fail-closed, unreadable untracked 단일 경고, 주석·문자열·문서·ignored·정상 잠금·marker 보유 오차단 방지 probe가 포함됐다.

개발책임자가 정적 수정 대상에서 제외한 네 형태는 판정에서 제외했다. 한계 주석은 `harness-false-green-guard.test.ts` 105~113행과 S25 보고서의 “정적 가드 역할과 알려진 한계” 절에 모두 명시돼 있다.

- quoted Batch 목적지
- marker와 write가 같은 도움말 문자열
- Python `Path('docs') / 'qa'` 조립
- Batch `%OUT%` 변수 목적지

## S25 병행 계약 실동작

tracked `docs/qa` 파일 1개를 임시 변경하고 non-ignored untracked 파일 1개를 함께 만든 probe에서 결과 검사는 exit 1로 두 경로를 모두 열거했다. 원본 bytes 복원과 untracked 삭제 뒤 clean은 exit 0이었다.

`docs/qa/**/_local/` ignored 파일만 둔 probe는 exit 0이었다. ignored probe 제거 후에도 clean exit 0을 재확인했다.

## probe 정리와 변경 통제

다음 임시 자원을 전부 제거했다.

- 빈 `GIT_INDEX_FILE` 및 대량 status 출력 파일
- Git 실패 stderr 파일
- S25 tracked/untracked/ignored 계약 probe
- real-QA 독립 임시 Git 저장소
- 공통 캡처기 stdout/stderr 임시 디렉터리

공유 Docker는 재기동하지 않았고 `.gitguardian.yaml`은 건드리지 않았다. 커밋·push·코드 수정은 하지 않았다.

이번 라운드의 신규 파일은 이 보고서 1개뿐이다.

- `docs/dev-reports/2026-08-08-1116-s28-final-reconvergence.md`

## 이 라운드가 보지 않은 것

- 96 MiB보다 큰 출력에서 실제 OOM/Node 최대 문자열 예외가 발생하는 임계값은 재현하지 않았다. 96 MiB 제한-heap probe도 이 환경에서는 exit 0이었다.
- Linux/macOS의 파일명 byte 처리, signal/timeout 차이, 파일 권한·symlink 차이는 실행하지 않았다.
- 세 Git production 호출에 timeout을 새로 부여했을 때의 정책값이나 장시간 hang을 실제로 기다려 재현하지 않았다.
- GitHub Actions 원격 runner, 전체 frontend-desktop/desktop-playwright job, 공유 Docker, 제품 UI/API, 운영 데이터는 실행하지 않았다.
- 개발책임자가 제외한 네 정적 미탐 형태는 주석 존재만 확인했고 정적 탐지 여부를 다시 판정하지 않았다.
