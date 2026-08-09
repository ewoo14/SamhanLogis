# PR #1137 / 이슈 #1136 — S3 SOL 1차 적대검증

## 결론

**결함 0이 아니다. 머지 차단 결함 2건, 주요 결함 3건이 도달했다.**

- `main` 직접 push에서는 적용 migration 편집이 있어도 가드가 항상 공집합 diff를 검사해 통과한다. 현재 `main`은 branch protection이 없다.
- 복구 스크립트는 DB 비밀번호 값을 Docker 명령행 인자로 전달하고, repair 실패 시 그 전체 인자를 예외 로그에 다시 출력한다.

검증 기준은 PR HEAD `75c05cf12ea8908366a185b7709210efd7a18103`, 2026-08-08 검증 시점의 `origin/main` `1ba6dd3d43e6da3ff01bb56d051adf03b9963b95`이다.

## 도달 결함

### SOL-BLOCK-1 — `main` push 가드는 적용 migration 편집을 false green으로 통과시킨다

도달 경로:

1. `main` tip에서 기존 `services/future-service/src/main/resources/db/migration/V1__future.sql`을 편집해 커밋했다.
2. GitHub `push main` checkout 상태처럼 `origin/main`과 `HEAD`를 같은 새 tip으로 맞췄다.
3. 가드는 `git diff --name-status --find-renames origin/main...HEAD`를 실행했다.

실측:

```text
CASE=push-main-illegal expected-security=1 actual=0 diff=
```

원인은 `.github/workflows/applied-migration-guard.yml:11-17`이 `push main`에서 가드를 실행하면서도, `scripts/check-applied-migrations.ps1:36`이 push 이전 commit이 아니라 checkout 후의 `origin/main...HEAD`를 비교하기 때문이다. 두 ref가 같은 tip이므로 diff는 항상 비어 있다.

GitHub API 실측에서 `main` branch protection은 `404 Branch not protected`였다. 따라서 PR을 거치지 않는 직접 push가 별도 정책으로 차단된다는 전제도 없다.

### SOL-BLOCK-2 — DB 비밀번호가 프로세스 명령행과 실패 로그에 평문으로 도달한다

정적 도달 경로:

- `scripts/repair-flyway-checksums.ps1:82`가 `FLYWAY_PASSWORD=<값>` 형태를 `$common` Docker 인자 배열에 넣는다.
- 이 배열은 `docker run ... -e FLYWAY_PASSWORD=<값>`의 프로세스 명령행이 된다.
- repair가 실패하면 `scripts/repair-flyway-checksums.ps1:35`가 `$Arguments -join ' '` 전체를 예외문에 넣으므로 같은 값이 CI/터미널 로그에 기록된다.

저장소 파일과 기존 보고서에는 실제 자격값이 발견되지 않았고 `<redacted>` 표기는 유지되어 있다. 결함은 실행 시 자격값이 평문 명령행과 실패 로그로 나가는 경로다.

### SOL-MAJOR-3 — 기본 Compose 환경 파일 탐색이 라벨 map 전체를 경로로 사용한다

`scripts/repair-flyway-checksums.ps1:44`는 다음 출력을 `$composeWorkDir`로 사용한다.

```text
docker inspect samhan-auth-service --format {{.Config.Labels}}
```

이 형식은 `com.docker.compose.project.working_dir` 값 하나가 아니라 전체 라벨 map을 반환한다. 이후 49-50행은 그 map 문자열에 `.env`와 `.env.local`을 붙인다. 저장소의 실제 라벨 사용 기록은 `com.docker.compose.project.working_dir` 값을 개별 조회한다.

따라서 `-EnvFile`을 생략한 정상 경로는 실행 중 스택의 Compose 작업 디렉터리를 찾지 못하고, 현재 worktree의 `infrastructure/.env*` fallback을 쓰거나 환경 파일 없음으로 종료한다. 공유 스택이 다른 worktree에서 올라온 현재 운영 형태에서는 잘못된 자격 파일 선택까지 도달할 수 있다.

### SOL-MAJOR-4 — checksum mismatch 하나만 있으면 다른 validate 오류를 무시하고 repair한다

`scripts/repair-flyway-checksums.ps1:84-87`의 중단 조건은 다음과 같다.

```text
checksum mismatch version 추출 수 == 0 AND validate exit != 0
```

따라서 validate 출력에 checksum mismatch와 다른 검증 오류가 함께 있으면 `versions.Count > 0`이 되어 중단하지 않고 92행의 `repair`로 진행한다. 이 경우 스크립트가 표방하는 "checksum metadata only" 전제가 검증되지 않는다. 허용 가능한 validate 오류가 checksum mismatch뿐인지 전체 진단을 검사하지 않는다.

### SOL-MAJOR-5 — 실패 메시지의 repair 안내가 가드 범위와 맞지 않는다

가드는 서비스 열거 없이 현재 407개 migration 전부를 검사한다. 반면 실패 메시지는 모든 위반에 대해 `scripts/repair-flyway-checksums.ps1` 실행을 안내하지만, 해당 스크립트의 대상은 `auth_db`와 `arologis_db` 두 개로 고정되어 있다.

다른 12개 migration 디렉터리에서 위반하면 메시지의 첫 대안인 "기존 파일을 되돌리고 새 migration 추가"는 유효하지만, "부득이하면 모든 환경에서 repair 스크립트 실행"은 해당 DB를 복구하지 않는다. 개발자가 메시지만 따라 예외 경로를 처리할 수 없다.

## 정상 작업 차단 여부

저장소 제공 테스트와 별개로 임시 Git 저장소에서 실제 branch와 commit을 만들어 같은 가드 스크립트를 호출했다.

| 시나리오 | diff | 기대 | 실제 |
|---|---|---:|---:|
| 최신 `origin/main` 자체 | 없음 | 0 | 0 |
| 평범한 신규 migration 추가 | `A V2__new.sql` | 0 | 0 |
| migration 무관 README 변경 | `M README.md` | 0 | 0 |
| merge commit 뒤 신규 migration만 남음 | `A V2__merge_added.sql` | 0 | 0 |
| rebase 뒤 신규 migration만 남음 | `A V3__rebase_added.sql` | 0 | 0 |
| force-push에 해당하는 이력 재작성 뒤 안전 tip | `A V4__force_rewritten.sql` | 0 | 0 |
| fork contributor 형태의 안전 tip | `A V5__fork_added.sql` | 0 | 0 |

실제 저장소에서도 checkout 없는 임시 worktree를 `origin/main`에 직접 두고 실행했다.

```text
WT_HEAD=1ba6dd3d43e6da3ff01bb56d051adf03b9963b95
ACTUAL_ORIGIN_MAIN_EXIT=0
WT_REMOVED=True
```

PR HEAD가 최신 `origin/main`보다 뒤처진 현재 상태에서도 symmetric diff는 base 쪽 신규 commit을 PR 변경으로 오인하지 않았고 exit 0이었다.

## 우회 여부

| 시나리오 | Git 판정 | 기대 | 실제 |
|---|---|---:|---:|
| 파일 삭제 후 같은 이름으로 다른 내용 재생성 | `M V1__initial.sql` | 1 | 1 |
| 기존 migration 이름만 변경 | `R100 old -> new` | 1 | 1 |
| main에 새 서비스가 들어간 다음 후속 PR에서 그 migration 편집 | `M services/future-service/.../V1__future.sql` | 1 | 1 |

새 서비스 검사는 서비스명 열거가 아니라 `(^|/)db/migration/V[^/]*\.sql$` 축으로 도달했다.

현재 `origin/main`의 `db/migration` 아래 파일은 407개/14개 디렉터리이며, 407개 전부가 가드의 case-insensitive 패턴과 워크플로의 대문자 `V*.sql` trigger에 일치했다. 현재 파일 집합에서 가드와 workflow trigger 사이의 case gap은 0개다.

워크플로는 migration 무관 PR에서는 경로 필터 때문에 실행되지 않는다. 현재 main은 보호되지 않았고 이 job이 required check도 아니므로, 무관 PR을 pending 상태로 막는 경로는 없다.

## base 계산과 shallow clone

- merge commit, rebase, 이력 재작성 tip, fork 형태는 `origin/main...HEAD`의 merge-base 축으로 정상 통과했다.
- depth 1로 PR branch 하나만 받은 fixture에서는 `origin/main`이 없어 가드가 다음과 같이 throw했다.

```text
CASE=shallow-pr-tip-before-full-fetch origin_main=False actual=throw
error=git rev-parse --verify origin/main failed with exit code 128
```

- 같은 clone에서 전체 branch 이력을 fetch한 뒤에는 `origin/main=True`, `actual=0`, `shallow=false`였다.
- 현재 workflow는 `fetch-depth: 0`을 명시하므로 CI 기본 shallow 설정으로 인한 false failure 경로는 현재 구성에서 차단되어 있다.

## 복구 스크립트 정적 검토

이 라운드에서는 `scripts/repair-flyway-checksums.ps1`을 실행하지 않았다.

- `clean`, `drop`, `migrate` 명령 토큰: 0개.
- 실행 가능한 Flyway 동작: `validate`, `repair`뿐이다.
- PowerShell AST parse 오류: 0개.
- 두 번째 실행도 `validate` 뒤 `repair`를 다시 호출한다. Flyway repair 자체의 멱등성에 의존하며, 슬라이스 1 보고서에는 실제 2회차 불일치 `(none)`이 기록되어 있다.
- schema history가 없는 새 DB는 코드상 `validate exit 0 -> repair` 경로로 간다. "기록 없음"을 오류로 취급하는 자체 분기는 없다. 외부 Flyway의 빈 DB 동작은 이 라운드에서 실행하지 않았다.
- DB 업무 테이블을 직접 갱신하는 SQL은 없다. 다만 SOL-MAJOR-4 조건에서는 repair가 checksum 외 메타데이터를 바꾸지 않는다는 보장이 없다.

## 실패 메시지 도달성

다른 서비스의 기존 migration 편집 fixture에서 exit 1과 함께 다음 정보가 출력됐다.

- `M` 상태와 정확한 파일 경로
- 주석만 바꿔도 checksum mismatch가 난다는 원인
- 기존 파일을 고치지 말고 새 `V*.sql`을 추가하라는 1차 조치

따라서 일반 위반의 1차 조치는 메시지만으로 알 수 있다. 예외적인 repair 안내는 SOL-MAJOR-5처럼 실제 스크립트 대상과 맞지 않는다.

## 증거 무결성과 정리

- 전체 저장소 격리 clone 두 번은 64초 checkout timeout으로 완료되지 않아 결과에서 제외했다. 남은 Git 자식 프로세스 6개는 명령행의 전용 임시 경로를 대조한 뒤 종료했다.
- 최종 로컬 `check-credential-plaintext.sh` 재실행은 WSL 자식이 34초 묶음 제한을 넘겨 결과에서 제외했고, 해당 `bash`/`wsl` 자식 2개를 종료했다. PR의 GitHub `Credential Plaintext Guard`와 문서 관할 자격 비공개 가드는 조회 시점에 각각 pass였다.
- 이후 검증은 삭제 가능한 독립 fixture와 checkout 없는 임시 worktree에서 수행했다.
- 임시 fixture, 임시 clone, 임시 worktree는 모두 제거했다.
- 작업 전부터 존재하던 Java/Node 프로세스는 건드리지 않았다. 이 라운드에서 Gradle을 실행하지 않았고 새 Gradle daemon도 만들지 않았다.
- 공유 Docker 스택 재기동, 복구 스크립트 실행, DB 쓰기, 실제 자격 출력, 저장소 commit/push는 수행하지 않았다.
- 이 보고서 외 신규 파일은 없다.

## 이 라운드가 보지 않은 것

- 실제 GitHub fork에서 발생한 `pull_request` merge ref의 서버 측 checkout 동작은 push 없이 fixture로만 모사했다.
- 기존 `V*.sql`을 migration 경로 밖 또는 trigger에 맞지 않는 이름으로 rename했을 때 GitHub 서버의 `paths` 판정이 old path와 new path 중 무엇을 사용하는지는 실제 PR을 만들지 않아 확인하지 않았다.
- 새 빈 PostgreSQL에 대한 Flyway `validate`/`repair` 런타임 동작은 DB 쓰기 금지 때문에 실행하지 않았다.
- 이미 복구된 공유 DB의 checksum과 로그인 상태는 다시 읽거나 쓰지 않았다.
- GitHub Actions 41/41은 기존 PR 결과를 조회했을 뿐 재실행하지 않았다.
