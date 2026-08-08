# #1113 S9 — port 축 resolver·guard

## 채택한 설계와 이유

S8의 부분 resolver와 분산 map을 제거하고 `scripts/lib/local-stack-port.ps1`를
서비스 이름·환경변수·기본값의 단일 진실원으로 승격했다. 소비자는 숫자나 환경변수명을
직접 조합하지 않고 `Get-LocalStackPort -Service <name>`만 호출한다. 알 수 없는 이름과
유효하지 않은 override는 즉시 throw한다.

목록 기반 가드가 새 파일을 놓친 전례가 있으므로, `git ls-files -- '*.ps1'`로 매번
tracked PowerShell 전체를 발견하고 URL/port 구성 문맥의 알려진 서비스 port 리터럴을
검사한다. 정본과 비-runtime artwork/deployment 문맥만 이유가 적힌 예외로 남겼다.

## resolver 매핑 정본

| service | environment | default |
|---|---|---:|
| eureka-server | SAMHAN_EUREKA_PORT | 8761 |
| api-gateway | SAMHAN_API_GATEWAY_PORT | 8080 |
| auth-service | SAMHAN_AUTH_PORT | 8081 |
| logging-service | SAMHAN_LOGGING_PORT | 8082 |
| user-service | SAMHAN_USER_PORT | 8083 |
| product-service | SAMHAN_PRODUCT_PORT | 8084 |
| inventory-service | SAMHAN_INVENTORY_PORT | 8085 |
| slip-service | SAMHAN_SLIP_PORT | 8086 |
| accounting-service | SAMHAN_ACCOUNTING_PORT | 8087 |
| partner-order-service | SAMHAN_PARTNER_ORDER_PORT | 8088 |
| dc-config-service | SAMHAN_DC_CONFIG_PORT | 8089 |
| partner-auth-service | SAMHAN_PARTNER_AUTH_PORT | 8091 |
| groupware-service | SAMHAN_GROUPWARE_PORT | 8092 |
| notification-service | SAMHAN_NOTIFICATION_PORT | 8093 |
| dashboard-service | SAMHAN_DASHBOARD_PORT | 8094 |
| partner-service | SAMHAN_PARTNER_PORT | 8095 |
| arologis-service | SAMHAN_AROLOGIS_PORT | 8097 |

## 경유하게 바꾼 전수

- `infrastructure/scripts/operational-validation.ps1`: 전체 service health map을 resolver definitions에서 생성. S8 오배정 제거.
- `infrastructure/scripts/start-local-full.ps1`: pre-flight expected/env map과 startup health port를 resolver로 생성.
- `infrastructure/scripts/stop-local-full.ps1`: actuator shutdown 대상 port를 resolver로 생성.
- `scripts/launch-local-stack.ps1`: Eureka/gateway/auth/dashboard 안내·health URL을 resolved port로 변경.
- `scripts/run-load-test.ps1`: login/health 및 k6 `BASE_URL`의 gateway port를 resolved port로 변경.
- `scripts/seed-local-stack.ps1`: gateway/auth/accounting 및 14-service health를 resolver로 변경.
- `tools/operational-validation/run-smoke-tests.ps1`: service map을 resolver로 변경.
- `tools/operational-validation/import-notion-csv.ps1`: gateway와 직접 호출 service port를 resolver로 변경.
- `tools/test-data/seed-9-slice-fixtures.ps1`: 기본 gateway URL을 resolver로 변경.

## 가드와 CI 배선

`scripts/check-local-stack-port-literals.ps1`가 `git ls-files` 결과를 전수 순회한다.
정본·가드 자기 패턴·명시된 비-runtime artwork/deployment 예외만 허용하며, 예외마다 이유를
소스에 남겼다. `.github/workflows/ci.yml`의 기존 `credential-plaintext-guard` 인접에
`local-stack-port-guard` job을 추가해 다음을 실제 실행한다.

```powershell
./scripts/check-local-stack-port-literals.ps1 -Root $PWD
./tools/operational-validation/test-s7-axis-redefined.ps1
```

## RED-A 원문과 결과

1. S7 테스트의 `Measure-Object` 0/1/다건은 선언만 하고 실행하지 않았다. 이제 실제
   pipeline을 실행해 `0/1/3`을 단정한다.
2. S8의 operational validation service map은 부분 resolver였고 slip/accounting 등
   기본 port가 잘못 배정돼 있었다. 전체 map을 정본 definitions에서 생성한다.
3. launch-local-stack의 고정 health·안내 URL을 resolver 호출로 바꿨다.
4. run-load-test의 고정 gateway host port를 resolver 호출로 바꿨다.

추가로 mutation test가 임시 git repository의 새 tracked `bad.ps1`에
`http://localhost:8080`을 주입한다. guard가 비-0으로 종료하는 것을 실제 확인한 뒤
임시 디렉터리를 삭제한다.

## RED-B

tracked `.ps1` 전체를 UTF-16 포함해 재검사했다. resolver·guard·정적 QA artwork·배포
문서 외의 알려진 local-stack port literal은 0건이어야 하며, 현재 guard가 0건으로
통과한다. startup/stop/validation/load-test/seed/smoke/import 소비자는 모두 resolver를
경유한다.

## 신규 파일 목록

- `scripts/check-local-stack-port-literals.ps1`
- `docs/dev-reports/2026-08-08-1113-s9-port-resolver-and-guard.md`

기존 S8 핸드오프 파일 `docs/dev-reports/2026-08-07-1113-s8-final-reconvergence.md`는
사용자 변경으로 존재하므로 보존했다. 커밋·푸시·컨테이너 재빌드는 수행하지 않았다.
