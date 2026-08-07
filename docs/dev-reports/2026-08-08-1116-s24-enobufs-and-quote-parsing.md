# #1116 S24 — ENOBUFS·Python 주석 delimiter·경고 중복 수정

## 판정

S22가 만든 세 결함을 수정했다. 명시적으로 제외된 quoted Batch 목적지, marker/write 도움말 문자열, Python `Path('docs') / 'qa'` 조립, Batch `%OUT%` 목적지는 건드리지 않았다.

## 변경

- `directoryContainsTrackedFile()`의 `git ls-files -co --exclude-standard -z` 호출에 `maxBuffer: 50 * 1024 * 1024`를 추가했다. 열거 실패는 빈 집합으로 흡수하지 않고 `unable to enumerate tracked evidence files with git ls-files` 오류로 드러낸다.
- Python 주석과 문자열을 같은 문자 상태기계에서 처리하도록 바꿨다. 주석 속 `"""`는 triple string을 열지 않고, 문자열 속 `#`은 주석을 열지 않는다. triple-quoted 내용은 계속 writer 분석에서 제외한다.
- 읽지 못한 untracked 후보는 canonical 경로별로 한 번만 경고한다. 이후 호출에서는 같은 후보를 반복 출력하지 않으며, 다시 읽을 수 있게 되면 경고 상태를 해제한다.
- S24 회귀 테스트 3건을 추가했다: 큰 `git ls-files` 출력 아래 tracked `build` writer, 주석 속 triple delimiter 뒤 writer, 동일 unreadable 후보 경고 중복.

## RED 확인

수정 전 S24 테스트 3건이 모두 실패했다.

```text
3 failed | 58 skipped
```

실패 내용은 각각 경고 2회, Python writer false-green, tracked build writer 미발견이었다.

## 최종 검증

실행 명령:

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
```

원문 결과:

```text
Test Files 1 passed (1)
Tests 61 passed (61)
Vitest Duration 32.69s
S24_FULL_EXIT=0
S24_FULL_WALL_SECONDS=34.28
```

S22 기준 58건에서 S24 회귀 3건이 추가되어 61건이 전건 통과했다. 테스트가 생성한 probe와 임시 index entry는 각 테스트의 `finally`에서 제거·복구했다. 종료코드는 파이프 없이 확인했다.

## 신규 파일

- `docs/dev-reports/2026-08-08-1116-s24-enobufs-and-quote-parsing.md`

커밋·push는 하지 않았다.
