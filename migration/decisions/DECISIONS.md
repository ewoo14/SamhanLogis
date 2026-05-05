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

## Phase 1+ 의사결정은 사용자 자료 도착 후 추가
