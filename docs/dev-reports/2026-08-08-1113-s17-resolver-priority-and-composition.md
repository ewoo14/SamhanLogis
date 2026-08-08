# PR #1119 / Issue #1113 — S17 resolver 우선순위·compose 합성

## 판정

S16에서 보고된 이번 라운드의 두 BLOCKER에 대해 코드 수정과 회귀 테스트를 완료했다. 공유 Docker stack은 재기동·재생성·중지하지 않았고, 커밋·push도 하지 않았다.

## 변경 내용

### 1. 관측 우선 resolver

`scripts/lib/local-stack-port.ps1`의 `Get-LocalStackPort` 출처 우선순위를 다음과 같이 정정했다.

1. 실행 중 컨테이너의 실제 Docker publish 포트
2. 명시적 `SAMHAN_*_PORT` 환경변수
3. 실제 로컬 기동에 사용하는 compose 3개 파일의 합성 포트
4. 합성 선언도 없을 때만 정적 기본값

따라서 live Docker publish가 `18086`인 상태에서 stale `SAMHAN_SLIP_PORT=8186`이 있어도 resolver는 `18086`을 반환한다.

### 2. Dockerless 실제 compose 합성 fallback

resolver가 다음 파일을 순서대로 읽고 뒤 파일의 service `ports` 선언을 덮어쓰도록 했다.

```text
infrastructure/docker-compose.yml
infrastructure/docker-compose.local-all.yml
infrastructure/docker-compose.slip-port-override.yml
```

Dockerless fallback에서 `slip-service=18086`, `partner-order-service=18088`을 포함한 16개 publishable service를 effective compose 포트로 해석한다.

## 검증

검증 셸: Windows PowerShell 5.1 (`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass`)

### TDD RED

수정 전 S7 테스트에서 Docker publish가 있는 auth-service에 명시 override를 주었을 때 다음 실패를 확인했다.

```text
FAIL: Docker publish must win over explicit auth override
S7_RED_EXIT=1
```

### GREEN

```text
S7 axis regression tests passed.
S7_RECHECK_EXIT=0
```

동 테스트에서 Dockerless 16개 fallback 전수와 compose overlay 2건을 확인했다.

stale override live priority 별도 확인:

```text
STALE_OVERRIDE_LIVE_RESOLVED=18086
exit 0
```

## 변경 통계

```text
2 files changed, 70 insertions(+), 10 deletions(-)
```

`git diff --stat` 기준 삭제 줄 수는 **10줄**이다.

## 신규·기존 미추적 파일

이번 라운드에서 새로 작성한 보고서:

- `docs/dev-reports/2026-08-08-1113-s17-resolver-priority-and-composition.md`

작업 시작 전부터 미추적이던 파일은 수정·삭제하지 않았다.

- `docs/dev-reports/2026-08-08-1113-s16-sol-premerge-reconvergence.md`
- `docs/qa/local-load-soak-test/raw/k6-image-20260808-022301.log`
- `docs/qa/local-load-soak-test/raw/k6-image-20260808-033759.log`
- `docs/qa/local-load-soak-test/raw/k6-image-20260808-034532.log`
- `docs/qa/local-load-soak-test/raw/k6-smoke-20260808-022301.log`
- `docs/qa/local-load-soak-test/raw/k6-smoke-20260808-033759.log`
- `docs/qa/local-load-soak-test/raw/k6-smoke-20260808-034532.log`
