# 전체 보안점검 — Samhan Public (17-서비스 MSA)

- **일자**: 2026-07-06
- **요청**: 개발책임자 — "전체적인 보안점검 + Docker 실사용 테스트 겸임"
- **진행 워크플로우**: 표준 워크플로우 준수 (보안 사안 → Opus·Codex 이중 검증)
  1. **조기 PR 개설** (본 문서 = 스코프/방법론/신뢰경계 분석)
  2. **Opus 5-에이전트 보안 리뷰** (5개 도메인 병렬) → fix(Codex) → 라운드 게시
  3. **Codex 5-에이전트 독립 보안 리뷰** (순차, Opus 완료·게시 후) → fix → 라운드 게시
  4. **Docker 실사용 보안 QA** (실서버 인증우회/헤더위조/미인증 접근 실증) — 매 라운드 동반
  5. error/skip/backlog **0 수렴**까지 반복
  6. **PM(Fable5) 종합 확인** → CI green → 개발책임자 머지 승인
- 🚫 Opus·Codex 라운드 **병렬 금지(순차)**, 리뷰 **단축 금지(5차원 전부)**, 실행=게시 1:1

---

## 1. 감사 범위

| 구분 | 대상 |
|---|---|
| 백엔드 | 17개 서비스 (`services/*`) + 9개 공유 모듈 (`shared/*`) — Spring Boot 3 / Java 17 |
| 게이트웨이 | `api-gateway` (Spring Cloud Gateway, reactive) — 인증 단일 권위 |
| 인증/인가 | JWT 발급/검증, `X-Internal-Token`, 헤더기반 신원전파, 권한 Aspect, 파트너 self-scope |
| 프론트 | `clients/*` (Electron 데스크탑 / 웹 / 모바일) — XSS/Electron 하드닝 |
| 인프라 | `infrastructure/*` (docker-compose, terraform, nginx), 시크릿/설정, CI 워크플로우 |
| 외부연동 | CODEF(금융), 이카운트, 알림(FCM/SES/Aligo), 오브젝트 스토리지 |

**감사 도메인 (5-에이전트 = 5차원)**
1. **주입** — SQL/NoSQL/명령/경로traversal/XXE/템플릿 injection
2. **인가·IDOR** — 권한 Aspect, 객체수준 인가, 파트너 교차테넌트, 미인증 상태변경
3. **시크릿·크립토·설정** — 커밋된 시크릿, 취약 암호, actuator/CORS 노출, 부팅가드
4. **클라이언트·SSRF** — DOM XSS, Electron 하드닝, 토큰 저장, 서버측 SSRF
5. **게이트웨이·역직렬화** — 라우트 노출, `/internal` 노출, 역직렬화 RCE, arologis 독립 인증

## 2. 방법론

`security-review` 스킬 방법론 채택 + 전체 프로젝트로 범위 확대:
- 각 도메인 에이전트가 **재현 가능한 공격경로**가 있는 findings만 보고 (confidence ≥ 7/10)
- 취합 단계에서 **false-positive 필터** (confidence ≥ 8 만 확정) — 이론적/DoS/미커밋 시크릿/테스트파일/env의존 제외
- Codex 라운드가 **독립 교차검증** (Opus 지적 = false-positive 의심 대상도 재검)
- **Docker 실서버 실증** — 코드 리딩 PASS 금지, 실제 HTTP 응답으로 확인

## 3. 신뢰경계 아키텍처 분석 (예비 — Opus 정찰 완료분)

### 3.1 인증 모델 (설계 견고 항목)
- **게이트웨이 단일 권위**: `JwtAuthenticationGatewayFilterFactory` 가 HS256 JWT(Bearer 또는 `access_token` 쿠키) 검증.
- **헤더 스푸핑 차단**: 게이트웨이가 `INBOUND_IDENTITY_HEADERS`(전 8종 identity 헤더 + `X-Internal-Token`)를 **remove-then-set** 으로 제거 후 JWT claim 기반 값만 재주입 (C5-4 P1-a). 목록 **완전성 확인됨** — 게이트웨이 경유 위조 불가.
- **JWT 견고성**: `JwtTokenProvider` = jjwt 0.12.x `parseSignedClaims` — `alg=none`/알고리즘 혼동에 안전.
- **네트워크 격리**: prod compose 상 downstream 서비스 전부 `127.0.0.1:PORT` 바인딩, `api-gateway`(8080)만 공개 → 외부에서 downstream 직접 헤더위조 접근 불가.
- **`/internal/**` 이중가드**: `InternalTokenFilter`(X-Internal-Token) + SecurityConfig `INTERNAL_PRINCIPAL` 인가 → `X-User-*` 위조로 내부엔드포인트 우회 차단.

### 3.2 예비 확정 findings (Opus 정찰 단계 적발)
> 하단 findings는 Opus/Codex 라운드에서 재검·확정 및 fix 대상.

- **[MEDIUM] 부팅가드 프로파일명 불일치** — `InternalTokenGuard`(`shared/security`)가 활성 프로파일 `"prod"` 만 검사(`PROD_PROFILE="prod"`)하는데, 실제 배포는 `SPRING_PROFILES_ACTIVE=production`(`infrastructure/docker-compose.prod.yml`). 다른 코드(`NoopAppNoticeImageStorage`)는 `Set.of("prod","production","staging","aws")`로 둘 다 인지 → **가드가 프로덕션에서 무발동**. dev 기본 내부토큰(`dev-internal-token-change-me`)으로 prod 부팅해도 차단 실패.
- **[MEDIUM] JWT secret 부팅가드 부재** — 내부토큰은 (무발동이지만) 가드가 있으나 `SAMHAN_JWT_SECRET`(dev 기본값 `dev-secret-change-me-in-production-32bytes-min!`)은 **어떤 부팅가드도 없음**. prod에서 env 미설정 시 공개된 dev secret로 기동 → JWT 위조 위험. fail-fast 보호 부재.
- **[LOW→검증] 부팅가드 DEV_DEFAULT 사각지대** — `dc-config`/`partner-order` 등은 내부토큰 dev 기본값이 `dev-only-token-replace`(가드의 `DEV_DEFAULT`와 불일치)라 가드 검사 대상에서 누락.

## 4. Opus 라운드 findings (5-에이전트 + 라이브 QA)

> 5개 도메인 병렬 리뷰 + Docker 실서버(localhost 스택) 라이브 QA 결과. confidence = 에이전트 자체 평가(1–10). 라이브 QA 증거: [`qa/2026-07-06-live-qa-evidence.txt`](qa/2026-07-06-live-qa-evidence.txt).

### HIGH

| # | 제목 | 위치 | conf | 라이브 QA |
|---|---|---|---|---|
| H1 | **파트너 자가등록 교차테넌트 사칭** — 미인증 등록이 client `partnerCode` 신뢰 + PENDING 승인 우회 → 피해자 공개 사업자번호만으로 피해 테넌트 주문/단가/초안 전권 | `partner-auth-service` `PartnerAuthService.java:125`, `PartnerAuth.java:117/69`, gateway route `partner-auth-public-v1` | 9 | 코드확증(파괴적—비실행) |
| H2 | **임시비밀번호 계정탈취** — `POST /api/v1/auth/partner-temp-password`가 client가 준 `mobileNo`로 PIN 발송(등록번호 대조 없음) + `NEED_PW_SET`이 현재비번 검증 skip → 완전 탈취 + 피해자 락아웃 | `partner-auth-service` `PartnerAuthService.java:253`, `PartnerAuth.java:151` | 9 | 코드확증(SMS발송—비실행) |
| H3 | **그룹웨어 쪽지함 IDOR** — `GET /admin/groupware/messages/inbox?userId={uuid}` 소유권 미검, gate `messenger.send`가 전 업무 role에 시드(V30) → 임의 사용자 사쪽지 본문 열람 | `groupware-service` `GroupwareAdminController.java:206`, `MessageService.java:65` | 9 | 코드확증 |
| H4 | **JWT 서명 secret = 커밋된 dev 기본값 + 부팅가드 부재** — gateway↔auth 공유키가 repo에 커밋(`dev-secret-change-me…`), `InternalTokenGuard` 같은 가드 없음. 공개키를 아는 자가 MASTER JWT 위조 → 전면 우회 | `api-gateway` `application.yml:684`·`JwtProperties.java`, `auth-service` `application.yml:51`, `partner-auth` `:34` | 8 | **✅ 라이브 확증**: 위조토큰→`/products`·`/accounting/journals` **200** |
| H5 | **arologis 독립배포 부팅가드 부재 + 8097 `0.0.0.0` 노출·secret 미설정** — 공개 dev secret로 `AROLOGIS_MASTER` 위조 → 직접접근 관리자(기사 PII/배차) 탈취. (메인 prod 스택은 127.0.0.1+secret로 미해당) | `arologis-service` `ArologisJwtProperties.java`, `docker/docker-compose.arologis.yml:34` | 7 | 코드확증(별도 배포경로) |

### MEDIUM

| # | 제목 | 위치 | conf | 비고 |
|---|---|---|---|---|
| M1 | **그룹웨어 일정 열람 IDOR** — `?ownerId={uuid}` 소유권 미검 (all-role gate) | `GroupwareAdminController.java:232` | 9 | H3 동일 근인 |
| M2 | **그룹웨어 일정 변조/위조 IDOR** — `PUT …/schedules/{id}` bare findById, `POST`가 body `ownerId` 신뢰 | `GroupwareAdminController.java:244/222` | 8 | read→write 체인 |
| M3 | **그룹웨어 발신자 위조** — `POST …/messages`가 body `senderId` 신뢰(caller 대조 없음) → 내부 피싱 | `GroupwareAdminController.java:197`, `MessageService.java:34` | 8 | |
| M4 | **전표타입 권한우회(죽은 코드)** — `checkEditPermissionBySlipType`가 게이트웨이가 strip하는 `X-User-Role` 참조 → 항상 no-op. `sales.slip.edit`만으로 매입전표 변경 가능 | `slip-service` `SlipController.java:701` | 7 | |
| M5 | **`InternalTokenGuard` 프로파일명 불일치** — 가드는 `"prod"` 검사, 배포는 `SPRING_PROFILES_ACTIVE=production`(+terraform) → 프로덕션 무발동 | `shared/security` `InternalTokenGuard.java:25` | 9 | dev토큰 부팅차단 실패 |
| M6 | **레거시 웹 주문/견적앱 저장형 XSS** — 백엔드 카탈로그/거래처명을 `.innerHTML`에 무이스케이프(~40곳). 파트너 자가등록 회사명에 payload → 주문폼 열람 시 실행 → 파트너 JWT(sessionStorage) 탈취 | `clients/web/order-app/index.html:5602`, `estimate-app/index.ejs:6043` | 8 | |
| M7 | **Electron webview HTML 주입** — preload가 무이스케이프 HTML 합성 → 레거시 webview `innerHTML` 실행 | `clients/desktop/src/preload/samhanApi.ts:143` | 7 | contextIsolation로 RCE는 차단 |

### LOW / 하드닝

| # | 제목 | 위치 | conf | 비고 |
|---|---|---|---|---|
| L1 | **CORS** `allowedOriginPatterns`에 `localhost:*`/`127.0.0.1:*`/`file://*` + `allowCredentials=true` 프로덕션 잔존 | `api-gateway` `CorsConfig.java:57` | 7 | 원격 미도달, 로컬 상주 공격자만 |
| L2 | **RN WebView `originWhitelist=['*']`** — 인증 WebView 내 임의 origin 로드 | `clients/mobile/.../MobileOrderWebViewScreen.tsx:93` | 7 | 방어심화 |
| L3 | **게이트웨이 `/actuator/gateway` = `exposure.include` 등재** — SCG 4.1.x 기본 비활성이라 실제 미노출. **라이브 404 확인** → 오해소지 설정 정리 권고 | `api-gateway` `application.yml:687` | — | ⬇️ E-HIGH에서 하향(라이브 반증) |
| L4 | Electron `sandbox:false`·`setWindowOpenHandler` 부재 | `clients/desktop/src/main/index.ts:50` | — | 정보성(현재 미악용) |
| L5 | 루트 `C:…devSamhan-Public.tmp_sync.java` 오추적(시크릿 無)·`samhan_dev_pw` 로컬전용 | repo root, `local-all.yml` | — | 정리 권고 |

### 🔐 신뢰경계 라이브 확증 (설계 견고 — 오탐 방지)
- **JWT 검증**: `alg=none`·잘못된 서명·토큰없음 = 전부 **401**. jjwt 0.12 `parseSignedClaims` 안전.
- **게이트웨이 헤더 strip**: 위조 `X-User-Id`+`X-Is-System-Master:true`(토큰X) 경유 = **401**.
- **downstream 직접접근**: 동일 위조헤더 직접(`:8084`) = **200** → 전 모델이 **127.0.0.1 격리 단일통제**에 의존(H-급 방어심화 관찰).
- **부서가드**: 위조 MASTER `/admin/users` = **403**(`@RequireDepartment` 방어).
- **주입 0건**(파라미터 바인딩·서버생성 키·UUID 타입), **SSRF 0건**(host 전부 config/Eureka 바인딩), **역직렬화 0건**, **BCrypt·SecureRandom 일관**, **actuator health/info/prometheus만**, **커밋된 실시크릿 0**.

## 5. Codex 라운드 검증 결과 (독립·적대적, gpt-5.5 high, read-only)

**13 CONFIRM · 4 AMEND · 0 REFUTE · 신규 finding 0** → Opus 라운드와 실질 finding 집합 **수렴**.

- **AMEND**: M4(전표 우회는 `X-User-Role` no-op 범위로 한정), M6(XSS sink 실재하나 "파트너 회사명→sink" source 경로 미확정), L3(actuator/gateway 라이브 404 — 설정정리), L5(dev_pw/tmp 범위)
- **REFUTE 0** — 오탐 없음. H1~H5·M1~M3·M5는 CONFIRM conf 8~9.

## 6. 진행 상태 (라운드별 갱신)

| 라운드 | 상태 |
|---|---|
| 조기 PR 개설 | ✅ |
| Opus 5-에이전트 리뷰 + 라이브 QA | ✅ |
| Opus 라운드 PR 게시 | ✅ |
| Codex 5-에이전트 리뷰 + 게시 | ✅ |
| 이중검증 0 수렴 | ✅ (REFUTE 0, 신규 0) |
| PM(Fable5) 종합 | 🔄 |
| 개발책임자 remediation 승인 → fix(Codex) → CI → 머지 | ⏳ |

> findings 확정분·QA 증거·fix 내역은 본 PR 코멘트에 라운드별 누적 게시.
