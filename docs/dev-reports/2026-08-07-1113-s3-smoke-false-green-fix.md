# #1113 S3 — smoke false green 및 seed 검증 결함 수정

## 범위

이번 라운드는 PR #1119 파일 안의 #2~#5만 수정했다. Inventory/Product 참조 불일치(#1)는 백엔드 결함이므로 수정하지 않았다. 서버 JWT 권한 계약과 권한 경계는 변경하지 않았다.

## 변경 내용

### #3 거짓 green

`smoke-test-helpers.ps1`에 `Get-SmokeFailureCount`를 두고 결과를 `@(...)`로 강제 배열화한 뒤 실패 건수를 센다. 따라서 PowerShell 5.1의 파이프라인 스칼라 결과에서도 0건·1건·다건이 정확하다.

### #2 404 분류

HTTP 404 응답 body를 읽어 JSON `code=NOT_FOUND`이면 `BUSINESS_404`, body가 없거나 다른 응답이면 `PATH_404`로 분류한다. 200은 `OK`, 그 밖의 상태는 `NON_200`이다.

### #4 seed register 경로

기본 gateway public `/api/auth/register` 대신 실제 auth-service 포트의 `/auth/register`를 사용한다. gateway의 inbound identity header strip으로 register가 403이 되는 경로를 피하면서, 기존 JWT/identity header 계약은 그대로 보존했다. 사용자 5건의 literal 자격 블록(원본 `seed-local-stack.ps1:70~74`)은 수정하지 않았다.

### #5 seed post-check 포트

`SAMHAN_<SERVICE>_PORT` 환경변수를 우선 사용하고 없으면 기본 포트를 사용하는 `Resolve-LocalStackPort`를 추가했다. health post-check는 14개 서비스 각각의 실제 포트 맵을 사용하며, slip/partner-order override도 반영한다.

## RED-A 원문

PowerShell 5.1에서 헬퍼를 실제 호출해 일부 실패를 주입했다.

```text
RED-A simulated smoke output — OK 8 / 8 (fail=0)
RED-A simulated smoke output — OK 7 / 8 (fail=1)
RED-A simulated smoke output — OK 6 / 8 (fail=2)
404 business verdict: BUSINESS_404
404 path verdict: PATH_404
```

회귀 테스트의 0/1/다건 기대값은 각각 `0, 1, 2`로 확인됐다.

실제 smoke 실행도 다음과 같았다.

```text
service health  — UP 14 / 14
inventory-service /balances (전체)  404  BUSINESS_404
endpoint smoke  — OK 7 / 8
```

실제 smoke exit 1은 #1 업무 404가 남아 있기 때문이며, 이제 7/8로 정확히 보고한다.

## RED-B

서버/공통 보안 코드는 변경하지 않았다. 현재 diff의 서비스·공통 모듈 변경은 0건이다. S2에서 실측한 기존 경계는 유지된다.

```text
권한 경계: 401 / 401 / 403 / 200
identity 전체 위조 후: 401 / 401 / 403
Notion import: 4/4 실제 200
자격 누락: fail-fast throw
```

이번 코드 변경은 운영 PowerShell과 테스트/문서 및 두 순수 helper에 한정된다.

## seed 실측

기존 컨테이너만 기동하고 재빌드하지 않았다. 실제 host mapping인 `SAMHAN_SLIP_PORT=18086`, `SAMHAN_PARTNER_ORDER_PORT=18088`을 주입해 scriptblock으로 UTF-8 원문을 실행했다(PowerShell 5.1의 기존 no-BOM 파싱 트랩 때문에 파일 직접 실행 대신 S2와 같은 실행 방식 사용).

```text
[seed] OK gateway
[seed] OK auth-service
[seed] OK accounting-service
[seed] exists 5건
[seed] 14 service actuator health OK — Flyway startup completed
[seed] verified login OK 5건
exit 0
```

## #1 재현 경로와 실측 — 수정하지 않음

```text
gateway
  → StockController.balances
  → StockService.findBalancePage
  → ProductClient.lookup
  → product internal lookup 100 요청 / 1 응답
  → 404 code=NOT_FOUND
```

이번 smoke에서도 `/api/v1/inventory/balances?page=0&size=10`이 `404 BUSINESS_404`로 재현됐다. gateway route/controller/JWT/permission 단계를 통과한 뒤 발생하는 inventory/product 참조 데이터 불일치이며, PR #1119의 운영검증 스크립트 수정 범위를 벗어난 백엔드 도메인 결함이다. 따라서 새 이슈를 만들거나 백엔드를 수정하지 않았다.

## 검증

```text
node --test scripts/lib/qa-operational-validation-contract.test.cjs
4 pass / 0 fail

실제 smoke
14/14 health, 7/8 endpoint, #1 BUSINESS_404

실제 seed
14 service health, 5/5 login verify, exit 0
```

## 신규 파일 목록

- `tools/operational-validation/smoke-test-helpers.ps1`
- `scripts/lib/local-stack-port.ps1`
- `docs/dev-reports/2026-08-07-1113-s3-smoke-false-green-fix.md`

기존 파일 수정:

- `tools/operational-validation/run-smoke-tests.ps1`
- `scripts/seed-local-stack.ps1`
- `scripts/lib/qa-operational-validation-contract.test.cjs`
