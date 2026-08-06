# R62 라이브QA 보고서 — PR #1057 · 이슈 #874

## 컨테이너 상태 (재배포 없음)

확인 시각: 2026-08-05 (Asia/Seoul)

| 컨테이너 | created | started | 상태 |
|---|---|---|---|
| `samhan-api-gateway` | `2026-08-05T13:55:20.45079612Z` | `2026-08-05T13:55:30.333688993Z` | healthy |
| `samhan-slip-service` | `2026-08-05T14:17:51.44867138Z` | `2026-08-05T14:17:55.498813686Z` | healthy |
| `samhan-accounting-service` | `2026-08-05T11:35:22.04655355Z` | `2026-08-05T11:35:25.824979054Z` | healthy |
| `samhan-partner-service` | `2026-07-23T13:40:46.849980189Z` | `2026-08-05T10:02:11.264451964Z` | healthy |
| `samhan-dc-config-service` | `2026-07-29T15:14:34.210417664Z` | `2026-08-05T10:02:11.2910491Z` | healthy |
| `samhan-product-service` | `2026-08-05T10:17:39.747773714Z` | `2026-08-05T10:17:43.342187543Z` | healthy |
| `samhan-inventory-service` | `2026-08-04T10:39:09.502630221Z` | `2026-08-05T10:02:11.284615778Z` | healthy |
| `samhan-auth-service` | `2026-08-03T14:34:20.226032107Z` | `2026-08-05T10:02:11.261460747Z` | healthy |

재배포·재빌드·중지 없음.

## 판정 요약

| 항목 | 판정 | 캡처 |
|---|---|---|
| 거래처 전역DC 대상 거래처로 신규 판매전표 생성 | PASS | [03-partner-global-dc-target.png](03-partner-global-dc-target.png) |
| 전역DC가 신규 전표 가격/할인율에 반영 | FAIL | [04-confirmed-products-discount-price.png](04-confirmed-products-discount-price.png), [05-fixed-dc-slip-save-result.png](05-fixed-dc-slip-save-result.png) |
| 고정DC 우선 규칙 (`fixedDc ?? globalRate`) | FAIL | [04-confirmed-products-discount-price.png](04-confirmed-products-discount-price.png), [06-no-fixed-dc-product-confirmed.png](06-no-fixed-dc-product-confirmed.png) |
| 화면에서 만든 전표의 저장 | PASS | [05-fixed-dc-slip-save-result.png](05-fixed-dc-slip-save-result.png), [07-no-fixed-dc-slip-save-result.png](07-no-fixed-dc-slip-save-result.png) |
| DRAFT → SAVED → SENT | PASS | [09-sales-slip-after-complete-action.png](09-sales-slip-after-complete-action.png), [11-dispatch-confirm-screen-before-action.png](11-dispatch-confirm-screen-before-action.png) |
| SENT → CONFIRMED | FAIL | [11-dispatch-confirm-screen-before-action.png](11-dispatch-confirm-screen-before-action.png), [12-sales-slip-after-accept.png](12-sales-slip-after-accept.png) |
| 회계 배분 실행 | 미실시 | [14-sales-accounting-allocation-no-confirmed-source.png](14-sales-accounting-allocation-no-confirmed-source.png), [15-accounting-allocation-save-result.png](15-accounting-allocation-save-result.png) |
| `sales_accounting_slips` POSTED 행 / riUsage | 미실시 | [13-accounting-daily-closing-riusage-blocked.png](13-accounting-daily-closing-riusage-blocked.png) |
| 차단되면 안 되는 동작의 부당 차단 | PASS(관찰 범위) | [12-sales-slip-after-accept.png](12-sales-slip-after-accept.png), [15-accounting-allocation-save-result.png](15-accounting-allocation-save-result.png) |

## 1. 테스트 대상과 전표 번호

R61에서 저장한 대상 거래처는 `4348703365 / 주식회사 엠엠시스템에어(고영현)`이며 화면 검색·선택을 확인했다. 출고창고는 `2 / 상일창고 S18`이다.

이번 실행에서 생성된 전표는 삭제하지 않았다.

| 전표번호 | 용도 | 상태/결과 |
|---|---|---|
| `2026/08/06-1` | 고정DC 품목 `AJ020FERPBC1` | DRAFT |
| `2026/08/06-2` | 고정DC 품목 재시도 | DRAFT |
| `2026/08/06-3` | 고정DC 품목 재시도 | DRAFT |
| `2026/08/06-4` | 고정DC 없는 세트 `AC023CS1DBC1SY` | SENT; 수락 시도에서 차단 |

주 판정 표본은 `2026/08/06-3`과 `2026/08/06-4`다. 반복 실행으로 생성된 `-1`, `-2`도 보존했다.

## 2. 전역DC·고정DC 가격 관찰

### 고정DC 품목

품목 API 실조회에서 `AJ020FERPBC1`의 `fixedDiscountRate=45`, `releasePrice=1,980,000`을 확인했다. 화면에서 해당 모델을 자동완성으로 확정했으나 화면에는 `비스포크 AI 에어콤보 토출 우측`, `판매가 적용`, 단가 `0`만 표시됐다. 할인율 `45%`, 거래처 전역DC `48%/49%`, 계산된 할인 단가는 표시되지 않았다.

저장 응답도 `discountInfo=null`, 라인 `unitPrice=0.00`이었다. 따라서 고정DC가 전역DC를 이기는 계산 결과는 PASS로 판정할 수 없고, 관찰 결과는 FAIL이다.

### 고정DC 없는 품목

`AC023CN1DBC1`은 실 API에서 `fixedDiscountRate=null`로 확인했지만 `usageScope=NONE`이라 판매전표 자동완성 후보에서 제외됐다(화면 원문: `검색 결과 없음`). 판매 가능한 고정DC 없는 세트 `AC023CS1DBC1SY`로 바꾸어 확정했다. 화면에는 세트 단가 `1,204,500`이 표시됐고 저장 후 구성품 4개가 `441,200 / 662,600 / 84,700 / 16,000`으로 저장됐다.

이 과정에서도 거래처 전역DC `48%/49%` 또는 적용 할인율 표시는 없었다. 세트 구성품 저장은 확인했지만 전역DC 계산 결과로는 판정하지 않았다.

## 3. 상태 전이와 차단 원문

`2026/08/06-4`를 화면에서 `완료 (저장)`하여 `DRAFT → SAVED`, 다시 `완료 (전송)`하여 `SAVED → SENT`까지 성공했다. 이후 `dev_master` 화면에서 `완료 (수락)`을 눌렀다.

수락은 HTTP `409`로 차단됐다.

```text
inventory-service 호출 실패(409 CONFLICT): {"success":false,"code":"CONFLICT","message":"재고 부족 — 가용 인스턴스 0 < 필요 1 (productCode=AC023CN1DBC1)"...}
```

따라서 `SENT → CONFIRMED`에 도달하지 못했다. `dev_dispatch`로 동일 상세 URL을 열었을 때는 상세가 아니라 배차 대시보드로 리다이렉트됐고 별도 오류 원문은 없었다([11-dispatch-confirm-screen-before-action.png](11-dispatch-confirm-screen-before-action.png)).

## 4. 회계 배분·POSTED·riUsage

회계 `dev_accountant`로 `2026-08-06` 일마감에서 `매출전표`를 선택했다. 실 API는 다음처럼 200을 반환했지만 마감 이력과 상세 전표가 없었다.

```text
GET /accounting/closings/daily?date=2026-08-06&kind=SALES&sourceKind=SALES_SLIP → 200
해당 일자의 일마감 이력이 없습니다.
상세 전표가 없습니다.
모델별 재검증 결과가 없습니다.
```

매출전표 회계 배분 화면에서도 거래처 코드 `4348703365`를 입력하고 첫 원천 라인에 배분율 100을 넣었다. 임시저장 시 HTTP `422`로 차단됐다.

```text
{"success":false,"code":"SAS_SOURCE_SLIP_NOT_CONFIRMED","message":"원천 전표가 확정 상태가 아닙니다 (전표=2026/08/06-4, 상태=전송완료)"}
```

이 차단으로 회계 배분 저장, `sales_accounting_slips`의 `POSTED` 행 생성, riUsage 화면 결과는 미실시다. 데이터베이스를 직접 조작하지 않았고, 전표도 삭제하지 않았다.

## 5. 차단되면 안 되는 동작 관찰

관찰 범위에서 `SENT` 전표의 재고 부족 수락 거부(HTTP 409)와 미확정 원천의 회계 배분 거부(HTTP 422)는 각각 재고·상태 사전조건에 따른 명시적 차단이었다. 부당하게 허용된 동작이나, 정상 조건에서 차단된 동작은 이번 표본에서 확인하지 못했다.

앱 부팅 시 업데이트 확인 요청의 503은 반복 관찰됐으나 판매전표·회계 화면의 실 API 동작과 무관했다.

## 6. 새 파일 목록

- `docs/qa/874-riusage-r62-real-qa/qa-report.md`
- `docs/qa/874-riusage-r62-real-qa/*.png` 및 관찰 텍스트
- `r62-live-qa-driver.mjs`
- `clients/desktop/r62-live-qa-driver.mjs`
- `clients/desktop/r62-status-riusage-driver.mjs`
- `clients/desktop/r62-dispatch-confirm-driver.mjs`
- `clients/desktop/r62-accounting-riusage-driver.mjs`
