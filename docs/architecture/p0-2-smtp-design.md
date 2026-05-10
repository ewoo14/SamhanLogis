# P0-2 비밀번호 셀프 재설정 — SMTP 인프라 설계

작성일: 2026-05-11
담당: DevOps (SamhanLogis)

---

## 1. 개요

P0-2 (비밀번호 셀프 재설정) 기능은 사용자가 이메일 기반 인증 토큰을 통해
스스로 비밀번호를 재설정할 수 있도록 한다.
SMTP 연동은 **현 단계(Phase 11 이전)** 와 **Phase 11(AWS 마이그레이션 이후)** 로
단계별 구현 전략을 분리한다.

---

## 2. 현 단계 — Mock SMTP (Phase 11 이전)

### 2-1. 동작 방식

실제 이메일 발송 없이 다음 두 가지 대체 수단으로 인증 흐름을 검증한다.

| 수단 | 내용 |
|------|------|
| Console 출력 | 인증 토큰(6자리 OTP 또는 UUID 링크)을 `logger.info` 로 출력 |
| DB INSERT | `auth_audit` 테이블에 `event_type = PASSWORD_RESET_REQUESTED`, `payload = {token, maskedEmail}` 형태로 INSERT |

### 2-2. 장점

- docker-compose 변경 불필요 (SMTP 서버 컨테이너 추가 없음)
- CI/CD 환경에서 외부 의존성 제거
- 개발자가 서버 로그 또는 DB 직접 조회로 토큰 확인 가능

### 2-3. 구현 위치

```
services/auth-service/
  src/main/java/.../service/PasswordResetService.java
    → sendResetToken() : MockMailSender or JavaMailSender 조건 분기
  src/main/java/.../infra/MockMailSender.java
    → 실제 전송 없이 logger.info + auth_audit INSERT
```

---

## 3. Phase 11 단계 — AWS SES 또는 SendGrid 연동

### 3-1. 선택지 비교

| 항목 | AWS SES | SendGrid |
|------|---------|----------|
| 과금 기준 | $0.10 / 1,000건 | Free 100건/일, $19.95/월 Essentials |
| 도메인 검증 | Route 53 통합 (samhan-air.com DNS) | CNAME/TXT 수동 추가 |
| 반송 관리 | Suppression List 자동 | 대시보드 수동 |
| 선호도 | **AWS SES 우선** (Phase 11 AWS 단일 환경) | 대안 |

### 3-2. AWS SES 설정 절차 (Phase 11 cutover 시)

1. ap-northeast-2 리전에서 SES Identity 생성 (`samhan-air.com` 도메인 검증)
2. DKIM/SPF DNS 레코드 추가 (Route 53)
3. Sandbox 해제 신청 (프로덕션 발송 한도 24시간 내 승인)
4. IAM 역할 `SamhanSESRole` 생성 → EC2 인스턴스 프로파일 연결 (또는 SMTP 자격증명 발급)
5. `SAMHAN_SMTP_HOST=email-smtp.ap-northeast-2.amazonaws.com`, `PORT=587` 설정

### 3-3. 환경변수 주입 방식

Phase 11 EC2 환경에서는 AWS Systems Manager Parameter Store 또는
Secrets Manager 에서 환경변수를 주입하며, `.env` 파일은 인스턴스에 직접 작성하지 않는다.

---

## 4. 환경변수 명세

| 변수명 | 기본값 (DEV) | 설명 |
|--------|-------------|------|
| `SAMHAN_SMTP_HOST` | `localhost` | SMTP 서버 호스트 |
| `SAMHAN_SMTP_PORT` | `25` | SMTP 포트 (SES STARTTLS = 587) |
| `SAMHAN_SMTP_USERNAME` | (빈 문자열) | SMTP 인증 사용자명 |
| `SAMHAN_SMTP_PASSWORD` | (빈 문자열) | SMTP 인증 비밀번호 |
| `SAMHAN_SMTP_AUTH` | `false` | SMTP AUTH 활성화 여부 |
| `SAMHAN_SMTP_STARTTLS` | `false` | STARTTLS 활성화 여부 |
| `SAMHAN_PASSWORD_RESET_FROM_EMAIL` | `no-reply@samhanair.com` | 발신자 이메일 주소 |

---

## 5. docker-compose 변경 없음

현 단계에서는 docker-compose.yml 에 SMTP 관련 컨테이너(MailHog 등)를 추가하지 않는다.
이유:

- Mock 방식으로 기능 검증이 완료됨
- MailHog 추가 시 포트 충돌 및 메모리 증가 우려
- Phase 11 에서 SES 전환 시 로컬 SMTP 서버 자체가 불필요

Phase 11 cutover 이후에는 `.env` 또는 Parameter Store 에서
SES SMTP 자격증명을 주입하여 auth-service 를 재시작하는 방식으로 전환한다.

---

## 6. 보안 가드

| 항목 | 내용 |
|------|------|
| 토큰 해시 저장 | DB 에는 bcrypt 해시만 저장 (평문 토큰 비저장) |
| 만료 시간 | 10분 (`samhan.password-reset.token-ttl-minutes: 10`) |
| Rate Limit | 분당 최대 3회 (`samhan.password-reset.rate-limit-per-minute: 3`) |
| 토큰 단회 사용 | 재설정 완료 즉시 토큰 무효화 (DB `used_at` 업데이트) |
| 이메일 마스킹 | 로그 및 감사 테이블에 `us***@example.com` 형태로만 기록 |

---

## 7. 연관 문서

- `docs/dev-reports/p0-2-password-self-reset.md` — 구현 dev-report
- `docs/manual/01-로그인.md` — 사용자 매뉴얼 (비밀번호 재설정 절차 추가 예정)
- `infrastructure/env-templates/auth-service.env` — 환경변수 템플릿
- `services/auth-service/src/main/resources/application.yml` — spring.mail 섹션
