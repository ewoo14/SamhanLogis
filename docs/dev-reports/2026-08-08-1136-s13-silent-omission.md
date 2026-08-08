# S13 — Flyway 대상 조용한 누락 수정 보고서

## 범위

PR #1137 / 이슈 #1136의 S13 fix 라운드다. S11-MAJOR-3·4만 수정했다. BLOCK-1·2와 `$unexpectedLines` 분류기는 변경하지 않았고, 실제 `flyway_schema_history`, Docker, Git에는 접근하지 않았다.

## RED-A 원문 — 수정 전 조용한 누락

fixture에 `new-service`(migration 디렉터리는 있으나 DB 매핑 없음)와 `dashboard-service`(매핑은 있으나 migration 디렉터리 없음)를 넣었다. 수정 전 전체 실행 원문은 다음과 같았다.

```text
Environment file: C:\Users\user\AppData\Local\Temp\flyway-repair-test-6cb1d7cc06bb4974832d980e757b7c59\infrastructure\.env
arologis-service: checksum mismatch versions = 1
auth-service: checksum mismatch versions = 1
```

두 서비스가 출력·대상 목록에서 사라졌고, RED-A 테스트는 종료코드 1로 실패했다.

## RED-B 원문 — 수정 전 14개 정상 회귀 울타리

별도 정상 fixture에서 fake Docker/Flyway `-WhatIf`로 전체 실행했다. migration 없는 비-Flyway `api-gateway`도 함께 두었다.

```text
accounting-service: checksum mismatch versions = 1
arologis-service: checksum mismatch versions = 1
auth-service: checksum mismatch versions = 1
dashboard-service: checksum mismatch versions = 1
dc-config-service: checksum mismatch versions = 1
groupware-service: checksum mismatch versions = 1
inventory-service: checksum mismatch versions = 1
notification-service: checksum mismatch versions = 1
partner-auth-service: checksum mismatch versions = 1
partner-order-service: checksum mismatch versions = 1
partner-service: checksum mismatch versions = 1
product-service: checksum mismatch versions = 1
slip-service: checksum mismatch versions = 1
user-service: checksum mismatch versions = 1
```

14개 정상 실행의 내부 종료코드는 0이었다.

## 수정 내용

서비스 디렉터리를 전부 순회해 다음처럼 discovery한다.

- 매핑 서비스 + migration 디렉터리 있음: 기존 target으로 추가
- 매핑 서비스 + migration 디렉터리 없음: 서비스명·사유·경로를 출력하고 fail-closed
- 매핑 없음 + migration 디렉터리 있음: 서비스명·사유·경로를 출력하고 fail-closed
- 매핑 없음 + migration 디렉터리 없음: `api-gateway`, `eureka-server`, `logging-service` 같은 비-Flyway 서비스로 간주해 정상 실행 유지

`$unexpectedLines` 분류기는 손대지 않았다.

## 동시 GREEN 원문

실행 명령은 `& .\scripts\repair-flyway-checksums.test.ps1`이며 종료코드는 `EXIT_CODE=0`이다.

RED-A fixture:

```text
Service discovery failed; resolve the omitted service(s) before running Flyway repair.
dashboard-service (migration directory not found): ...\services\dashboard-service\src\main\resources\db\migration
new-service (no database mapping): ...\services\new-service\src\main\resources\db\migration
```

정상 14개 fixture:

```text
accounting-service: checksum mismatch versions = 1
arologis-service: checksum mismatch versions = 1
auth-service: checksum mismatch versions = 1
dashboard-service: checksum mismatch versions = 1
dc-config-service: checksum mismatch versions = 1
groupware-service: checksum mismatch versions = 1
inventory-service: checksum mismatch versions = 1
notification-service: checksum mismatch versions = 1
partner-auth-service: checksum mismatch versions = 1
partner-order-service: checksum mismatch versions = 1
partner-service: checksum mismatch versions = 1
product-service: checksum mismatch versions = 1
slip-service: checksum mismatch versions = 1
user-service: checksum mismatch versions = 1
Flyway repair credential scenarios: PASS
```

명시 실행도 검증했다. `-Service new-service`는 `no database mapping`, `-Service dashboard-service`는 `migration directory not found`를 출력하고 fail-closed 했다.

## 필수 3절

### ① 새로 가능해진 상태·환경 조합과 결과

| 상태 | 결과 |
|---|---|
| 매핑 + migration 있음 | 기존 처리, 성공 |
| 매핑 + migration 없음 | 사유·경로 출력 후 fail-closed |
| 매핑 없음 + migration 있음 | 사유·경로 출력 후 fail-closed |
| 매핑 없음 + migration 없음 | 비-Flyway 서비스로 조용히 제외, 정상 실행 유지 |
| 명시 대상이 누락 상태 | 해당 서비스 진단 후 fail-closed |
| 현재 14개 전체 | 14개 모두 처리, 종료코드 0 |

### ② 제거·이동·개명한 식별자 grep 전수 확인

제거·이동·개명한 production 식별자는 없다. `rg`로 `new-service`, `dashboard-service`, `$unexpectedLines`, checksum 분류 anchor를 확인했고 모두 의도한 fixture 또는 기존 코드에 존재한다. 분류기 현재 anchor는 `repair-flyway-checksums.ps1:150-166`이며 삽입부가 앞에 추가되어 줄번호만 이동했다.

### ③ 바꾼 파일을 참조하는 테스트 전부 실행 결과

- `scripts/repair-flyway-checksums.test.ps1`: PASS, 종료코드 0
- 두 PowerShell 파일 parse error: 각 0건
- `scripts/check-applied-migrations.test.ps1`: 실행하지 않음. 내부에서 `git init`, `git commit`, `git clone` 등을 직접 실행하므로 이번 라운드의 명시적 Git 명령 금지와 충돌한다. workflow의 repair script/test 경로 문자열은 정적 `rg`로 확인했다.

## 변경 파일

수정: `scripts/repair-flyway-checksums.ps1`, `scripts/repair-flyway-checksums.test.ps1`

신규: `docs/dev-reports/2026-08-08-1136-s13-silent-omission.md`
