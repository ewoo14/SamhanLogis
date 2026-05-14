---
name: arologis-independent-extract
description: 2026-05-14 사용자 결정 — 아로로지스를 Samhan Public 의 마이크로서비스에서 독립 운영 단위로 분리 (monorepo 유지, build/배포만 분리)
metadata:
  type: project
---

아로로지스 (`arologis-service`, Phase 10 W10-1~W10-4 완료) 를 Samhan Public 의 14 서비스 묶음에서 **독립 운영 단위** 로 분리.

**Why:** 2026-05-14 개발책임자 결정 — 아로로지스 = 별도 제품 인식이 필요한 도메인 (외부 vendor 5만 기사 풀, 모바일 어플, GPS 추적). 같은 AWS 환경 공유로 비용 변경 0 + service-to-service 통신 유지.

**How to apply:**

9개 핵심 결정 (D-AX-01~09):

| # | 결정 |
|---|---|
| D-AX-01 | monorepo 유지 + build/배포만 분리 (settings.gradle 의 `:services:arologis-service` 유지) |
| D-AX-02 | Eureka 클러스터 공유 (service-to-service 통신 변경 0) |
| D-AX-03 | Client 도 분리 — `clients/arologis-desktop` + `clients/arologis-mobile` 신규 |
| D-AX-04 | RDS 공유 + `arologis_db` 격리 (service-per-DB) |
| D-AX-05 | `arologis.samhan-air.com` 하위 (api / app / mobile) |
| D-AX-06 | 단일 통합 PR + 5-team 병렬 |
| D-AX-07 | 계정/인증 완전 별도 (자체 auth + user 도메인) — Samhan Public auth-service / user-service 와 무관 |
| D-AX-08 | Auth 패키징 = arologis-service 내장 (단일 jar, 별도 service 아님) |
| D-AX-09 | 기사 인증 = 휴대번호 passwordless (사전 등록 기사만 허용, OTP/PIN 없음) |

**연관 산출:**
- spec: `docs/superpowers/specs/2026-05-14-arologis-extract-design.md`
- plan: `docs/superpowers/plans/2026-05-14-arologis-extract.md`
- decisions: `migration/decisions/DECISIONS.md` D-AX-01~09
- ROADMAP milestone 명: **Phase 10.5 — 아로로지스 독립 분리**

**도메인 영향:**
- arologis-service 안에 `AdminUser` + `Driver` (기존, `appUserId` @Deprecated) + `RefreshToken` entity 추가
- `UserClient` 삭제 + `shared:user-client-abstraction` 의존 제거
- 3 client (PartnerClient / SlipClient / NotificationClient) 만 유지
- `/auth/admin/login` (loginId+password BCrypt) + `/auth/driver/login` (phoneNumber 만) + `/auth/refresh` (rotation) + `/auth/logout` + `/auth/me`
- Flyway V7 (admin_user) / V8 (refresh_token) / V9 (dev seed master)

**참조:** [[feedback_arologis_name]] / [[feedback_samhan_public_name]] / [[project_arologis_phase10]] / [[project_phase11_aws]]
