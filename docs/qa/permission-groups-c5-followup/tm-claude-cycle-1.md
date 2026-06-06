## Claude 5-agent 사이클 1 통합 리뷰 (head `78093209` 기준)

> TM 통합. input: claude-be / claude-fe / claude-designer / claude-qa / claude-devops 사이클 1 + PM 사전 실증 노트.
> 우선순위는 PM 실증 반영하여 TM 이 최종 조정함. 중복/수렴 결함은 1행 병합 + 출처 병기.

---

### 1. 결함 종합 표

| # | 출처 | 우선순위 | 위치 | 내용 | 처리 |
|---|---|---|---|---|---|
| 1 | QA DEF-1 | **P0 (CRITICAL)** | `V47__seed_products_sync_group_permission.sql` + `EffectivePermissionMaterializer` | V47 이 `group_page_permissions` 에만 INSERT 하고 account 단 rematerialize 미수행 → MANAGER 그룹 배속 계정 전원 `products.sync` 403 (실측 S2b: dev_manager → GET /sync/last **403 FAIL**). 본 PR 핵심 기능(sheet-sync PermissionGuard 화) 실동작 불가 | 사이클 1 Claude fix — V47 에 `account_page_permissions` 동기 INSERT(또는 rematerialize 훅) 추가 + dev_manager 200 재검증 |
| 2 | FE P1-2 + Designer D-001 + Designer D-002 (PM 수렴: 동일 계열) | **P1** | `AppLayout.tsx` L272-L285, L433/L435, L634/L636 | **사이드바 노출 조건 ↔ 라우트 가드 소스 이원화** 3건: (a) 배차안내 SMS 발송 이력 — `dynamicCanAccess('notification.dispatch-sms.send-audit','view')` 제거로 커스텀 그룹 grant 시 사이드바 미노출(FE-hides-BE-allows), (b) 매출 마감 — `showAccounting`(12 page-code OR) 과다 가시성 vs 라우트 `accounting.period-close`, (c) arologis 5개 메뉴(수동/가배차/미배차/실배차/admin) — 사이드바 `hasAnyBuiltinRoleGroup` vs 라우트 `arologis.dispatch.admin`/`arologis.dispatch.ops`/`dispatch.batch` 동적 가드 | 사이클 1 Claude fix — (a) dynamicCanAccess 동일 page-code 복원, (b) `showAccountingPeriodClose` 신설 후 2곳 교체, (c) 라우트와 동일 page-code 의 dynamicCanAccess 전환 (계획서 S3 "page-code 존재 시 canAccess 1순위"). fix 시 mock 카탈로그(SP_D1_PAGES grant)·seed 정합 재확인 의무 |
| 3 | FE P1-1 + DevOps D-3 (PM 실증으로 P2 격하) | P2 | `full-menu-contract.spec.ts` L120-121 | blocked-partners / aligo-address-book 단언이 stale RoleGuard 기준 (해당 라우트는 main C2b #403 에서 이미 PermissionGuard 전환, 상수는 본 PR 에서 제거). 단 `playwright.config.ts` testIgnore 영구 격리 spec 이라 미실행 → "스펙 실패"(FE) 도 "정합"(DevOps) 도 부정확 | 사이클 1 Claude fix — PermissionGuard 단언으로 갱신 (격리 해제 대비 + Codex 가 동일 파일 기수정, 일관 정리) |
| 4 | BE P2-1 | P2 | accounting `PrometheusSecurityConfigTest` | `authenticated()` 전환은 보안 동등(InternalTokenFilter `allow-missing-token=false` 가 실 게이트)이나 테스트/주석에 미명시 | 사이클 1 Claude fix — "InternalTokenFilter 가 실 게이트" 주석 1줄 추가 |
| 5 | BE P2-2 | P2 | `session.ts` `canQuerySales` | BE `SlipSalesAccessGuard` 는 `X-Is-System-Master` 독립 bypass 보유, FE 는 MASTER 그룹 배속으로만 대리 판정 — 계약 문서 대비 구현 불일치 (실위험 낮음) | 사이클 1 Claude fix — Javadoc 에 "FE snapshot 에 isSystemMaster 부재, MASTER 그룹 배속 대리 + auth-service 발급 정책상 동일 집합" 명시 |
| 6 | Designer D-003 | P2 | `AppLayout.tsx` L287 `showAdmin` | 빌트인 role-group UUID 단독 비교 잔류 — `showAdminHrGroup` 등 dynamicCanAccess 조합 변수와 판단 기준 혼재. 현재 빈 블록(L997-L1005)이라 UX 영향 0 이나 오염 가능 | 사이클 1 Claude fix — dead 빈 블록 제거 또는 dynamicCanAccess 기준으로 정렬 |
| 7 | Designer D-005 + FE Nit-2 (동일 파일 병합) | P3 | `SalesClosingPage.tsx` L158 + 컴포넌트 Javadoc | `auth?.role` 문자열 직접 읽기 → `canExecuteClosing(role)`/`canReverseClosing(role)` 잔류 + Javadoc 이 구 `@PreAuthorize ACCOUNTANT/MASTER` 서술 (현행 BE 는 `@RequirePermission accounting.period-close`) | 사이클 1 Claude fix — 'scope 외 후속' 분류 금지(통합 PR 패턴 fix 즉시 처리 의무). 그룹/권한 기반 전환 + Javadoc 현행화 |
| 8 | DevOps D-1 | P3 | `V47` ON CONFLICT 절 | partial unique index 정합·재적용 안전 확인됨. 단 `is_deleted=TRUE` 소프트삭제 행 존재 시 충돌 미감지 → 신규 INSERT 시나리오가 SQL 주석에 미명시 | 사이클 1 Claude fix — SQL 주석으로 해당 시나리오 명시 (#1 fix 와 동일 파일에서 함께 처리) |
| 9 | BE Nit-1 | Nit | `AuthFlywayV47SeedIT` | `canUpdate` FALSE 만 단언 — `canDelete/canRestore/canDownload/canPrint` 미검증 (seed 오타 시 false-green) | 사이클 1 Claude fix — 4개 FALSE 단언 추가 |
| 10 | BE Nit-2 | Nit | `InventoryPermissionControllerIT` `withActor()` | C5 이후 무시되는 `X-User-Role` 을 계속 전송 — 라벨 목적임이 불명확 | 사이클 1 Claude fix — "IT 케이스 라벨 목적 전송" 주석 1줄 |
| 11 | BE Nit-3 | Nit | accounting EcountMig6~11 IT 6개 클래스 | `isMissingUserIdCase` 동일 로직 복제 | 사이클 1 Claude fix — accounting IT 공통 static 헬퍼로 추출 |
| 12 | FE Nit-1 | Nit | `sp-d2-accounting-permission-migration.spec.ts` T5 | 제목에 구 "이중 가드 패턴" 잔류 (body 는 단일 게이트로 갱신됨) | 사이클 1 Claude fix — 제목 "PermissionGuard 단일 게이트" 로 갱신 |
| 13 | BE Nit-4 | 기록 | 14개 서비스 `HeaderAuthenticationFilterTest` | 동일 테스트 코드 복제 — 각 서비스 독립 컴파일/테스트 단위라 허용 판정 | 결함 아님 — shared-test 모듈은 별도 검토 기록 |
| 14 | DevOps D-2 | 기록 | accounting Prometheus scrape | scrape job 무인증 → 메트릭 미수집은 **선재 결함**(기존 hasRole 403 → 현행 401, 본 PR 회귀 없음). scrape 인증 연계는 운영 인프라 결정 필요 | 환경(운영 인프라) 한계 예외 — 후속 기록 (본 PR 비대상, 계획서 범위 외) |
| 15 | Designer D-004 | 기록 | `PermissionMatrixPage.tsx` L1354 | PageCode raw 문자열 병기 — UUID 아님, MASTER 전용 화면의 의도된 디버그 패턴 | 결함 아님 — 기록만 |

---

### 2. 각 agent 종합 판정

| Agent | 산출물 | 판정 | 결함 요약 | TM 조정 |
|---|---|---|---|---|
| BE | claude-be-cycle-1.md | 조건부 APPROVE | P2 2건 + Nit 4건 (보안 회귀 0, S2 dead-code 안전, V47 패턴 정합 확인) | 조정 없음 |
| FE | claude-fe-cycle-1.md | CHANGES REQUESTED | P1 2건 + Nit 2건 | P1-1 → **P2 격하** (PM 실증: testIgnore 영구 격리 spec, 미실행이라 suite green). P1-2 는 P1 유지하되 Designer D-001/D-002 와 1계열 병합 |
| Designer | claude-designer-cycle-1.md | CHANGES REQUESTED | P2 3건 + P3 1건 + 정보 1건 (UUID 비공개 위반 0, DS 무영향, role 라벨 보존) | D-001/D-002 → FE P1-2 와 병합 (P1). D-005 → '후속 슬라이스' 분류 기각, **본 PR 즉시 처리 재분류** |
| QA | claude-qa-cycle-1.md | APPROVE 보류 | CRITICAL 1건 (S2b 실측 403) — 나머지 시나리오 전부 PASS | DEF-1 = **P0 확정** (본 PR 핵심 기능 실동작 불가) |
| DevOps | claude-devops-cycle-1.md | APPROVE 가능 | D-1 LOW(주석 보완) / D-2 선재 결함·회귀 0 / D-3 오판 자체 취소 | D-3 은 PM 실증 기준 "stale 단언" 으로 정정, #3 행에 병합 |

---

### 3. TM 결정

**판정: 사이클 1 Claude fix 진입 필수 (현 상태 APPROVE 불가)**

1. **fix 대상 12건** (표 #1~#12) — 전건 본 PR 사이클 1 Claude fix 로 처리. 후속 PR 위임 금지 ([[feedback_integrated_pr_pattern]] fix 즉시 처리 의무). 예외는 #14 (운영 인프라 한계, 본 PR 회귀 0) 뿐.
2. **P0 (#1) 최우선** — V47 materializer gap 해소 없이는 본 PR 의 stated goal 자체가 실운영 불성립. fix 후 auth-service 재빌드 + QA S2b (dev_manager → 200) 재검증 필수.
3. **P1 (#2) 는 단일 원칙으로 일괄 해소** — "사이드바 노출 조건 = 라우트 가드와 동일 page-code 의 dynamicCanAccess" (page-code 실재 시 그룹 매칭 분기는 과잉). `hasAnyBuiltinRoleGroup` 헬퍼는 page-code 부재 케이스 대비 유지, 사용처 0 이 되면 제거 판단.
4. **QA 재검증 잔여** — inventory-service stale JAR 로 시나리오 3 매트릭스 미완 (환경 한계). fix 빌드 시 inventory-service 포함 재빌드 후 재검증.
5. fix 완료 후 본 통합표 #1~#12 체크리스트 소거 확인 → Codex 5-agent review 단계 진입 (사이클 1 잔여 절차).

UUID 사용자 비공개 위반 0 / 디자인 시스템 영향 0 / 배포 순서 의존성 0 / CI matrix 전 모듈 커버 — 횡단 점검 이상 없음.
