# PR #1133 / Issue #1095 제품 상태 구현 보고서

작성일: 2026-08-09  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1095`  
브랜치: `feat/1095-sheet-product-status`  
커밋/Push: 수행하지 않음

## 1. 실측 결과

### 1.1 Google Sheet 원천

대상 Spreadsheet는 `종합 견적서`(`1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ`)이다. `ProductSheetSyncService`가 읽는 단가 탭의 상태 헤더는 모두 `비고`이며, 상태값은 헤더 위치에서 정확히 일치하는 원문을 세었다.

| 탭 | 상태 컬럼 | 단종 | 미판매 | 품절 |
|---|---:|---:|---:|---:|
| 홈멀티_단가인상 | H | 14 | 0 | 0 |
| 싱글 세트_단가인상 | J | 50 | 12 | 3 |
| 싱글 구성품_단가인상 | 상태값 없음 | 0 | 0 | 0 |
| 상업멀티_단가인상 | I | 24 | 2 | 0 |
| 상업멀티 구성_단가인상 | 상태값 없음 | 0 | 0 | 0 |
| 구형 | 상태값 없음 | 0 | 0 | 0 |
| **합계(셀)** |  | **88** | **14** | **3** |

원문은 `단종`, `미판매`, `품절`의 공백 없는 정확한 문자열이었다. 상태 컬럼에서 공백·괄호·유사어 변형은 발견하지 못했다. 다만 `상업멀티 구성_단가인상`의 품명 셀 `A234`에 `실내기 무풍 벽걸이(단종)`이 있었는데, 상태 컬럼이 아닌 품명 원문이므로 상태로 세지 않았다.

중복 모델코드를 제거한 영향 품목 수는 단종 83개, 미판매 14개, 품절 3개이다. 세 그룹 모두 현재 `product_db.products.model_code`에 대응 행이 있었다.

### 1.2 현재 product_db 상태 분포

읽기 전용 SELECT 기준이다.

| 범위 | ACTIVE | DISCONTINUED | NOT_FOR_SALE | OUT_OF_STOCK |
|---|---:|---:|---:|---:|
| `is_deleted = false` | 3083 | 0 | 0 | 0 |
| 전체 행 | 3217 | 4 | 0 | 0 |

기존 enum에는 `ACTIVE`, `DISCONTINUED`만 있었으므로 미판매·품절 표본은 0이며, 이는 결함 0이 아니라 구현 전 판정 불가 상태다. `products.status`는 VARCHAR이고 기존 CHECK 제약은 없었다.

### 1.3 기존 견적·주문 문서 영향 표본

영향 모델코드/품명으로 현재 DB의 `slip_db` 견적 라인, `slip_lines`, `partner_order_lines`를 읽기 전용 조회했다. 일치 문서 라인은 0건이었다. 따라서 기존 문서를 열어 금액 불변을 확인할 표본이 0이며, RED-E와 불변식 E/F는 **판정 불가**이다. 0건을 결함 0으로 해석하지 않는다.

## 2. RED 원문 및 구현 결과

### RED-A — 상태 동기화

구현 전 원문: `ProductStatus`에는 `ACTIVE("판매중")`, `DISCONTINUED("단종")`만 존재하여 `미판매`, `품절`을 표현할 수 없었다. 따라서 시트 14개 미판매와 3개 품절은 DB 대응 상태를 가질 수 없었다(RED).

구현 후: enum에 `NOT_FOR_SALE("미판매")`, `OUT_OF_STOCK("품절")`을 추가했고, `ProductSheetSyncService`가 `비고`/`상태` 헤더에서 세 문자열을 정확히 매핑한다. 대상 모델코드 83/14/3개가 각각 대응 상태로 저장되는 동기화 통합 테스트가 GREEN이다.

### RED-B — 단종·미판매 새 선택 후보 미표시

기존 웹 견적 카탈로그는 `note`의 `단종`/`미판매`를 후보 차단하는 로직을 이미 갖고 있었으나, 내부 카탈로그 응답에 상태를 공급하지 못했다. `EstimateCatalogInternalController`에 상태를 포함하고 `db-catalog.js`에서 상태를 기존 차단 경로의 표시값으로 연결했다. product-service 전체 테스트는 GREEN이다. 웹 Jest는 이 워크트리에 `jest` 실행 파일이 없어 실행하지 못했다.

### RED-C — 품절 표시 및 수량 입력 차단

기존 웹 카탈로그의 `품절` note 경로가 수량을 잠그고 수량 자리에 `품절`을 표시하도록 되어 있어, `db-catalog.js`에서 `OUT_OF_STOCK`을 그 경로에 연결했다. product-service 자동 검증은 GREEN이나 웹 Jest 및 실제 화면 캡처는 미실행이므로 라이브 UI 판정은 보류한다.

### RED-D — 상태 표기 없는 시트가 기존 상태를 덮어쓰지 않음

상태 셀이 공란이거나 인식되지 않으면 기존 상태를 보존하도록 구현했다. 통합 테스트에서 단종 상태를 저장한 뒤 같은 모델의 상태 셀을 공란으로 재동기화해 단종이 유지되는 것을 확인했으며 GREEN이다. 가격·비고 속성 동기화와 상태 보존을 분리했다.

### RED-E — 기존 문서 보존 및 금액 불변

실측 표본이 0건이므로 판정 불가이다. 기존 라인을 삭제하거나 금액을 재계산하는 코드는 추가하지 않았다.

## 3. 변경 내용

- `ProductStatus`에 미판매·품절 상태와 시트 표시값 파서를 추가.
- `Product.changeStatus`로 null 상태 입력을 방지.
- `ProductSheetSyncService`가 상태 컬럼을 감지해 신규/변경 제품에만 상태를 반영하고, 공란은 기존 상태를 보존.
- 내부 견적 카탈로그 응답에 `status`를 추가하고 웹 카탈로그의 기존 단종·미판매 차단/품절 수량 잠금 경로에 연결.
- Flyway V34에서 네 가지 상태만 허용하는 CHECK 제약 추가.
- 상태 세 가지와 공란 보존을 검증하는 `ProductSheetSyncServiceIT` 추가.

## 4. Flyway 번호 근거

현재 브랜치의 `product-service` 최대 migration은 V32였다. 열린 브랜치를 `git ls-tree -r --name-only origin/<branch> -- services/product-service/src/main/resources/db/migration`으로 확인한 결과, 열린 PR #1152 브랜치가 V33 `V33__mark_non_goods_estimate_candidates.sql`을 사용하고 있었다. 따라서 충돌을 피하기 위해 본 변경은 V34를 사용했다.

추가 파일 `V34__expand_product_statuses.sql`은 `ACTIVE`, `DISCONTINUED`, `NOT_FOR_SALE`, `OUT_OF_STOCK`만 허용한다.

## 5. 검증

- `ProductSheetSyncServiceIT.sync_시트_상태_세_가지_반영하고_상태_공란은_기존상태를_보존한다` — 통과.
- `./gradlew.bat :services:product-service:test` — `BUILD SUCCESSFUL`.
- `git diff --check` — 오류 없음.

## 6. 신규 생성 파일

- `services/product-service/src/main/resources/db/migration/V34__expand_product_statuses.sql`
- `docs/dev-reports/2026-08-09-1095-product-status.md`

기존 트랙 개설 문서 등 기존 파일은 신규 목록에서 제외했다.

## 7. 못 한 것 및 판정 보류

- 실제 Google Sheet 원본 조회와 DB SELECT는 완료했지만, 운영 Sheet를 공유 product DB에 쓰는 실동기화는 실행하지 않았다.
- 웹 Jest는 `jest` 미설치로 실행하지 못했다.
- 데스크톱 네이티브 선택 UI의 별도 상태 표시/수량 잠금에 대한 Playwright 실화면 검증과 QA 스크린샷은 만들지 않았다.
- 기존 문서 영향 표본이 0건이므로 RED-E/F는 판정 불가이다.
- 커밋과 push는 수행하지 않았다.
