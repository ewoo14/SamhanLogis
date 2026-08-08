# #1116 S30 최종 재수렴 — 스트리밍 캡처 적대 검증

## 판정

**결함 0건 — BLOCK 없음.**

S28의 BLOCK이었던 출력 크기 비례 전체 문자열 보유는 세 production 호출에서 재현되지 않았다. 8/32/96 MiB를 독립 측정했고, 총 건수·앞 200건·절단 표식, 64 KiB 청크 경계와 UTF-8 분할, 빈 출력과 무개행 EOF, 개행/NUL 구분, Git 실패 fail-closed를 확인했다.

정적 가드 61/61, 결과 검사 5/5, real-QA 50/50과 S13~S28의 도달 가능한 probe도 모두 exit 0 또는 의도한 차단 exit를 냈다. 개발책임자가 판정 제외로 지정한 네 형태는 결함 수에 넣지 않았다.

## 1. 8/32/96 MiB 독립 heap 측정

Node `--expose-gc`의 새 프로세스를 크기마다 따로 실행했다. 자식 stdout은 정확히 64 KiB 청크로 임시 파일에 기록했고, 부모는 `summarizeOutputFile(limit: 200)` 전후를 측정했다. 구현자 보고값을 재사용하지 않았다.

### S29와 같은 2바이트 레코드(`x\n`)

| 출력 | 실제 bytes | 총 건수 | 표시 | 절단 | 캡처 직후 heap | 요약 직후 heap | 강제 GC 후 |
|---|---:|---:|---:|---|---:|---:|---:|
| 8 MiB | 8,388,608 | 4,194,304 | 200 | true | +0.13 MiB | +3.09 MiB | +0.05 MiB |
| 32 MiB | 33,554,432 | 16,777,216 | 200 | true | +0.13 MiB | +4.80 MiB | +0.07 MiB |
| 96 MiB | 100,663,296 | 50,331,648 | 200 | true | +0.13 MiB | +14.24 MiB | +0.07 MiB |

독립 96 MiB 실측은 구현자 수치 `+11.25 MiB`와 같지 않고 `+14.24 MiB`였다. 그러나 S28의 `+96.1 MiB`처럼 출력 전체 크기만큼 잔존하지 않았고, 강제 GC 뒤에는 `+0.07 MiB`였다.

### 앞 200건 순서까지 구분한 32바이트 고유 레코드

동일 문자열 200개로 순서를 오인하지 않도록 각 레코드를 `000...000`부터 증가하는 고유 31자리 번호와 개행으로 만들었다.

| 출력 | 총 건수 | 첫 건 | 200번째 | 표시/절단 | 요약 직후 heap | 강제 GC 후 |
|---|---:|---|---|---|---:|---:|
| 8 MiB | 262,144 | `...0000` | `...0199` | 200 / true | +0.87 MiB | -0.09 MiB |
| 32 MiB | 1,048,576 | `...0000` | `...0199` | 200 / true | +0.88 MiB | -0.08 MiB |
| 96 MiB | 3,145,728 | `...0000` | `...0199` | 200 / true | +0.89 MiB | +0.33 MiB |

음수 GC 차이는 기준 시점 대비 GC 변동이다. 세 크기 모두 bytes, 총 건수, 0~199 레코드 전부와 `truncated=true`를 단언했다. 결과 보고 포맷도 96 MiB 조건의 총 3,145,728건에서 1번째와 200번째를 포함하고 201번째는 제외하며 `... 외 3,145,528건 (총 3,145,728건)`을 표시했다.

## 2. 청크 경계·구분자·EOF

합성 파일의 첫 레코드를 65,530 ASCII bytes로 맞춘 뒤 긴 한글 경로를 이어, 한글 3바이트 문자가 실제 65,536-byte 청크 경계에 걸치게 했다. 별도로 `chunkSize=2`에서도 `A가B`의 UTF-8 문자를 강제로 분할했다.

```text
64 KiB 경계의 개행 구분 긴 경로       원문 2건 그대로 복원
64 KiB 경계의 NUL 구분 긴 경로        원문 2건 그대로 복원
NUL 레코드 내부 개행                   파일명의 일부로 보존
2-byte 청크의 UTF-8 분할               A가B 그대로 복원
0-byte 출력                            0건, truncated=false
마지막 개행 없음                       마지막 레코드 포함
마지막 NUL 없음                        마지막 레코드 포함
마지막 NUL 있음                        빈 가짜 레코드 추가 없음
```

결과 검사는 개행 구분만 사용한다. real-QA의 tracked와 ignored-untracked 두 호출은 모두 `git ls-files -z`와 NUL 구분 요약을 함께 사용한다. 한 호출 안에서 `-z` 출력과 개행 파싱이 섞인 경로는 없다.

임시 Git 저장소에서도 각각 411-byte 한글 tracked 경로와 531-byte 한글 ignored-untracked 경로를 만들었다. 두 real-QA 호출은 이름을 쪼개지 않고 정확히 한 건씩 반환했다. 임시 저장소는 제거했다.

## 3. 세 production 호출의 동일 동작과 fail-closed

현재 저장소의 원시 Git 결과와 스트리밍 결과를 이름 단위로 대조했다.

```text
real-QA tracked      raw 176 / streamed 176 / 완전 일치
real-QA ignored      raw   0 / streamed   0 / 완전 일치
```

PATH에서 Git을 제거해 세 호출을 각각 실행했다.

```text
check-docs-qa-clean                  exit 1, `git status 실행 실패: spawnSync git ENOENT`
listTrackedRealQaFiles               예외, `real-QA 추적 집합 판정 실패` + ENOENT
listGitignoredUntrackedRealQaFiles   예외, `real-QA 무시 파일 판정 실패` + ENOENT
캡처 임시 디렉터리 증감              0
```

따라서 Git 실패가 결과 검사의 “깨끗함”이나 real-QA의 빈 집합으로 흡수되는 production 경로는 재현되지 않았다.

## 4. S26 대량 오염과 S25 결과 계약

별도 `GIT_INDEX_FILE`에 빈 index를 만들고 원시 `git status`와 결과 검사를 독립 대조했다.

```text
raw git status exit                  0
raw bytes                            1,235,722
raw 총 건수                          15,316
check-docs-qa-clean exit             1 (의도 차단)
결과 검사 wall                       0.45초
보고 총 건수                         15,316
원본 1~200번째                       모두 정확히 표시
원본 201번째                         표시하지 않음
절단 표식                            `... 외 15,116건 (총 15,316건)`
ENOBUFS                              없음
```

별도 S25 계약 probe에서는 non-ignored untracked 1건일 때 exit 1과 정확한 경로를 냈다. 그 파일을 지우고 `docs/qa/**/_local/` ignored 파일만 두면 exit 0, probe 제거 뒤 clean도 exit 0이었다.

## 5. 전체 회귀

종료코드는 파이프 없이 원 명령에서 직접 받았고 wall time을 별도로 쟀다.

```text
cd clients/desktop
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
Tests 61 passed / 61
exit 0
wall 47.81초 (Vitest 내부 46.07초)

cd ../..
node --test scripts/check-docs-qa-clean.test.cjs
tests 5, pass 5, fail 0
exit 0
wall 1.33초 (Node 내부 1266.2963ms)

node --test clients/desktop/scripts/real-qa-scope.test.cjs
tests 50, pass 50, fail 0
exit 0
wall 22.70초 (Node 내부 22628.8597ms)

git diff --check
exit 0
```

61건에는 S13~S24의 writer 탐지, 대량 `git ls-files`, 읽기 실패 fail-closed, 경고, 오차단 방지 probe가 포함된다. 결과 검사 5건과 위 수동 probe는 S25~S29의 결과 계약·15,316건 대량 오염·스트리밍 집계를 다시 밟는다. real-QA 50건은 tracked/ignored 집합, 한글 경로, 명시 실행, 오차단 표면을 다시 밟는다. 의도적 읽기 실패 경고와 임시 Git 저장소의 CRLF 경고 외 테스트 실패는 없었다.

정적 wall은 비교 기준 33.32초보다 이번 실행에서 14.49초 길었다. 종료코드와 61/61 결과에는 변화가 없었다.

## 6. 제외 항목·정리·변경 통제

개발책임자 결정에 따라 다음 네 형태는 판정에서 제외했다.

- quoted Batch 목적지
- marker와 write가 같은 도움말 문자열
- Python `Path('docs') / 'qa'` 조립
- Batch `%OUT%` 변수 목적지

생성한 합성 출력 파일, 빈 index, 임시 Git 저장소, `docs/qa` untracked/ignored probe, 캡처 임시 디렉터리는 모두 제거했다. 공유 Docker는 재기동하지 않았고 `.gitguardian.yaml` allowlist는 건드리지 않았다. 커밋·push·코드 수정은 하지 않았다.

이번 라운드 신규 파일은 이 보고서 1개뿐이다.

- `docs/dev-reports/2026-08-08-1116-s30-final-reconvergence.md`

## 이 라운드가 보지 않은 것

- Linux/macOS에서의 파일명 byte 처리, signal/권한/symlink 차이는 실행하지 않았다.
- 96 MiB보다 큰 출력, 단일 레코드 자체가 비정상적으로 거대한 경우, 실제 OOM 임계값은 재현하지 않았다.
- GitHub Actions 원격 runner 43개 job 자체, 전체 frontend-desktop/desktop-playwright job, 제품 UI/API와 운영 데이터는 실행하지 않았다. 제공된 HEAD의 43/43 green을 이 로컬 라운드의 독립 실행으로 재검증했다고 주장하지 않는다.
- 공유 Docker와 서비스 컨테이너는 재기동하거나 접근하지 않았다.
- 개발책임자가 제외한 네 정적 미탐 형태는 탐지 여부를 다시 판정하지 않았다.
