# P0-2 비밀번호 셀프 재설정 — Dev Report

작성일: 2026-05-11
담당: DevOps (SamhanLogis)
관련 branch: `feature/p0-2-password-self-reset`

---

## 1. P0-2 기능 범위

사용자(MASTER/MANAGER/DRIVER/STAFF)가 로그인 화면에서
이메일 인증을 통해 비밀번호를 스스로 재설정할 수 있는 기능.

### 1-1. 팀별 역할 분담

| 팀 | 역할 |
|----|------|
| BE | PasswordResetController / PasswordResetService / MockMailSender 구현, Flyway 마이그레이션 (auth_password_reset_tokens 테이블), auth_audit 이벤트 기록 |
| FE | 로그인 화면 "비밀번호 찾기" 버튼 → 이메일 입력 모달 → 토큰 입력 → 새 비밀번호 설정 3-step 플로우 (Desktop/Mobile-Staff) |
| Designer | 비밀번호 재설정 화면 와이어프레임 + Design Token 적용 |
| DevOps | SMTP 인프라 설계, application.yml spring.mail 섹션 추가, env-template 동기화, Phase 11 AWS SES 연동 계획 수립 |

### 1-2. API 엔드포인트 (BE 담당)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/auth/password-reset/request` | 재설정 토큰 발송 요청 |
| POST | `/auth/password-reset/verify` | 토큰 검증 |
| POST | `/auth/password-reset/confirm` | 새 비밀번호 설정 |

---

## 2. DevOps 구현 내용 (이번 커밋)

### 2-1. application.yml — spring.mail 섹션 추가

`services/auth-service/src/main/resources/application.yml` 에
`spring.mail` 및 `samhan.password-reset` 섹션 신규 추가.
chained-default 패턴 적용 (PR #129 회고 준수).

추가된 환경변수:

| 환경변수 | 기본값 | 설명 |
|----------|--------|------|
| `SAMHAN_SMTP_HOST` | `localhost` | SMTP 서버 호스트 |
| `SAMHAN_SMTP_PORT` | `25` | SMTP 포트 |
| `SAMHAN_SMTP_USERNAME` | (빈 문자열) | SMTP 인증 사용자명 |
| `SAMHAN_SMTP_PASSWORD` | (빈 문자열) | SMTP 인증 비밀번호 |
| `SAMHAN_SMTP_AUTH` | `false` | SMTP AUTH 활성화 여부 |
| `SAMHAN_SMTP_STARTTLS` | `false` | STARTTLS 활성화 여부 |
| `SAMHAN_PASSWORD_RESET_FROM_EMAIL` | `no-reply@samhanair.com` | 발신자 이메일 주소 |

고정값 (application.yml hardcode):

| 키 | 값 | 설명 |
|----|-----|------|
| `samhan.password-reset.token-ttl-minutes` | `10` | 토큰 유효시간 (분) |
| `samhan.password-reset.rate-limit-per-minute` | `3` | 분당 최대 요청 횟수 |

### 2-2. env-template 동기화

`infrastructure/env-templates/auth-service.env` 에
SMTP 관련 7개 환경변수 추가 (application.yml 동기화 의무 준수).

### 2-3. SMTP 아키텍처 설계 문서

`docs/architecture/p0-2-smtp-design.md` 신규 작성.
단계별 전략, AWS SES 설정 절차, 보안 가드 항목 포함.

---

## 3. 매뉴얼 갱신 계획

### 3-1. 01-로그인.md 갱신 항목 (FE 슬라이스 완료 후 적용)

- "비밀번호를 잊으셨나요?" 링크 위치 안내
- 이메일 입력 → 인증번호 수신 → 새 비밀번호 설정 3단계 절차
- 인증번호 유효시간 10분, 분당 3회 한도 안내
- 현 단계(mock): 인증번호는 서버 로그에서 확인 (운영 전 임시)

---

## 4. Phase 11 AWS SES 연동 계획

현재 단계에서는 Mock SMTP (console 출력 + auth_audit DB INSERT) 로 동작하며,
Phase 11 AWS 마이그레이션 cutover 시 아래 절차로 전환한다.

### 4-1. 전환 절차

1. AWS SES 도메인 검증 (`samhan-air.com`, ap-northeast-2)
2. DKIM/SPF DNS 레코드 등록 (Route 53)
3. SES Sandbox 해제 신청 (프로덕션 한도 확보)
4. EC2 인스턴스 프로파일 또는 SMTP 자격증명 발급
5. 환경변수 업데이트:
   - `SAMHAN_SMTP_HOST=email-smtp.ap-northeast-2.amazonaws.com`
   - `SAMHAN_SMTP_PORT=587`
   - `SAMHAN_SMTP_AUTH=true`
   - `SAMHAN_SMTP_STARTTLS=true`
   - `SAMHAN_SMTP_USERNAME=<SES SMTP 자격증명>`
   - `SAMHAN_SMTP_PASSWORD=<SES SMTP 비밀번호>`
6. auth-service 재시작 후 발송 테스트

### 4-2. 비용 예측

| 항목 | 수량 | 월 비용 |
|------|------|--------|
| SES 이메일 발송 | 월 1,000건 이하 예상 | $0.10 미만 |
| SES 도메인 검증 | - | 무료 |

---

## 5. 보안 가드

| 항목 | 구현 내용 |
|------|----------|
| 토큰 해시 저장 | `auth_password_reset_tokens.token_hash` — bcrypt 해시만 저장, 평문 비저장 |
| 토큰 만료 | 발급 후 10분 경과 시 자동 만료 (`expires_at` 비교) |
| Rate Limit | `@RateLimiter` 또는 Redis 기반 카운터로 분당 3회 초과 시 `429 Too Many Requests` |
| 단회 사용 | 재설정 완료 즉시 `used_at` 업데이트 → 재사용 불가 |
| 이메일 마스킹 | 로그 및 auth_audit payload 에 `us***@example.com` 형태로만 기록 |
| 구 비밀번호 이력 | 직전 3회 비밀번호 재사용 금지 (BE 구현 예정) |

---

## 6. docker-compose 변경 없음

현 단계에서 docker-compose.yml 은 변경하지 않는다.
SMTP 관련 추가 컨테이너(MailHog 등) 없이 Mock 방식으로 운영.
상세 이유: `docs/architecture/p0-2-smtp-design.md` 5절 참조.

---

## 7. 검증 이력

| 항목 | 결과 |
|------|------|
| `docker compose config` 파싱 검증 | PASS (변경 파일 없음) |
| application.yml 환경변수 chained-default 패턴 | 준수 |
| env-template UTF-8 저장 | Write 도구 사용 — UTF-8 BOM 없음 |
| dev-report UTF-8 저장 | Write 도구 사용 — UTF-8 BOM 없음 |
