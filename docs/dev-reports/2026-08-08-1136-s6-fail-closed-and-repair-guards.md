# PR #1137 / 이슈 #1136 — S6 fail-closed 및 복구 가드

## 결론

S5 차단 1건과 도달 결함 3건을 테스트 우선으로 수정했다. 커밋·push, 공유 Docker 재기동, 실제 DB 접근/복구는 하지 않았다.

## RED 원문

수정 전 테스트에서 확인한 실패는 다음과 같다.

```text
force-push missing previous SHA: expected exit 1, got 0
WARN: ... 이전 SHA가 소실된 경우이므로 검사를 건너뜁니다.
PASS: 비교 기준 부재로 ... 변경을 판정하지 않음.
```

```text
Join-Path : Cannot find drive. A drive with the name
'com.docker.compose.project.working_dir=C' does not exist.
```

```text
repair ran despite a non-checksum validate error:
... validate
... repair
```

기존 migration 위반 안내에는 `repair-flyway-checksums.ps1`만 있고 위반 서비스/DB 대상이 없어, auth가 아닌 서비스의 DB에 그대로 유효한 명령인지 판정할 수 없었다.

## 변경 내용

- 비교 기준을 얻지 못하면 guard는 `FAIL`과 함께 exit 1로 종료한다. all-zero 첫 push만 empty tree를 사용해 정상 통과한다.
- PR 비교(`BeforeRef` 없음)는 `origin/main`을 계속 사용한다. 따라서 PR force-push는 reachable한 현재 `origin/main`과 비교되며 정상 변경을 막지 않는다. push 이벤트에서 이전 SHA가 소실되고 대체 기준도 없는 경우만 fail-closed로 막고, SHA 복구 또는 전체 이력 fetch 후 재실행하도록 안내한다.
- Compose label map 전체를 경로로 사용하지 않고 `com.docker.compose.project.working_dir` label 값만 조회한다.
- 기본 env 탐색 실패 시 확인한 후보 경로를 오류에 출력한다.
- validate 출력에 checksum 이외의 오류가 섞이면 repair를 호출하지 않고 원문을 보고한다. checksum mismatch가 없으면 repair 자체도 호출하지 않는다.
- 14개 migration service와 DB 이름을 명시하고 `-Service` 선택을 추가했다. guard의 안내는 위반 경로에서 추출한 서비스에 대한 `-WhatIf`/실행 명령만 출력한다.
- 자격값은 기존처럼 임시 `--env-file`에만 두고 argv/출력 redaction 및 `finally` 정리를 유지했다.

## RED-A / RED-B 검증

| 조합 | 결과 |
|---|---|
| force-push 직후 정상 PR 기준 비교 | 통과: `BeforeRef` 없는 PR은 `origin/main` 비교 |
| 신규 브랜치 첫 push (`before=0`) | 통과: empty tree 기준 exit 0 |
| 소실된 이전 SHA | 통과: exit 1, 복구/fetch 후 재실행 안내 |
| `.env` 자동 탐색 성공 | 통과: Compose working directory의 `.env` 사용 |
| `.env` 미탐색 | 통과: `Environment file not found`와 확인 경로 출력 |
| checksum + 다른 validate 오류 혼합 | 통과: validate 오류 보고, repair argv 0건 |
| 서비스별 repair 안내 | 통과: `-Service <실제 서비스>`만 안내 |
| 자격 성공/실패/WhatIf/정상 중단 경로 | 기존 S5 회귀 유지 |

실행한 테스트:

```text
Flyway applied-migration guard scenarios: PASS
Flyway repair credential scenarios: PASS
```

두 테스트 모두 fake Git/fake Docker만 사용했다. 실제 DB에 repair를 실행하지 않았고, WhatIf 외 복구 실행도 하지 않았다.

## 신규 파일 및 변경 통계

- 신규 파일: `docs/dev-reports/2026-08-08-1136-s6-fail-closed-and-repair-guards.md`
- 기존 미추적 S5 보고서 `docs/dev-reports/2026-08-08-1136-s5-reconvergence.md`는 변경하지 않았다.
- 현재 `git diff --stat` 기준 삭제 줄 수: **91**
- 커밋/push: 하지 않음
