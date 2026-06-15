# 사양(스펙) 후속 큐 — 2026-06-15 (개발책임자 순서: 2 → 3 → 1)

> PR #485(품목 등록/관리 고도화) 머지 완료 후속. 동적 사양 등록은 #485에 포함(ProductSpec 1:N, 사양 섹션 종류 무관 항상 표시). 아래 3건은 컨텍스트 소진으로 다음 세션 연속.

## #2 (먼저) — 종합견적서 사양 표시 실 캡처 ✅ 완료 (2026-06-15 회사 PC)
**실 캡처 완료** — estimate-app 로컬 dev 서버 `:5183`(`CATALOG_SOURCE=db`, 게이트 우회·`?email=` 진입). 산출: `docs/qa/product-master-registration/screenshots/estimate-spec-set-modal.png/.txt`, `estimate-spec-home-modal.png/.txt`, `estimate-catalog-overview.png`. 캡처 스크립트=`clients/web/estimate-app/scripts/spec-capture-v2.mjs`(+`spec-component-probe.mjs`). **실 시드+실 사양맵, mock 미사용. 모달은 dblclick 가 호출하는 동일 production 함수 `openSpecModalByItem(item,scope)` 직접 호출**(카탈로그 테이블이 비활성 탭이라 헤드리스 셀 dblclick=not visible → 동일 코드경로 직접 호출).

**확정 현행 동작:**
- **일반 품목**(예 실외기 AJ060MXHNBC1) → 자기 **전체 사양표** 표시(배관경·냉방성능·소비전력·치수·중량·최대연결대수 등). ✓
- **세트**(예 360 CST UV / AC060CS6PBH1SY, 구성품 4) → **① 구성 행 = 구성품 모델명만**([실내기]AC060CN6PBH1 [실외기]AC060CXAPBH1 [판넬]PC6NUNK1NW [리모컨]AR-EH05) **② 세트 통합 사양**(배관경·냉방/난방성능 등은 세트 단일값, 제품크기/중량/포장만 실내기·실외기 분리). **→ 각 구성품의 개별 상세 사양표 없음 = #3 갭 실체 확정.**

**🔴 #3 데이터 제약 발견 (probe 결과 — 핸드오프 '데이터 기반 OK'는 BE 한정):**
- estimate-app **사양맵(specDetailMap)은 마지막 시트 소스**(카탈로그는 #30 으로 DB 전환됐으나 `code.js:1704-5` "사양맵...시트 read 유지(후속 PR)"). product-service estimate-catalog 엔드포인트도 구성품은 `specText`(짧은 라벨)만 노출.
- **구성품 모델 329개 중 SPEC_DETAIL_MAP 개별 상세사양 엔트리 보유 = 단 7개**(판넬/리모컨류만, COMM 시트에 우연 존재). **핵심 실내기/실외기는 개별 엔트리 0**(세트 전용 구성품이라 HOME/COMM 독립 카탈로그에 없음). `.spec`/`specText`는 "싱글 360" 같은 분류 라벨뿐.
- 상세 per-component 사양은 **product-service ProductSpec(#485 741 spec_key + #445 자동채움)에 존재하나 estimate-catalog 가 구성품별로 미노출.**

## #3 (진행중) — 세트 조회 = 구성품 사양 집계 표시 — ✅ 스코프 확정, 🔨 구현 대기
**개발책임자 결정 2건(2026-06-15 회사 PC):**
1. **범위 = C(DB 상세 전체)** — product-service estimate-catalog 확장→구성품별 ProductSpec→세트 모달 각 구성품 사양표.
2. **싱글세트 구성품 = 물리치수+라벨(실측 데이터)** — 실내기/실외기는 치수·중량·포장(세트 spec inSize/outSize 유도)+분류 라벨, 판넬/리모컨은 전체 사양, 상업멀티는 구성품 전체 사양. **성능(냉방/난방)은 세트 통합값 유지**(시스템 단위·분리불가·실데이터 부재 → 합성 금지 [[feedback_no_fake_data_ever]]).

**📋 스펙 = `docs/superpowers/specs/2026-06-15-set-component-spec-display.md`** (Opus 계획 완료).

**데이터 커버리지(probe `scripts/spec-coverage-probe.mjs`)**: 상업멀티 구성품 266/266 전체사양✓ / 싱글세트 INDOOR 0/191·OUTDOOR 0/115·PANEL 4/4·REMOTE 3/11. 싱글 실내기/실외기는 시트·DB 모두 개별사양 부재(부모 카탈로그 미등재). 단 세트 spec 에 inSize/outSize/inWeight/outWeight 등 물리치수 분리 보유. **효율 포인트**: 상업멀티·싱글 판넬/리모컨 구성품 사양은 이미 client SPEC_DETAIL_MAP 에 존재 → estimate-app 모달은 주로 렌더 변경. BE `/components` ProductSpec 반환은 additive(DB 정합+데스크톱+#1 시너지).

**본 슬라이스 스코프**: ① BE `EstimateCatalogInternalController` `/components` ComponentRow 에 `List<ProductSpecResponse> specs` 추가(additive, `ProductSpecRepository.findByProductIdInOrderByDisplayOrderAsc` 신규) ② estimate-app `db-catalog.js` 구성품 specs 매핑 + `views/index.ejs` `renderSingleSpec_`/`renderCommSpec_` 에 `renderComponentSpecs_` 섹션 신설(소스 우선순위 part.specs→SPEC_DETAIL_MAP→싱글 실내/외 물리치수 유도). **후속 슬라이스**: 데스크톱 주문/전표 구성품 사양 / 사양맵 전체 시트→DB 치환 / #1 사양명 드롭박스.

**🪤 Codex MCP**: 본 세션 `mcp__codex__codex` 미노출([[feedback_codex_mcp_session_limit]]). codex CLI 0.131.0 가용 → `codex exec` 우회(`</dev/null`+approval never+workspace-write, Codex git 금지·Claude commit 대행) 또는 새 세션(MCP 복구). **다음 = Codex 개발(BE+estimate-app) → Opus/Codex 5-agent → CI+Docker 실QA(싱글세트·상업멀티 모달 캡처) → 머지.**

## #1 (마지막) — 사양명 드롭박스 (시드 사양 기반)
사양 등록 시 `사양명` 자유입력 → **`select` 드롭다운**(기존 시드 spec_key 741개에서 선택). 구현: BE distinct spec-key endpoint(`GET /products/spec-keys` 등, ProductSpec distinct spec_key) + FE `ProductFormPage` 사양 행 `사양명`을 Select(+직접입력 허용 옵션). productFormModel/mock/vitest 동반.

## 워크플로우 (동일)
Opus 계획 → Codex 개발 → Opus 5-agent + Codex 교차 → CI green + Docker 실 QA(스크린샷, electron-vite dev 막힘→**렌더러 정적빌드+python http.server:5175+playwright real-qa.config** 우회 검증됨) → 머지.
