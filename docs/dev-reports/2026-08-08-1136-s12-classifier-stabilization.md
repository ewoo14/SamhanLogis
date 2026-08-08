# PR #1137 / 이슈 #1136 — S12 classifier stabilization 조사 보고서

## 결론

S12 fix를 저장하지 않았다. S11의 네 진단은 모두 코드와 실제 경로에서 맞았지만, 결함 2를 안전하게 닫을 판정 근거를 찾지 못했다.

Flyway 10.10.0의 `validate`는 적용 migration 파일을 `THIS IS NOT VALID SQL;`로 바꾼 경우에도 주석만 바꾼 경우와 똑같이 `CHECKSUM_MISMATCH`를 반환한다. 자유 텍스트 허용목록을 JSON으로 바꾸어도 이 정보는 추가되지 않는다. 이 상태에서 checksum mismatch이면 repair를 허용하면 손상 SQL이 열리고, 허용하지 않으면 checksum-only 복구가 막힌다. 따라서 현재 요구된 ①~③을 동시에 만족한다고 주장하는 변경은 근거 없는 fail-open이다.

실제 원본 콘텐츠 또는 신뢰 가능한 기준 버전과의 비교를 추가로 정해야 다음 라운드에서 구현할 수 있다. 이번 라운드에는 production script와 기존 테스트를 변경하지 않았다.

## RED-A 원문 — 정상·checksum-only 경로가 현재 실패

### 정상

실제 Flyway 10.10.0, 실제 `auth_db` validate 전문:

```text
WARNING: Storing migrations in 'sql' is not recommended and default scanning of this location may be deprecated in a future release
WARNING: This version of Flyway is out of date. Upgrade to Flyway 13.2.0: https://rd.gt/3rXiSlV
Flyway OSS Edition 10.10.0 by Redgate
See release notes here: https://rd.gt/416ObMi
Database: jdbc:postgresql://postgres:5432/auth_db (PostgreSQL 16.14)
Successfully validated 96 migrations (execution time 00:00.267s)
EXIT_CODE=0
repair preview 판정 EXIT_CODE=1
```

현재 줄 허용목록이 `Successfully validated ...`를 unexpected로 세기 때문이다.

### checksum mismatch 뿐

실제 적용 V1에 주석만 추가한 뒤 실행한 실제 Flyway 전문:

```text
ERROR: Validate failed: Migrations have failed validation
Migration checksum mismatch for migration version 1
-> Applied to database : -670111044
-> Resolved locally    : 400076994
Either revert the changes to the migration, or run repair to update the schema history.
Need more flexibility with validation rules? Learn more: https://rd.gt/3AbJUZE
repair preview: What if: Performing the operation "Flyway repair (checksum metadata only)" on target "auth-service".
RED-A_EXIT_CODE=0
```

이 전문은 S10에서 고정된 실제 Flyway 출력이다. 정상 전문은 현재 실패하지만 mismatch 전문은 preview까지 도달한다.

## RED-B 원문 — 손상 SQL이 현재 통과

실제 `auth_db`의 적용 `V1__init_account.sql` 전부를 `THIS IS NOT VALID SQL;`로 교체하고 validate한 실제 전문:

```text
ERROR: Validate failed: Migrations have failed validation
Migration checksum mismatch for migration version 1
-> Applied to database : -670111044
-> Resolved locally    : 166554633
Either revert the changes to the migration, or run repair to update the schema history.
DAMAGED_APPLIED_MIGRATION_WHATIF_EXIT_CODE=0
```

현재 분류기는 checksum mismatch 행과 허용된 주변 행만 보고 `Flyway repair (checksum metadata only)`에 도달시킨다. 손상 SQL의 내용은 판정에 들어가지 않는다.

## 실제 구조화 출력 조사

자유 텍스트의 대안으로 Flyway 10.10.0의 `-outputType=json validate`를 실제 실행했다.

정상:

```json
{
  "errorDetails": null,
  "invalidMigrations": [],
  "validationSuccessful": true,
  "validateCount": 96,
  "flywayVersion": "10.10.0",
  "database": "auth_db",
  "warnings": [],
  "operation": "validate"
}
```

손상 SQL:

```json
{
  "errorDetails": {"errorCode":"VALIDATE_ERROR","errorMessage":"Migrations have failed validation"},
  "invalidMigrations": [{
    "version":"1",
    "errorDetails": {
      "errorCode":"CHECKSUM_MISMATCH",
      "errorMessage":"Migration checksum mismatch for migration version 1\n-> Applied to database : -670111044\n-> Resolved locally    : 166554633\nEither revert the changes to the migration, or run repair to update the schema history."
    }
  }],
  "validationSuccessful": false,
  "validateCount": 0,
  "flywayVersion":"10.10.0",
  "database":"auth_db",
  "warnings":[],
  "operation":"validate"
}
```

주석만 변경한 경우에도 JSON의 판정은 동일하고 `errorCode`도 `CHECKSUM_MISMATCH`이다. 따라서 JSON은 정상 성공·접속 오류·checksum 판정을 자유 텍스트보다 안정적으로 읽게 해 주지만, checksum mismatch의 원인이 주석인지 실행 불가능 SQL인지 구분하지 못한다.

접속 불가 실제 출력도 JSON root `error`와 종료코드 1로 분리된다.

```json
{"error":{"errorCode":"CONFIGURATION","message":"Unable to connect to the database..."}}
DB_UNREACHABLE_EXIT_CODE=1
```

## 판정 근거와 자유 텍스트 대비 안정성

구조화 JSON의 `validationSuccessful`, `invalidMigrations[].errorDetails.errorCode`, root `error`, 그리고 종료코드를 근거로 삼는 것이 올바른 방향이다. 필드 의미와 종료코드가 Flyway CLI 계약에 속하므로 `Successfully validated` 같은 문장 변화·경고 추가·문구 순서 변화에 덜 민감하다.

그러나 이 근거는 checksum mismatch의 종류까지 제공하지 않는다. 손상 SQL을 거부하려면 다음 중 하나가 추가로 필요하다.

1. 적용 당시 migration 원본을 기준 버전/아카이브에서 읽어 현재 파일과 비교한다.
2. 신뢰 가능한 SQL parser 또는 격리 DB에서 migration SQL 자체를 검증한다.
3. checksum repair를 checksum-only 변경으로 제한한다는 별도 계약과 그 계약의 원본 콘텐츠 입력을 도입한다.

현재 저장소와 Flyway 출력에는 이 세 근거가 없다. 임의 SQL 키워드 정규식은 현재의 자유 텍스트 허용목록을 다른 형태로 재현할 뿐이므로 채택하지 않았다.

## ① 새로 가능해진 상태·환경 조합과 결과

| 상태·환경 | 결과 |
|---|---|
| 정상 validate, 실제 Flyway text | 현재 preview exit 1 — S11-BLOCK-1 재현 |
| 정상 validate, 실제 Flyway JSON | `validationSuccessful=true`, 안정적 성공 근거 확보 |
| checksum-only 변경, 실제 Flyway text/JSON | `CHECKSUM_MISMATCH`, preview exit 0 |
| 손상 SQL, 실제 Flyway text/JSON | checksum-only와 동일 판정 — 안전한 fix 불가 |
| DB 접속 불가, 실제 Flyway JSON | root `error`, exit 1 — repair 거부 가능 |
| 매핑 외 신규 서비스 | 현재 전체 대상에서 누락, 명시 실행 차단 — S11-MAJOR-3 재현 |
| 매핑 서비스 migration 디렉터리 없음 | 현재 전체 대상에서 누락 — S11-MAJOR-4 재현 |

실제 `flyway_schema_history`에는 repair를 실행하지 않았고, Docker 재기동·재배포도 하지 않았다.

## ② 제거·이동·개명 식별자 grep 전수 결과

이번 라운드는 production 파일을 변경하지 않았으므로 제거·이동·개명한 식별자는 없다.

```text
REMOVED_IDENTIFIERS=0
MOVED_IDENTIFIERS=0
RENAMED_IDENTIFIERS=0
```

QA 잔재 DB(`slip_db_qa_e2estimate`, `sol951_*`)도 검색·삭제·서비스 매핑에 사용하지 않았다.

## ③ 바꾼 파일을 참조하는 테스트 전부 실행 결과

바꾼 production 파일이 없으므로 해당 테스트 실행 대상은 없다.

```text
CHANGED_PRODUCTION_FILES=0
REFERENCING_TESTS=0
```

## 동시 GREEN 원문

```text
NOT_RUN: RED-A와 RED-B를 동시에 GREEN이라고 보고할 수 있는 안전한 판정 근거가 없음.
```

## 신규 파일 목록

```text
docs/dev-reports/2026-08-08-1136-s12-classifier-stabilization.md
```

