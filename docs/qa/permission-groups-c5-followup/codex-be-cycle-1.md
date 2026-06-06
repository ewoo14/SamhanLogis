## BE 결함표

| 우선순위 | 위치 | 내용 | 처리 |
|---|---|---|---|
| - | - | 신규 BE 결함 없음. | 추가 fix 없음 |

## Codex BE 자체 검토 체크

| 항목 | 판정 | 근거 |
|---|---|---|
| 14개 `HeaderAuthenticationFilter` `ROLE_` 제거 안전성 | 통과 | 비-`INTERNAL` `hasRole`/`hasAuthority("ROLE_")` 소비 잔존 grep 결과, 남은 production role gate는 `/internal/**` 토큰 경로 또는 아로로지스 자체 JWT 경로로 한정됨. downstream `HeaderAuthenticationFilter` 제거 영향 없음. |
| V47 `account_page_permissions` 동기 INSERT | 통과 | `BOOL_OR` 집계, 활성/미삭제 계정 제한, 시스템마스터 제외, `ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE`가 기존 partial unique index 계약과 일치함. |
| user-service 401 rekeying | 통과 | `X-User-Role` 단독은 더 이상 partial identity가 아니며, `groups`/`isSystemMaster` 기반 401 계약으로 재정의됨. EcountMig IT도 해당 계약으로 갱신됨. |
| EcountMig IT 계약 | 통과 | accounting 6개 IT는 공통 helper로 missing user-id partial identity를 재현하고, user-service는 모듈 경계상 로컬 상수로 동일 계약을 검증함. |
| `ProductAdminController @RequirePermission` action | 통과 | `POST /sync`는 `CREATE`, `GET /sync/last`는 `VIEW`로 매핑되어 `products.sync` V47 seed와 controller IT 계약이 일치함. |
| `CorsConfig` 와이어 변경 | 통과 | gateway exposed headers에서 `X-User-Role` 제거가 반영됐고 테스트도 literal wire name 기준으로 고정됨. 아로로지스 CORS의 `X-User-Role` 유지는 별도 JWT role 의미라 본 변경과 충돌 없음. |

## Claude 발견 평가표

| 항목 | 평가 | `3374a0c9` fix 검토 | 분류 |
|---|---|---|---|
| P0 DEF-1 V47 materialize 누락 | valid | V47에서 `products.sync` 그룹 seed 후 `account_page_permissions` materialize INSERT가 추가됐고, 시스템마스터 제외 및 active account 조건도 맞음. | 본 PR 즉시 처리 완료 |
| P2-1 prometheus `authenticated()` | valid | `InternalTokenFilter`가 실제 `/actuator/prometheus` gate이고 `ROLE_MASTER` 의존 제거가 맞음. 테스트/Javadoc 보강으로 의도도 명확해짐. | 본 PR 즉시 처리 완료 |
| P2-2 `canQuerySales` `isSystemMaster` 명시성 | valid | FE snapshot에 `isSystemMaster`가 없고 auth-service가 system master를 `MASTER` builtin group으로 동기화한다는 Javadoc 근거가 추가되어 충분함. | 본 PR 즉시 처리 완료 |
| Nit-1 V47 false action assertion 부족 | valid | `can_delete/can_restore/can_download/can_print` false 검증이 추가되어 seed 범위가 닫힘. | 본 PR 즉시 처리 완료 |
| Nit-2 `InventoryPermissionControllerIT` `X-User-Role` 사용 혼선 | valid | role header가 권한 근거가 아니라 legacy label/metrics 목적임을 주석으로 고정함. | 본 PR 즉시 처리 완료 |
| Nit-3 EcountMig `isMissingUserIdCase` 중복 | valid-nit | accounting IT 공통 helper 추출은 6개 파일의 동일 계약을 묶는 수준이라 과하지 않음. user-service는 모듈 경계상 별도 유지가 적절함. | 본 PR 즉시 처리 완료 |

## 판정

APPROVE (BE). 신규 BE 결함 0건이며, Claude cycle 1 BE 관련 지적은 `3374a0c9` 기준 해소됨. 본 PR 즉시 처리 대상 잔여 없음.
