# PR #1118 / 이슈 #1116 — S7 캐시 무효화

## 결론

모듈 전역 `discoveredEvidenceWritersCache`에 변경 경로 기반 무효화 API를 추가했다. 정상적인 불변 체크아웃에서는 기존처럼 전수 discovery가 최초 1회이고, 같은 프로세스에서 파일이 추가·삭제될 때만 해당 파일을 캐시에 증분 반영한다.

선택한 방식은 `invalidateEvidenceWriterDiscovery(changedFiles)`다. mtime/파일 수 fingerprint는 호출마다 디렉터리 상태를 다시 확인해야 하고, 단순 캐시 제거는 mutation 때 전수 스캔을 반복한다. 변경 경로를 아는 파일 probe/test 훅에서만 신호를 보내면 삭제는 기존 캐시에서 제거하고, 추가·변경은 동일한 `isEvidenceWriter` 판정기로 한 파일만 읽는다.

## RED-A — 같은 프로세스 생성·삭제 양방향

신규 계약 테스트는 다음 순서를 같은 Vitest 프로세스에서 수행한다.

1. `discoveredEvidenceWriters()`로 캐시를 채운다.
2. `clients/desktop/scripts/.s7-cache-invalidation-probe.mjs`를 만든다.
3. `invalidateEvidenceWriterDiscovery([probe])` 뒤 G3 대상 목록에 probe가 있는지 확인한다.
4. probe를 삭제한다.
5. 같은 무효화 신호 뒤 discovery 결과와 G3 대상 목록에서 probe가 사라졌는지 확인한다.

무효화 구현을 의도적으로 no-op으로 바꾼 적대 mutation의 원문 결과:

```text
FAIL ... 같은 프로세스의 파일 생성·삭제 후 discovery 캐시를 무효화하면 양쪽 변화를 본다
AssertionError: expected [ …(384) ] to include 'clients/desktop/scripts/.s7-cache-invalidation-probe.mjs'
at ...harness-false-green-guard.test.ts:1057:10
Test Files 1 failed (1)
Tests 1 failed, 50 skipped (51)
exit 1
```

정상 구현 GREEN:

```text
✓ 같은 프로세스의 파일 생성·삭제 후 discovery 캐시를 무효화하면 양쪽 변화를 본다
Test Files 1 passed (1)
Tests 10 passed, 41 skipped (51)
exit 0
```

삭제 후 `probe` 파일과 임시 `node_modules` junction은 모두 제거됐다.

## RED-B — 성능·순서·기존 게이트

기존 S6의 GitHub Actions 실측을 기준값으로 보존한다.

| 측정 | S6 CI 기준 |
|---|---:|
| G3a 최초 discovery | 43,838 ms |
| Vitest 전체 | 45.07 s |
| discovery 모집단 | 384건 |
| G8a 축소 mutation(199건) | exit 1 |
| CI | 43/43 |

S7은 commit/push 금지 조건 때문에 새 GitHub Actions run을 만들 수 없었다. 따라서 위 수치는 S6의 실제 CI 수치이며, S7 로컬 fresh 측정은 다음과 같다.

```text
targeted harness run: 10 passed / 0 failed, exit 0
Vitest duration: 26.12 s
new mutation contract: 25.09 s
```

S7 계약 테스트의 추가 파일 생성·삭제는 전수 재스캔하지 않고 변경 파일 1건만 판정한다. 정상 경로의 전수 discovery 호출은 기존 캐시 identity 테스트와 G8a/G8b/G8c/G9 호출이 같은 배열을 재사용한다. CI runner 배선은 변경하지 않았고 `ci.yml:649`의 `node --test scripts/lib/qa-credentials.test.cjs`를 그대로 유지한다.

테스트 순서 의존성은 생성 전 discovery → 생성 후 증분 반영 → 삭제 후 증분 제거 순서를 한 프로세스에서 실행해 확인했다. 생성·삭제 어느 방향도 앞 테스트의 stale 결과를 사용하지 않는다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1116-s7-cache-invalidation.md` — 본 보고서

기존 파일 수정:

- `clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts` — 증분 무효화 API, 공통 단일 파일 판정기, RED-A 회귀 테스트

임시 probe 및 의존성 junction은 잔류하지 않는다. commit/push, 컨테이너 재빌드, 다른 워크트리 변경은 수행하지 않았다.
