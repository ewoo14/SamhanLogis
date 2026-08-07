# #1116 S29 — 공통 캡처기 스트리밍 전환

## 판정

**해소 — 결함 1건 수정, RED-A/B 모두 통과.**

`capture-child-output.cjs`가 임시 stdout·stderr 파일을 종료 후 전체 문자열로 읽던 동작을 제거했다. 캡처 결과는 파일 경로와 `cleanup()`만 반환하고, `summarizeOutputFile()`이 64 KiB 청크와 UTF-8 decoder로 레코드를 세면서 앞 제한 건만 보관한다.

- 결과 검사: 앞 200건 + 정확한 총 건수 + 절단 표식
- real-QA: NUL 구분 파일 목록을 스트리밍 소비 후 필요한 파일명 목록만 구성
- 실패: stderr 앞 1건만 읽고 exit/error를 그대로 fail-closed
- 정상 출력·Git 오류·임시 파일 정리 계약 보존

## S28 결함 재현 조건의 S29 개선 실측

자식은 64 KiB 줄 레코드 청크로 출력했고, 부모는 `--expose-gc`에서 동일 프로세스의 캡처 전후 heap을 측정했다. `summarizeOutputFile(limit: 200)` 결과도 함께 검증했다.

```text
requested 8 MiB  -> total 4,194,304 records  shown 200  truncated true  heap +3.10 MiB
requested 32 MiB -> total 16,777,216 records shown 200  truncated true  heap +3.25 MiB
requested 96 MiB -> total 50,331,648 records shown 200  truncated true  heap +11.25 MiB
```

S28 측정값(+8.1 / +32.1 / +96.1 MiB)처럼 출력 크기에 비례해 전체 문자열을 보유하는 증가가 사라졌고, 이 probe에서 최대 heap 증가는 +11.25 MiB였다. 96 MiB 출력의 총 건수·앞 200건·절단 상태는 모두 정확했다.

## RED-A / RED-B

### RED-A — 대규모 출력

공통 캡처기 회귀 테스트에서 20,000개 레코드를 생성했다.

```text
status 0
totalCount 20,000
records 200
truncated true
record-0 ... record-199 보존
```

실 저장소의 `docs/qa` 대량 오염 검사도 앞 200건과 정확한 총 건수를 유지했다.

### RED-B — 정상 출력·오염 0

기존 결과 검사 정상 케이스가 동일하게 통과했고, real-QA의 추적·ignored 목록, Git 실패 fail-closed, 명시 경로/집합 판정이 유지됐다.

## 전건 실행 원문

종료코드는 파이프 없이 각 명령을 직접 실행했다.

```text
node --test scripts/check-docs-qa-clean.test.cjs
tests 5, pass 5, fail 0
exit 0
duration_ms 1330.2322

node --test clients/desktop/scripts/real-qa-scope.test.cjs
tests 50, pass 50, fail 0
exit 0
duration_ms 19567.2436

npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
Test Files 1 passed (1)
Tests 61 passed (61)
exit 0
Duration 31.52s (transform 111ms, setup 0ms, collect 254ms, tests 30.72s, environment 0ms, prepare 131ms)
```

`real-qa-scope`와 정적 가드의 stderr에는 기존 probe가 의도적으로 남기는 읽기 실패 경고가 있었지만, 테스트 실패는 0건이었다.

추가로 `git diff --check`도 exit 0이었다. 공유 Docker는 재기동하지 않았고 `.gitguardian.yaml`은 변경하지 않았다.

## 변경 파일 및 신규 파일

수정:

- `scripts/capture-child-output.cjs`
- `scripts/check-docs-qa-clean.cjs`
- `scripts/check-docs-qa-clean.test.cjs`
- `clients/desktop/scripts/real-qa-scope.cjs`

신규 파일:

- `docs/dev-reports/2026-08-08-1116-s29-streaming-capture.md`

커밋·push는 하지 않았다.
