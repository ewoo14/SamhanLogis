# PR #1137 / 이슈 #1136 — S4 main push·자격 증명 fix

## 범위와 안전 제약

- 커밋·push 하지 않음.
- 공유 Docker 스택 재기동·공유 DB 쓰기 없음.
- 복구 스크립트 검증은 fake Docker 및 `-WhatIf` preview로만 수행.

## RED 원문

### ① main 직접 push 가드

기존 가드에 push 이전 SHA 연결이 없고 `origin/main == HEAD`인 상황을 재현했다. 첫 push all-zero SHA는 다음 오류로 중단됐다.

```text
fatal: Invalid symmetric difference expression 0000000000000000000000000000000000000000...HEAD
```

또한 기존 workflow에는 `github.event.before` 또는 동등한 이전 SHA 전달이 없었다.

### ② 복구 스크립트 자격 노출

잘못된 자격으로 fake Docker validation 실패를 유도했을 때 기존 Docker 인자 기록에 다음과 같이 평문이 포함됐다.

```text
run --rm --network samhan-net ... -e FLYWAY_PASSWORD=<redacted> ... validate
```

실패 원인은 유지하되 보고서에는 자격을 `<redacted>`로만 기록한다.

## 수정 내용

### main push 기준점

- workflow의 `push` 실행은 `github.event.before`를 `PUSH_BEFORE_SHA`로 전달한다.
- 가드는 `-BeforeRef`가 있으면 `BeforeRef..HEAD` 전체 범위를 검사한다.
- PR 경로는 기존 `origin/main...HEAD` 비교를 유지한다.
- all-zero 이전 SHA는 빈 tree 기준으로 처리한다.
- force-push로 이전 SHA가 로컬에 없으면 경고 후 non-blocking PASS를 반환한다.

따라서 신규 migration 추가·무관한 변경·현재 main·merge/rebase/force-push의 무고한 경로는 통과하고, push 범위의 이미 적용된 migration 수정·삭제·이름변경은 실패한다.

### 복구 자격 전달

- `FLYWAY_URL`, `FLYWAY_USER`, `FLYWAY_PASSWORD`는 임시 env-file로 전달한다.
- Docker 프로세스 인자에는 env-file 경로만 남고 비밀번호는 남지 않는다.
- Docker stdout/stderr 및 예외 메시지에는 알려진 비밀번호를 `<redacted>`로 치환한다.
- validation 실패 원인 메시지는 보존한다.
- 성공 repair, validation 실패, `-WhatIf` preview 모두 finally에서 임시 env-file을 삭제한다. cleanup은 `WhatIf`에 막히지 않는다.

## 검증

실행한 명령:

```powershell
& .\scripts\check-applied-migrations.test.ps1
& .\scripts\repair-flyway-checksums.test.ps1
git diff --check
git diff --stat
git diff --numstat
```

결과:

- `Flyway applied-migration guard scenarios: PASS`
- `Flyway repair credential scenarios: PASS`
- `git diff --check`: 오류 없음
- 복구 테스트: 잘못된 자격 실패 원인 보존, argv/stdout/stderr/예외의 평문 자격 없음, `-WhatIf` env-file cleanup, fake Docker repair 수행을 확인
- `git diff --stat`: **99 insertions, 19 deletions** — 삭제 줄 수 **19**

## 변경·신규 파일

변경:

- `.github/workflows/applied-migration-guard.yml`
- `scripts/check-applied-migrations.ps1`
- `scripts/check-applied-migrations.test.ps1`
- `scripts/repair-flyway-checksums.ps1`

신규:

- `scripts/repair-flyway-checksums.test.ps1`
- `docs/dev-reports/2026-08-08-1136-s4-main-push-and-credential-fix.md` (본 보고서)

기존에 있던 미추적 S3 adversarial report는 수정하지 않았다.
