# PR #1137 / 이슈 #1136 — S5 재수렴 적대검증

## 결론

**결함 0이 아니다. 머지 차단 결함 1건과 주요 도달 결함 3건이 있다.**

- S3 차단 ①은 닫히지 않았다. `push` 이전 SHA를 로컬에서 찾지 못하면 가드가 경고 뒤 `exit 0`으로 통과한다. force-push로 이전 SHA가 소실된 fixture에서 기존 migration 편집이 실제로 통과했다.
- S3 차단 ②의 자격 평문 노출은 이번에 실행한 실패·성공·`WhatIf`·정상 중단 경로에서는 재현되지 않았다. Docker 인자에는 env-file 경로만 있었고, 출력은 자격값만 가리면서 실패 원인은 보존했으며, 임시 파일도 제거됐다.
- S3에서 함께 보고한 기본 Compose 환경 파일 탐색 실패와 혼합 validate 오류의 무조건 repair가 그대로 도달했다.
- 모든 검증은 PR HEAD `62a6a8d15bed738f640427bcb28374e5a6db1633`에서 수행했다. 검증 시점의 로컬 `origin/main`과 원격 `main`은 모두 `6a804ccce37c3192f1e3b419531b09c4ef352da4`였다.

## 도달 결함

### S5-BLOCK-1 — 이전 SHA가 소실된 main force-push는 불법 migration 편집을 fail-open으로 통과시킨다

`scripts/check-applied-migrations.ps1:44-54`는 `BeforeRef^{commit}`을 찾지 못하면 다음 순서로 끝난다.

```text
WARN: 비교 기준 커밋을 로컬에서 찾지 못했습니다(...)
PASS: 비교 기준 부재로 적용된 마이그레이션 변경을 판정하지 않음.
exit 0
```

독립 Git fixture에서 main의 기존 `V1__base.sql`을 편집해 커밋하고 존재하지 않는 40자리 SHA를 `BeforeRef`로 전달했다.

| 시나리오 | 기대 | 실제 |
|---|---:|---:|
| 이전 SHA 소실 + 기존 migration 편집 | 1 | **0** |

제공 테스트도 이 결과를 방지하지 않는다. `scripts/check-applied-migrations.test.ps1:104-107`은 같은 소실 SHA에 대해 exit 0을 성공 조건으로 고정한다. 실제 GitHub `fetch-depth: 0`은 현재 모든 reachable ref를 가져오지만, force-push로 어느 ref에서도 도달할 수 없게 된 이전 commit까지 보장하지 않는다. 따라서 이 경우는 단순 fixture 전제가 아니라 `push main`에서 도달 가능하다.

이는 S3 차단 ①과 같은 보안 결과다. 공격 또는 실수로 기존 migration을 편집한 force-push가 가드를 통과한다.

### S5-MAJOR-2 — `-EnvFile` 생략 시 Compose 작업 디렉터리를 찾지 못한다

`scripts/repair-flyway-checksums.ps1:59-67`은 다음 Docker 출력을 작업 디렉터리 하나로 사용한다.

```text
docker inspect samhan-auth-service --format {{.Config.Labels}}
```

가짜 Docker가 실제 형태의 label map에 `com.docker.compose.project.working_dir=<fixture path>`를 포함해 반환하고, 그 디렉터리에 `.env`를 배치했다. 스크립트는 label 값 하나를 추출하지 않고 map 전체를 `Join-Path`에 넘겨 다음 오류로 중단됐다.

```text
Cannot find drive. A drive with the name '[com.docker.compose.project.working_dir' does not exist.
```

따라서 문서화된 기본 실행 경로인 env-file 자동 발견은 공유 스택의 Compose 작업 디렉터리에 도달하지 못한다. 명시적 `-EnvFile` 경로만 이 결함을 피한다.

### S5-MAJOR-3 — checksum mismatch와 다른 validate 오류가 함께 있어도 repair를 실행한다

`scripts/repair-flyway-checksums.ps1:105-113`의 중단 조건은 “checksum mismatch version이 0개이면서 validate가 실패”인 경우뿐이다. 가짜 Flyway validate가 다음 두 진단을 함께 내고 exit 1을 반환하게 했다.

```text
Migration checksum mismatch for migration version 1
Detected failed migration version 2
```

실제 결과는 두 대상 DB 모두 `repair` 명령 실행 및 `repair completed`였다. 즉 checksum 외 validate 오류가 있는 상태에서도 “checksum metadata only” 전제가 성립한 것으로 간주하고 DB metadata 변경 경로에 도달한다.

### S5-MAJOR-4 — 가드의 repair 안내가 위반 DB에 도달하지 않는 경우가 있다

새 서비스 디렉터리가 main에 이미 존재한 뒤 그 서비스의 기존 migration을 편집한 fixture는 가드에 잡혔다. 그러나 모든 위반에 출력되는 `scripts/repair-flyway-checksums.ps1` 안내는 실제로 `auth_db`와 `arologis_db` 두 대상만 실행한다(`repair-flyway-checksums.ps1:91-94`). 다른 12개 migration 디렉터리 위반에서 개발자가 안내를 그대로 실행해도 해당 DB는 복구되지 않는다.

## 정상 작업 재검증

S4가 비교 기준을 바꾼 뒤 S3에서 통과했던 정상 경로를 독립 commit graph로 다시 만들었다.

| 시나리오 | 기대 | 실제 |
|---|---:|---:|
| 현재 원격과 일치하는 `origin/main` 자체 | 0 | 0 |
| 신규 migration만 추가한 PR | 0 | 0 |
| migration 무관 PR | 0 | 0 |
| main 진전을 merge한 안전 PR | 0 | 0 |
| main 위로 rebase한 안전 PR | 0 | 0 |
| 안전한 migration 추가 commit을 이력 재작성한 PR | 0 | 0 |
| fork contributor 형태의 안전 tip | 0 | 0 |
| all-zero `before`인 첫 push | 0 | 0 |

현재 실제 작업트리에서도 원격 `main`과 로컬 `origin/main`이 같은 SHA임을 확인한 뒤 가드를 실행했고 exit 0이었다. merge·rebase·이력 재작성·fork 형태의 안전한 PR에서 무고한 실패는 재현되지 않았다.

## 위험 변경 재검증

| 시나리오 | 기대 | 실제 |
|---|---:|---:|
| main 직접 push의 기존 migration 편집 | 1 | 1 |
| 첫 commit에서 migration 편집, 마지막 commit은 README인 다중 push | 1 | 1 |
| 삭제 후 같은 경로에 다른 내용으로 재생성 | 1 | 1 |
| 기존 migration rename | 1 | 1 |
| 새 서비스가 main에 들어간 뒤 후속 PR에서 기존 migration 편집 | 1 | 1 |
| 이전 SHA 소실 + 기존 migration 편집 | 1 | **0** |

다중 push는 마지막 commit만 보지 않고 `BeforeRef..HEAD` 전체의 최종 snapshot 차이를 검사해 편집을 잡았다. 삭제·재생성과 rename, 서비스명 비열거 경로도 유지됐다.

## 자격 비공개와 임시 파일 정리

공유 Docker와 DB 대신 독립 가짜 Docker 프로세스를 사용했다. 임시 env-file 안의 무작위 자격값을 가짜 Docker가 stdout과 stderr에 의도적으로 출력하게 해 redaction을 검증했으며, 보고서와 터미널에는 실제 값을 출력하지 않았다.

| 경로 | 자격 평문 출력 | Docker argv 자격값 | 실패 원인 | env-file 제거 |
|---|---|---|---|---|
| 잘못된 자격 validate 실패 | 없음 | 없음 | `auth rejected` / `authentication failed` 보존 | 확인 |
| checksum mismatch `WhatIf` | 없음 | 없음 | mismatch 및 preview 원인 보존 | 확인 |
| repair 성공 | 없음 | 없음 | 성공 원인 보존 | 확인 |
| 실행 중 PowerShell job 정상 중단 | 없음 | 없음 | 해당 없음 | 확인 |

argv에는 `--env-file <temporary-path>`만 있었고 `FLYWAY_PASSWORD=`나 자격값은 없었다. 성공·실패·preview·정상 중단에서 각 파일이 실행 중에는 존재하고 종료 뒤 사라지는 것을 확인했다. 제공된 `repair-flyway-checksums.test.ps1`도 별도로 exit 0이었다.

## 워크플로 도달성과 shallow checkout

- workflow 상태는 GitHub API에서 `active`였다.
- PR HEAD `62a6a8d15...`의 실제 `pull_request` run `31234497414`가 생성돼 성공했다. 따라서 현재 PR 경로에서 workflow가 아예 트리거되지 않는 상태는 아니다.
- migration 경로 407개/14개 디렉터리를 셌고, 407개 모두 가드 정규식과 workflow의 대문자 `V*.sql` path filter에 일치했다. 현재 파일 집합의 trigger gap은 0개다.
- migration 무관 PR에서는 이 workflow가 실행되지 않지만, `main`은 GitHub API상 branch protection이 없고 이 check가 required pending으로 정상 PR을 막는 경로도 없다.
- 실제 run 로그에서 checkout 입력 `fetch-depth: 0`과 모든 branch ref 및 PR merge ref fetch를 확인했다. `origin/main`이 존재했고 최종 검사도 exit 0이었다. 기본 shallow clone 때문에 생기는 false failure는 현재 workflow 구성에서 도달하지 않았다.
- 반대로 `fetch-depth: 0`이어도 force-push 전 SHA가 모든 ref에서 소실되면 가져올 수 없다. 이때 false failure가 아니라 S5-BLOCK-1의 false green으로 떨어진다.

## 실행·증거 정리

- 제공 가드 테스트: `Flyway applied-migration guard scenarios: PASS`.
- 제공 복구 테스트: `Flyway repair credential scenarios: PASS`.
- 두 PowerShell 파일 AST parse: 오류 없음.
- 임시 Git fixture, 가짜 Docker fixture, PowerShell job은 모두 제거했다. 각 fixture의 최종 확인은 `FIXTURE_REMOVED=True`였다.
- 공유 Docker 스택 재기동·실 Docker 호출·DB 읽기/쓰기·복구 스크립트의 실제 DB 실행은 하지 않았다.
- Gradle을 실행하지 않았고 새 Gradle daemon을 만들지 않았다.
- commit·push·코드 수정은 하지 않았다. 이 보고서만 신규 파일이다.

## 이 라운드가 보지 않은 것

- workflow가 아직 PR에 있으므로, merge 뒤 실제 `push main` 이벤트를 새 commit으로 발생시키지는 않았다. push 이벤트의 `github.event.before` 전달은 workflow 정의와 독립 fixture로 검증했다.
- 실제 GitHub fork의 서버 측 merge ref는 만들지 않았고 동일한 commit topology로 모사했다.
- OS 강제 종료, 전원 손실처럼 PowerShell `finally` 자체가 실행될 수 없는 중단 뒤의 임시 파일 잔존은 검증하지 않았다. 검증한 중단은 PowerShell job의 정상 취소 경로다.
- 이미 복구된 공유 DB는 다시 읽거나 쓰지 않았다. 실제 PostgreSQL/Flyway의 잘못된 자격 실패와 repair는 실행하지 않고 동일 argv·stdout·stderr 계약의 가짜 Docker로 검증했다.
- GitHub Actions 41/41은 조회만 했고 재실행하지 않았다.
