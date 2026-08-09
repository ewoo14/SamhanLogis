# PR #1145 R8 라이브 QA 환경·관측 원문

- 시각: 2026-08-09 KST
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1144`
- 검증 HEAD: `018385cb19f26d7a148fe78f287c77622c1bee8f`
- 현재 워크트리 Vite: `http://127.0.0.1:51145`, `VITE_MOCK_MODE=1`
- Vite 호출 API 성격: 브라우저 내부 `getMockResponse`를 쓰는 mock 경로
- 기존 실 스택: gateway `127.0.0.1:8080`, auth-service `127.0.0.1:8081`, PostgreSQL `127.0.0.1:5432`
- Docker 재배포: 0회. 기존 컨테이너는 이 워크트리 HEAD의 배포본이라고 간주하지 않았다.

## 서버 응답 원문

```text
GET http://127.0.0.1:51145/ -> HTTP 200, 1283 bytes
GET http://127.0.0.1:51145/main.tsx -> HTTP 200, 4323 bytes
GET http://127.0.0.1:51145/App.tsx -> HTTP 200, 6545 bytes
GET http://127.0.0.1:8080/actuator/health -> HTTP 200 {"status":"UP"}
GET http://127.0.0.1:8081/actuator/health -> HTTP 200 {"status":"UP"}
```

## GUI·스크린샷 관측

```text
browser runtime discovery result: []
```

인앱 브라우저 런타임에 사용 가능한 브라우저가 0개라 실제 GUI를 열거나 스크린샷을 찍지 못했다. 따라서 GUI 도달 여부는 **관측 불가**이며 결함 0의 근거로 사용하지 않는다. 독립 Playwright로 우회하지 않았다.

## 실 API 인증 관측

```text
QA_CREDENTIAL_MISSING: infrastructure/.env.local에 QA_DEV_DEFAULT_PASSWORD 없음
```

실 gateway/auth-service health는 원문 확인했으나 인증 자격 부재로 `/api/auth/admin/permissions/my` 실 응답은 **관측 불가**다. DB 대조는 `samhan-postgres`의 `auth_db`를 SELECT만 수행했다.

## 서버 로그

- `vite.stdout.log`: 현재 워크트리 Vite 기동 원문
- `vite.stderr.log`: 최초 design-system 파생물 부재로 발생한 변환 오류 원문. 이후 임시 로컬 파생물을 생성해 `/`, `/main.tsx`, `/App.tsx` HTTP 200까지 확인했으나 GUI 부재로 렌더 완료는 단언하지 않는다.
