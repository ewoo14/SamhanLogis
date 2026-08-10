# PR #1137 / 이슈 #1136 — 슬라이스 2 재발 방지 CI 가드

## 결과

`origin/main`에 이미 존재하는 `**/db/migration/V*.sql`에 대해 PR이 `M`, `D`, `R`을 만들면 CI를 실패시키는 가드를 추가했다. 신규 `A`와 마이그레이션 무관 변경은 허용한다. 서비스명이나 고정 경로 목록은 사용하지 않는다.

실측 기준 `origin/main`의 마이그레이션은 407개 파일, 14개 디렉터리이며 `arologis-service`도 포함된다.

## RED-first 원문

가드 파일이 없는 상태에서 시나리오 테스트를 실행했다.

```text
The term '...\\scripts\\check-applied-migrations.ps1' is not recognized as the name of a cmdlet, function, script file, or operable program.
```

이후 테스트 fixture를 보정해 `origin/main`에 있는 migration을 수정·삭제·rename한 커밋을 만들고, 신규 migration·무관 변경·현재 main 상태를 각각 검증했다.

## 구현 파일

- `scripts/check-applied-migrations.ps1`
  - `origin/main...HEAD` diff를 읽는다.
  - 기준 migration 원본 경로의 `M`, `D`, `R`만 차단한다.
  - 실패 메시지에 상태·파일, 체크섬/기동 불가 원인, 새 migration 대안, 주석 변경 금지, repair 스크립트를 포함한다.
- `scripts/check-applied-migrations.test.ps1`
  - RED-B: 수정·삭제·이름변경 차단.
  - RED-A: 신규 migration·무관 변경·현재 main 통과.
- `.github/workflows/applied-migration-guard.yml`
  - 전체 Git 이력을 checkout해 `origin/main`을 확보한다.
  - migration 패턴을 서비스명 열거 없이 트리거한다.

## 검증

```text
scripts/check-applied-migrations.ps1 -BaseRef origin/main  PASS
scripts/check-applied-migrations.test.ps1                  PASS
```

특히 현재 `origin/main` 상태에서 `PASS`가 확인됐다. 현재 PR의 기준 diff에도 migration 변경은 없다.

## diff 통계

`git diff --stat origin/main...HEAD` 기준 기존 추적 파일의 삭제 줄 수는 **0**이다. 이번 슬라이스 신규 파일도 삭제 없이 추가만 했으므로 전체 변경의 삭제 줄 수는 **0**이다.

Docker 스택 재기동, DB 쓰기, 커밋, push는 수행하지 않았다.
