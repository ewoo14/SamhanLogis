# 권한그룹 C5 후속 정리 통합 계획서 (2026-06-06)

> **목적**: C5 최종 cutover(#414/#415/#416) 완결 후 잔존한 선택·비차단 P2 후속 5건을 **통합 PR 1개**로 일괄 정리.
> **워크플로우** (개발책임자 지정, 2026-06-06): Claude 기획·PR 개설 → Codex 개발 → Claude 5-agent TM 리뷰/fix → Codex 5-agent TM 리뷰/fix → PM 확인(잔존 시 사이클 재진행, 해결될 때까지) → PM 판단 후 머지.
> **위험도**: 낮음 — 인가 경로 신규 변경 없음(이미 그룹 기반 완결). dead-code 제거 + FE 가드 정합 + additive seed 뿐. 락아웃 시나리오 없음.

---

## 0. 배경 — C5 cutover 완결 상태 (불변 전제)

- 인가 = **그룹 UUID 집합(X-User-Groups/JWT groups) + X-Is-System-Master**. role(X-User-Role 헤더/JWT role 클레임/accounts.role 컬럼)은 인가 경로에서 완전 소멸.
- LoginResponse: `groups[{id,name,builtin}]` + `role`(빌트인 그룹 역매핑 **파생 표시값**).
- FE 인가 = `usePermissions().canAccess(pageCode, action)` (7-action 모델).
- **의도적 잔존(본 PR 비대상)**: Role enum(provisioning·BuiltinRoleGroupIds), user-service role_snapshot(HR 직무), DynamicPermissionService role-mode(arologis 데이터 시맨틱), InternalTokenFilter(ROLE_INTERNAL/ROLE_MASTER — INTERNAL 서비스간 인증 26건), ArologisJwtFilter(arologis 자체 JWT role), X-Is-Partner 판정, client.ts PARTNER 분기(API 헤더 용도), AppLayout 프로필 칩 `auth.role` 표시.

---

## S1 — arologis SecurityConfig CORS Javadoc 명확화 (#413 후속, DevOps P2)

**파일**: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/config/SecurityConfig.java:64-66`

- 현재 Javadoc: "api-gateway 의 reactive CorsConfig 와 동일 origin/method/header 정책" — **거짓**(게이트웨이는 X-User-Groups 노출, arologis 는 미노출).
- **결정: Javadoc 을 "아로로지스 전용 정책"으로 명확화** — 아로로지스는 독립 운영 단위(게이트웨이 미경유, X-User-Groups 헤더 미사용)이므로 "동일 정책" 선언 제거, 비대칭이 의도임을 박제. **exposedHeaders 와이어 포맷 변경 금지**(X-User-Groups 추가하지 않음 — arologis 클라이언트 미소비, 노출 시 오해 유발).
- exposedHeaders 의 `X-User-Role` 잔존은 arologis 자체 JWT role 시맨틱 문맥이므로 유지(변경 시 와이어 포맷 영향 — 비대상). 단 Javadoc 에 arologis 자체 role 시맨틱임을 1줄 명시.

## S2 — 잔존 필터 ROLE_ authority dead-code 제거 (C5-4 후속)

**근거**: C5-4(#415)에서 게이트웨이 X-User-Role 헤더 주입 완전 제거 → 각 서비스 `HeaderAuthenticationFilter` 의 `X-User-Role` 파싱 + `ROLE_<role>` authority 생성 분기는 **도달 불가 dead-code** (role 값 항상 null/blank).

**대상 (14개 서비스 HeaderAuthenticationFilter)**: arologis(L51)·auth(L46)·user(L54)·accounting(L54)·notification(L51)·dashboard(L42)·partner(L48)·partner-auth(L41)·partner-order(L45)·slip(L42)·inventory(L42)·dc-config(L42)·groupware(L42)·product(L42) — X-User-Role 헤더 읽기 + ROLE_ authority 부여 구간 제거. GROUP_ authority 경로만 잔존.

**보존 (절대 변경 금지)**: `InternalTokenFilter`(shared/security — INTERNAL 인증), `ArologisJwtFilter`(arologis 자체 Bearer JWT role), `@PreAuthorize hasRole('INTERNAL')` 26건.

**검증 의무 (Codex)**:
1. 제거 전 서비스별로 비-INTERNAL `hasRole`/`hasAuthority("ROLE_...")` 소비처 0 재확인 (HeaderAuthenticationFilter 의 ROLE_ authority 에 의존하는 곳이 진짜 없는지).
2. 게이트웨이 측 잔존 일관 정리: `CorsConfig` exposedHeaders 의 `X-User-Role`(CALLER_ROLE_HEADER) — 게이트웨이가 더 이상 주입하지 않으므로 노출 제거 + Javadoc 갱신. `HttpHeaderConstants.CALLER_ROLE_HEADER` 는 사용처 0 확인 시 제거, 잔존 사용처 있으면 유지 + 사유 주석.
3. 각 서비스 필터 단위 테스트 갱신 (ROLE_ 분기 테스트 삭제 → "X-User-Role 수신해도 무시" 회귀 테스트 1건으로 대체 권장).
4. 전 14+ 서비스 compile + test green.

## S3 — FE 사이드바 role 배열 → 권한/그룹 기반 전환

**파일**: `clients/desktop/src/renderer/components/AppLayout.tsx` (+ 관련 api 모듈 상수)

현재 사이드바는 동적 `canAccess`(45개 호출, 완료)와 **정적 role fallback 이 혼재**:
- `*_SIDEBAR_ROLES` 상수 5개 (VENDOR_ORDER_OCR/REGION_MGMT/SHEET_SYNC/ALIGO_ADDRESS_BOOK/BLOCKED_PARTNERS, L170~194)
- `ACCOUNTING_EDIT_REQUEST_REVIEWER_ROLES` 매칭 (L276-277), `canAccessAccounting(auth?.role)` (L291)
- arologis 배차 메뉴 6개 `ARO_*_ROLES` 매칭 (L327-343)
- 정적 헬퍼 15회 (canAccessAdmin/canAccessAudit 등, L354-404)

**전환 원칙**:
1. **BE `@RequirePermission` pageCode 가 존재하는 메뉴 → `canAccess(pageCode)` 전환** (1순위). page-code↔BE 대조표를 dev-report 에 박제 (C2b/C2c 교훈: mock 이 잘못된 page-code 에 맞춰 통과하는 함정).
2. **BE 가 role-mode(arologis 배차 등)라 page-code 가 없는 메뉴 → 그룹 기반 판정 전환**: `getSessionGroups(auth)` + `BUILTIN_ROLE_GROUP_IDS` UUID 매칭 (session.ts 기존 카탈로그 재사용). role 문자열 비교 제거. **UUID 화면 노출 절대 금지**([[feedback_uuid_no_user_visibility]]) — 내부 비교 전용, 표시는 `group.name`/파생 role 만.
3. 정적 헬퍼는 호출처 전수 이관 후 **헬퍼 자체 제거** (다른 화면 호출처 포함 전수 — accounting.ts 정적 헬퍼 ~10회, adminApi.ts L521, auditApi.ts L203-217 등). 이관 불가 사유 있는 헬퍼는 유지 + 사유 주석.
4. **mock 권한 카탈로그 동기화 의무** (SP_D1_PAGES/DEFAULT_VIEW/EDIT — auth seed 와 정합) + **전체 mock suite 실행** ([[feedback_fe_guard_removal_contract_tests]] — FE 가드 변경 = 전체 suite, 핵심 스펙만 불충분).

## S4 — FE 잔여 role 헬퍼 정리 (canQuerySales 판정 박제)

- `hasAdminRole`/`canTransitionSlip`/`canTransitionTransfer`: C5-2b/2c 에서 **이미 이관 완료** — 본 PR 작업 없음 (dev-report 에 확인 사실만 기록).
- **`canQuerySales`(session.ts:73-76): 유지 확정** — BE `SlipSalesAccessGuard`(slip-service:69-79) 의 그룹 OR 판정(SALES/MANAGER/MASTER + isSystemMaster)과 1:1 미러. `canAccess('sales.slip.list')` 는 seed 가 ACCOUNTANT/INVENTORY 에도 view 부여 → 화면 진입 후 API 403 (UX 결함). → **이관하지 않고** 유지 사유를 Javadoc 주석으로 박제 + 가능하면 그룹 기반 판정(BUILTIN_ROLE_GROUP_IDS 매칭 OR isSystemMaster)으로 내부 구현만 전환해 role 문자열 의존 제거(LoginResponse.role 파생값이라 동작은 동일 — 전환 시 단위 테스트 필수).
- 기타 직접 role 비교 중 **인가 용도** 잔존 → S3 원칙대로 이관. **표시용**(프로필 칩, audit 라벨)·**PARTNER API 분기**(client.ts:72)는 유지.

## S5 — C2b 보류 3 라우트 PermissionGuard 전환

**파일**: `clients/desktop/src/renderer/routes/index.tsx` (L465-472, L1111-1118, L1216-1222)

| 라우트 | 판정 | 작업 |
|---|---|---|
| `/sales/closing` | BE 완비 (accounting MonthEndCloseController @RequirePermission `accounting.period-close` VIEW/CREATE + `.reverse` UPDATE, V7 seed ✓, mock ✓) | FE `RoleGuard` → `PermissionGuard('accounting.period-close','view')` 전환만 |
| `/sales/vendor-order-upload` | endpoint 존재(vendor upload/confirm), **@RequirePermission 미부여**. page-code `sales.vendor-order` V10 seed ✓, mock ✓ | BE: 두 endpoint 에 `@RequirePermission(page="sales.vendor-order")` 부여 (upload/confirm=CREATE, 조회성 있으면 VIEW — 실제 시그니처 보고 action 정밀 판정) + FE `PermissionGuard('sales.vendor-order','view')` 전환. 서비스 위치(partner-service vs partner-order-service) Codex 가 실코드로 확정 |
| `/admin/sheet-sync` | endpoint 존재(product-service ProductAdminController:62,83), **page-code 자체 없음** | **신규 page-code `products.sync`**: ① auth-service **V47** migration — `group_page_permissions` seed (V43 그룹 기반 패턴 준수 — role_page_permissions 아님. 그룹 101 MANAGER: view+create, MASTER 는 V43 기존 패턴과 동일하게 처리), page 카탈로그 테이블 있으면 등록 ② ProductAdminController `POST /sync`=CREATE, `GET /sync/last`=VIEW `@RequirePermission` 부여 ③ FE `PermissionGuard('products.sync','view')` 전환 ④ mock SP_D1_PAGES + DEFAULT_VIEW/EDIT 동기화 (auth seed grant 와 그대로 정합) |

**후속 정리**: 3개 전환 후 `RoleGuard` 사용처 0 이면 RoleGuard 컴포넌트 + 관련 ROLES 상수 + 박제 테스트 제거 (사용처 잔존 시 제거 보류 + 사유 기록).

---

## 검증/QA 계획

1. **컴파일/테스트**: 전 서비스 `gradlew compileJava compileTestJava` + 변경 서비스 test, FE `npm run test`/`lint`/`typecheck` + **전체 Playwright mock suite**.
2. **Docker 실QA (사이클 1a QA agent 의무, [[feedback_no_fake_data_ever]])**:
   - 재빌드/재배포 후 역할 매트릭스: MANAGER/MASTER → sheet-sync 200, 비대상 역할 403. vendor-order upload/confirm 권한 차등. sales-closing 진입/마감 권한 차등.
   - 사이드바 가시성: 역할별 로그인 → 메뉴 노출 정합 실캡처.
   - V47 migration 적용 확인 (group_page_permissions 신규 row).
   - ROLE_ 제거 후 기존 인가 회귀 0 (그룹 기반 200/403 매트릭스 재확인).
3. **금지**: 와이어 포맷 임의 변경(S1 exposedHeaders), INTERNAL/ArologisJwtFilter 변경, UUID 화면 노출, mock 카탈로그 과다 grant(C2b 교훈 — auth seed 와 그대로 정합).

## 리뷰 사이클 (개발책임자 지정 워크플로우)

- 사이클 N = Claude 5-agent(BE/FE/Designer/QA/DevOps) 리뷰 → TM Claude 통합 PR comment → Claude fix → push → Codex 5-agent(read-only) 리뷰 → TM Codex 통합 PR comment → Codex fix(workspace-write) → push.
- PM 확인: 잔존 결함 시 사이클 재진입(해결될 때까지). 잔존 0 + CI 전 green → PM 종합 리뷰 게시 + squash 머지.
- PR 코멘트 = 사이클당 TM 통합 2건 + 최종 PM 종합 1건. raw 5건은 `docs/qa/permission-groups-c5-followup/` 저장만.
