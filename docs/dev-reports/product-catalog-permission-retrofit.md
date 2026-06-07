# product-catalog-permission-retrofit — 개발 리포트

> 2026-06-07 · PR #420 · PR #418 잔여 ② 재개 슬라이스
> 계획서: [2026-06-07-product-catalog-permission-retrofit-plan.md](../superpowers/plans/2026-06-07-product-catalog-permission-retrofit-plan.md)

## 1. 배경

PR #418(RC9 lookup) 진행 중 `ProductCatalogController` 기존 GET 무권한 비대칭이 잔여 기록됨. 본 슬라이스 정찰(Explore 2기 전수 sweep)에서 **범위 확대 확정**:

- **무권한 endpoint 10건** — ProductCatalogController 9(조회 3 + **mutation 6 = P1**) + CategoryController.tree 1. 인접 컨트롤러는 전부 `@RequirePermission` 보유.
- **게이트웨이 라우팅 결함 동반 발견** — `GET /api/v1/products`(정확 경로)는 strip 라우트로 빠져 **ProductController.search 오매칭**(usageScope/category 무시 + envelope 계약 파괴), `PATCH .../usage`는 strip 후 매핑 없음 = **404 도달 불가**. RC2/RC9 풀패스 no-strip 계열 누락.

## 2. 변경 내역

### 2.1 BE — product-service (Flyway 0)
| Endpoint | page | action |
|---|---|---|
| GET /api/v1/products | products.list | VIEW |
| PATCH /api/v1/products/{code}/usage | products.admin | UPDATE |
| GET /api/v1/products/{code}/specs | products.list | VIEW |
| POST /api/v1/products/{code}/specs | products.admin | CREATE |
| PATCH /api/v1/products/{code}/specs/{id} | products.admin | UPDATE |
| DELETE /api/v1/products/{code}/specs/{id} | products.admin | DELETE |
| PATCH /api/v1/products/{code}/specs/reorder | products.admin | UPDATE |
| GET /api/v1/spec-key-templates | products.list | VIEW |
| POST /api/v1/spec-key-templates/{id}/apply-to-existing | products.admin | CREATE |
| GET /products/categories (tree) | products.list | VIEW |

부수 결함 교정: `deleteSpec` actor `"system"` 하드코딩 → `X-User-Id` 헤더 추출(null 폴백) — soft-delete 감사 추적 가능화.

### 2.2 게이트웨이 — api-gateway
- `product-catalog-v1`: `Path=/api/v1/products` (정확 경로, no-strip) — strip 라우트보다 선행 선언
- `product-usage-v1`: `Path=/api/v1/products/*/usage` (no-strip)
- 기존 `/api/products/**`(StripPrefix=1, ProductController.search) 경로 무영향.

### 2.3 seed 검증 결론 — 신규 Flyway 불필요
- `V10` role template 에 products.list/products.admin 존재 → `V39` account_page_permissions materialize → `V43` group_page_permissions 빌트인 그룹 복사. `V30` DEVELOPER seed 존재.
- ProductController 가 동일 page-code 로 이미 enforcement 중 → grant 부족 lockout 리스크 없음.

### 2.4 FE — desktop mock + 계약 박제 (4종 원자 체크리스트)
- **BE대조**: page-code/action §2.1 표와 1:1.
- **FE전환**: desktop 내 spec mutation UI 호출처 현재 없음(SpecAddModal 은 design-system 컴포넌트, props 기반) → 버튼 가드 추가 대상 0. 조회 화면은 products.list VIEW 로 기존 가드와 정합.
- **mock 동기화**: `mockRequirePermission`/`mockCanAccess` 공통 가드 신설, catalog/spec CRUD/template/category/usage 핸들러 403 분기 + mockPerms override 연동. 권한 카탈로그 DEVELOPER products.list/products.admin V30/V43 정합 반영.
- **spec 박제**: `qa/playwright/tests/catalog/product-catalog-permission-retrofit.spec.ts` 4 TC — ① controller 9 매핑 1:1 ② tree VIEW ③ gateway no-strip 선언 순서(strip 라우트 선행 + `/**` 금지 + StripPrefix 부재) ④ mock 권한 검사 선행 흐름.

### 2.5 IT
- `ProductPermissionControllerIT`: EndpointCase 매트릭스 10 케이스 추가 (grant 200 / deny 403 양방향).
- `ProductCatalogControllerIT`: `@MockBean DynamicPermissionClient` 격리 (lenient allow) — AOP 추가 후 기존 happy path 유지.

## 3. 검증

| 항목 | 결과 |
|---|---|
| product-service compileJava/compileTestJava + api-gateway compileJava | PASS |
| 신규 계약 spec (5 project × 4+7 TC) | PASS (hard-gate 스텝으로 CI 승격) |
| desktop `npm run typecheck` | PASS |
| desktop 전체 mock suite | 434/434 PASS (1차) · 433+1 FS 플레이크 재실행 green (2차, mock 가드 추가 후) |
| qa/playwright signature-c 6건 실패 | **본 변경 무관 확정** — main 베이스라인 동일 실패 (crypto.subtle insecure context 로컬 환경 한계). CI Linux 권위 |
| **QA Docker 실서버 매트릭스 (게이트웨이 경유 실 HTTP)** | **12/12 PASS** — 라우팅 교정 실증(T1 Page shape·T3 종전404→200·T3b 404)·역할 매트릭스 200/403·deleted_by=UUID psql 실증·403 deny 는 psql 임시 revoke→실증→원복. 증빙 `docs/qa/product-catalog-permission-retrofit/` |

### 3.1 dual review 사이클 요약
- **1a Claude 5-agent**: BE APPROVE · FE/Designer/DevOps 8건 적발(CI 적발 C-0 포함) → 전건 fix. 기각 2건 근거 박제(envelope(null) 원칙·트레일링 슬래시 matchTrailingSlash=true).
- **1b Codex 5-section**: APPROVE — 신규 0. 트레일링 슬래시 기각 동의(gateway 4.1.5 소스 확인).
- **2a fix delta 재검증**: 신규 0 — 수렴.
- **QA Docker 가 dual review 미적발 P1 단독 적발**: D-PCR-01 식별자 단절(아래) — 실서버 QA 의 가치 재입증.

### 3.2 D-PCR-01 (P1, QA 실서버 적발) — 카탈로그 식별자 단절
실DB products 100건 전부 `model_code=NULL` → GET 의 modelCode 필드는 model_name fallback 인데 mutation 조회는 model_code 만 검색 → GET 식별자로 PATCH 시 500. **라우팅 교정으로 처음 도달 가능해지며 노출된 잠복 결함**. fix: `findByCatalogExposedModelCodeAndIsDeletedFalse` (model_code→model_name fallback, 응답 규칙과 왕복 정합) + EntityNotFoundException→404 + model_code NULL 재현 IT. 재실측 T3/T5a/T6 전부 PASS 전환.

## 4. 구현 주체

Codex(MCP `mcp__codex__codex`, workspace-write, reasoning high) 구현 + Claude PM 검증/commit 대행([[feedback_codex_sandbox_git]]). Codex sandbox 가 gradle/playwright 실행 거부(EPERM) → PM 이 로컬 검증 대행, spec 단언 1건 fix 를 Codex 스레드 재요청으로 처리(정규식 이스케이프 형태 불일치).

## 5. 잔여 / 후속

- **D-PCR-02 (P2, 비차단)**: products.list 무권한 dev 계정(기사/사원/배차담당자) V5 seed 부재 — 403 deny 실QA 는 본 PR 에서 psql 임시 revoke→실증→원복으로 충족. dev 계정 seed 추가는 별도 슬라이스 후보.
- lookup 3종 시드 슬라이스(자재 28·ODU 24행) — #418 부터 이월, workbook.json 원천 시드 방식 개발책임자 결정 대기.
