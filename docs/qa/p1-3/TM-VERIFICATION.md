# TM 통합 검증 — PR #143 (P1-3 안전재고 알림)

> **branch**: `feature/p1-3-safety-stock-alert`
> **검증일**: 2026-05-11
> **TM**: Tech Manager (Claude Opus 4.7)
> **PR URL**: https://github.com/ewoo14/SamhanLogis/pull/143

---

## 1. 통합 cross-check 결과

| Check | 결과 | 비고 |
|---|---|---|
| UUID 정합성 (V6 seed ↔ V8 seed UUID 재사용) | PASS | `a0a0a0a0-…` 제품 UUID + `11111111-…` 창고 UUID 동일 |
| API contract (BE ↔ FE 경로/필드/롤) | FIX | TM 통합 fix 로 정렬 (이하 §3) |
| 디자인 일관성 (design-system 토큰) | PASS | Badge / Button / DataTable 사용, neutral/danger 토큰 |
| 도메인 정합성 (Layer 4 메서드) | PASS | SafetyStockConfig.create / updateThreshold / updateNote |
| Flyway 의존성 (V7→V8 column 의존) | PASS | V8 seed 가 V7 컬럼만 참조, NULLable + default 보존 |
| 메모리 가드 (UUID 비공개 / Korean / role 풀네임 / @MockBean) | PASS | 관리자 화면 → UUID 노출 허용 명시 (controller javadoc) |

---

## 2. PR #134~#142 회고 가드 점검

| 가드 | 점검 | 결과 |
|---|---|---|
| `feedback_it_mockbean_external_clients` | P13ValidationIT 4종 @MockBean | PASS |
| `feedback_korean_commits` | 모든 commit 한국어 + Co-Authored-By trailer | PASS |
| `feedback_uuid_no_user_visibility` | 관리자 전용 화면 → UUID 노출 허용 명시 | PASS (justified) |
| `feedback_role_naming_full` | MASTER/MANAGER/INVENTORY/WAREHOUSE 풀네임 | PASS |
| `feedback_pr_qa_screenshots` | 본 문서 + QA 스크린샷 후속 첨부 예정 | 후속 |
| project_korean_accounting | 계정과목 무관 슬라이스 | N/A |
| project_build_conventions | BaseEntity 7 audit + Soft Delete (`@SQLRestriction`) | PASS |
| `feedback_no_dev_director_mention` | 본문/코드/주석 모두 미언급 | PASS |
| `feedback_function_documentation` | Javadoc + dev-report + springdoc @Operation | PASS |
| `feedback_gradlew_exec_bit` | gradlew 실행권한 변경 없음 | PASS |
| `feedback_continuous_docs_sync` | dev-report + 매뉴얼 03-재고-조회.md 갱신 | PASS |

---

## 3. TM 발견 blocker 및 자가 fix

### blocker B-1 — BE/FE API contract 전면 불일치

**증상**

| 항목 | BE 구현 | FE 호출 (변경 전) |
|---|---|---|
| 알림 목록 GET | `/inventory/alerts/safety-stock` (List 평면) | `/inventory/safety-stock-alerts` (PageResponse) |
| 알림 건수 GET | (없음) | `/inventory/safety-stock-alerts/count` |
| 임계값 설정 | `POST /inventory/products/{productId}/safety-stock` | `PUT /inventory/safety-stock-configs/{productCode}` |
| 응답 필드 | `productId`/`warehouseId`/`currentQty`/`shortage`/`note` | `productCode`/`modelName`/`warehouseCode`/`availableQty`/`shortfall` |
| 권한 화이트리스트 | MASTER/MANAGER/INVENTORY | MASTER/MANAGER/WAREHOUSE |

**fix**

1. BE — `SafetyStockController` 에 `GET /inventory/alerts/safety-stock/count` 신규 추가 (`{ count: int }` 응답)
2. BE — 모든 안전재고 엔드포인트 @PreAuthorize 에 `WAREHOUSE` 추가 (FE 화이트리스트 정합)
3. FE — `safetyStockApi.ts` 를 BE record 와 1:1 정합 (`SafetyStockAlert` → `productId`/`warehouseId`/`threshold`/`currentQty`/`shortage`/`note`)
4. FE — `SafetyStockAlertsPage` 컬럼/필터를 신규 필드 기반으로 재작성, 창고 UUID → 코드 매핑은 화면단에서 `listWarehouses()` 결과로 보조
5. FE — `mock.ts` 의 SAFETY_STOCK fixture 와 mock 라우터를 BE 정합 경로/필드로 교체 (V8 seed 동일 UUID 사용)
6. IT — P13ValidationIT 시나리오 6-A/6-B/6-C (WAREHOUSE 권한 + count 엔드포인트 200/SALES 403) 추가

### warning W-1 — `checkAndNotify` 미연결

`SafetyStockService.checkAndNotify(productId, warehouseId)` 가 정의되어 있으나 입고/출고/조정 service 어디에서도 호출되지 않는다. 5분 polling (`scheduledCheck`) 으로 보조되므로 기능적 blocker 아님 — 다음 슬라이스 (재고 변동 hook) 에서 연결 권장.

### warning W-2 — `SafetyStockConfigRepository.findAllByProductId` 미사용

신규 메서드가 정의되어 있으나 Service 에서 호출되지 않는다. 임계값 설정 목록 조회 화면 추가 시 사용 예정. blocker 아님.

### nit N-1 — 매뉴얼 reference

`docs/manual/02-창고/03-재고-조회.md` 의 안전재고 섹션 ⛔ → ✅ 갱신은 산출물에 포함됨. URL 변경 (`/inventory/safety-stock-alerts`) 은 그대로 유효.

---

## 4. 자동 머지 정책 점검

| 항목 | 상태 |
|---|---|
| 5-team 0결함 | TM 통합 fix 후 0건 |
| Layer 4 도메인 정합 | PASS |
| BE assemble | PASS (TM 사전 수행) |
| Flyway invariant | PASS |
| @MockBean 4종 격리 | PASS |
| WAREHOUSE 권한 BE-FE 정합 | PASS (TM fix) |
| count 엔드포인트 BE-FE 정합 | PASS (TM fix) |
| 한국어 + Co-Authored-By | PASS |

→ **PM 풀빌드 검증 후 PR 발행 권장.**

---

## 5. 변경 이력

| 일자 | 작성자 | 내용 |
|---|---|---|
| 2026-05-11 | TM (Claude Opus 4.7) | 초안 — cross-check 결과 + blocker B-1 자가 fix 기록 |
