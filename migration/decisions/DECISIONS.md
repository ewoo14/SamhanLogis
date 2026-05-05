# Migration 의사결정 기록

각 Phase 별 사용자 확정 사항을 기록.

---

## Phase 0 — 프레임워크 합의 (2026-05-05)

| 결정 | 사유 |
|---|---|
| 자료 확보: clasp + xlsx export (옵션 A) | 코드 무손실 우선 (사용자 명시) |
| 코드 분석 우선 → 시트 데이터 매핑 | 사용자 명시 — "코드를 통해 먼저 코드 분석을 완료하고 이를 토대로 ... 시트의 데이터를 품목 데이터로 마이그레이션" |
| 함수 단위 분석 의무 | 사용자 명시 — "모든 함수마다 분석 완료" |
| 멀티 에이전트 discussion + 다중 재검증 | 사용자 명시 — "여러 에이전트들이 서로 소통하면서 discussion 실행하고 여러번 재검증" |
| QA 엄중 검증 | 사용자 명시 — "QA가 엄중하게 완벽하게 이식이 되었는지 확인 및 테스트 필요" |
| 시트 헤더 위치 가변 | 사용자 명시 — "구글 스프레드시트는 시트별로 열헤더 위치가 다르므로 주의 필요" |
| 시트 export 방식: **Apps Script JSON dump** (xlsx 회피) | 사용자 회고 — xlsx 변환 시 Google 전용 함수 (ARRAYFORMULA/QUERY/IMPORTRANGE) `#NAME?` 깨짐. `getDisplayValues()` 로 화면 표시값 추출 → 무손실. 스크립트 위치: `migration/source/sheet/dump-script.gs` |
| **변동DC 사전 boolean 컬럼** | 사용자 명시 — 기존 Apps Script 가 수식/단어 감지로 runtime 판정하는 변동DC 여부를 product 도메인에 `hasVariableDiscount: boolean` 으로 사전 저장. 상세: `DOMAIN-EXTENSIONS.md` §1 |
| **세트(Bundle) 품목 처리** | 사용자 명시 — 일부 품목은 세트 구조. Phase 1 분석 후 옵션 A/B/C 중 확정 (default 추천: A — productType enum + bundleComponents). 상세: `DOMAIN-EXTENSIONS.md` §2 |

---

## Phase 2 — Cross-review 후 확정 (2026-05-05)

| 결정 | 사유 |
|---|---|
| **이카운트 외부 의존 제거 → SamhanLogis 출고전표 자체 생성** | 사용자 명시 — "코드 내부 이카운트 전송 -> 우리 프로그램 출고전표 생성". e-Count `/sale` (estimate, 판매전표 즉시) + `/saleorder` (partner-order, 판매주문) 양 endpoint 모두 slip-service 출고전표 생성으로 대체. ecount-gateway-service 신규 **불요**. e-Count 평문 자격증명 (양 스크립트 `getScriptCreds_`) 폐기. |
| **Notion DB 9종 의존 제거 → SamhanLogis MS DB 저장** | 사용자 명시 — "노션 저장 -> 우리 프로그램 데이터베이스에 저장". SECRETS-MAP §1 의 토큰 9종 모두 마이그 후 폐기. 각 Notion DB → SamhanLogis MS endpoint 매핑 표 (Phase 4 Plan 의무). 운영 전환 시점에 Notion 기존 데이터 1회 export → SamhanLogis DB 시드. |
| **변동DC 4-컬럼 안 채택** | Phase 2 cross-review 권장 — partner-order.md §5 의 4-컬럼 (`hasVariableDiscount`/`fixedDiscountRate`/`setMaterialKey`/`legacyDiscountFlag`) 가 estimate.md 의 단일 enum 보다 우월 (룰 1/2/3 분리 표현 가능). DOMAIN-EXTENSIONS §1 갱신. |
| **Bundle 옵션 A + bundleMode(EXPAND/KEEP) 확정** | Phase 2 cross-review 권장 — productType enum (SINGLE/BUNDLE) + bundleComponents 위에 `bundleMode: enum EXPAND/KEEP` 추가. SEND_AS_SET_IDS 화이트리스트 (4 SKU) 는 KEEP, 나머지 BUNDLE 은 EXPAND. DOMAIN-EXTENSIONS §2 갱신. |
| **Phase 1.5 보정 작업 의무** | Phase 2 cross-review 발견 — partner-order Code.js 81→87 (6 누락) + index.html 256 inventory 미수행 + workbook.json formulas re-export (변동DC 룰 검증). |

---

## Phase 3 — Sheet 스키마 분석 후 확정 (2026-05-05) — G1~G8 모두 추천대로

| 게이트 | 항목 | 사용자 결정 (추천 채택) |
|---|---|---|
| **G1** | 분기계산 시트 (~99 row, A열 코드 lookup) | **시드** — `BranchPipeLookup` entity (product-service sub-domain). A열 코드 의미는 Phase 6 시드 스크립트 작성 시 추가 spot-check |
| **G2** | 상업멀티 구성_단가인상 사용 비대칭 (PM spot-check 결과 공유) | **확인** — estimate `Code.js:64` = `상업멀티 구성_단가인상`, partner-order `Code.js:50` = `상업멀티 구성`. 양 시트 모두 시드 (PriceHistory 분리로 흡수) |
| **G3** | 시트 마스터 충돌 4쌍 → PriceHistory 분리 모델 | **승인** — 동일 ProductMaster + PriceHistory 2 row (effectiveDate=과거 / `2026-04-01`) |
| **G4** | PRICE_INC_DATE 상수 위치 (PM grep 결과) | **확인** — `partner-order/index.html:1274` `const PRICE_INC_DATE = '2026-04-01';`. 단일 상수 → `PriceHistory.effectiveDate` 로 직접 사용 |
| **G5** | 거래처 그룹 컬럼 정책 (distinct 14, SF 42% / 빈 40% / 일반업체 12% / 기타 6%) | **enum 표준화** — `PartnerGroup enum {SF, GENERAL, OTHER}` + **빈 그룹 default = GENERAL** (마이그 시 14 distinct → 3 enum 매핑 표 별도 작성) |
| **G6** | 거래처 `싱글 할인` 컬럼 (208 row 채워짐) | **활성 보존** — `PartnerMaster.singleDiscountRate decimal nullable` 컬럼 시드. Phase 6 BE 구현 시 사용처 spot-check 추가 |
| **G7** | 전표생성폼 평문 자격증명 4종 | **시트 폐기 + Vault 이전** — 이카운트 의존 0 결정 (Phase 2) 으로 e-Count 자격증명 폐기. 단 운영 전환 마지막 1회 export 위해 일시적 Vault 이전 |
| **G8** | `setMaterialKey` enum 확장 `{D7, D8}` → `{D4, D7, D8}` | **승인** — D4 가 가장 많은 245 hits (자재 합계 default master). DOMAIN-EXTENSIONS §1 갱신 완료 |

---

## Phase 3.5 — 도메인 확장 추가 (Phase 4 진행 중 사용자 신규 요청, 2026-05-05)

| 결정 | 사유 |
|---|---|
| **품목 노출 분류 — usageScope + estimateCategory** | 사용자 명시 — "품목 데이터에서 견적/주문서용 품목 (견적서 중에서도 어디로 분류할지 선택 가능) 을 선택할 수 있게 분류 / 분류되지 않은 품목은 견적서 및 주문서에 나타나지 않음". ProductMaster 신규 2 컬럼 (`usageScope enum {NONE, ESTIMATE, PARTNER_ORDER, BOTH}` default NONE + `estimateCategory enum {HOME_MULTI, SINGLE_SET, COMMERCIAL_MULTI, LEGACY, OTHER} nullable`). 시드 시 시트 출처 기반 자동 분류. 상세: `DOMAIN-EXTENSIONS.md` §3 |
| **품목 동적 스펙 — ProductSpec 1:N + SpecKeyTemplate** | 사용자 명시 — "스펙의 경우 품목마다 종류가 다르므로 동적으로 스펙을 선택 추가 및 삭제 가능하도록 조정 / 종류는 견적서 코드의 스펙 관련 함수를 통해 확인 바람". ProductMaster 의 정적 spec 컬럼 대신 1:N ProductSpec entity (productMasterId/specKey/specValue/unit/displayOrder). 카테고리별 추천 키는 SpecKeyTemplate (53 row 시드). spec 키 출처: estimate Code.js `getSpecDetailMap_()` (line 1006-1364) 의 `scanHome/scanSingle/scanComm` 함수 spec 컬럼 매핑 그대로 채택. 상세: `DOMAIN-EXTENSIONS.md` §4 |

---

## Phase 4+ 의사결정은 Migration Plan 산출 후 추가
