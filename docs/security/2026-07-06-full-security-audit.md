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

## 4. 진행 상태 (라운드별 갱신)

| 라운드 | 상태 |
|---|---|
| 조기 PR 개설 | ✅ (본 커밋) |
| Opus 5-에이전트 리뷰 | 🔄 진행 중 |
| Docker 실사용 QA | ⏳ 대기 |
| Codex 5-에이전트 리뷰 | ⏳ 대기 (Opus 완료·게시 후) |
| 0 수렴 | ⏳ |
| PM(Fable5) 종합 + 머지 | ⏳ |

> findings 확정분·QA 증거·fix 내역은 본 PR 코멘트에 라운드별 누적 게시.
