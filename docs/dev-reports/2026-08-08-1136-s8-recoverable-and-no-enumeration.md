# PR #1137 / 이슈 #1136 — S8 복구 가능 판정·서비스 열거 제거

## 결론

S7 차단 1건과 도달 결함 4건을 수정했다. 커밋·push·Docker 재기동·DB 쓰기는 하지 않았다.

## 변경 사항

- 비교 기준 SHA가 로컬에 없으면 `origin`에서 해당 객체를 최대 20초 동안 targeted fetch한다. fetch 성공 후 정상 비교하고, 실패·타임아웃이면 기존 fail-closed를 유지한다.
- Flyway validate 출력은 checksum mismatch 본문과 표준 상세행(`Applied to database`, `Resolved locally`), validate 헤더만 checksum-only로 인정한다. 다른 오류행이 섞이면 원문을 보고하고 repair하지 않는다.
- Compose inspect가 실패하거나 경로가 아니면 그 출력을 경로로 사용하지 않고 `.env` 후보 목록 안내로 진행한다.
- repair 스크립트와 테스트 변경도 Applied Flyway Migration Guard workflow를 실행하도록 PR/push path에 추가했다.
- `ValidateSet`과 14개 서비스 배열을 제거하고, `services/*/src/main/resources/db/migration` 디렉터리를 가진 서비스만 실행 시 계산한다. DB명은 서비스명에서 `-`를 `_`로 바꿔 계산한다. migration 디렉터리가 없는 서비스는 제외한다.
- 테스트용 `-RepoPath`를 추가해 동적 서비스 계산을 격리 fixture에서 검증했다.

## RED 원문

수정 전 테스트에서 다음 실패를 확인했다.

```text
recoverable missing previous SHA: expected exit 0, got 1
FAIL: 비교 기준 커밋을 로컬에서 찾지 못했습니다(...).

missing env failure did not explain checked paths: Cannot find drive. A drive with the name 'Error' does not exist.

checksum-only multiline output did not repair: auth-service validate failed for a reason other than a checksum mismatch

Cannot validate argument on parameter 'Service'. The argument "new-service" does not belong to the set ... specified by the ValidateSet attribute.

repair-only changes do not trigger the workflow
```

## 검증

- `scripts/check-applied-migrations.test.ps1` — PASS
- `scripts/repair-flyway-checksums.test.ps1` — PASS
- PowerShell parser 검사 4개 스크립트 — PASS
- checksum-only 다중행 — 실제 fake Docker `repair` 호출 확인
- fetch 성공·fetch 실패 fail-closed 경로 — fixture 확인
- 신규 서비스 및 migration 없는 서비스 계산 — fixture 확인
- 평문 자격 증명 — 기존 credential fixture 회귀 PASS

## diff 통계

`git diff --stat`: **109 insertions, 16 deletions**. 삭제 줄 수는 **16줄**이다.

변경 파일 5개이며, S8 신규 보고서 파일 1개를 추가했다. 기존 S7 보고서 `docs/dev-reports/2026-08-08-1136-s7-reconvergence.md`는 사용자 작업물로 보존했다.
