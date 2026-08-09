# #1092 슬라이스 2 — 담당 기준과 표면별 조회 범위

작성일: 2026-08-08  
브랜치: `feat/1092-s2-owner-axis`  
기준: `e5a239646` / 슬라이스 1 머지 `d933d3584`

## 결론

`requester_id`를 담당으로 사용하도록 서버 계약을 추가했다. `created_by`는 `BaseEntity` 감사 필드이며 담당 변경 코드에서 전혀 쓰지 않는다. 따라서 담당 변경 후에도 작성 기록은 보존된다.

조회 표면은 역할 등급으로 나누지 않는다.

- 데스크톱 견적서 메뉴: 기존 `GET /slips/estimates` 전체 조회 유지
- 웹 assigned 표면: `GET /slips/estimates/assigned`, `X-User-Id`와 `requester_id` 일치 행만 조회
- 웹 assigned 복원: `POST /slips/estimates/assigned/{id}/restore`, 담당 불일치 시 서비스에서 `FORBIDDEN`

`X-User-Id`가 없는 assigned 조회/복원은 `"system"` fallback을 사용하지 않고 fail-closed 한다.

## 담당 변경 계약

`PATCH /slips/estimates/{id}/owner`가 `{ "requesterId": "...", "documentType": "ESTIMATE" }`를 받는다. 도메인 aggregate의 `changeRequesterId`만 호출하며 `created_by`에는 대입하지 않는다.

`documentType`이 `PARTNER_ORDER` 등 `ESTIMATE`가 아닌 값이면 `slip-service` 서비스 계층에서 거부한다. 주문서 계열에는 담당 변경 endpoint나 새 `requester_id` 컬럼을 추가하지 않았다. 화면 우회/API 직접 호출을 포함해 견적 서비스에서 주문서 계열을 변경할 수 없도록 계약 테스트를 추가했다.

## 통합 목록의 `작성자` 열 판단

기존 `작성자` 열은 유지한다. 이 열은 현재 담당이 아니라 불변 작성 감사 기록을 의미해야 하므로 `담당`으로 이름을 바꾸면 `created_by`와 `requester_id`의 역할 분리가 다시 흐려진다. 이번 서버 응답에는 UUID를 화면에 노출하지 않는 기존 원칙을 유지했다.

## 변경 파일

추적 파일:

- `services/slip-service/.../Estimate.java`
- `services/slip-service/.../EstimateRepository.java`
- `services/slip-service/.../EstimateService.java`
- `services/slip-service/.../EstimateController.java`
- `clients/desktop/src/renderer/api/estimateApi.ts`
- `clients/desktop/src/renderer/api/estimateApi.test.ts`

신규 파일:

- `docs/superpowers/plans/2026-08-08-1092-s2-owner-axis.md`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/dto/ChangeEstimateOwnerRequest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/estimate/service/EstimateOwnerAxisTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/estimate/web/EstimateOwnerSurfaceContractTest.java`
- `docs/dev-reports/2026-08-08-1092-s2-owner-axis-and-scope-filter.md`

## RED → GREEN 검증

- RED-B: `changeRequesterId` 부재로 실패 → aggregate 메서드 추가 후 `created_by` 보존 테스트 통과
- RED-C: assigned/owner endpoint 부재로 실패 → endpoint 계약 및 `PARTNER_ORDER` 서비스 거부 테스트 통과
- RED-A: assigned repository query 및 fail-closed caller 검증 추가
- RED-D: 기존 통합 목록 모델/페이지의 작성자 열, 교차 정렬, 부분 실패 보존 테스트 통과

실행 결과:

`@text
./gradlew :services:slip-service:test --tests '*EstimateOwnerAxisTest' --tests '*EstimateOwnerSurfaceContractTest' --tests '*EstimateControllerSecurityContractTest' --no-daemon
BUILD SUCCESSFUL

npm exec vitest run src/renderer/api/estimateApi.test.ts src/renderer/routes/estimateUnifiedListModel.test.ts src/renderer/routes/EstimateListPage.test.tsx
3 test files passed / 16 tests passed
`@

프런트 기존 테스트 출력에는 기존 `SalesSubNav` 중복 key와 React Router future flag warning이 남지만 실패는 없다.

## 미완료/다음 작업

이번 패스에는 데스크톱 `EstimateListPage` 안의 실제 담당자 선택 UI, 직원명 lookup을 통한 표시명 응답, 웹 assigned 화면 신규 구현을 추가하지 않았다. 서버/API 계약까지가 구현됐으며, 시간이 허용되면 다음 패스에서 UI와 사용자명 계약을 붙여야 한다. 새 endpoint에는 mock handler를 추가하지 않았으므로 실제 Axios 호출 QA는 `VITE_API_BASE_URL='http://127.0.0.1:1'` 격리에서 수행해야 한다.

## diff 통계 및 운영 제약

`git diff --stat` (추적 파일 기준): 6 files changed, 178 insertions(+), 1 deletion(-). 삭제 줄 수는 **1줄**이다. 신규 파일은 위 목록과 같다. 커밋/push, DB 직접 변경, 공유 Docker 재기동은 하지 않았다.
