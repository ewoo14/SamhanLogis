# PR #907 CODEX LUNA 라운드 fix 설계

## 목표

주문 병합 화면에서 후보로 표시되는 주문 집합, 거래처 전환 상태, 후보 freshness, 성공 후 캐시, 거래처 검색 리터럴 계약을 실제 병합 가능성에 맞춘다. 기존 S7-2 409 안전망과 S7-3 병합 규칙은 유지한다.

## 설계 결정

1. 병합 후보 조회는 기존 `partnerCode` 정확일치에 선택한 거래처 UUID의 별도 정확일치 필터를 AND로 추가한다. 기존 목록 화면의 `partnerId` 부분검색 계약은 변경하지 않는다. `partnerIdExact`는 기존 endpoint의 선택적 필터로만 추가한다.
2. `PartnerOrderSummaryResponse.mergeEligible`의 legacy fail-closed를 유지한다. 후보/실행 양쪽 모두 주문의 저장된 `partner_id`와 선택 거래처 UUID를 기준으로 같은 정체성 축을 사용한다.
3. 거래처 변경 이벤트는 주문 선택뿐 아니라 창고, 수량, 충돌 선택값, 직접입력값, 모달 오류까지 모두 초기화한다. 새 거래처의 주문 상세가 다시 로드된 뒤 충돌 필드가 미확정 상태가 되어 제출 버튼이 비활성화된다.
4. 병합 후보 query는 `staleTime: 0`과 `refetchOnMount: 'always'`를 사용하고, 병합 성공 시 후보 key 전체와 정규화된 상세 key를 무효화한다. 목록 query도 계속 무효화한다.
5. partner-service의 JPQL/native/directory LIKE 검색은 입력 escape helper와 SQL `ESCAPE '\\'`를 함께 사용한다. `%`, `_`, `\`는 모두 리터럴 문자로 검색되고 기존 부분검색 범위는 유지된다.
6. mock 주문 목록도 실제 BE와 같은 `partnerCode OR bizCode` 부분검색을 수행한다. `partnerCode` exact 병합 후보 필터와는 분리한다.
7. real-QA는 HashRouter 해시 경로로 이동하고, 반전된 M-2/M-3 단언을 통과 기준으로 사용한다. 캐시·outgoing body·409는 단위 테스트가 아닌 라이브 요청 관측으로 증명한다.

## 변경 경계

- BE: partner-order-service의 목록 필터 DTO/controller/query service 및 목록 IT, partner-service 검색 입력 정규화·repository query 및 검색 IT.
- FE: `MergeConvertDialog`, sales API filter 타입/직렬화, `SalesPartnerOrderListPage`, mock order filtering, 관련 Vitest/Playwright.
- 병합 오케스트레이션 및 slip-service 병합 로직은 변경하지 않는다.
- DB migration은 필요하지 않다.

## 검증 기준

- R-1/R-4는 BE 테스트와 실제 API에서 RED/GREEN/뮤테이션 RED를 확보한다.
- R-2/R-3/R-5는 반전 SOL Playwright와 라이브 요청 계측으로 RED/GREEN/뮤테이션 RED를 확보한다.
- BE partner-order/partner 테스트, Desktop typecheck/Vitest, mock Playwright hard gate 전량, 재배포 후 real-QA를 실행한다.
- 모든 throwaway 데이터는 시작 시 잔재를 회수하고 종료 시 SQL count 0을 확증한다.

## 자기 검토

- M-1~M-6 각각에 수정·테스트·라이브 증거 경로가 있다.
- UUID를 화면에 추가 노출하지 않으며 UUID는 필터 payload 전용이다.
- `partnerId` 기존 부분검색과 `partnerIdExact` 병합 후보 계약을 혼동하지 않는다.
- 새 migration이나 새 endpoint는 없다.
