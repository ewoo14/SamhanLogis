# #1113 S27 — `SAMHAN_SEED_TEST_DATA` 호출자 환경 복원

## 결론

`start-local-full.ps1`이 진입 시점의 `SAMHAN_SEED_TEST_DATA` 존재 여부와 값을 저장하고, 전체 실행 경로를 `try/finally`로 감쌌다. 스크립트가 정상 종료하거나 terminating error/중단 경로로 빠져도, 진입 전에 있던 값은 복원하고 진입 전에 없었던 변수는 제거한다.

`-RunSeed`의 `true` 대입, product/inventory compose 배선, inventory validator fail-fast 계약은 변경하지 않았다.

## RED → GREEN

먼저 추가한 `scripts/lib/s27-seed-env-scope-contract.test.cjs`의 RED 결과:

- RED-A: PASS — 기존 `-RunSeed` 대입 및 환경파일 로드 계약이 유지됨.
- RED-B: FAIL — 진입 전 상태 캡처와 `finally` 복원 계약이 없어 2건 실패.

수정 후:

- S27 계약: 3/3 PASS
- 기존 `s23-toggle-exitcode-contract.test.cjs`: 6/6 PASS
- Windows PowerShell 5.1 parser: PASS
- `git diff --check`: PASS

## 조합별 확인

| 조합 | 기대 결과 | 확인 |
|---|---|---|
| 중간 예외 | 진입 전 상태 복원 | `finally` 복원 계약 고정 |
| Ctrl+C 중단 | 진입 전 상태 복원 | `finally` 복원 계약 고정 |
| 진입 전 `true` | 종료 후 `true` | 원래 값 복원 분기 고정 |
| 진입 전 미설정 | 종료 후 미설정 | `Remove-Item` 분기 고정 |
| `-RunSeed` 없음 | toggle 원래 상태 보존 | 복원을 `-RunSeed` 조건 밖에 둔 계약 고정 |

실제 Docker/seed 실행은 개발책임자 지시대로 하지 않았다. PowerShell 7은 호스트에 설치되어 있지 않아 해당 파서 검증은 생략했고, Windows PowerShell 5.1 파서 검증으로 대체했다.

## 변경 범위

- 수정: `infrastructure/scripts/start-local-full.ps1`
- 신규: `scripts/lib/s27-seed-env-scope-contract.test.cjs`
- 신규: 본 보고서
- `s23-toggle-exitcode-contract.test.cjs`의 기존 단정은 수정하지 않음.
- `git diff --stat` 기준 삭제 줄 수: **0**

커밋·push·공유 Docker stack 재기동·seed 실행·DB 직접 쓰기는 하지 않았다. 이 라운드에서 Gradle daemon이나 서비스 프로세스는 시작하지 않았다.
