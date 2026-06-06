# 권한그룹 C5-1 P2 선처리 — 실 Docker QA 증빙

> 2026-06-06. 실 Docker 풀스택(samhan-api-gateway · samhan-auth-service **본 브랜치 재빌드/재배포**) 대상 실 캡처만 수록.
> 목업·합성·시뮬레이션 0 ([[feedback_no_fake_data_ever]]). 모든 출력은 실 curl/psql 응답 원문.

## 0. 환경

- 브랜치 `fix/permission-groups-c5-1-p2` (`e37a985b`) bootJar → `docker compose build auth-service api-gateway` → `up -d` 재배포.
- 재배포 후 두 컨테이너 healthy 확인:

```
samhan-auth-service    Up 15 seconds (healthy)
samhan-api-gateway     Up 10 seconds (healthy)
```

## 1. CorsConfig exposedHeaders — `X-User-Groups` 실 노출 ✅

실 로그인 요청(Origin: http://localhost:3000)에 대한 게이트웨이 실 응답 헤더:

```
POST http://localhost:8080/api/auth/login   (Origin: http://localhost:3000)

HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Expose-Headers: Authorization, Content-Type, X-User-Id, X-User-Role, X-User-Groups
Access-Control-Allow-Credentials: true
```

→ `X-User-Groups` 노출 추가 + 기존 4종(Authorization/Content-Type/X-User-Id/X-User-Role) 회귀 0.

## 2. JWT `groups` claim ORDER BY (순서 결정성) — 런타임 실증 ✅

**설계**: insertion order ≠ UUID 오름차순이 되도록 **UUID 큰 그룹을 먼저** 배속 → claim 이 오름차순으로 나오면 insertion/PK 순서가 아닌 `ORDER BY group_id ASC` 가 실제 적용됨을 증명.

1. MASTER 로 임시 custom 그룹 2개 생성(빈 매트릭스 = 권한 영향 0):
   - A = `b47b1fdf-2478-492e-b882-d3b5c7a2cfcf` (큰 UUID)
   - B = `4b240cf1-3f8e-463a-93a7-820c8c69c7ec` (작은 UUID)
2. dev_sales(`a0000000-…0004`, 기존 그룹 `…0102`)에 **A 먼저, B 나중** 배속 (실 API `POST /auth/admin/accounts/{id}/groups`, 둘 다 200).
   - insertion order = `…0102` → `b47b…` → `4b24…`
3. dev_sales 실 로그인 → JWT payload `groups` claim 디코드:

```
JWT groups claim = 00000000-0000-0000-0000-000000000102,4b240cf1-3f8e-463a-93a7-820c8c69c7ec,b47b1fdf-2478-492e-b882-d3b5c7a2cfcf
sorted asc      = 00000000-0000-0000-0000-000000000102,4b240cf1-3f8e-463a-93a7-820c8c69c7ec,b47b1fdf-2478-492e-b882-d3b5c7a2cfcf
MATCH(ORDER BY) = True
```

→ claim 순서 = **오름차순** ≠ 배속(insertion) 순서. `findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc` 런타임 실증.

## 3. 기존 동작 회귀 0 ✅

- §1 로그인 응답에서 dev_master JWT 정상 발급: `role=MASTER`, `isSystemMaster=true`, `groups=00000000-…0100`(C4/C5-1 클레임 전부 보존).
- §2 dev_sales 로그인/배속/해제 전 과정 실 API 200/204.

## 4. QA 환경 원복 ✅

임시 배속 2건 해제(204) + 임시 그룹 2개 삭제(204) 후 dev_sales 재로그인:

```
restored groups = 00000000-0000-0000-0000-000000000102
```

→ QA 전 상태로 완전 복귀(잔여 데이터 0).

## 5. 정직 고지

- 본 QA 는 터미널 기반 실 curl/JWT 디코드 캡처(텍스트 원문)이며 GUI 화면 캡처는 해당 없음(백엔드 전용 변경).
- 게이트웨이 헤더 상수 통일(HttpHeaderConstants)은 와이어 포맷 무변경(문자열 동일) — §1/§2 의 실 헤더/claim 정상 동작이 곧 회귀 0 증빙.
