# #1116 S27 결과 검사 버퍼 전수 후검증

## 판정

**FIXED — 결과 검사와 같은 `git` 대량 출력 축의 버퍼 결함을 닫았다.**

S26의 실제 재현은 Node 기본 `spawnSync` stdout buffer 초과였다.

```text
[docs/qa 결과 검사] git status 실행 실패: spawnSync git ENOBUFS
```

공통 `scripts/capture-child-output.cjs`를 추가해 자식 프로세스의 stdout/stderr를 임시 파일로 직접 받도록 했다. 따라서 Node의 `spawnSync` 출력 buffer 크기에 따라 Git 목록이 사라지지 않는다. 결과 검사 출력은 사람이 읽을 수 있도록 최대 앞 200건을 표시하고, 생략분과 정확한 총 건수를 표시한다.

예시 형식:

```text
  ... 외 15116건 (총 15316건)
```

Git 실행 실패는 여전히 `git ... 실행 실패`와 원인으로 exit 1을 유지한다. 정상 상태는 기존처럼 조용한 통과 메시지와 exit 0이다.

## `git` 외부 명령 버퍼 전수 조사

| 위치 | 외부 호출 | 대량 출력 판정 | 조치 |
|---|---|---|---|
| `scripts/check-docs-qa-clean.cjs` | `git status --porcelain=v1 --untracked-files=all -- docs/qa` | S26에서 기본 buffer로 `ENOBUFS` 재현 | 공통 파일 캡처기로 교체 |
| `clients/desktop/scripts/real-qa-scope.cjs` | `git ls-files -z --cached -- clients/desktop/playwright` | `-z`와 무관하게 기본 buffer 의존, 대규모 집합에서 절단 가능 | 공통 파일 캡처기로 교체 |
| 테스트 fixture의 `git read-tree`, `git init/config/add/commit`, `git cat-file`, `git checkout-index` | 테스트용 소규모/개별 파일 명령 | `git ls-files` 대량 열거가 아니며 이번 축의 대상 아님 | 변경 없음 |
| 그 밖의 `execSync`/`execFileSync`/`spawnSync` | 릴리스·프로세스 종료·Playwright/셸 fixture 등 | `git ls-files` 대량 목록 수신 호출 없음 | 변경 없음 |

production의 `git ls-files` 호출은 전수 재검색 후 위 `real-qa-scope.cjs`의 두 호출만 남았고 모두 공통 캡처기를 사용한다. `.gitguardian.yaml`은 변경하지 않았다.

## RED-A / RED-B

새 회귀 테스트는 빈 임시 Git index로 현재 `docs/qa` 전체를 대규모 오염처럼 만들고, 결과 검사가 다음을 만족하는지 검증한다.

- exit 1
- `ENOBUFS` 없음
- 오염 경로 목록 존재
- 별도 Git 원본 목록과 결과 메시지의 `총 N건`이 정확히 일치

정상 작업 트리의 실제 실행도 추가했다.

```text
[docs/qa 결과 검사] 통과: tracked 변경 + non-ignored untracked 잔재 0
```

## 전건 검증 원문

### 결과 검사 회귀

```text
node --test scripts/check-docs-qa-clean.test.cjs
✔ docs/qa 결과 검사는 tracked 변경과 non-ignored untracked 경로를 모두 목록으로 보고한다
✔ 빈 git status는 결과 검사 통과로 표현된다
✔ 정상 docs/qa 상태는 결과 검사 통과로 표현된다
✔ 대규모 오염도 목록 일부와 정확한 총 건수를 보존한다
ℹ tests 4
ℹ pass 4
ℹ fail 0
ℹ duration_ms 1073.4716
```

### real-QA 집합 회귀

```text
node --test clients/desktop/scripts/real-qa-scope.test.cjs
ℹ tests 50
ℹ pass 50
ℹ fail 0
ℹ duration_ms 20727.0124
```

### 정적 가드

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
Test Files 1 passed (1)
Tests 61 passed (61)
Duration 37.31s (transform 78ms, setup 0ms, collect 176ms, tests 36.63s, environment 0ms, prepare 115ms)
```

### diff·상태

```text
git diff --check
exit 0
```

probe, 임시 index, Docker stack, `.gitguardian.yaml`, 커밋, push는 건드리지 않았다. 신규 파일은 다음 2건이다.

- `scripts/capture-child-output.cjs`
- `docs/dev-reports/2026-08-08-1116-s27-postcheck-buffer.md`
