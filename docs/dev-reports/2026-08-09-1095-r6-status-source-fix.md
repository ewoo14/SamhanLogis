# PR #1133 R6 fix — 상태 출처 재수렴

## 판정

결함 ①은 `EstimateFormPage` 저장본 hydrate가 현재 품목 상태를 전혀 주입하지 않아 발생했다. 결함 ②는 `ProductClient.lookup()`의 all-or-nothing 계약을 안전재고 batch가 그대로 사용해 한 stale ID가 같은 batch의 정상 결과까지 버리게 한 것이 원인이다.

## RED 원문 — fix 전

R5 실 사용자 경로에서 저장본 품절 행 표본은 0건이어서 신규 선택 경로의 원문을 먼저 남겼다. fix 전 관측은 다음과 같다.

```json
{
  "estimateOutOfStockEditable": true,
  "estimateOutOfStockValueBefore": "1",
  "estimateOutOfStockValueAfter": "7"
}
```

저장본 재열기 라이브 캡처는 이 라운드에 `5295` 실 앱이 기동되지 않아 확보하지 못했다. 실행 원문은 다음과 같다.

```text
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5295/#/sales/estimates/new
```

현재 포트 실측: `8080` LISTEN, `5195/5295/5296/28084` LISTEN 없음.

결함 ②의 R5 원문은 다음과 같다.

```text
findAlerts: product-service lookup chunk 실패, productCode/modelName fallback null — chunkSize=5, 일부 제품을 찾을 수 없습니다 (요청 5, 응답 1)
```

## 상태 출처 전수 표

| 수량 입력 라인 출처 | 상태 fix 전 | R6 처리 | ACTIVE / OUT_OF_STOCK |
|---|---|---|---|
| 신규 ProductAutocomplete 선택 | `product.status`를 선택 시 주입 | 기존 경로 유지, 모델 lookup 결과에도 상태 반영 | 편집 / 잠금 |
| 저장본 로드 `toDraftLinesFromEstimate` | `status` 미매핑 | 라인 productId를 현재 `lookupProducts`로 조회해 화면 상태만 병합 | 편집 / 잠금 |
| 협업 동기화 `coeditLinesToDraftLines` | provider에 status 셀이 없어 이전 로컬 상태만 보존 | 현재 라인의 미저장 입력을 보존하고 상태만 병합; 수량 user/doc-sync 모두 OUT_OF_STOCK guard | 편집 / 잠금 |
| 복제 | 복제 결과가 저장본 로드 경로로 진입 | 저장본 현재 상태 hydrate 재사용 | 편집 / 잠금 |
| 견적→전표 변환 | 전표 페이지의 `line.status` 잠금은 기존 존재 | EstimateForm 상태는 저장하지 않고, SlipForm/LineRow 기존 상태 guard 유지 | 편집 / 잠금 |
| 품목 해제 후 재선택 | 기존 상태가 남을 수 있음 | 해제 시 `status=null`, 새 lookup 상태로 교체 | 편집 / 잠금 |

핵심 소비자는 `EstimateFormPage` 수량 input, 모바일 `EstimateMobileLineCard`, `SlipFormPage`의 `LineRow`이다. UUID는 화면에 표시하지 않고 상태는 저장 payload/CRDT에 추가하지 않았다.

## 결함 ① 변경

- `hydrateCurrentProductStatuses`: 화면 표시 시점에 현재 master 상태를 batch 조회한다.
- 조회 실패 시 해당 화면 라인을 보존하고 `console.warn`으로 원인을 남긴다.
- 저장본 상태 조회 완료 시 협업 provider가 이미 반영한 모델명·품목명·미저장 입력을 덮어쓰지 않고 status만 병합한다.
- 수량 user 입력 및 doc-sync 입력 모두 `OUT_OF_STOCK`이면 무시한다.
- ACTIVE는 `readOnly=false`로 유지하고, 품절 해제 후 ACTIVE 조회 결과가 오면 잠금을 해제한다.

## 결함 ② 원인 확정 및 변경

원인 파일:줄은 R5에서 확정한 그대로다.

- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/ProductClient.java:68-82`: 기본 `lookup()`은 `requireAll=true`라 응답 수가 요청보다 작으면 예외를 던진다.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SafetyStockService.java:170-190`: 기존 batch 예외 처리 단위가 chunk 전체라 정상 summary까지 `productMap`에 넣지 못했다.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SafetyStockService.java:152-160`: 누락 map 조회 결과를 `productCode/productName=null`로 만들어 UI 공란을 만들었다.

R6는 `lookupAllowMissing()`으로 존재하는 응답을 항목별 보존하고, 누락 UUID 목록과 요청/응답 수를 WARN 로그로 남긴다. stale 항목은 null fallback이지만 정상 항목의 코드·이름은 유지된다.

## 조합 표

| 출처 × 상태 | ACTIVE | OUT_OF_STOCK |
|---|---|---|
| 신규 선택 | 편집 | 잠금 |
| 저장본 로드 | 현재 조회 후 편집 | 현재 조회 후 잠금 |
| 협업 동기화 | 편집, 원격 수량 반영 | 잠금, 원격 수량 무시 |
| 복제 | 현재 조회 후 편집 | 현재 조회 후 잠금 |
| 전표 변환 | 기존 LineRow 편집 | 기존 LineRow 잠금 |

자동 검증은 상태 hydrate helper의 ACTIVE/OUT_OF_STOCK/조회 실패 3건과 협업 EstimateForm 56건으로 위 규칙을 고정했다. 라이브 저장본 전후 조합은 포트 부재로 실행하지 못했다.

## 검증 원문

- RED: `estimateOutOfStockValueBefore=1`, `estimateOutOfStockValueAfter=7`.
- GREEN: `estimateLineStatus.test.ts` 1 file / 3 tests passed.
- GREEN: `EstimateFormPage.coedit.test.tsx` 1 file / 56 tests passed.
- GREEN: `SafetyStockServiceTest` 18 tests passed.
- GREEN: design-system 26 files / 227 tests passed.
- GREEN: desktop `typecheck` 및 `lint` — lint 0 errors, 기존 경고 157건.
- desktop 전체 `npm test`는 기존 `build-output-cjs-interop.test.ts` Electron 설치 오류 1건과 기존 협업 계약 3건이 처음 함께 발생했으나, 협업 계약 3건은 상태 조회의 비동기 덮어쓰기 경합을 제거한 뒤 관련 테스트 56/56으로 확인했다. Electron 오류는 `node_modules/electron` 설치 산출물 문제이며 R6 코드와 무관하다.

## 상태 분포 / DB 안전

공유 DB write는 하지 않았다. 따라서 상태 분포 전후는 R5 기준과 동일하다.

```text
전: ACTIVE 2,984 · DISCONTINUED 83 · NOT_FOR_SALE 14 · OUT_OF_STOCK 3
후: ACTIVE 2,984 · DISCONTINUED 83 · NOT_FOR_SALE 14 · OUT_OF_STOCK 3
```

R5 잔재인 threshold-0 2건, soft-delete 1건, `R5-TEMP-RESTORE-AC060CS6PBH1SY` 이름 복구 실패 표본은 건드리지 않았다.

## 신규 생성 파일

- `clients/desktop/src/renderer/utils/estimateLineStatus.ts`
- `clients/desktop/src/renderer/utils/estimateLineStatus.test.ts`
- `docs/dev-reports/2026-08-09-1095-r6-status-source-fix.md`

기존 파일 수정: `EstimateFormPage.tsx`, 해당 coedit 테스트, `ProductClient.java`, `SafetyStockService.java`, `SafetyStockServiceTest.java`.

## 못 한 것

- 실 앱 `5295`, product-service `28084`, proxy `5296`이 없는 상태라 저장된 견적 재열기 fix 전/후 캡처와 실제 R6 스크린샷 디렉터리를 만들지 못했다.
- 공유 DB 표본 생성·상태 변경·분포 복구는 수행하지 않았다.
- 커밋·push·main 병합은 수행하지 않았다.
