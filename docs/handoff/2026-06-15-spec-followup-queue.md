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

## #3 (다음) — 세트 조회 = 구성품 사양 집계 표시 (갭 구현) — ⏳ 스코프 결정 대기
**요구**: 세트 조회 시 구성품 사양도 모두 표시(현재 규격 `-`/세트통합값). **그러나 위 데이터 제약으로 "구성품 사양"의 의미·소스가 결정 필요 → 작업량 1시간~다일 차이.** 개발책임자 결정 옵션:
- **(A) 라벨 집계(소)**: 구성품 `.spec` 짧은 라벨(싱글 360/원형노출/무선냉난방)을 세트 모달·세트행에 집계 표시. DETAIL 모드가 보여주는 그 라벨과 동일. estimate-app 단독 소규모.
- **(B) 부분 상세(중)**: SPEC_DETAIL_MAP 보유 7종(판넬/리모컨)만 전체 사양표, 실내기/실외기는 라벨. 일관성 미흡.
- **(C) DB 상세 전체(대·전략정합)**: product-service estimate-catalog(또는 신규 엔드포인트) 확장→구성품별 ProductSpec 전체 반환→세트 모달에 각 구성품 전체 사양표. `code.js` 가 미룬 "사양맵 DB 치환 후속 PR" 수행. [[project_sheets_to_db_full_migration]] 정합 + #1 spec-key 엔드포인트와 시너지. 데스크톱/주문서 사양경로도 동반.
- estimate-app `openSpecModalByItem`/`renderSingleSpec_` + 데스크톱/주문서 사양 표시 경로.

## #1 (마지막) — 사양명 드롭박스 (시드 사양 기반)
사양 등록 시 `사양명` 자유입력 → **`select` 드롭다운**(기존 시드 spec_key 741개에서 선택). 구현: BE distinct spec-key endpoint(`GET /products/spec-keys` 등, ProductSpec distinct spec_key) + FE `ProductFormPage` 사양 행 `사양명`을 Select(+직접입력 허용 옵션). productFormModel/mock/vitest 동반.

## 워크플로우 (동일)
Opus 계획 → Codex 개발 → Opus 5-agent + Codex 교차 → CI green + Docker 실 QA(스크린샷, electron-vite dev 막힘→**렌더러 정적빌드+python http.server:5175+playwright real-qa.config** 우회 검증됨) → 머지.
