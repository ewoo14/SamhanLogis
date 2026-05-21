# MIG-23 로컬 6 client 직접 검증 환경

## 목표

MIG-22 이후 개발책임자가 요청한 “로컬에서 직접 접속해서 5개 클라이언트 앱을 직접 테스트” 요구를 6 client 묶음 기준으로 정리했다. 신규 앱을 만들지 않고 기존 desktop / mobile / mobile-staff / web 3종 / arologis-desktop / arologis-mobile을 한 번에 실행하는 로컬 검증 스택을 제공한다.

## 결정

| 결정 | 내용 |
|---|---|
| D-MIG-23-01 | 신규 client를 만들지 않고 기존 6 client 운영 단위를 정비한다. |
| D-MIG-23-02 | 기존 infra compose는 유지하고 `docker-compose.local-all.yml` overlay로 Eureka, gateway, 14 service를 추가한다. |
| D-MIG-23-03 | PowerShell/Bash launcher가 bootJar build, compose up, health check, client 병렬 실행을 담당한다. |
| D-MIG-23-04 | 사용자 5 credential은 `seed-local-stack.ps1`에서 auth-service register API로 멱등 등록한다. 현재 코드 기준 auth-service에는 `POST /admin/users`가 없고, user-service `/api/v1/admin/users`는 임시 비밀번호 자동 발급 계약이라 고정 비밀번호 seed에는 부적합하다. |
| D-MIG-23-05 | 이카운트 raw 11종은 MIG-20 reimport endpoint를 `mig-1`~`mig-11` 순서로 호출하고 source hash 멱등을 사용한다. |
| D-MIG-23-06 | 사용자 가이드는 `docs/local-stack/README.md` 단일 진입점으로 둔다. |
| D-MIG-23-07 | 옵션 C 21단계 요구는 PR 머지 전 TM comment gate로 유지한다. 본 변경은 commit/push 후 PR에서 gate comment를 남긴다. |

## 산출

- `infrastructure/docker/spring-service.Dockerfile`
- `infrastructure/docker-compose.local-all.yml`
- `scripts/run-client-local-dev.cjs`
- `scripts/launch-local-stack.ps1`
- `scripts/launch-local-stack.sh`
- `scripts/seed-local-stack.ps1`
- 8개 client package `local-dev` script
- `docs/local-stack/README.md`

## 직접 검증 시나리오

| 시나리오 | Client | 절차 | 기대 결과 |
|---|---|---|---|
| S1 회계 admin 확인 | desktop | `master@samhan.test` 로그인 후 Cash/Order/Aging/Ledger 화면 순회 | 목록/필터/운영 대시보드가 gateway 데이터를 조회한다. |
| S2 현장 견적 WebView | mobile-staff + estimate-app | Expo QR 실행 후 견적 WebView 진입 | `http://localhost:5174` 견적 화면이 열리고 API base가 local gateway를 가리킨다. |
| S3 거래처 주문 WebView | mobile + order-app | Expo QR 실행 후 주문서 WebView 진입 | `http://localhost:5175` 주문 화면이 열리고 catalog API가 local gateway를 사용한다. |
| S4 거래처 web 직접 클릭 | web | estimate/order/design-system URL을 브라우저에서 직접 연다 | 세 포트가 충돌 없이 열린다. |
| S5 아로로지스 배차/기사 | arologis-desktop + arologis-mobile | desktop에서 배차 목록 확인, mobile에서 기사 로그인/오늘 배차 진입 | arologis-service dev seed 데이터로 관리자/기사 흐름을 확인한다. |

## Role enum 확장 (MIG-23 통합 처리)

Samhan Public Role enum이 본 PR 안에서 8 → 10 role taxonomy 로 확장되었다 (`STAFF` "사원", `DRIVER` "기사" 신규 추가, commit `a4db1f08`). 따라서 MIG-23 seed는 alias 없이 5 credential을 실 enum 값으로 직접 등록하며, 등록 후 `POST /api/auth/login` 으로 token 발급 검증까지 자동화한다.

- DB schema 변경 없음 (`Account.role` VARCHAR(20) NOT NULL, 신규 enum 값 길이 fits).
- 기존 비즈니스 로직 switch case 0 — STAFF/DRIVER 추가 무영향.
- `Role.values()` 의존 assertion 1건 (`AdminUserControllerTest.listRoles`) 도 같은 commit에서 8 → 10 갱신.
