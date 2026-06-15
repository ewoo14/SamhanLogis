# 세트 조회 = 구성품 사양 집계 표시 (사양 후속 #3) — 스펙

> 에픽: 사양(스펙) 후속 큐 (#2→#3→#1). 본 문서 = #3.
> 선행 #2 완료(커밋 `9991bd04`): 종합견적서 사양 모달 현행 동작 실캡처 + 데이터 제약 확정.
> 개발책임자 결정 2건(2026-06-15 회사 PC): **① 범위 = C(DB 상세 전체) ② 싱글세트 구성품 = 물리치수+라벨(실측 데이터)**.

---

## 1. 배경 / 목적

종합견적서(estimate-app) 세트 사양 모달은 현재 **구성품 모델명 + 세트 통합 사양**만 표시하고 **구성품 개별 사양은 미표시**(#2 캡처 `docs/qa/product-master-registration/screenshots/estimate-spec-set-modal.png`). 요구: **세트 조회 시 구성품 사양도 표시.**

## 2. 데이터 실측 (probe — `scripts/spec-coverage-probe.mjs`)

| 세트 종류 | 구성품 모델 | SPEC 전체보유 | 비고 |
|---|---|---|---|
| 상업멀티(COMMULTI 338) | 266 | **266/266** | 구성품=카탈로그 모델(상업멀티/홈멀티 spec 보유) → 완전 구현 |
| 싱글세트(SINGLE_SETS 276) | 329 | 7 (PANEL 4/4, REMOTE 3/11) | INDOOR 0/191·OUTDOOR 0/115·ACCESSORY 0/8 = **개별 사양 부재** |

- 싱글세트 실내기/실외기 카세트 구성품은 **사양 보유 탭(홈/싱글세트/상업멀티 부모 카탈로그)에 미등재** → 시트·DB(`ProductSheetSyncService` 사양 적재 = 부모 탭만) **모두 개별 사양 없음**.
- 단 **세트 자체 spec(`SPEC_DETAIL_MAP[setModel].single`)이 실내기/실외기 물리치수를 분리 보유**: `inSize/outSize`, `inWeight/outWeight`, `inPackSize/outPackSize`, `inPackWeight/outPackWeight`. 성능(cool_cap_kw 등)은 **세트 통합값**(시스템 단위, 분리 불가).
- **가짜 금지([[feedback_no_fake_data_ever]])**: 없는 per-component 성능값 합성 절대 금지.

## 3. 스코프

**본 슬라이스 = estimate-app 세트 사양 모달 + BE `/components` 사양 반환(additive).**
- 후속 슬라이스(별도): ① 데스크톱 구성품 사양(주문/전표 상세 expandedComponents — 계약은 `BundleComponentItem.specText` 준비됨, 전체 사양은 BE 확장 재사용) ② 사양맵 전체 시트→DB 치환(`code.js getSpecDetailMap_` 폐기) ③ #1 사양명 드롭박스(spec-key distinct).

## 4. 표시 설계 (개발책임자 확정 형식)

세트 모달 = **기존(구성 행 + 세트 통합 사양) 유지** + 하단에 **"구성품별 사양" 섹션 신설**.

구성품별 사양 = 각 구성품 1블록(헤더 `[종류] 모델명 · 라벨`) + 사양표:
- **사양 보유 구성품**(상업멀티 전부 / 싱글 판넬·리모컨): 자기 전체 사양표(소스 우선순위 = ① BE 반환 `part.specs`(DB) → ② `SPEC_DETAIL_MAP[part.model]` fallback).
- **싱글 실내기/실외기**(사양 부재): 세트 spec에서 유도한 **물리치수 표** + 분류 라벨. 매핑:
  - 실내기: 치수=`inSize`, 중량=`inWeight`kg, 포장치수=`inPackSize`, 포장중량=`inPackWeight`kg
  - 실외기: 치수=`outSize`, 중량=`outWeight`kg, 포장치수=`outPackSize`, 포장중량=`outPackWeight`kg
  - 값 없으면 행 생략. 성능은 구성품 블록에 넣지 않음(세트 통합 사양에만).
- 빈 값/없는 구성품 블록은 렌더 생략(빈 표 금지).

## 5. BE 변경 (product-service, additive)

`EstimateCatalogInternalController` `/components` (`ComponentRow`):
- `ComponentRow`에 `List<ProductSpecResponse> specs` 필드 추가(없으면 빈 리스트).
- 구현: 기존 `componentProducts`(modelCode→Product) 의 productId 집합 → 신규 repo 메서드로 전체 ProductSpec 일괄 로드 → componentProductCode별 매핑 → row.specs 세팅.
- `ProductSpecRepository`: `List<ProductSpec> findByProductIdInOrderByDisplayOrderAsc(Collection<UUID> productIds)` 추가.
- DTO `ProductSpecResponse`(record id/specKey/specValue/unit/displayOrder) 재사용.
- **호환**: 기존 필드 무변경, 신규 필드만 추가. `/products` 는 본 슬라이스 무변경.
- IT: `ProductCatalogControllerIT` 에 구성품 specs 반환 검증 추가(상업멀티 구성품 specs 비어있지 않음, 싱글 실내기 specs 빈 리스트).

## 6. estimate-app 변경

- `lib/db-catalog.js` `components()`: `ComponentRow.specs` 를 각 구성품 객체에 `specs`(또는 `specMap`)로 매핑(legacy 시트 모드는 미보유 → undefined 허용).
- `views/index.ejs`:
  - `explodeSetParts`/`explodeCommSets_` 가 구성품 객체의 `specs` 를 **그대로 통과**시키는지 확인(누락 시 보존 추가).
  - `renderSingleSpec_`(싱글)·`renderCommSpec_`(상업): 반환 HTML 끝에 `renderComponentSpecs_(parts, setSpec, scope)` 호출 결과 append.
  - 신규 헬퍼 `renderComponentSpecs_(parts, setSpec, scope)`: §4 설계대로 구성품 블록 렌더. 사양 소스 우선순위 = `part.specs`(DB) → `SPEC_DETAIL_MAP[part.model]` → (싱글 실내기/실외기) `setSpec` 물리치수 유도. 기존 `specTable_` 재사용.
- **회귀 0**: 기존 구성 행·세트 통합 사양·홈멀티(`renderHomeSpec_`) 무변경. 모달 외 카탈로그/단가/폭발 로직 무영향.

## 7. QA (Docker 실서버 + 실 캡처 — 가짜 금지)

`scripts/spec-capture-v2.mjs` 확장/신규로 실 캡처(estimate-app :5183, CATALOG_SOURCE=db, 실 product-service):
1. **싱글세트** 모달 — 구성품별 사양 섹션(실내기/실외기 물리치수+라벨, 판넬 전체사양). `docs/qa/set-component-spec-display/single-set-modal.png`.
2. **상업멀티** 모달 — 구성품 전체 사양. `commercial-set-modal.png`.
3. before/after 대비(현행 #2 캡처 vs 신규). 각 리뷰 라운드 코멘트에 인라인 게시([[temp-multimodel-workflow]]).

## 8. 비목표 / 후속
- 데스크톱 주문/전표 구성품 사양(후속 슬라이스, BE 확장 재사용).
- 사양맵 전체 시트→DB 치환(후속).
- #1 사양명 드롭박스(후속, spec-key distinct 엔드포인트 — 본 슬라이스 BE 패턴 재사용).
- 제조사 per-component 성능사양 신규 수집(개발책임자 미선택 — 추후 데이터 슬라이스).

## 9. 워크플로우
Opus 계획(본 문서) → Codex 개발 → Opus 5-agent + Codex 5-agent 교차(각 PR 게시 + Docker 실QA 스크린샷) → CI green + Docker 실QA → PM 종합 → 머지. 모델 = Opus 4.8 ↔ Codex 교대(에러 0까지).

## 10. 구현 노트 (PR #486, 2026-06-15)
- **구현 결과**: §5 BE + §6 estimate-app 전부 구현. 소스 우선순위 ①→②→③ 모두 반영(§4). 상세 dev-report = `docs/dev-reports/2026-06-15-set-component-spec-display.md`.
- **🚨 라이브 QA 단독 적발(P1)**: 상업 카탈로그 단위가 전부 EA(SET 없음)라 최초 구현의 `isSetOutdoor(unit==='SET')` 트리거가 항상 false → 상업 구성품 섹션 미렌더. 트리거를 `catL==='실외기'`(단위 무관)로 수정 + `isSetFallback` 가드로 구성품 없는 실외기 over-trigger 차단.
- **kind 한글 라벨**: BE enum(영문 INDOOR/...) → 한글(`kindLabel_`, KIND_KO 매핑). 모달 내 기존 "구성" 행과 일관.
- **후속(비차단) 데이터 품질**: ① 싱글 판넬/리모컨 일부 DB spec_key 오라벨(#445/#485 자동채움). ② 상업 combo 모듈 kind=ACCESSORY(소스 시트 구분 폴백). 둘 다 데이터 정리 슬라이스(코드 아님).
