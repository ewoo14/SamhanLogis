# PR #996 Issue #896 슬라이스 4 라이브 QA 보고서

## 시작 상태 — 2026-07-31

- 브랜치/HEAD: `feat/896-s4-quantity-sync-config` / `26c91d6651cc4ea2f87f5ed1014f70b65cdceff6`
- QA 파일 외 git 변경: 없음. QA 산출물 디렉토리만 새로 생성됨.
- 재배포 전 `infrastructure-product-service` 생성 시각: `2026-07-29T15:14:31.384967556Z`
- 판정: 재배포 전 상태이며, 배포 확인은 아직 통과하지 않음.

## 배포 확인

- 실행 명령: `./gradlew.bat :services:product-service:bootJar -x test`
- 결과: `BUILD SUCCESSFUL` (12 actionable tasks, 2 executed, 10 up-to-date)
- 실행 명령: `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps product-service`
- 결과: `infrastructure-product-service` 이미지 build 완료, `samhan-product-service` 재생성·기동 완료.
- 필수 확인 명령: `docker inspect -f '{{.Created}}' infrastructure-product-service`
- 결과: `2026-07-31T14:25:23.874519458Z`; 컨테이너 `samhan-product-service`는 `2026-07-31T14:25:27.708567873Z` 기동, 상태 `running`.
- 실행 jar 확인: `services/product-service/build/libs/product-service.jar`에 `QuantitySyncRuleValidator.class`, `QuantitySyncRuleController.class`, `QuantitySyncRule.class`, `V24__quantity_sync_rule_schema.sql` 심볼이 존재.
- 판정: PASS — 방금 생성된 이미지와 현재 브랜치의 quantity-sync 심볼을 확인함.

## order-app 기동

- 요청 명령: `VITE_APP_VERSION="2026/07/31-1" VITE_API_BASE_URL="http://localhost:8080/api/v1" npx vite --port 5223 --strictPort`
- 첫 기동 시 포트 5223 점유가 보고되었으나, 점유 프로세스는 이 워크트리의 `clients/web/order-app/node_modules/.bin/vite` (`PID 68860`)로 확인됨. `GET http://localhost:5223/`는 HTTP 200을 반환.
- 로그 파일: `order-app-vite.log`, `order-app-vite.err.log` (동 디렉토리). 실행 프로세스의 명령줄과 워크트리 경로를 확인함.
- 판정: PASS — 실제 이 워크트리의 Vite order-app이 포트 5223에서 제공 중.

## ① 실제 order-app 관측 및 API 응답

### 명령과 응답

- 로그인: order-app 화면에서 전용 QA 거래처 `2118712345` / PIN `1234`를 입력. 실제 `POST http://localhost:8080/api/v1/auth/partner-login`은 `200`, `status=OK`, JWT 발급.
- 화면 캡처: [order-app-after-login.png](order-app-after-login.png)
- 보조 캡처: [order-app-live.png](order-app-live.png) — 실제 order-app 최초 사업자번호 게이트 화면.
- 화면 결과: 실제 order-app의 로그인 후 주문서 카테고리 화면이 렌더되었고, 튜토리얼 안내가 표시됨. 합성/목업 캡처 아님.
- order-app이 실제 호출한 게이트웨이 요청:
  - `GET http://localhost:8080/api/v1/quantity-sync-rules?estimateCategory=SINGLE_SET&page=0&size=50`
  - 응답 `404`, body: `{"timestamp":"2026-07-31T14:30:27.579+00:00","path":"/api/v1/quantity-sync-rules","status":404,"error":"Not Found","requestId":"ac5132d9-5595"}`
  - 브라우저 console: `[quantity-sync shadow] S-03 설정 관측 불가: Request failed with status code 404`
- 직결 요청(동일 JWT + `X-Is-Partner:true`):
  - `GET http://localhost:8084/api/v1/quantity-sync-rules?estimateCategory=SINGLE_SET&page=0&size=50`
  - 응답 `200`, body는 canonical `SINGLE_S03_CEILING_DRAIN_PUMP` 1건만 반환. `legacyRef=S-03`, `when={}`, source/target은 throwaway 품목.

### 판정

- 직결 product-service의 shadow 관측: PASS.
- 사용자가 지정한 게이트웨이 경유 order-app 관측: BLOCK — 현재 기동 중인 gateway가 해당 경로에서 `404`를 반환하여 화면의 shadow 관측 성공 로그를 만들지 못함. product-service만 재기동한 범위와 일치하며 gateway는 재기동하지 않음.

## ② 범위 밖 규칙 혼입 여부

- 전용 데이터로 `QA996_THROW_GENERAL_S03` (`legacyRef=S-03`, 일반 ruleKey)와 canonical `SINGLE_S03_CEILING_DRAIN_PUMP`를 각각 실제 API로 생성.
- MASTER 직결 목록 응답에는 두 규칙이 모두 존재함(관리자 전체 목록).
- PARTNER 직결 목록 응답에는 `SINGLE_S03_CEILING_DRAIN_PUMP`만 존재하고 `QA996_THROW_GENERAL_S03`은 제외됨.
- 판정: PASS — `legacyRef=S-03`만으로 일반 규칙이 partner shadow 응답에 섞이지 않음. canonical ruleKey로 좁혀짐.
- 게이트웨이 경유 동일 요청은 404이므로, 게이트웨이에서의 필터링 화면 증거는 확인하지 못함.

## ③ 일반 S-03 규칙의 무결성 검사 예외 차단

- 실제 API로 전용 throwaway 품목 `QA996_THROW_SOURCE`, `QA996_THROW_TARGET`을 생성함. 생성 응답은 각각 `201`.
- 실제 API로 일반 규칙 `QA996_THROW_GENERAL_S03`을 생성함:
  - `POST http://localhost:8084/api/v1/quantity-sync-rules`
  - `legacyRef=S-03`, 일반 ruleKey, throwaway source/target, 응답 `201`.
- 실제 API로 source 품목 상태/노출을 `NONE`으로 변경 시도:
  - `PATCH http://localhost:8084/api/v1/products/QA996_THROW_SOURCE/usage`
  - body `{"usageScope":"NONE","estimateCategories":[]}`
  - 응답 `409 CONFLICT`: `수량 동기화 규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다: QA996_THROW_GENERAL_S03`
- 판정: PASS — `legacyRef=S-03`인 일반 규칙은 품목 무결성 검사를 비껴가지 못함.

## 정리 후 행 수 대조

- 정리 전 확인: `products` active 1,220행; `quantity_sync_rule` active 0행; `quantity_sync_source` active 0행; `quantity_sync_target` active 0행.
- 정리: QA ruleKey 3개와 canonical QA rule 1개를 API DELETE로 soft-delete하고, throwaway 품목 2개를 API DELETE함. 기존 실 품목 `AF70F19D11BRS`, `AP110BSPPHH8SY`는 수정/삭제하지 않음.
- 정리 후 active 행 수(`docker exec samhan-postgres psql -U samhan -d product_db -c "..."`):
  - `QA996_%` products: `0`
  - QA rule rows: `0`
  - QA source rows: `0`
  - QA target rows: `0`
- 참고: soft-delete 보존 정책상 물리 행은 products 2, rules 3, sources 3, targets 3으로 남지만 모두 `is_deleted=true`이며 active 조회에는 0행.
- 최종 전체 active 대조: `products=1220`(시작 전과 동일), `quantity_sync_rule=0`, `quantity_sync_source=0`, `quantity_sync_target=0`, `QA996_% products=0`.

## 확인하지 못한 것

- 현재 gateway가 `/api/v1/quantity-sync-rules`를 404로 반환하여, gateway 경유 order-app에서 성공적인 shadow 관측 로그/화면 상태는 확인하지 못함.
- 브라우저 연결 기능이 unavailable하여 로컬 Chrome headless/Playwright로 실제 DOM 로그인과 캡처를 수행함.
- product-service 외 서비스는 재빌드·재기동하지 않음.
- QA 종료 후 이 워크트리의 order-app Vite 프로세스(PID 66572/68860)만 종료함.

## 최종 판정

- 배포: PASS
- 직결 API shadow 관측: PASS
- 범위 밖 규칙 차단: PASS
- 일반 S-03 무결성 예외 차단: PASS
- 지정 gateway를 통한 order-app shadow 성공 관측: BLOCK (gateway `404`)
