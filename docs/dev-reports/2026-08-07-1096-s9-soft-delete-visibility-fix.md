# PR #1097 / 이슈 #1096 — S9 soft-delete visibility fix

## 결론

F1의 원인은 삭제 감사/복원 표면을 활성 업무 목록에 기본으로 합친 FE 호출과, 견적 목록의 삭제 포함 native query 고정이었다. 세 문서 목록의 기본 조회를 활성 전용으로 바꾸고 `삭제 문서 포함`을 명시적으로 켤 때만 삭제행을 조회하도록 계약을 통일했다.

F2의 103건은 이번 워크트리에서 추가 migration 대상이나 제외 대상으로 확정하지 않았다. 기존 증거는 `created_by`별 집계와 일부 화면 표식뿐이며, 지시서가 요구한 문서번호/source_type/메모/라인 snapshot/생성시각 전수표가 없다. Docker·서비스 재기동과 DB 쓰기가 금지된 상태에서 이 집합을 추측으로 soft-delete하면 정상 service 문서를 오삭제할 수 있으므로 **RED-C BLOCKED / 개발책임자 판정 대기**로 남겼다. V117/V31/V18은 수정하지 않았다.

## 변경 사항

| 경로 | 기본 상태 | 명시적 토글 | 백엔드/카운터 |
|---|---|---|---|
| `/sales/estimates` | `includeDeleted` 미전송 → `is_deleted=false` | `estimate-list-include-deleted` | `EstimateRepository.searchIncludingDeleted`에 `includeDeleted` 조건과 countQuery를 함께 적용 |
| `/sales/partner-orders` | `includeDeleted` 미전송 | `partner-order-list-include-deleted` | 기존 BE opt-in 계약 유지; 실패 건수 집계도 활성 기본값 |
| `/sales/slips` OUTBOUND | `includeDeleted` 미전송 | `slip-list-include-deleted` | 기존 BE OUTBOUND opt-in 계약 유지; Excel도 화면 상태와 파리티 |
| `/purchases/slips` INBOUND | 활성 전용 유지 | 없음 | `SlipController`가 INBOUND의 includeDeleted를 차단 |
| 품목 카탈로그 | 활성 전용 유지 | 없음 | `Product`의 `@SQLRestriction` 및 `searchByUsageScope` 경로 확인 |

삭제행을 포함한 상태에서도 삭제자/삭제시각/복원 가능 여부와 삭제행 상세 진입 차단은 기존 렌더링 계약을 유지했다. 페이지·카운터는 같은 API Page를 사용한다.

## ② `is_deleted` 필터 누락 전수 grep 표

범위: `clients/desktop/src/renderer`의 견적·주문·전표·품목 목록 API/페이지와 해당 서비스의 목록 repository/service/controller/domain. `includeDeleted=true`는 감사/복원 opt-in으로 분류하고, 기본 경로가 활성 필터인지 확인했다.

| 도메인/경로 | 조회 경로 | 결과 | 근거 |
|---|---|---|---|
| 견적 목록 | `EstimateListPage → listEstimates → EstimateController → EstimateService → EstimateRepository.searchIncludingDeleted` | **수정 완료** | 기본 false, SQL/ countQuery 모두 `:includeDeleted = TRUE OR e.is_deleted = FALSE` |
| 견적 상세 | `EstimateService.getOne → findById` 및 번호 조회 `findByEstimateNo` | **활성 전용** | `Estimate @SQLRestriction("is_deleted = false")` |
| 주문 목록 | `SalesPartnerOrderListPage → listPartnerOrders` | **수정 완료** | 기본 호출에서 true 제거, 토글 시에만 true |
| 주문 상세/복원 | `PartnerOrderRepository` 기본 조회 / 별도 `findByIdIncludingDeleted` | **의도된 분리** | 엔티티 `@SQLRestriction`; 복원만 명시적 including-deleted |
| 판매전표 목록 | `SlipListPage → listSlips` | **수정 완료** | 기본 호출에서 true 제거, OUTBOUND 토글 시에만 true |
| 전표 상세 | `SlipRepository.findById` 등 기본 JPA 경로 | **활성 전용** | `Slip @SQLRestriction("is_deleted = false")` |
| 품목 카탈로그 | `ProductCatalogController → ProductRepository.searchByUsageScope` | **활성 전용** | `Product @SQLRestriction`; 삭제 포함 목록 API/FE 경로 없음 |
| 품목 lookup | `ProductService.lookup/search` | **활성 전용** | `findAllByIdIn` 및 search가 엔티티 restriction 적용 |
| Excel | `SlipListPage → exportSlips` | **수정 완료** | 화면의 `isOutbound && includeDeleted`와 동일한 opt-in |

발견한 셋째 가능성: 삭제행을 관리자가 봐야 한다는 설계 자체는 유효하지만, 그것은 기본 업무 모집단과 분리된 명시적 opt-in이어야 한다. 따라서 삭제행을 완전히 제거하지 않고 토글로 분리했다.

## ① 새로 가능해진 상태·조합 실행

| 조합 | 자동 테스트/실행 | 결과 |
|---|---|---|
| 견적 기본 + 상태/기간 필터 | `EstimateListPage` query key/호출 테스트 | PASS |
| 견적 삭제 포함 토글 + 동일 필터 | API/페이지 테스트 | PASS |
| 주문 기본 + DRAFT/검색/발행실패 집계 | 페이지 테스트 | PASS |
| 주문 삭제 포함 토글 + 복원행 렌더링 | 페이지 기존 복원 테스트 + 신규 토글 테스트 | PASS |
| 판매 OUTBOUND 기본 + 배송태그/Excel | API 계약 및 기존 화면 계약 | PASS |
| 판매 OUTBOUND 삭제 포함 토글 | API 계약 + `SlipListPage` 호출 경로 정적 확인 | PASS (전용 화면 테스트 부재) |
| INBOUND 기본/토글 누출 | `SlipController`의 OUTBOUND 한정 조건과 FE 조건 확인 | PASS (코드 기준) |
| 삭제행 직접 상세 진입 | Estimate/Slip/PartnerOrder 엔티티 restriction 및 FE rowClickable 확인 | PASS (코드 기준) |
| 활성 문서 보존 | 아래 RED-B 참조 | 실 DB 재측정 BLOCKED |

## RED 실행 원문 및 판정

### RED-A — 삭제행 기본 비노출

실패 재현 원문:

```text
Estimate API: expected last call params { page: 0, size: 50 }
             but implementation had no includeDeleted opt-in contract.
SalesPartnerOrderListPage: expected filters not to have includeDeleted=true,
                           but got includeDeleted=true.
```

수정 후:

```text
npx vitest run src/renderer/api/estimateApi.test.ts src/renderer/api/slip.test.ts \
  src/renderer/routes/EstimateListPage.test.tsx \
  src/renderer/routes/SalesPartnerOrderListPage.test.tsx
Test Files 4 passed; Tests 24 passed
```

견적 repository의 기본/토글 SQL은 페이지 count 조건까지 같은 predicate를 사용한다. 삭제행은 토글을 끄면 API 응답과 카운터에서 제외된다.

### RED-B — 정상 문서 보존

S8 SELECT 증거(변경 전 baseline)는 품목 3,082, 견적 34, 주문 3, 전표 343이며 전표는 `OUTBOUND 301 + INBOUND 42`로 분리된다. S9에서는 공유 DB를 재기동하거나 쓰지 않았고, 활성 baseline의 재SELECT/실 화면 재캡처를 수행할 수 없었으므로 **실 데이터 전후 건수 판정은 BLOCKED**다. 코드상 필터는 `is_deleted=false`만 추가하며 활성 조건·status·기간·페이지 정렬은 변경하지 않았다.

보존 기대값:

```text
estimates  active 34
partner_orders active 3
slips      active 343 = OUTBOUND 301 + INBOUND 42
products   active 3,082
```

### RED-C — 잔존 system/system-internal 103건

확인된 SELECT 원문:

```sql
SELECT count(*)
FROM slips
WHERE is_deleted = FALSE
  AND created_by IN ('system', 'system-internal');
```

S8 결과는 103건(`system` 100 + `system-internal` 3)이다. 그러나 전수 provenance 표가 없어 `created_by`만으로 deterministic seed라고 확정할 수 없다. `source_type`, 문서번호, 메모 표식, 모든 line의 `product_id/model snapshot`, 생성시각별 전수 분류와 정상 service 생성 반대 fixture가 필요하다. **새 migration을 추가하지 않았고, 새 cleanup actor도 만들지 않았다.** 이는 범위 밖 셋째 상태(정본 가능성/시드 가능성 혼합 또는 관측 부족)를 보고하는 보류다.

### RED-D — 복구 가능

S9는 기존 soft-delete 정책과 actor 한정 복구 SQL을 보존했다. V117/V31/V18 파일은 수정하지 않았다. 기존 복구 SQL은 `deleted_by = 'issue-1096-test-seed-cleanup'`로 제한되어 있고 hard delete는 없다. S9 자체는 DB 쓰기를 하지 않았다.

## 테스트 결과

| 명령 | 결과 |
|---|---|
| `npx vitest run ...` 4개 파일 | **PASS 24/24** |
| `./gradlew :services:slip-service:test --tests "*Estimate*" --tests "*SlipQuery*"` | **PASS**, 191 tests |
| `./gradlew :services:partner-order-service:test` | **PASS**, 최초 124초 제한 실행은 exit 124였으나 제한을 늘려 재실행 후 `BUILD SUCCESSFUL` |
| `./gradlew :services:product-service:test --tests "*Catalog*"` | **PASS**, exit 0 |
| `npm run typecheck` | **PASS**, `tsc` + real-QA typecheck 50/50 |
| `npm run test ...` | 사전 `real-qa-scope`가 `out/main/index.js` 부재로 중단(exit 1); Vitest 직접 실행으로 대체 검증 |

slip 테스트 첫 실행에서는 새 `EstimateService.list` boolean 인자를 반영하지 않은 `SlipPermissionControllerIT` Mockito 스텁과, 삭제 포함을 기본으로 가정한 견적 IT/보안 계약 테스트가 실패했다. 호출부/기대 계약을 수정한 뒤 위 slip 테스트가 통과했다.

## 남은 차단

1. Docker·서비스 재기동 금지로 RED-B 실 DB 전후 대조와 S9 headless Chromium 재캡처를 수행하지 못했다. 기존 S8 캡처/문서는 삭제하지 않았다.
2. partner-order 전체 테스트는 최초 124초 제한에서 중단됐으나, 제한을 늘린 재실행에서는 통과했다.
3. F2 103건 전수 provenance 표와 개발책임자 판정이 없어 새 migration을 추가하지 않았다.
4. 작업 위치에는 기존 S8 미추적 검증 산출물이 있으며 보존했다.

추가 확인: 제한을 늘려 재실행한 `./gradlew :services:partner-order-service:test`는 **BUILD SUCCESSFUL**(up-to-date)로 종료했다. 따라서 partner-order 테스트 차단은 해소되었다.

## 새로 만든 파일

```text
docs/dev-reports/2026-08-07-1096-s9-soft-delete-visibility-fix.md
```
