# PR #1137 / 이슈 #1136 — S7 재수렴 적대검증

## 결론

**결함 0이 아니다. 차단 결함 1건과 도달 결함 4건이 있다.**

- feature branch를 force-push한 정상 PR은 막히지 않았다. `pull_request`에서는 `BeforeRef`를 전달하지 않고 `origin/main...HEAD`를 비교하며, 실제 HEAD `0029dd962`의 synthetic merge ref도 exit 0이었다.
- 반면 main force-push의 이전 SHA가 최초 checkout에 없으면, 그 SHA를 원격에서 명시 fetch할 수 있는 경우에도 fetch를 시도하지 않고 exit 1로 끝난다. 이는 “진짜 판정 불가”와 “현재 checkout에만 없음”을 구분하지 못한 정상 작업 차단이다.
- S6의 checksum 외 validate 오류 중단은 동작한다. 그러나 정상 checksum-only Flyway 출력도 다른 오류로 오판하여 repair가 전혀 실행되지 않는다.
- Compose 기준 컨테이너가 없을 때 `.env` 후보 안내에 도달하지 않고 Docker stderr의 `Error:`를 PowerShell drive로 해석해 중단한다.
- repair 스크립트 두 파일만 바꾸는 PR/push에서는 repair 테스트를 실행하는 유일한 workflow가 path filter 때문에 생성되지 않는다.
- 현재 14개 서비스에서는 실제 위반 서비스별 `-Service` 안내가 유지된다. 그러나 15번째 새 서비스에서는 guard가 출력한 동적 서비스명이 repair의 고정 `ValidateSet`에 거부된다.
- S5의 자격 비공개·임시 파일 정리는 유지됐다.

검증 기준은 PR HEAD `0029dd962534058170bcd831e812a83aa5e1f01e`이다. GitHub의 해당 HEAD run `31236440107`에서 적용 migration 가드는 성공했고, 전체 status check 41/41도 성공 상태였다.

## 도달 결함

### S7-BLOCK-1 — 복구 가능한 `before` SHA도 fetch 없이 판정 불가로 확정한다

`scripts/check-applied-migrations.ps1:45-69`는 `BeforeRef^{commit}`이 로컬에 없으면 즉시 다음 메시지와 exit 1을 반환한다.

```text
FAIL: 비교 기준 커밋을 로컬에서 찾지 못했습니다(...).
force-push 이전 SHA를 복구하거나 전체 이력을 가져온 뒤 가드를 다시 실행하십시오.
```

임시 shallow 저장소에 현재 HEAD만 depth 1로 받은 뒤, 이전 PR SHA `62a6a8d15...`를 `BeforeRef`로 실행했다.

| 단계 | 결과 |
|---|---:|
| HEAD만 있는 shallow checkout | exit 1 |
| 같은 원격에서 `git fetch --depth=1 origin 62a6a8d15...` | fetch exit 0 |
| 동일한 guard 재실행 | exit 0 |

즉 이 사례는 원격에도 객체가 없어 진짜 판정 불가였던 것이 아니다. 현재 workflow가 SHA fetch를 시도하지 않아 판정 가능한 비교를 못 한 것이다. `fetch-depth: 0`은 현재 ref들의 전체 reachable history를 가져오지만, force-push로 ref에서 이탈한 `github.event.before`를 항상 포함시키지는 않는다.

또한 현재 실패 안내대로 Actions runner에서 “전체 이력 후 재실행”만 해서는 같은 checkout이 반복될 수 있다. workflow가 targeted fetch를 수행하지 않으므로 개발자가 로컬에서 SHA를 복구해도 해당 CI run에는 반영되지 않는다.

정상 feature force-push PR은 이 결함에 닿지 않는다. `pull_request` 이벤트는 `BeforeRef`를 비워 `origin/main...HEAD`를 비교했고 exit 0이었다. 차단 도달점은 이전 SHA가 현재 ref에서 이탈한 **main push/force-push**이다.

### S7-MAJOR-2 — checksum-only의 정상 다중행 출력에서도 repair에 도달하지 못한다

`scripts/repair-flyway-checksums.ps1:90-100`은 다음 두 조건 중 하나면 “checksum mismatch 이외 오류”로 중단한다.

```text
출력 전체에 failed|detected|error|authentication|exception|unable|rejected 존재
비어 있지 않은 출력 줄 수 > checksum mismatch 줄 수
```

가짜 Docker가 Flyway checksum-only 실패의 다중행 형태를 반환하게 했다.

```text
ERROR: Validate failed: Migrations have failed validation
Migration checksum mismatch for migration version 1
- Applied to database : 123
- Resolved locally    : 456
```

실제 결과는 다음과 같았다.

```text
auth-service validate failed for a reason other than a checksum mismatch
REPAIR_CALLED=False
```

checksum mismatch 자체가 `ERROR`/`failed` 문구와 상세 줄을 동반하므로 두 조건을 모두 만족한다. 따라서 S6 fixture처럼 mismatch 한 줄만 출력되는 경우 외에는 정상 복구 경로가 막힌다. 혼합 오류에서 repair를 금지하는 방향은 유지됐지만, checksum-only와 혼합 오류를 구별하지 못한다.

임시 credential file은 이 중단 뒤 제거됐고 평문 자격은 출력·argv에 나타나지 않았다.

### S7-MAJOR-3 — Compose 기준 컨테이너 부재 시 명확한 `.env` 실패 안내 전에 중단한다

`scripts/repair-flyway-checksums.ps1:49-55`는 `docker inspect samhan-auth-service`를 `-AllowFailure`로 호출한 뒤 exit code를 확인하지 않고 출력 첫 줄을 Compose working directory로 사용한다.

실제 Docker 부재 응답 형태를 가짜 Docker로 반환했다.

```text
Error: No such object: samhan-auth-service
exit 1
```

스크립트는 `Environment file not found. Checked: ...`에 도달하지 않고 다음 오류로 끝났다.

```text
Cannot find drive. A drive with the name 'Error' does not exist.
```

따라서 auth container가 제거됐거나 다른 Compose container name을 쓰는 복구 환경에서는 어디를 확인해야 하는지 알 수 없다. 특히 `-PostgresContainer`를 별도로 받지만 Compose working directory 탐색은 그 값을 쓰지 않고 `samhan-auth-service`에 고정돼 있다.

### S7-MAJOR-4 — repair-only 변경에는 복구 회귀 workflow가 생성되지 않는다

`.github/workflows/applied-migration-guard.yml:6-17`의 PR/push path filter는 migration SQL, guard 본체/테스트, workflow 파일만 포함한다. 다음 두 파일은 없다.

```text
scripts/repair-flyway-checksums.ps1
scripts/repair-flyway-checksums.test.ps1
```

저장소 전체 검색에서 `repair-flyway-checksums.test.ps1`을 실행하는 다른 workflow나 build task는 없었다. 현재 PR에서는 guard 파일도 함께 바뀌어 workflow가 실행됐지만, 이후 repair-only 변경은 이 검사를 아예 실행하지 않는다.

### S7-MAJOR-5 — 15번째 새 서비스의 위반 안내는 실제 서비스명이지만 실행 불가능하다

guard는 `scripts/check-applied-migrations.ps1:100-105`에서 경로의 서비스명을 동적으로 추출한다. 따라서 main에 `services/new-service/.../V1__base.sql`이 들어간 뒤 그 파일을 편집한 fixture는 exit 1로 잡고 다음 형태를 안내한다.

```text
.\scripts\repair-flyway-checksums.ps1 -Service new-service -WhatIf
```

그러나 repair의 `scripts/repair-flyway-checksums.ps1:4-5`는 현재 14개 이름으로 고정된 `ValidateSet`을 사용한다. 위 안내를 `-WhatIf`로 실행한 결과 DB나 Docker에 닿기 전 다음 parameter binding 오류가 났다.

```text
Cannot validate argument on parameter 'Service'.
The argument "new-service" does not belong to the set ...
```

즉 “다른 DB를 건드리는 안내”는 제거됐지만, 새 서비스에서는 실제 위반 서비스를 정확히 가리키면서도 복구 명령으로는 도달하지 못한다. 현재 열거된 14개 서비스의 안내는 실행 가능한 이름이다.

## 정상 작업 도달성

| 시나리오 | 실제 | 판정 |
|---|---:|---|
| feature force-push 뒤 정상 PR topology | 0 | 통과 |
| 신규 branch 첫 push (`before=0`) | 0 | empty tree 비교 후 통과 |
| 신규 migration만 추가 | 0 | 통과 |
| migration 무관 변경 | workflow 없음 | path filter상 의도된 미실행; main branch protection 없음 |
| main 진전을 merge한 정상 PR | 0 | 통과 |
| main 위로 rebase한 정상 PR | 0 | 통과 |
| 같은 repository PR의 synthetic merge ref | 0 | 실제 run에서 통과 |
| 현재 `origin/main` 자체 | 0 | 통과 |
| main force-push + before가 최초 checkout에 없음 | 1 | 차단 |
| 위 before가 원격 targeted fetch 가능 | fetch 뒤 0 | 판정 가능했으나 현재 workflow는 fetch하지 않음 |

현재 workflow는 `fetch-depth: 0`을 명시하며 실제 run 로그도 그 입력과 `refs/remotes/pull/1137/merge` checkout을 확인했다. 따라서 GitHub Actions 기본 shallow 값 때문에 현재 PR이 무고하게 실패하는 경로는 도달하지 않았다. 별도 shallow fixture의 실패는 S7-BLOCK-1처럼 `before` 객체가 로컬에 없는 push 비교에서만 발생했다.

fork PR은 `pull_request` + base repository의 synthetic merge ref를 사용하고 guard가 remote 이름이나 repository owner를 읽지 않으므로 같은 commit graph에서는 통과한다. 이번 라운드에서 실제 외부 fork 이벤트는 만들지 않았다.

## 차단 동작 도달성

| 시나리오 | 실제 |
|---|---:|
| main 직접 push의 기존 migration 편집 | exit 1 |
| 여러 commit push의 전체 `BeforeRef..HEAD`에 남은 migration 편집 | exit 1 |
| 기존 migration 삭제 | exit 1 |
| 삭제 후 같은 경로에 다른 내용으로 재생성 | exit 1 |
| 기존 migration rename | exit 1 |
| main에 존재하는 새 서비스 디렉터리의 기존 migration 편집 | exit 1 |

다중 commit 범위는 마지막 commit 하나가 아니라 push 전 snapshot과 최종 HEAD의 전체 차이를 본다. 중간에 편집했다가 최종 HEAD에서 원본 바이트로 완전히 복원한 경우는 차단하지 않지만, 배포될 최종 checksum도 원본과 같으므로 적용 DB 손상 경로가 아니다.

현재 tracked migration은 407개이며 모두 `services/*/src/main/resources/db/migration/V*.sql` 형태였다. 삭제/rename은 old path가 filter에 포함돼 workflow trigger 대상이고 guard는 `D`/`R*`를 차단한다.

## 복구 스크립트 S5 회귀

| 항목 | 실제 |
|---|---|
| Compose working directory label의 `.env` 발견 | label 조회 성공 시 발견 |
| Compose 기준 container 부재 | **후보 안내 전 `Error:` drive 오류** |
| 명시한 `.env` 부재 | 해당 경로를 포함한 `Resolve-Path` 오류 |
| checksum + 다른 validate 오류 혼합 | repair 0건, 원문 원인 보존 |
| checksum-only 실제형 다중행 오류 | **repair 0건으로 오판 중단** |
| 현재 14개 서비스의 위반 안내 | 실제 위반 service만 `-Service <name>` 출력, parameter 허용 |
| 15번째 새 서비스의 위반 안내 | **실제 이름을 출력하지만 고정 `ValidateSet`이 거부** |
| validate 실패의 credential file | 제거 확인 |
| checksum-only 중단의 credential file | 제거 확인 |
| `WhatIf` | repair 호출 없음, credential file 제거 확인 |
| 성공 fixture | 평문 자격 argv/출력 없음, credential file 제거 |

서비스 안내는 auth-service와 별도 new-service fixture에서 위반 경로로부터 서비스명을 추출했다. 지원되는 14개 서비스의 실제 위반에서는 해당 서비스만 `-WhatIf`와 실행 명령에 나타났다. new-service 명령은 parameter binding에서 실패했다.

## 워크플로와 실패 메시지

- migration SQL 변경, guard 본체/테스트 변경, workflow 변경에서는 PR과 main push 모두 workflow가 돈다.
- migration 무관 변경에는 돌지 않는다. main은 API상 branch protection이 없으므로 skipped required check가 merge를 Pending으로 막는 상태는 아니다.
- repair 본체/테스트만 변경하면 S7-MAJOR-4로 아예 돌지 않는다.
- 기존 migration 위반 메시지는 파일, checksum 위험, 신규 migration 대안, 실제 서비스별 preview/repair 명령을 제공한다.
- missing `before` 메시지는 원인을 말하지만, CI가 targeted fetch를 하지 않아 안내만으로 같은 run을 복구할 수 없다.
- Compose inspect 실패는 S7-MAJOR-3의 PowerShell drive 오류만 보여 `.env` 확인 위치를 알 수 없다.
- checksum-only 오판은 원래 Flyway 원문을 보존하지만 정상 mismatch인지 혼합 오류인지 잘못 분류한다.

## 실행 및 증거 정리

- 제공 가드 fixture: `Flyway applied-migration guard scenarios: PASS` (Windows PowerShell 5.1).
- 제공 복구 fixture: `Flyway repair credential scenarios: PASS` (Windows PowerShell 5.1).
- 실제 GitHub Actions의 PowerShell 7 run `31236440107`: guard exit 0.
- 임시 Git graph fixture: 정상 PR/첫 push/new migration/merge/rebase 통과, 삭제·재생성/new-service 기존 migration 편집 차단.
- 임시 shallow clone: missing before exit 1 → 동일 SHA targeted fetch exit 0 → guard exit 0.
- 가짜 Docker fixture: 실제 DB 연결 없이 Compose inspect 실패와 Flyway checksum-only 다중행 출력을 재현.
- 모든 임시 fixture는 `FIXTURE_REMOVED=True`를 확인했다.
- 공유 Docker 스택 재기동·실 Docker container 실행·DB 읽기/쓰기·실 repair는 하지 않았다.
- Gradle을 실행하지 않았고 다른 트랙 daemon/process를 건드리지 않았다.
- commit·push·코드 수정은 하지 않았다. 신규 파일은 이 보고서 1개다.

## 이 라운드가 보지 않은 것

- workflow가 아직 main에 없으므로 실제 `push main` 이벤트를 새 commit으로 발생시키지 않았다. `github.event.before` 전달은 workflow 정의와 독립 Git graph로 확인했다.
- 실제 외부 fork PR을 만들지 않았다. fork/base owner와 무관한 동일 commit topology까지만 실행했다.
- force-push 이전 SHA가 GitHub 원격에서도 완전히 GC돼 targeted fetch가 실패하는 진짜 판정 불가 사례는 만들지 않았다. 그 경우 fail-closed 자체는 타당하다.
- 실제 PostgreSQL/Flyway container를 실행하지 않았고, 이미 복구된 공유 DB는 읽거나 쓰지 않았다. Flyway 출력 계약은 가짜 Docker로만 재현했다.
- 로컬에는 `pwsh` 7이 없어 제공 두 fixture를 Windows PowerShell 5.1로 실행했다. PowerShell 7은 현재 HEAD의 실제 GitHub Actions 성공 로그만 확인했다.
- OS 강제 종료나 전원 손실처럼 PowerShell `finally`가 실행되지 않는 경우의 임시 credential file 잔존은 보지 않았다.
- GitHub Actions 41/41은 조회했으며 재실행하지 않았다.
