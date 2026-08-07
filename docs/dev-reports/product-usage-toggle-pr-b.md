# 요구사항1 PR-B — 품목 노출 수동 토글 + usageScope 필터 실효화 + 품목관리 화면 (PR #460)

> 2026-06-11 야간 자율 (개발책임자 위임). #457(PR-A) 명시 이월 스코프.
> spec: [docs/superpowers/specs/2026-06-11-product-usage-toggle-pr-b-spec.md](../superpowers/specs/2026-06-11-product-usage-toggle-pr-b-spec.md)

## 설계 결정

- **수동 override 모델 = 단일 `usage_scope` + `usage_scope_manual` 플래그** (V14) — 조회 필터가 기존 컬럼을 그대로 쓰도록 (COALESCE 이중 컬럼 기각). PATCH 시 manual=true, '시트 자동 복귀'(DELETE) 시 플래그만 해제(값 유지) → 다음 sync 재분류.
- **sync 보존 가드**: `usageScopeManual=true` 품목은 usageScope/estimateCategory 무변경 (displayOrder 는 update 분기 진입 시 갱신). **soft-delete 보호** — 시트 부재여도 manual 품목 유지 (개발책임자 "시트에 없는 품목도 수동 노출" 결정 부합, `preservedManual` 카운터 분리).
- **rowHash 캐시 evict**: 시트 복귀 시 `evictRowHash(실제 model_code)` — 행 내용 무변경이어도 다음 sync 가 재분류 (사이클1 P1 적발분).
- **usageScope 질의 = IN-확장 시멘틱**: ESTIMATE→+BOTH / PARTNER_ORDER→+BOTH / BOTH·NONE exact (`findExposedCatalog` 패턴 통일) — BOTH 시드 품목이 주문서 질의에서 빠지는 공집합 결함 해소 (사이클1 P1).
- **라우팅 정정 (정찰 오류 교훈)**: `/api/v1/products` 는 게이트웨이 정확경로로 **ProductCatalogController** 가 담당 — 최초 정찰이 ProductController 로 오인. q 검색·IN-확장은 catalog 경로에 배선, `/products` 경로는 exact-match 분기 Javadoc 명시.

## BE (product-service)

| 항목 | 내용 |
|---|---|
| V14 | `products.usage_scope_manual BOOLEAN NOT NULL DEFAULT FALSE` |
| 도메인 | `markUsageManual(scope, category)` (NONE/PARTNER_ORDER 시 category 강제 null — changeUsage 보다 엄격) / `clearUsageManual()` |
| API | `PATCH·DELETE /api/v1/products/{modelCode}/usage` (products.admin UPDATE, 서비스 위임 일원화) / catalog `GET /api/v1/products` 에 `q`(model_code+name+**model_name** LIKE, 와일드카드 이스케이프) + usageScope IN-확장 + `ORDER BY display_order NULLS LAST, model_code` 결정 페이징 |
| 응답 | usageScope/estimateCategory/usageScopeManual/displayOrder 노출 |
| 테스트 | 전체 green — 신규: 도메인 7, sync IT(보존/복귀 재분류/soft-delete 보호/estimateCategory null) , catalog IT(포함·배제 양면/BOTH 포함/q·레거시 행·와일드카드/정렬), deny lockout |

## FE (desktop)

| 항목 | 내용 |
|---|---|
| 품목 관리 페이지 | `/products/catalog` 신설 — DataTable, '견적 노출'/'주문 노출' 토글(usageScope 4조합 매핑), 시트자동·수동 뱃지, '시트 자동 복귀', DS Input/Select, products.list VIEW + products.admin UPDATE 게이트 |
| 메뉴 | 좌측 '품목' 그룹 ('품목 관리' + '시트 동기화' 이동) — 5대분류 재편은 별도 슬라이스 |
| mock | PATCH bare DTO + estimateCategory null-정리 룰 복제 / DELETE 204 동형 / 404 동형 / IN-확장 필터 / 경로 선점 순서 가드 |
| 검증 | typecheck/lint/build green, Playwright product-catalog 4 TC (토글 왕복·시트 복귀·view-only) |

## 리뷰 사이클 (dual — Codex 한도 다운, Claude 5축 Workflow 대체)

- **사이클1** (40 에이전트): 확정 32 (유니크 P1 3·P2 4·P3 9) / 기각 3 → 전건 fix `1bacbb4e`. P1 = 라우팅 오배선(+q no-op·mock false-green) / rowHash 캐시 재분류 불능 / IN-확장 부재.
- **사이클2** (40 에이전트, Verify 일부 토큰 한도 중단 — fix 단계에서 코드 재확인으로 보완): **5축 만장일치 사이클1 P1 전건 실해소 + 신규 P1 없음**. 잔존 P2 3·P3 다수 → 전건 fix/근거 보고 `cb099ab3`.

## QA (Docker 실서버)

- [docs/qa/product-usage-toggle-pr-b/RESULTS.md](../qa/product-usage-toggle-pr-b/RESULTS.md) — 1차(fd8c9917): T1/T2/T4/T6/T7 PASS, T3 SKIP(컨테이너 SA key 미마운트 — 보존 가드는 IT 커버), T5 PARTIAL. 보충(cb099ab3): T4R catalog 실경로 IN-확장 / T8 q 검색 / T5R 견적 카탈로그 / T9R 페이징 결정성.
- GitGuardian "2 secrets" = 실QA 스펙 ${QA_DEV_DEFAULT_PASSWORD} 2회 — **PM FP 판정** (V5 dev seed, ignored-matches 기등재).

## 회고 메모

- **정찰 단계에서 게이트웨이 라우팅표 대조 의무**: FE 가 호출하는 URL 만 보고 BE 컨트롤러를 추정하면 정확경로/strip 라우트 분기를 놓침 — 본 슬라이스 P1 의 근원. 이후 정찰은 api-gateway application.yml 라우트와 대조.
- mock 만 선행 구현된 endpoint 는 구현 시 mock 형상이 아닌 **BE 실 컨트롤러 반환 타입이 진실원** (bare DTO vs envelope).
- 동일 파라미터명(usageScope)이 경로별 다른 시멘틱(exact vs IN-확장)이면 Javadoc 분기 명시 의무.
