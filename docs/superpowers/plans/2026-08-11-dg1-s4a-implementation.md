# D-G1 S4a 영업수수료 정산 구현 계획

> **For agentic workers:** 이 계획은 현재 세션에서 인라인으로 실행한다. Git commit/push는 수행하지 않는다.

**Goal:** 영업수수료 정산의 목록·상세·생성·확정 REST API와 회계 메뉴/화면/전용 RBAC를 연결한다.

**Architecture:** accounting-service의 기존 S1/S2 aggregate·service·일자별 번호 시퀀스를 REST DTO와 권한 가드로 노출한다. desktop renderer에는 기존 AppLayout/PermissionGuard/ApiResponse 패턴을 따라 목록·상세 라우트를 추가한다. 권한은 auth-service의 PageCode/seed와 renderer PermissionMatrix를 같은 pageCode로 수렴시킨다.

**Tech Stack:** Spring Boot, Spring Data JPA, Flyway, JUnit/MockMvc/Testcontainers, React/TypeScript, React Router, Vitest/Playwright.

## Global Constraints

- 전용 pageCode는 `accounting.sales-commission-settlement`이며 `accounting.reports`를 재사용하지 않는다.
- DRAFT는 documentNo가 없고 CONFIRMED 진입 때 settlementDate 기준 `yyyy/MM/dd-N`을 채번한다.
- REST 응답은 `ApiResponse`, 화면에는 UUID를 표시하지 않는다.
- 기존 회계 메뉴를 삭제/대체하지 않고 activeTargets와 visible guards만 확장한다.
- 그룹웨어 연결 버튼과 확정 취소는 구현하지 않는다.
- 신규 accounting-service migration은 V99부터 사용한다.

## 구현 순서

1. 현재 RED를 고정하는 accounting-service REST/RBAC 테스트와 desktop 계약 테스트를 먼저 추가하고 실패를 확인한다.
2. REST DTO/controller/service 목록 조회를 구현하고 권한 없는 역할의 API 거절을 확인한다.
3. auth-service pageCode/seed와 renderer permission catalog/matrix를 추가하고 exact role matrix 및 양방향 mutation 테스트를 통과시킨다.
4. desktop API, 목록/상세 화면, 라우트, 회계 sidebar를 구현하고 기존 회계 링크 보존을 검증한다.
5. accounting-service·desktop 테스트, 빌드, Playwright 좁은 뷰포트 QA를 실행하고 결과/RED 원문/조합표/신규 파일을 dev-report에 기록한다.
