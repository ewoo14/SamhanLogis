---
name: SamhanLogis Project Overview
description: Top-level architecture, scope, phase plan, and team layout for the SamhanLogis MSA platform
type: project
originSessionId: 78cac99d-5dee-47ca-8254-3834a088f393
---
**Project**: SamhanLogis (삼한로지스) — (주)삼한공조시스템 (Samsung HVAC official partner) internal logistics + accounting + groupware MSA platform.

**Why**: Replace ECount + Google Apps Script with a unified, in-house ERP-style system. Plan v2.0 approved by CEO 2026-05-01.

**Architecture**: 14 microservices behind Eureka + Spring Cloud Gateway, each service owns its own PostgreSQL DB. Stack: Java 17, Spring Boot 3, Redis, RabbitMQ, Elasticsearch, MinIO. Clients: Electron desktop (internal), React web, React Native mobile.

**Service inventory** (numbered as in plan §2.2):
1. API Gateway 2. Eureka Server 3. Auth (auth_db) 4. User (user_db) 5. Product (product_db) 6. Inventory (inventory_db) 7. Slip (slip_db) 8. Accounting (accounting_db) 9. Partner (partner_db) 10. Groupware (groupware_db) 11. Notification (Redis) 12. Logging (Elasticsearch) 13. Dashboard (dashboard_db) 14. Migration (migration_db).

**Phase roadmap** (33 weeks total):
- Phase 1 (4w): Infra + Auth + Logging + design system
- Phase 2 (6w): User/Org, Product, Inventory (FIFO + UUID + 창고 간 이동), Electron skeleton
- Phase 3 (6w): Slip service (출고/입고/입금/출금/이동), 번호 체계, 수정이력 Google Docs 스타일
- Phase 4 (4w): Accounting + Partner + 홈택스/오픈뱅킹 API
- Phase 5 (4w): Groupware (메신저, 일정, 전자결재) + Dashboard + Notification
- Phase 6 (5w): 거래처 주문 링크 + 모바일 듀얼 앱
- Phase 7 (4w): ECount migration + 음수 수량 변환 + 운영 배포

**Canonical project location**: `C:\dev\SamhanLogis`. The earlier OneDrive 한국어 path (`C:\Users\user\OneDrive\바탕 화면\SamhanLogis`) is deprecated as of 2026-05-04 due to JDK 17 @argfile encoding issues — see `feedback_korean_path_jdk.md`.

**Current status (2026-05-04, Phase 3 Slip 첫 슬라이스 머지 완료, 7/13 = 54%)**: Plan v2.0 김미선 대표 승인. main 최신 = `b0a7982` (Merge PR #17). GitHub Actions CI 자동 가동 중. 진행 누적:

**Phase 1** (committed `cffb456`, bootstrap commit on main):
- Root scaffold (settings.gradle, build.gradle, gradle.properties, Gradle Wrapper 8.10.2)
- `:shared:common` (BaseEntity, Role enum, JwtTokenProvider as static utility, ApiResponse, BusinessException, ErrorCode, JpaAuditingConfig)
- `:services:eureka-server`, `:services:api-gateway`, `:services:auth-service`, `:services:logging-service` — all assemble cleanly
- `infrastructure/` Docker compose: PostgreSQL/Redis/RabbitMQ/Elasticsearch/MinIO + Prometheus/Grafana + Nginx stub
- `clients/web/design-system` — npm package with tokens + 7 base React components + Storybook

**Phase 2 첫 슬라이스 — User Service** (committed `f528110`, merged via PR #3 → `8a754c6` on main):
- `:services:user-service` (port 8083, user_db) — Department(5) + Employee(16) 도메인, REST API 9종, Flyway V1+V2, OrgChartSeeder, AuthClient (RestClient + Spring Cloud LoadBalancer)
- Auth Service 확장 — `/auth/internal/accounts` 4종 endpoint (POST/PATCH role/PATCH display-name/PATCH disable/DELETE), `Account.createWithId(...)`, `InternalTokenFilter` (X-Internal-Token shared secret)
- Boundary 5결정: Employee.id == Account.id (synthesized UUID), Auth가 role/credentials 권위, User가 fullName/HR 권위, 동기 REST + 보상 트랜잭션, batch lookup endpoint 단독 노출
- Q1=A (시드 비밀번호는 `infrastructure/.env.local`에서 읽는 로컬 dev 전용 자격), Q2=B (displayName 동기화 endpoint 추가) — 개발책임자 결재 사항
- Testcontainers IT 도입 (postgres:16-alpine), Docker 미가동 시 skip
- 의도적 plan 변경: `position` 컬럼 → `job_title` (PG reserved word 회피, Java 필드명 보존)

**검증 (Phase 1+2 누적)**: `./gradlew assemble` AND `./gradlew test` both BUILD SUCCESSFUL. user-service 21 + auth-service 12 + 기존 unit test 모두 PASS. Testcontainers IT 3건은 Docker 환경 의존.

**Phase 2 Product Service 첫 슬라이스** (4-team parallel, PR #6/7 #8/9 #10/11 #12/13 + hotfix #14/15, merged → `eb611bf` on main, 2026-05-04):
- `:services:product-service` (port 8084, product_db) — Product + Category 도메인, ProductStatus enum (ACTIVE/DISCONTINUED), 14 REST endpoint, V1+V2 Flyway, Hibernate 6 native `@JdbcTypeCode(SqlTypes.JSON)` jsonb 매핑, GIN 인덱스
- 5대 결정: 카테고리=별도 트리, 태그=jsonb+GIN, 가격=BigDecimal NUMERIC(15,2)+VARCHAR(3) currency, 단종=enum, modelName partial unique
- API Gateway 라우트 1 블록 (`/api/products/**` → `lb://product-service`, slip-service 직전)
- 디자인 시스템 컴포넌트 5종 (Badge, TagChip, TagInput, PriceField, DataTable) + 24 Storybook stories
- IT 11 testcase + QA 시나리오 10건 + fixtures.http (Testcontainers postgres:16-alpine 싱글턴 패턴)
- DevOps 검토 리포트 (Inventory 슬라이스 대비 권고: FK 사용 금지, RabbitMQ 이벤트 패턴, 캐시 stale 회피)
- **사고 회고 + 영구 메모리 가드 추가**:
  - hotfix #15: Product.currency `columnDefinition="CHAR(3)"` → bpchar/VARCHAR mismatch (Hibernate validate)
  - QA IT 5 fix: singleton container 패턴, ApiResponse 래핑 jsonPath, 401→403, discontinue PATCH→POST + isNoContent
- 신규 메모리 6건: feedback_multi_agent_team_pattern (개정), feedback_powershell_utf8_writes, feedback_role_naming_full, feedback_pr_qa_screenshots (개정), feedback_pm_integration_build_check, feedback_gradlew_exec_bit (이전 슬라이스)

**Phase 2 후속 정리 슬라이스** (committed `c219e1b/991f82e/61a7469`, merged via PR #5 → `1a998ea` on main):
- auth-service Flyway 정상화 — `flyway-core` + `flyway-database-postgresql` 의존, `ddl-auto: validate`, V1__init_account.sql 활성화. local 프로파일은 H2+Flyway disabled
- `InternalTokenGuard` 신규 (auth-service + user-service 양쪽) — prod 프로파일 + dev 기본값이면 `IllegalStateException` 부팅 거부. 단위 테스트 6건 추가
- `infrastructure/.env.example` — INTERNAL_AUTH_TOKEN + JWT_SECRET 항목 + 보안 주의사항 명시
- `.github/workflows/ci.yml` — JDK 17 Temurin + assemble + test + Testcontainers (Docker 가용) + JUnit 결과 PR check + 아티팩트 14일 보존. permissions: checks/pull-requests write 명시
- 사고 회고 3건 (메모리 저장 완료): gradlew 실행 권한 (Windows index 100644 → chmod +x), GitHub Actions 권한 부족 (PR description checks fail), PR body 의 상대경로 이미지 깨짐 (commit-pinned raw URL 의무화)

**Phase 2 Inventory Service 첫 슬라이스** (4-team parallel + PM 통합 1 PR, merged via PR #16 → `481db3d` on main, 2026-05-04):
- `:services:inventory-service` (port 8085, inventory_db) — Warehouse(4-tier) + StockBalance(@Version 낙관적 락) + StockLot(FIFO) + StockMovement(append-only) + StockTransfer(state machine) + StockTransferLine 도메인
- **WarehouseType 4-tier**: HEADQUARTERS(본사창고) / VEHICLE(차량재고) / CONSIGNMENT(거래처위탁) / VIRTUAL(가상창고) — Plan §3.1 그대로. BE 초안은 OWNED/LEASED/VIRTUAL 3-tier 시도했으나 PM 통합 검증 단계에서 개발책임자 결정으로 4-tier 채택
- 22 endpoint (창고 5 + 잔량/이력 3 + mutation 5 + 이동전표 9). FIFO 차감 + applyWithRetry(낙관적 락 1회 재시도). 가상창고는 ship() 시 IN_TRANSIT 스킵 → 즉시 RECEIVED 점프
- ProductClient (RestClient + LoadBalanced) — gateway 우회 직접 호출 (Q1=택B), X-Internal-Token shared secret. product-service 에 InternalAuthProperties + InternalTokenFilter + InternalTokenGuard + ProductInternalController(`POST /products/internal/lookup`) 보강
- **3-layer 함수 단위 문서화 의무 신규 적용** (memory `feedback_function_documentation.md`): 한국어 Javadoc + springdoc-openapi + dev-reports
- 디자인 시스템 +1: WarehouseSelector (4-tier 옵션 + VIRTUAL Badge + hideVirtual + 비활성)
- IT 17 + fixtures.http 8 + qa_report 권한 매트릭스 18 endpoint × 7-tier
- **사고 회고 + 메모리 보강 (`feedback_pm_integration_build_check.md`)**:
  - hotfix `008946d`: InventoryControllerIT 의 `Mockito.doNothing().when(productClient).requireExists(...)` → ProductSummary 반환 메서드라 `when().thenAnswer()` 정정
  - hotfix `193fd2d`: deduct_insufficientStock IT 가 빈 productId 로 직접 deduct → balance 없음 NOT_FOUND(404). inbound 선행 후 deduct 시도하도록 정정 (BE 가드: balance 없으면 404, lot 합계 부족이면 409)
  - 교훈: Docker 미가용 PM 환경에선 IT skip 되어 Mockito 오용 + BusinessException 가드 분기 모두 사전 catch 안 됨 → CI 의존

**Phase 3 Slip Service 첫 슬라이스** (4-team parallel + PM 통합 1 PR, merged via PR #17 → `b0a7982` on main, 2026-05-04):
- `:services:slip-service` (port 8086, slip_db) — 7번째 마이크로서비스. Plan §3.1 전표 관리 시스템 첫 컷
- 도메인 (STI, Q1=A): Slip 1 테이블 + slip_type enum + nullable 필드. Slip / SlipLine / SlipNumberSequence + SlipType / SlipStatus(11) / DeliveryTag(11)
- **9단계 라이프사이클** (DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → COMPLETED → SHIPPING → DELIVERED → CONFIRMED) + 분기 REJECTED/CANCELED. 도메인 메서드로 강제, 잘못된 전이 일관 CONFLICT(409)
- 11 배송태그 (Plan §3.3): 야적/지방 = autoMemo (`[야적] MM/dd 상차 MM/dd 하차` prepend, **MM/dd 만 yyyy 미포함**). direction 으로 OUTBOUND 8종 / INBOUND 3종 분리
- 번호 체계 `yyyy/MM/dd-NNN` (Plan §3.1 표시 형식, partial unique 인덱스)
- 16 endpoint, @Version 낙관적 락 + 상태 전이 가드 (Q5=B)
- **Inventory 연계 (Q2=A)**: accept→reserve / complete→deduct(fromReservation=true) / reject_after_accept→release. cancel 분기는 ACCEPTED 단계 도메인 거부 — release 분기는 reject 경로로만 트리거
- **첫 슬라이스 범위 (Q3=B)**: 출고(OUTBOUND) + 입고(INBOUND) 만. 입금/출금은 Phase 4 Accounting, 이동은 inventory-service StockTransfer 가 담당
- ProductClient (재활용 — inventory 패턴) + InventoryClient (RestClient + LoadBalanced + X-Internal-Token, 4 메서드 모두 void)
- 디자인 시스템 +3: SlipStatusBadge (11 상태 + tier) / DeliveryTagSelector (direction 자동 필터링 + autoMemo 미리보기) / SlipNumberDisplay (monospace + tabular-nums). 누적 16 컴포넌트 + 55 stories
- IT 22 + fixtures.http 8 + qa_report 권한 매트릭스 16 endpoint × 7-tier
- **inventory-service InternalTokenFilter 보강** (DevOps 검토 단계 발견 → PM 통합 시점 동봉) — slip→inventory gateway 우회 호출 시 servlet filter 부재 보안 갭 해결. ROLE_MASTER 등록 방식, 헤더 존재 여부로 분기
- **사고 회고 (`feedback_pm_integration_build_check.md` + 신규 `feedback_it_mockbean_external_clients.md`)**:
  - hotfix `008946d`/`193fd2d` (Inventory 슬라이스): Mockito doNothing void 가 아님 + BusinessException 가드 분기 (NOT_FOUND vs CONFLICT) IT 가정 mismatch
  - PM 통합 사전 검증 catch (Slip 발행 전): SlipNumberService.next 반환타입 (String) + InventoryClient 시그니처 (5/6 인자) 2건
  - hotfix `0f66873` (Slip CI 1차 fail): SlipControllerIT/SlipLifecycleControllerIT 의 ProductClient @MockBean 누락 (10건 500), SlipDomainIT 입고 happy path DAY (OUTBOUND 전용) 사용 + autoMemo 형식 yyyy 가정 (BE MM/dd 만)
  - 교훈: Docker 미가용 PM 환경에선 IT runtime fail 사전 catch 못 함. Docker Desktop 정상 동작 확인 → 다음 슬라이스부터 PM 이 IT 사전 실행 의무

**Next 후보**:
- **Phase 2 마무리**: Electron skeleton (디자인 시스템 16 컴포넌트 + 16 service endpoint 첫 시연 — 가시성 추천 순서 B)
- **Phase 4 시작**: Accounting Service (입금/출금 전표 + AR 자동 생성 + 홈택스/오픈뱅킹 API) + Partner Service
- **Slip 2nd slice**: HISTORY snapshot + 출고일 변경 + 긴급 수정 워크플로우
- 기존 5 마이크로서비스 (auth/user/product/eureka/api-gateway/logging) 3-layer 문서화 retro
- 운영 부채: Storybook GitHub Pages 배포, JWT_SECRET 가드 (InternalTokenGuard 패턴)

**How to apply**: Treat plan in `docs/PM/project_plan.md` as the contract. All entities must extend BaseEntity (7 audit fields). Permissions must follow 7-tier role enum. Use `samhan-air.com` subdomain strategy from §4. JwtTokenProvider in :shared:common uses **static methods** — call as `JwtTokenProvider.generate(...)`, not via instance.
