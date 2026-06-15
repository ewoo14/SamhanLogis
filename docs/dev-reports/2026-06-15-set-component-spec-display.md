# 세트 조회 = 구성품별 사양 표시 — 개발 리포트 (PR #486)

> 2026-06-15 세션. 사양(스펙) 후속 큐 #3 (개발책임자 순서 #2→#3→#1). 다모델 워크플로우(Opus 계획/PR → Codex 개발 → Opus 5-agent → Codex 5-agent → Opus 수렴 → PM 머지).
> 관련: 스펙 `docs/superpowers/specs/2026-06-15-set-component-spec-display.md`, 메모리 [[estimate-spec-data-sources]] / [[quotation-estimate-app-state]].

## 1. 배경·결정
종합견적서(estimate-app) 세트 사양 모달은 기존에 **구성품 모델명 + 세트 통합 사양**만 표시(#2 캡처). 세트 조회 시 **구성품 개별 사양**도 표시하도록 확장.

**개발책임자 결정 2건:**
- **범위 = C(DB 상세 전체)** — product-service estimate-catalog 확장 → 구성품별 ProductSpec → 세트 모달 각 구성품 사양표.
- **싱글세트 구성품 = 물리치수+라벨(실측)** — 실내기/실외기는 치수·중량·포장(세트 spec inSize/outSize 유도)+분류 라벨, 판넬/리모컨은 전체 사양, 상업멀티는 구성품 전체 사양. **성능(냉방/난방)은 세트 통합값 유지**(시스템 단위·분리불가·실데이터 부재 → 합성 금지).

## 2. 구현 (BE — product-service, additive)
- `EstimateCatalogInternalController` `/components` 응답 `ComponentRow` 마지막 필드에 `List<ProductSpecResponse> specs` 추가. 구성품 Product 조인 직후 ProductSpec 을 **1 벌크쿼리**로 일괄 로드 → `componentProductCode`별 매핑 → row.specs 세팅(없으면 `List.of()`).
- `ProductSpecRepository.findByProductIdInOrderByDisplayOrderAsc(Collection<UUID>)` 신규(displayOrder 정렬 벌크).
- 기존 `/products`·`loadSpecs()`·기타 endpoint **무변경**. DB 마이그 불요(응답 DTO 확장).
- `EstimateCatalogInternalControllerIT` 신규: 상업멀티 구성품 specs 반환(non-vacuous) + 싱글 실내기 spec 부재 시 빈 배열 검증. X-Internal-Token `test-internal-token`.

## 3. 구현 (FE — estimate-app)
- `lib/db-catalog.js`·`explodeSetParts`·`explodeCommSets_` 가 구성품 `specs` 를 통과(보존).
- `views/index.ejs` 신규 `renderComponentSpecs_(parts, setSpec, scope)`: 구성품 1블록(헤더 `[종류] 모델 · 품명` + 사양표). 소스 우선순위 **① part.specs(DB) → ② SPEC_DETAIL_MAP[model][scope] fallback → ③ 싱글 실내/외 세트 spec 물리치수**. 빈 행/빈 블록/빈 섹션 생략(가짜 금지).
- `renderSingleSpec_`·`renderCommSpec_` 하단에 섹션 append(판넬·triple·메인 return 망라, ERV 제외). 홈멀티·세트 통합 사양표·구성 행 무변경.

## 4. 다모델 리뷰 (Opus ↔ Codex, 수렴 0 P1/P2)
- **라운드 A (Opus 5-agent)**: BE 0·DevOps 0(CI 필터없음 IT 실행·마이그불요). **P2-1**(영문 enum kind 라벨 `[INDOOR]` vs 기존 한글 `[실내기]` 혼재) FE·Designer 독립 적발 → Opus fix(`kindLabel_` 한글 매핑). **🚨 P1 라이브 QA 단독 적발**: 상업 카탈로그 단위가 전부 EA(SET 없음)라 `isSetOutdoor(unit==='SET')` 게이트가 항상 false → 상업 구성품 섹션 통째로 미렌더 → 트리거 `catL==='실외기'`로 fix(정적 4-agent 미적발).
- **라운드 B (Codex 5-agent 교차)**: ① HTML escape 하드닝 ② SPEC_DETAIL_MAP fallback(스펙 §4 ② 누락 보강) ③ **isSetFallback 가드**(상업 트리거 확장 시 구성품 없는 실외기 자체 사양이 스퓨리어스 블록으로 새는 over-trigger 차단) ④ explodeCommSets_ kind 전달. Opus fix 양쪽 OK 판정.
- **라운드 C (Opus 수렴)**: FE-C 0(Codex 4변경 전건 통과, 8 상업 케이스 over-trigger probe 검증) · Designer-C 0([부속] 라벨 = ACCESSORY 스키마 DEFAULT+matchKind 폴백 충실반영, A안 유지 권장).

## 5. QA (Docker 실서버, 실데이터, 가짜 없음)
product-service 리빌드(+specs) + estimate-app :5183 `CATALOG_SOURCE=db`. `scripts/set-component-spec-capture.mjs`.
- **싱글세트** `360 CST UV`: `[실내기]/[실외기]` 물리치수, `[판넬]/[리모컨]` DB 사양, 전부 한글 라벨. (`docs/qa/set-component-spec-display/single-set-modal.png`)
- **상업멀티** `GHP 36HP`: 구성품(16HP/20HP 모듈) 각 12 DB 사양. (`commercial-set-modal.png`)
- 실 데이터: 상업 구성품 137/137 DB 사양, 싱글 판넬 16/16. 실내/외 0(물리치수 fallback).
- 검증: BE compile·product-service 244 테스트·estimate-app jest 71 PASS. **신규 IT = CI Linux Docker 실행 green**(로컬 Windows npipe skip). CI 25/25 green.

## 6. 후속(비차단) — 데이터 품질
- **싱글 판넬/리모컨 일부 DB spec_key 오라벨**: `냉방성능(정격): Ø1020`(실제 타공사이즈) 등. #445/#485 자동채움의 사전존재 데이터 이슈(코드 충실 표시). → 데이터 정리 슬라이스.
- **상업 combo 모듈 kind=ACCESSORY**: 소스 시트 `구분` 미명시 → `matchKind` 폴백. GHP/HP 패턴 OUTDOOR 규칙 또는 시트 보정. → 데이터/분류 후속.
- detailRows_ 싱글 scope flat-key(size) vs SDM in/out-key 미정합 — 현재 실데이터 미도달(②가 싱글 구성품에 도달 0건), 운영 영향 없음.
