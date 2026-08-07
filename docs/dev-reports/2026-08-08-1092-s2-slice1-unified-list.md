# #1092 견적서 메뉴 정본 — S2 슬라이스 1 구현 보고서

작성일: 2026-08-08  
범위: 데스크톱 내부 화면의 통합 조회·읽기 전용

## 구현 결과

- `/sales/estimates`에서 종합견적서 API(`/slips/estimates`)와 주문서 API(`/api/v1/partner-orders`)를 각각 전량 조회한다.
- 두 응답을 클라이언트의 `mergeEstimateAndOrderRows`에서 합치고 작성일 내림차순으로 정렬한 뒤 50행 단위로 화면 페이징한다.
- 현재 실측 43 + 4 = 47행에서는 추가 서버 표면 없이 처리한다.
- 한쪽 조회가 실패하면 성공한 계열의 행은 계속 표시하고, 실패 계열과 실패 메시지를 `role=alert`로 알린다.
- 표시 열은 계열, 견적 식별 번호, 거래처, 금액, 작성자, 작성일, 상태다.
- 행 클릭은 기존 종합견적서/주문서 상세 경로로만 이동하며, 이번 화면에는 저장·복원·전환 액션을 추가하지 않았다.

## 필드 공백 및 식별자 판단

| 표시 열 | 종합견적서 | 주문서 | 처리 |
|---|---|---|---|
| 계열 | 있음 | 있음 | `종합견적서` / `주문서` |
| 견적 식별 번호 | `estimateNo` | `orderNumber` | 공통 표시 모델의 `documentNo` |
| 거래처 | `partnerName` | 현재 목록 응답은 `null`일 수 있음 | 값이 없으면 빈칸 |
| 금액 | `totalAmount` | `totalAmount` | 문자열 금액으로 정규화 |
| 작성자 | `requesterId`는 UUID user-id뿐 | `createdBy`/작성자명이 목록 응답에 없음 | 두 계열 모두 빈칸. UUID 미노출 |
| 작성일 | `estimateDate` | `submittedAt` | 날짜 부분 표시 |
| 상태 | `EstimateStatus` | `PartnerOrderStatus` | 계열별 한국어 상태 라벨 |

두 DB를 이번 화면에서 조인하지 않는다. 따라서 `partner_id`로 매칭하거나 화면에서 UUID를 노출하지 않았다. 향후 실제 교차계열 매칭이 필요해질 때 사용할 거래처 키는 `partner_code`이며, 주문서 쪽 `partnerCode`만 보유하고 종합견적서 현행 목록 응답에는 해당 필드가 없다. `partnerBusinessNo`나 `partner_id`를 `partner_code`의 대체값으로 간주하지 않았다.

## 규모 경계

전량 조회·클라이언트 병합은 두 계열 합산 10,000행까지를 화면 설계의 운영 경계로 기록했다. 이를 넘으면 서버측 읽기 모델과 서버 페이지네이션으로 전환해야 한다. 무한 조회나 임의의 API 페이지 반복은 이번 슬라이스에 넣지 않았다.

## RED 양방향 검증

- RED-A: 통합 모델 테스트가 43개 종합견적서와 4개 주문서의 47행 보존을 검증한다.
- RED-B: 한쪽 API rejection 시 성공 계열 행 표시와 실패 배너 표시를 화면 테스트가 검증한다.

## 변경 파일

- `clients/desktop/src/renderer/routes/EstimateListPage.tsx`
- `clients/desktop/src/renderer/routes/EstimateListPage.test.tsx`
- `clients/desktop/src/renderer/routes/estimateUnifiedListModel.ts`
- `clients/desktop/src/renderer/routes/estimateUnifiedListModel.test.ts`
- `docs/dev-reports/2026-08-08-1092-s2-slice1-unified-list.md`

## 제외 확인

담당 축·담당 변경·담당 기준 필터, 외부 웹·권한 필터, snapshot 승격·복구·미리보기, 판매전표 전환·주문서 생성, 운임·절삭 parity, 마이그레이션·스키마 변경은 구현하지 않았다. 화면에는 `담당` 라벨을 사용하지 않았다.
