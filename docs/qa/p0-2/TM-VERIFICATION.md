# PR #138 P0-2 비밀번호 셀프 재설정 통합 검증 리포트 (TM)

- 검증자: TM (Tech Manager)
- 검증일: 2026-05-11
- 검증 대상 PR: [#138 P0-2 비밀번호 셀프 재설정 — IT 관리자 우회 폐지](https://github.com/ewoo14/SamhanLogis/pull/138)
- 브랜치: `feature/p0-2-password-self-reset`
- 검증 패턴: PR #134 / #136 / #137 회고 가드 + P0-2 보안 특화 점검

---

## 검증 결과 요약

| Check | 결과 | 비고 |
|---|---|---|
| 1. BE record vs FE TS interface 1:1 일치 (PR #136 회고) | **BLOCKER → FIX** | `PasswordResetResultResponse` 가 BE 에 미존재. FE 가 `res.data.data` (= null) 의 `.message`/`.success` 접근 시 TypeError. TM 자가 fix 발행 |
| 2. `@RequestParam` / `@RequestBody` 필드명 정확 | PASS | DTO record 4 필드 (loginId/email/token/newPassword/confirmPassword) BE-FE 정확 일치 |
| 3. `@MockitoSettings(LENIENT)` 적용 | PASS | `PasswordResetTokenServiceTest` 에 `Strictness.LENIENT` 명시 |
| 4. raw hex 0건 (신규 페이지) | PASS | 모든 색상은 `var(--color-*-NNN, #fallback)` 토큰 패턴 (LoginPage 와 동일) |
| 5. design-system Card / Button / FormField 사용 | PASS | `@samhan/design-system` 정식 import. `<input>` 직접 사용은 LoginPage 와 동일 패턴 (FormField render callback) |
| 6. NavLink end prop | N/A | P0-2 페이지는 sidebar 미등록 (LoginPage 의 "비밀번호를 잊으셨나요?" 링크로만 진입). NavLink 0건 |
| 7. ROLE enum 일치 | N/A | `permitAll()` public endpoint, RoleGuard 없음 |
| 8. Flyway V3 의존성 | PASS | V1/V2 의 `accounts` 테이블에 컬럼 추가, `password_reset_tokens` 신규 — 모두 nullable / default, legacy 호환 |
| 9. JWT + X-User-Id / X-User-Role 헤더 | N/A | 비인증 endpoint |
| 10. ApiResponse envelope 일관 (data + meta + error) | **WARNING → FIX** | BE 가 `ApiResponse<Void>` (data=null) + envelope.message 패턴인데 FE 가 data 에서 추출 시도 → TM 자가 fix |

---

## P0-2 특화 보안 점검

| 항목 | 결과 | 비고 |
|---|---|---|
| token DB 평문 저장 X | PASS | `PasswordResetToken.tokenHash` = SHA-256(code) hex 64자. `PasswordResetTokenService.sha256Hex()` 통일 |
| enumeration 방지 (사용자 미존재 / 이메일 불일치 동일 응답) | PASS | `requestReset` 3 분기 (미존재 / 비활성 / 이메일 불일치) 모두 `log.info` + 200 OK return. 단위 테스트 시나리오 2/3/4 검증 |
| rate limit (loginId 1분 3회 / IP 1분 10회) — request | PASS | `PasswordResetRateLimiter` Caffeine sliding window. Controller `requestReset` 진입 즉시 `checkAndIncrement` 호출 |
| rate limit — confirm 단계 token brute-force 방지 | **BLOCKER → FIX** | 기존 코드 `confirm` 에 rate-limit 미적용 → 10⁶ token 공간 brute-force 가능. TM 자가 fix: `confirm` 에도 동일 rate-limit 적용 + 단위 테스트 1건 추가 |
| 토큰 만료 10분 | PASS | `PasswordResetToken.TTL_MINUTES = 10`. `requestReset` 의 `expiresAt = now + 10분` |
| 재발급 시 기존 토큰 soft-delete | PASS | `requestReset` 의 `findByUserIdAndUsedFalse` → `markDeleted("SYSTEM-REISSUE")`. 단위 테스트 시나리오 10 검증 |
| 비밀번호 정책 검증 (8~32자 + 영문 + 숫자 + 특수문자) | PASS | `PasswordPolicy.validate()` 재사용 (P0-2 W10-4 산출물). FE 측 `validatePassword()` 동일 정규식 |
| 낙관적 잠금 (동시 confirm 이중 소비 방지) | PASS | `PasswordResetToken.@Version` 적용. 동시 confirm 시 OptimisticLockException → 한 건만 성공 |

---

## blocker / warning / nit 합계

- **blocker: 2 건 → 모두 TM 자가 fix 완료**
  1. FE TS interface ↔ BE response shape 불일치 — FE 가 `null` 객체 접근 → TypeError (PR #136 회고 패턴 위반)
  2. `confirm` 단계 rate-limit 누락 — token brute-force 위험
- warning: 0 건
- nit: 1 건 (NotificationStub 의 `sendPasswordResetCode` 가 dev console 에 인증번호 평문 출력 — Phase 11 SMTP cutover 시 제거 필수. 현재는 의도된 mock 동작이므로 코드 수정 없음)

---

## TM 통합 fix commit 상세

### blocker #1: FE-BE response shape 불일치

**증상**: BE 의 `PasswordResetController` 가 `ApiResponse.ok(null, "...메시지")` 반환 (data=null, envelope-level message). FE `passwordResetApi.ts` 의 `requestPasswordReset` / `confirmPasswordReset` 가 `return res.data.data` (즉 `null`) 후 `RequestPage` 가 `res.message` 호출 → TypeError.

**원인**: FE TS interface `PasswordResetResultResponse { success, message }` 가 BE 에 존재하지 않는 가상의 DTO 를 1:1 일치라 표기 (PR #136 회고 패턴 정확히 위반).

**fix**: `passwordResetApi.ts` 가 envelope 의 `success`/`message` 를 추출하여 view-model 형태로 반환하도록 수정. mock 의 두 endpoint 도 envelope-level `success`/`message` 셋업으로 일관 정렬.

### blocker #2: confirm 단계 rate-limit 누락

**증상**: `PasswordResetController.confirmReset` 가 `tokenService.confirmReset` 만 호출. 6자리 token 공간 (10⁶) 에 대해 무제한 brute-force 가능.

**fix**: `confirmReset` 메서드에 `HttpServletRequest httpRequest` 파라미터 + `rateLimiter.checkAndIncrement` 추가 (request 와 동일 정책 — loginId 1분 3회 / IP 1분 10회). 신규 단위 테스트 1건 (`confirmReset_callsRateLimiter`) 추가하여 회귀 가드.

---

## 풀빌드 검증

- BE: `gradlew :services:auth-service:assemble` PASS
- BE: `gradlew :services:auth-service:test --tests PasswordResetControllerTest --tests PasswordResetTokenServiceTest` PASS (기존 18 + 신규 1 = 19건)
- FE: `npm run typecheck` PASS

---

## PM 위임

- 풀빌드 검증 + PR 본문 갱신 + CI watch + 머지 요청
