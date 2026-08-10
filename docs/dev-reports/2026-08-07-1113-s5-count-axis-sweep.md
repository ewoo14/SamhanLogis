# PR #1119 / 이슈 #1113 — S5 count/port 축 sweep

## 결론

- PowerShell 5.1 pipeline 집계는 결과를 `@(...)`로 감싼 뒤 `.Count`를 읽도록 정리했다.
- Notion importer는 `smoke-test-helpers.ps1`의 `Get-SmokeFailureCount`를 사용한다. 단일 실패도 공백이 아니라 `1`로 출력된다.
- `seed-local-stack.ps1`의 auth 사전 health는 `$authServiceBaseUrl`을 사용하므로 `SAMHAN_AUTH_PORT` override를 따른다.
- 기본 계정 DC 403은 (나) 권한 설정 문제로 판정했다. 코드에서 권한을 완화하거나 기본 계정을 바꾸지 않았다.

## 축 sweep 방법

목록을 임의로 고른 것이 아니라 다음 패턴을 전수 검색했다.

```powershell
rg -n --glob '*.ps1' '\.Count' tools/operational-validation scripts infrastructure/scripts
rg -n --glob '*.ps1' '=.*\|' tools/operational-validation scripts infrastructure/scripts .
rg -n --glob '*.ps1' 'localhost:[0-9]+|SAMHAN_.*PORT|DefaultPort|Resolve-.*Port' tools/operational-validation scripts infrastructure/scripts
```

판정 기준은 pipeline 또는 cmdlet 결과가 0/1/다건일 때 scalar가 되어 `.Count`가 사라지는지였다. 이미 `@(...)`로 감싼 값, 배열/hashtable의 고정 필드, 문자열 분할 결과의 길이 검사는 집계 축의 결함으로 세지 않고 근거를 기록했다.

## count 전수 목록 및 실측

| 위치 | 축 판정 | 0건 | 1건 | 다건 | 조치 |
|---|---|---:|---:|---:|---|
| `tools/operational-validation/run-smoke-tests.ps1:197` health 실패 pipeline | 취약 | 0 | 1 | 2 | `@(...)` 추가 |
| `tools/operational-validation/import-notion-csv.ps1:443` 실패 pipeline | 취약 | 0 | 1 | 2 | `Get-SmokeFailureCount` 사용 |
| `tools/operational-validation/import-notion-csv.ps1:442` 성공 pipeline | 취약 | 0 | 1 | 3 | `@(...)` 추가 |
| `tools/operational-validation/smoke-test-helpers.ps1:22` 공통 helper | 수정 완료 패턴 | 0 | 1 | 2 | 회귀 기준으로 유지 |
| `infrastructure/scripts/operational-validation.ps1` 파일 검색 결과(MockMail/Smtp/Aligo/CSV/Hometax/backup/BaseEntity/Pretendard/manual/S3/V1) | 취약 가능 scalar 결과 | 0 | 1 | 3 | 검색 결과를 `@(...)`로 정규화 |
| `infrastructure/scripts/validate-config-audit.ps1:107,192-196` Java/compose 결과 | 취약 가능 scalar 결과 | 0 | 1 | 2 | `@(...)`로 정규화 |
| `scripts/generate-sp-08-4-4-order-print-form-screenshots.ps1:161` 누락 파일 pipeline | 취약 | 0 | 1 | 2 | `@(...)` 추가 |
| `scripts/probe-896-s2-fresh-postgres.ps1:12` migration 파일 pipeline | 취약 | 0 | 1 | 3 | `@(...)` 추가 |

실측은 `tools/operational-validation/test-s5-count-and-port.ps1`에서 수행했다. 결과:

```text
0건 pipeline 집계 = 0
1건 pipeline 집계 = 1
다건 [FAIL, OK, NON_200] = 2
S5 count/port regression checks passed
```

반복문 인덱스에 쓰이는 `.Count`, 명시적으로 배열을 만든 `$results/$rows/$serviceNames`, `Measure-Object`의 Count는 scalar pipeline 반환 함정이 아니므로 별도 변경하지 않았다.

## (가)/(나)/(다) 판정 — Notion DC 403

판정: **(나) 기본 계정에 DC 권한이 있어야 하나 현재 권한 설정이 부족하다. 코드 문제가 아니다.**

근거:

- importer 기본값은 `kimmiseon`이며 `OrgChartSeeder.java:59`에서 `대표실`, `MASTER`로 seed된다.
- DC import controller는 `대표실` 부서와 `dc-config.import CREATE`를 동시에 요구한다 (`DcConfigImportController.java:62-63`).
- 권한 seed는 `V29__seed_sp_d6_1_page_codes.sql:12`에서 해당 페이지를 MASTER 전용으로 seed한다.
- S4 실측은 기본 계정이 DC만 403, 대표실 계정을 명시하면 4/4였다.

따라서 (가)/(다)처럼 importer의 기본 LoginId를 바꾸지 않았다. 권한을 느슨하게 만들어 4/4로 만드는 변경도 하지 않았다. 계정/권한 데이터 정합성 조치가 필요하면 별도 운영 권한 작업이다.

## port 축 전수

| 위치 | 결과 |
|---|---|
| `tools/operational-validation/run-smoke-tests.ps1` | service별 `SAMHAN_*_PORT` → health probe → fallback 순서가 이미 공통화되어 있음 |
| `tools/operational-validation/import-notion-csv.ps1` | importer service 4종과 gateway가 `Resolve-ImportServicePort`/gateway resolver 사용 |
| `scripts/seed-local-stack.ps1` | gateway/auth/accounting URL은 resolver 사용; auth health의 리터럴 `8081` 제거 |
| `scripts/launch-local-stack.ps1` | eureka/gateway/auth/dashboard health와 출력 URL을 `local-stack-port.ps1` resolver로 변경 |
| `scripts/run-load-test.ps1` | gateway login/health를 `SAMHAN_API_GATEWAY_PORT` 기반으로 변경 |
| `infrastructure/scripts/start-local-full.ps1` | 서비스 health loop가 `envVar`와 resolved `$svc.port`를 이미 사용 |
| `scripts/seed-local-stack.ps1:70-74` | 사용자 지시대로 리터럴 5건은 건드리지 않음 |
| Prometheus/Grafana/MinIO/웹 UI URL 및 `phase11-deploy.ps1` 원격 readiness | local service port override 대상이 아닌 고정 인프라/배포 endpoint로 분류; 이번 수정 대상 아님 |

## RED-A / RED-B

- RED-A count: GREEN. Notion 단일 실패는 숫자 `1`로 집계되고, 0/1/다건 회귀 하네스가 통과했다.
- RED-A auth port: GREEN. `Resolve-LocalStackPort('8181', 8081) = 8181` 실측 및 seed 정적 회귀 확인.
- RED-A 전수 목록: 위 count/port 표에 기록했다.
- RED-B 권한 경계: 코드에서 권한/헤더/endpoint guard를 변경하지 않았다. S4가 확인한 `401/401/403/200`, 전체 위조 차단, 7/8·404 3종·14 health·5계정 login baseline은 보존된다.

## 검증

- `tools/operational-validation/test-s5-count-and-port.ps1` — PASS
- `git diff --check` — PASS
- 변경한 PowerShell 파일의 정적 `.Count`/port 재-sweep 수행
- 컨테이너 재빌드·기동·다른 워크트리·commit/push는 수행하지 않음

## 신규 파일 목록

- `tools/operational-validation/test-s5-count-and-port.ps1`
- `docs/dev-reports/2026-08-07-1113-s5-count-axis-sweep.md`
