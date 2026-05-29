# Claude DevOps 리뷰 — PR #316 권한 재편 Phase 1 (사이클 1)

> 리뷰어: Claude (DevOps)
> 브랜치: `feat/phase-1-permission-overhaul-framework`
> 일자: 2026-05-29
> 관점: CI / Flyway 마이그레이션 안전성 / 배포 순서 / Testcontainers IT 안정성
> PR 규모: +6922 / −2217, 214 files, `mergeStateStatus=UNSTABLE`, `mergeable=MERGEABLE`

## 0. DevOps 종합 판정 — REQUEST CHANGES (머지 불가)

**PR #316 은 현재 CI 가 RED 다. 전 backend test job (7/7) + arologis backend job 이 실패하며, 머지 게이트(CI green)를 통과하지 못한다.** dev-report §6 의 "로컬 BUILD SUCCESSFUL / PASS" 주장과 CI 실서버(Linux + Testcontainers) 결과가 정면 충돌한다([[qa-docker-real-test]] 위반 — 로컬 컴파일/단위 PASS 를 IT PASS 로 오인). 머지 전 P0 2건(V39 IT 컨텍스트 기동 실패 + 권한 enforcement 회귀)이 반드시 해소돼야 한다.

FE 측(Desktop/DS/Mobile-Staff typecheck+lint+build, Playwright)은 전부 GREEN — Stage 3 산출과 Task 11 의 vitest cross-project hack 제거(`clients/desktop/package.json` 에 vitest/test 스크립트 부재 확인)는 정상 반영됐다.

---

## 1. CI 현재 상태 (`gh pr checks 316`, run 26567636004 / 26567636006)

| 분류 | 결과 |
|---|---|
| **FAIL (8 job + 7 JUnit comment)** | 빌드+테스트: `shared+auth+gateway`, `user+product+inventory+logging`, `slip-it-core`, `slip-it-public`, `accounting+partner`, `phase9-10(groupware+notification+dashboard)` / arologis-ci `백엔드 빌드+테스트(arologis-service)` |
| **PASS** | `slip-units`, Frontend DS, Frontend Desktop, Frontend Mobile-Staff, Playwright(web+electron+mobile), Detox Android(arologis/mobile v4), arologis desktop/mobile prebuild, Notion Zero Guard, Credential Plaintext Guard(×2), GitGuardian |

분포: **backend test 그룹 7/7 FAIL, FE/guard/Playwright 전부 PASS.** 즉 컴파일·assemble 은 통과(전 모듈 `compileJava FROM-CACHE` 확인)하나 **test 단계에서 전 그룹이 깨진다.** 9.x 재주석화 완료로 단일 PR 컴파일 정합(리뷰 영역 1)은 달성됐지만, 런타임 권한 enforcement 와 V39 마이그레이션이 IT 를 무너뜨린다.

---

## 2. 발견 (P0 / P1 / P2 / Minor)

### P0-1 — V39 IT 가 Spring 컨텍스트 기동에서 실패 (Flyway/JPA validate 단계 추정)
- **증거**: `shared+auth+gateway` job —
  `V39GuardGatedPageIT`, `V39MigrationParityIT`, `V39PartnerExclusionIT` 3 클래스 모두
  `Caused by: org.springframework.beans.factory.BeanCreationException → ... → Caused by: java.lang.RuntimeException at DriverDataSource.java:109` 로 FAILED.
- **분석**: 세 IT 는 `AbstractPostgresIT`(Testcontainers `postgres:16-alpine`, `spring.flyway.enabled=true`, `spring.jpa.hibernate.ddl-auto=validate`)를 공유한다. CI 의 `docker version && docker ps` step 이 PASS 이고 동일 base 를 쓰는 형제 IT 가 컨테이너 기동까지는 도달하므로, **Docker 미가용 skip 이 아니라(그랬다면 `disabled`) 컨텍스트 기동 중 datasource 초기화가 throw** 한 것이다. 원인은 (a) V39 마이그레이션이 `migrate()` 중 SQL 오류로 throw, 또는 (b) Stage 1 신규 엔티티 `RolePagePermissionTemplate`/`AccountPagePermission` 와 V39 생성 테이블 간 `ddl-auto=validate` 컬럼/타입 불일치 둘 중 하나다. CI 집계 로그(`--log-failed`)가 PSQL 원문 메시지를 잘라 정확한 라인은 미확정.
- **V39 SQL 정적 검토 결과(구조는 정상)**: `role_page_permissions`(V7) 의 `can_view`/`can_edit` 컬럼·`accounts`(V1)의 `role`/`enabled` 컬럼 참조 유효, 보존 UPDATE 의 모든 `page_code`(accounting.journals/inventory.warehouse.admin/slip.audit-revert/estimates.list/products.list.view/sales.partner-order.print/accounting.hometax-export) 가 V7~V38 에 seed 됨 확인, `ON CONFLICT (col,col) WHERE is_deleted=FALSE DO NOTHING` 부분 유니크 인덱스 추론 구문도 PG 적법. → **하드 SQL 구문 오류보다 (b) entity↔table validate 불일치 가능성이 높다.**
- **권고 (Codex)**: 로컬에서 Docker 띄우고 `:services:auth-service:test --tests *V39*IT -i` 로 **컨텍스트 startup 로그의 Flyway/Hibernate validate 원문**을 확보하라. validate 불일치면 엔티티 `@Column` ↔ V39 DDL(컬럼명/nullable/타입) 정렬, Flyway 오류면 해당 statement 수정. 이것이 머지 1순위 블로커.

### P0-2 — 권한 enforcement 회귀: deny 돼야 할 요청이 200/204 로 통과 (lockout 의 반대 — over-permissive)
- **증거**: `AuthPermissionMigrationIT.java:128/:172` 7건 —
  `Status expected:<403> but was:<200>` (또는 `<204>`).
  대상: `POST /auth/register`, `PATCH /auth/admin/accounts/{id}/unlock`, `GET/PUT/DELETE /auth/admin/permissions`, `POST /auth/admin/permissions/batch`, "VIEW 만 있고 EDIT 없으면 403".
  테스트 의도 = "system.* endpoint 는 MASTER 라도 매트릭스 권한 없으면 403", "VIEW-only 면 mutation 403".
- **분석**: BE 리뷰가 지적한 narrowing/widening 과 동일 축. 실제 요청이 **denied 되지 않고 허용**됐다 → 7-action enforcement 가 해당 endpoint 에 안 걸렸거나(@RequirePermission 재주석 누락/잘못된 action), MASTER short-circuit 이 system.* 까지 무조건 통과시키는 구조(`PermissionAspect` line 108: `MASTER → proceed()` 무조건)와 테스트 기대("MASTER 라도 매트릭스 없으면 deny")가 모순. **이건 운영 DB 적용 시 권한 우회(보안)** 로 직결되므로 lockout 보다 위험할 수 있다.
- **권고**: `PermissionAspect` 의 MASTER bypass 정책과 IT 기대를 정합(MASTER 도 system.* 은 매트릭스 검사한다는 spec 인지 확인) + 해당 7 endpoint 의 `@RequirePermission(action=…)` 재점검. dev-report §5-1 의 `/my` MASTER all-true 와도 일관성 확인.

### P1-1 — 권한 IT see-saw 가 도메인 service 전반으로 전파 (deny stub 미보강 또는 7-action 미반영)
- **증거**: `user+product+inventory+logging` job —
  `ProductByCodeControllerIT`, `ProductByModelControllerIT`(8건, `byModel_unauthenticated_returns403` 포함), `DpsByProductFEMatchIT`(7건, MANAGER 200 기대), `EcountMig6UserImportControllerIT`(10건) 전부 AssertionError.
  `accounting+partner`, `slip-it-core/public`, `phase9-10`, arologis 도 동일 FAIL — backend 7/7.
- **분석**: dev-report §4 가 "도메인 권한 IT 를 `DynamicPermissionClient @MockBean` account+action-aware stub 으로 일괄 보강(deny case 명시 false)" 했다고 하나, 실제로는 다수 도메인 IT 가 깨진 채다. PR #310 see-saw(allow/deny flip-flop) 재발 정황 — stub 이 새 `check(UUID accountId, String page, PermissionAction action)` 시그니처(`DefaultDynamicPermissionClient`)와 정합하지 않거나, `X-User-Id`(account UUID) 헤더 전파가 IT 요청에 누락돼 `PermissionAspect` line 117 `accountId == null → deny` 로 403 이 떨어지는 케이스로 보인다(`returns200` 기대가 403/다른 코드로 실패하는 패턴과 일치).
- **권고**: 도메인 IT 의 `@MockBean DynamicPermissionClient` stub 을 **새 7-action `check(UUID,String,PermissionAction)` 시그니처로 lenient 보강 + 200 기대 케이스는 `X-User-Id` 유효 UUID 헤더 주입**. deny 케이스는 명시 `false` (리뷰 영역 4: deny case 명시 stub 의무). 단, 이 보강이 **테스트만 손보고 production enforcement 의 회귀를 가리지 않도록**, P0-2 와 교차 검증 후 진행.

### P1-2 — 배포 순서: V39 + auth-service 가 7-action client 소비 service 보다 먼저 적용돼야 함
- **분석**: 14 service 의 `@RequirePermission` 7-action 은 `DefaultDynamicPermissionClient` → auth-service `/auth/internal/permissions/check?action=…` 를 호출한다. auth-service 가 V39 미적용/구버전인 상태에서 소비 service 가 먼저 뜨면 `account_page_permissions` 부재 → check fallback `false`(`DefaultDynamicPermissionClient` line 87/91 보수적 deny) → **전사 lockout**. 반대로 auth 가 V39 적용·신버전인데 소비 service 가 구 2-action(String) 바이너리면 enum 미스매치 가능.
- **권고**: 배포 순서를 **(1) auth-service(V39 포함) 먼저 → (2) shared 의존 14 service 동시/직후** 로 고정하고, 단일 PR 머지로 main 이 한 번에 배포되므로 **배포 런북에 "auth-service 마이그레이션 선적용 + readiness 확인 후 나머지 rolling"** 을 명시. Phase 11 AWS 단일 환경에서는 무중단 보장 위해 auth-service 헬스체크 green 게이트 후 나머지 재기동 권장.

### P2-1 — V39 forward-only / 운영 적용 시 대량 INSERT 락·되돌리기 불가
- **분석**: V39 의 `INSERT INTO account_page_permissions ... FROM accounts JOIN role_page_permission_templates`(line 177~204)는 **활성 계정 수 × role 템플릿 page 수** 만큼 카티전 산출. 멱등성은 `ON CONFLICT DO NOTHING` 로 확보(재실행 안전), 비파괴(기존 `role_page_permissions` DROP 안 하고 COMMENT DEPRECATED 만 — 안전, 롤백 참조 보존 — 양호). 다만 **forward-only(Flyway)라 잘못된 materialize 시 SQL rollback 불가**, 계정 수가 많으면 단일 트랜잭션 내 대량 INSERT 가 `accounts`/`role_page_permission_templates` 에 짧은 락.
- **권고**: 현 규모(사내 계정 수십 단위)에서 락은 무시 가능. 단 **운영 적용 전 staging 에서 materialize row 수 + 권한 parity 스냅샷 검증**(MASTER 제외 계정 × page 곱 확인) + 잘못 시 되돌릴 보상 마이그레이션(V40 revoke) 사전 준비 권고. forward-only 특성상 "롤백 = 새 마이그레이션" 임을 런북에 명시.

### P2-2 — `slip-it-core/public` 60분→30분 timeout 그룹이 IT 실패로 RED (timeout 아님)
- **분석**: 본 PR FAIL 은 timeout 이 아니라 권한 IT 회귀(P1-1)다. 단일 거대 PR(214 files)의 CI 시간 우려(핵심 위험)는 실측상 각 job 2~5분으로 timeout 여유. **CI 시간/timeout 은 현재 리스크 아님.** Docker 의존 IT 안정성도 인프라 측은 정상(컨테이너 기동 OK), 실패는 코드/마이그레이션 결함.
- **권고**: 없음(관찰 기록). 단 P0-1 해소 후 slip 60분 nightly(`nightly-slip-it.yml`)에서 회귀 deep regression 재확인.

### Minor-1 — gradlew exec bit / secrets / env
- `chmod +x ./gradlew` step 이 ci.yml(line 99~100) + arologis-ci.yml(line 82~83) 양쪽에 존재 → [[gradlew-exec-bit]] 충족, Linux Permission denied 위험 없음.
- secrets: V39 는 평문 자격 미포함, Credential Plaintext Guard + GitGuardian PASS. env 신규 요구 없음(IT 가 `app.security.internal.token` 등 test 값 주입).
- Minor-2: ci.yml 의 `paths-ignore: docs/**` 로 dev-report 변경만으론 BE CI 미재실행 — 정상(SQL 은 `db/migration/` 경로라 영향 없음).
- Minor-3: Node.js 20 actions deprecation 경고(2026-06-02 Node 24 강제) — 본 PR 무관하나 후속 워크플로 유지보수 백로그.

---

## 3. 핵심 위험 요약 (요청 항목)

| 위험 | 평가 |
|---|---|
| V39 운영 적용 시 lockout/회귀 | **현실화됨** — IT 가 (P0-2) over-permissive(deny→allow) 회귀를 잡았고, (P1-2) 배포 순서 위반 시 fallback-false 로 lockout 가능. 배포 런북 + 순서 고정 필수. |
| 단일 거대 PR CI 시간/timeout | 낮음 — 각 job 2~5분, timeout 여유. 컴파일 정합(9.x 재주석화) 달성. |
| Docker 의존 IT CI 안정성 | 인프라는 정상(컨테이너 기동·docker ps PASS). 실패는 코드/마이그레이션 결함(P0-1)이지 Testcontainers flakiness 아님. |

---

## 4. 머지 차단 조건 (사이클 내 해소 의무)
1. **P0-1**: V39 IT 3종 컨텍스트 기동 실패 — 로컬 Docker 로 Flyway/validate 원문 확보 후 수정, `:auth-service:test --tests *V39*IT` green.
2. **P0-2**: AuthPermissionMigrationIT 7건 over-permissive 회귀 — enforcement/MASTER 정책 정합.
3. **P1-1**: 도메인 IT see-saw — 7-action stub + `X-User-Id` 헤더 정합, backend 7/7 green.
4. CI 전 그룹 green 확인 **후에만** PM 마지막 리뷰([[dual-5agent-review]] — CI green 전 PM 최종 리뷰 금지).
