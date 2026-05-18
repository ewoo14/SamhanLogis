# Codex DevOps Review — SP-D3 PR #243 Cycle 1

대상 commit: `df337cdd`  
범위: Flyway, CI/QA 실행 리스크, 운영 배포 관점 read-only 검토

## 결론

**Cycle 2 진입 권고. V9 fix migration 없이는 운영 배포 blocker.**

## Findings

### F-DevOps-01 [BLOCKER] V9 migration 미발급은 운영 데이터 기준으로 위험하다

SP-D3는 "V7 84 row 에 6 PageCode 이미 포함"을 근거로 V9를 발급하지 않았다. 하지만 V7의 값이 현재 요구사항과 다르다.

운영 DB에 이미 적용된 V7 값:

- `SALES dispatch.board` view=true: `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:118`
- `WAREHOUSE purchases.receipt-ocr` view=false: `V7__add_role_page_permissions.sql:128`
- `WAREHOUSE sales.slip.list` view=true: `V7__add_role_page_permissions.sql:130`
- `DISPATCH notification.dispatch-sms.send-audit` edit=true: `V7__add_role_page_permissions.sql:140`
- `DISPATCH dispatch.board` edit=true: `V7__add_role_page_permissions.sql:145`

V8은 회계 관련 SALES row 만 보정한다. `dispatch.board`, `sales.slip.list`, `purchases.receipt-ocr`, `notification.dispatch-sms.send-audit` 값은 보정하지 않는다: `services/auth-service/src/main/resources/db/migration/V8__sp_d2_accounting_page_permissions.sql`.

따라서 코드만 배포하면 운영 DB의 기존 권한값이 그대로 유지되어 SP-D3 hidden/override 정책과 다르게 동작한다.

### F-DevOps-02 [BLOCKER] Playwright spec 의 self-test 는 CI false-red 가능성이 높다

`false green 가드` 테스트가 자기 파일의 문자열/regex 정의까지 매칭한다. 재현 count:

- `|| true`: 2
- `test.skip(!ok)`: 2
- `page.setContent(`: 1

CI에서 해당 spec 을 실행하면 실제 금지 패턴이 없어도 실패할 수 있다. 이는 merge 전 반드시 수정해야 한다.

### F-DevOps-03 [IMPORTANT] 동적 권한 client 복제 코드는 서비스별 RestClient builder 차이가 있어 운영 해석을 문서화해야 한다

- slip-service 는 `@Qualifier("loadBalancedRestClientBuilder")` 를 사용한다.
- arologis/notification 은 기본 `RestClient.Builder` 를 사용한다.
- 세 서비스 모두 base URL 은 `http://auth-service` 이다.

코드 자체는 일관되지만, LoadBalancer/Eureka 해석 경로가 서비스별로 다르다. 운영 배포 시 `auth-service` 이름 해석이 동일하게 되는지 확인 항목으로 남겨야 한다.

### F-DevOps-04 [OK] 기존 IT `@MockBean DynamicPermissionClient` 보강은 지정 파일 기준 적용되어 있다

SP-D2 P04 트랩(기존 IT가 새 외부 client 빈 때문에 Eureka/네트워크로 새는 문제)은 지정된 기존 IT 5개에서 lenient true stub 로 보강되어 있다.

## DevOps Decision

**merge blocker.** V9 fix migration 및 Playwright self-test 수정 없이는 운영/CI 기준 승인 불가.
