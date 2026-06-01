# 게이트웨이 ↔ arologis CORS 중복 헤더 dedup — Docker 실 QA 증빙

- **작성일**: 2026-06-01
- **브랜치**: `fix/gateway-arologis-cors-dedup`
- **대상 변경**: `services/api-gateway/src/main/resources/application.yml` — `spring.cloud.gateway.default-filters` 에 `DedupeResponseHeader=Access-Control-Allow-Origin Access-Control-Allow-Credentials, RETAIN_UNIQUE` 1행 추가
- **QA 방식**: 실 Docker 스택(게이트웨이 :8080 + arologis-service + eureka + 실 auth_db). **stub 없음, 실 게이트웨이 경유 실 인증(MASTER JWT)**. before/after 양쪽 모두 게이트웨이 jar 를 **소스에서 재빌드**하여 검증.

---

## 1. 결함 (배경)

게이트웨이는 전 라우트 응답에 `CorsWebFilter`(`CorsConfig.java`)로 `Access-Control-Allow-Origin`(ACAO)을 부착한다.
arologis-service 는 **게이트웨이 우회 직접접근(:8097)** 용으로 자체 Spring Security `.cors()`(`SecurityConfig.java`)를
보유해, **게이트웨이 경유** 요청에도 자신의 ACAO 를 함께 부착한다(`.cors()` 는 인가 전 실행 → 인증 성공 2xx 응답에 부착).

→ arologis 를 **게이트웨이 경유**로 호출하면 응답에 **ACAO/ACAC 헤더가 2개씩 중복** → 브라우저/Electron 이
`The 'Access-Control-Allow-Origin' header contains multiple values` 로 **요청 차단**(배차 화면 등 arologis 기능 동작 불가).

## 2. 재현 환경

- 게이트웨이 라우트 `arologis-*` 는 모두 `JwtAuthentication` 필터를 거치므로, **유효 MASTER JWT 없이는 401**(게이트웨이에서 차단 → ACAO 1개만, 중복 미재현). 중복은 **arologis 컨트롤러까지 도달한 2xx 응답**에서만 발생.
- 테스트 엔드포인트: `GET /api/v1/arologis/admin/dispatches` (DispatchAdminV1Controller, MASTER 200).
- 인증: `POST /api/v1/auth/login` (dev_master, MASTER) → Bearer JWT.
- Origin 헤더: `http://localhost:5173` (Electron dev 렌더러).

## 3. BEFORE — dedup 필터 없음 (게이트웨이 jar 재빌드, dedup 0행)

```
$ curl -sI -H "Origin: http://localhost:5173" -H "Authorization: Bearer <MASTER>" \
       http://127.0.0.1:8080/api/v1/arologis/admin/dispatches

HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: http://localhost:5173        ← 중복
Access-Control-Allow-Credentials: true                    ← 중복

ACAO 헤더 개수: 2
ACAC 헤더 개수: 2
```

→ **중복 확인.** 브라우저/Electron 차단 조건 성립.

## 4. AFTER — dedup 필터 적용 (커밋 소스에서 재빌드, dedup 1행)

```
$ curl -sI -H "Origin: http://localhost:5173" -H "Authorization: Bearer <MASTER>" \
       http://127.0.0.1:8080/api/v1/arologis/admin/dispatches

HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true

ACAO 헤더 개수: 1
ACAC 헤더 개수: 1
```

→ **단일화 확인.** 브라우저/Electron 정상 통과.

## 5. 회귀 점검 — 비-arologis 라우트 정상 단일 CORS 보존

dedup 이 정상 단일 CORS 헤더를 깎지 않는지(RETAIN_UNIQUE 가 유일값은 그대로 유지) 확인:

| 라우트 | ACAO 개수 | 판정 |
|---|---|---|
| `GET /api/v1/auth/admin/permissions/my` (권한) | 1 | ✅ 보존 |
| `GET /api/v1/accounting/accounts` (회계) | 1 | ✅ 보존 |
| `OPTIONS /api/v1/arologis/admin/dispatches` (preflight) | 1 (+ ACA-Methods 정상) | ✅ 정상 |

→ **회귀 0.** 자체 CORS 미설정 서비스(권한/회계)는 게이트웨이 ACAO 1개뿐 → dedup 영향 없음.
arologis 직접접근(:8097) CORS 도 서비스 자체 필터라 보존됨(게이트웨이 응답 헤더만 중복 제거).

## 6. 결론

- arologis 게이트웨이 경유 CORS 중복(ACAO×2/ACAC×2) **실 버그 확인** → dedup 필터로 **단일화(×1) 확인**.
- 비-arologis 라우트·preflight·서비스 직접 CORS **회귀 0**.
- before/after 모두 **게이트웨이 jar 소스 재빌드 + 실 게이트웨이 경유 실 인증**으로 검증(stub 없음).
