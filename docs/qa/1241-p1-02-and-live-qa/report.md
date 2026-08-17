# PR #1241 — P1-02 흡수 및 라이브 QA 보고서

실행일: 2026-08-17 (Asia/Seoul)  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wgas1`  
브랜치: `feat/gas-parity-order-web`

## ① RED 원문

RED 테스트를 먼저 추가하고 `clients/web/estimate-app`에서 실행했다.

```text
FAIL test/calc-fidelity.test.js
할인율 조회 404 → 임의 기본값 없이 미확정 상태로 반환
Expected: true
Received: undefined
```

즉 404가 발생해도 기존 구현은 `dcConfigUnavailable` 없이 45% 기본값 계산을 계속했다.

## ② 고친 내용

- `initDcConfigFromNotion()`이 404·비200·예외를 기본 할인율로 환원하지 않고 `dcConfigUnavailable: true`, 오류 상태, `homeDiscount: null`, `commDiscount: null`을 반환한다.
- 견적 UI가 미확정 배너를 표시하고 할인율 입력을 비우며, 홈멀티·싱글·상업멀티 계산을 0으로 중단한다. 따라서 임의 금액을 사용자에게 확정값처럼 보여주지 않는다.
- 벌크 DC 조회 실패도 거래처에 미확정 상태를 전달한다.
- 성공한 DC 응답은 기존 매핑·산식을 그대로 유지한다.
- Render에 `DC_CONFIG_SERVICE_URL`을 명시했다. 내부 `/internal/**`는 Gateway에 외부 라우트가 없으므로 dc-config-service 전용 주소로 호출해야 한다.

## ③ 404 원인 규명

소스 대조 결과:

```text
dc-config-service 실제 경로: GET /internal/partners/by-bizno/{bizNo}
Gateway: /internal/** 외부 라우트 미등록(의도된 보안 정책)
기존 estimate-app: PARTNER_SERVICE_URL 또는 DC_CONFIG_SERVICE_URL로 해당 경로 호출
```

따라서 운영 `DC_CONFIG_SERVICE_URL`이 Gateway 주소이거나, 해당 사업자번호 거래처가 없으면 404가 난다. 이번 변경으로 Render에 전용 URL 설정 슬롯을 추가해 경로 오류는 고칠 수 있게 했다. 데이터 자체가 없는 404는 정상 금액으로 간주하지 않고 미확정으로 중단한다.

요청받은 `docs/dev-reports/2026-08-17-duplication-audit/P1-02-evidence.md`는 이 워크트리에 존재하지 않았다. 대신 PR 결정 코멘트의 실측 원문을 기준으로 구현했다.

## ④ GREEN

```text
clients/web/estimate-app
  npm test                         20 suites / 357 tests passed
  npm test -- --runInBand test/calc-fidelity.test.js
                                    1 suite / 44 tests passed

clients/desktop
  npm run typecheck                exit 0
  npm run lint                     exit 0 (기존 warning만, error 0)
  npm run build                    exit 0

보조 검증
  clients/web/design-system npm run build  exit 0
```

성공 방향도 기존 테스트로 확인했다. `987-65-43210`의 정상 응답은 홈 DC 0.46, 상업 DC 0.47 및 부가 설정을 기존 값으로 매핑한다.

## ⑤ 라이브 캡처 목록

Playwright Chromium을 `clients/desktop`에서 headless로 실행했고, 스펙은 `*-real-qa` 디렉터리·`resolveQaShotsDir()`·`resolveQaCredential()` 규약을 사용했다.

```text
docs/qa/1241-save-path-luna/screenshots/_local/04-login-blocked.png
  로그인 후 권한 메뉴 401로 세션이 회수되어 빈 로그인 화면을 보여줌.
  화면 행 수: 0 (견적품목 표/구성품 표에 도달하지 못함)
```

고정금액 저장·재조회, 반올림 단위 저장·재조회, P1-02 실패 화면, 성공 금액 일치의 정상 화면 캡처는 인증 게이트가 해소되지 않아 생성하지 못했다. 빈 표/stub를 정상으로 판정하지 않았다.

## ⑥ 로그인 차단 응답 원문

자격은 리터럴이 아니라 `resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')`로 가져왔다. 로그인 자체는 다음과 같이 성공했다.

```text
POST http://127.0.0.1:8080/auth/login
HTTP 200
본문: {"success":true,"code":"OK","message":"성공","data":{"token":"<보안상 비공개>","userId":"a0000000-0000-0000-0000-000000000001","role":"MASTER",...}}
```

그 뒤 Renderer가 권한 메뉴 조회에서 실패했다.

```text
GET http://127.0.0.1:8080/auth/admin/menu-catalog
HTTP 401
본문: {"success":false,"code":"INVALID_TOKEN","message":"유효하지 않은 토큰입니다"}

GET http://127.0.0.1:8080/auth/me
HTTP 401
본문: {"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}
```

결과 URL은 `http://127.0.0.1:5175/login#/login`이었고, Playwright 페이지 스냅샷의 로그인 입력값은 비어 있었으며 행 수는 0이었다. 로그인 API 200의 JWT 원문은 자격·토큰 재노출 방지를 위해 보고서에서 제외했다.

## ⑦ 프로세스 회수

```text
이번 세션에서 기동: clients/desktop Vite Renderer 1개
회수: 완료
5175 청취 프로세스: 0개
Renderer 관련 잔여 프로세스: 0개
공유 DB 변경: 없음
변경값 원복: 저장 화면 진입 전이라 원복 대상 없음
```

커밋·push·git add는 수행하지 않았다.
