---
name: project-estimate-spec-data-sources
description: estimate-app 사양맵은 마지막 시트 소스, 구성품 개별 사양 가용성(상업멀티 전부/싱글 실내외 부재)
metadata:
  type: project
---

estimate-app(종합견적서) 사양 데이터 아키텍처 (2026-06-15 #3 정찰 확정):

- **카탈로그는 #30 으로 DB 전환 완료**(`CATALOG_SOURCE=db` → product-service `/products/internal/estimate-catalog/*`), 그러나 **사양맵(SPEC_DETAIL_MAP, `lib/code.js` `getSpecDetailMap_`)은 유일하게 시트(Google Sheets) 소스로 잔존** — code.js:1704 주석 "사양맵...시트 read 유지(후속 PR)". 사양맵 시트→DB 치환은 미수행 후속 과제.
- **ProductSpec(1:N) 적재 규칙**(`ProductSheetSyncService`): **사양 보유 탭(홈멀티/싱글세트/상업멀티 = 부모 카탈로그)만** spec_key=헤더로 적재(blocklist). **구성품 탭(싱글 구성품/상업멀티 구성)은 specText(짧은 분류 라벨)만**.
- **구성품 개별 사양 가용성**(probe `clients/web/estimate-app/scripts/spec-coverage-probe.mjs`): **상업멀티 구성품 266/266 전체 사양 보유**(구성품이 카탈로그 모델). **싱글세트는 INDOOR 0/191·OUTDOOR 0/115·PANEL 4/4·REMOTE 3/11** — 싱글세트 전용 실내기/실외기 카세트는 부모 카탈로그 미등재라 시트·DB 모두 개별 사양 부재. 단 **세트 spec 엔트리에 inSize/outSize/inWeight/outWeight 등 물리치수는 실내기/실외기 분리 보유**(성능은 세트 통합값, 시스템 단위라 분리불가).
- estimate-catalog `/components` 엔드포인트는 현재 구성품 ProductSpec 미노출(specText만). 데스크톱은 구성품 사양 표시 경로 자체가 없음(expandedComponents=모델명/수량만).

**활용**: 세트 구성품 사양/사양맵 관련 작업 시 — 상업멀티는 DB/시트맵에서 바로 전체 사양 가능, 싱글세트 실내기/실외기는 물리치수+라벨까지만(성능 합성 금지 [[feedback_no_fake_data_ever]]). 진짜 per-component 성능은 제조사 카탈로그 신규 수집 필요. [[project_replaces_ecount_gas_was_exporter]] [[project_sheets_to_db_full_migration]] 정합.
