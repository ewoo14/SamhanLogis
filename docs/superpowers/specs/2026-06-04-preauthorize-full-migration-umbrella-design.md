# @PreAuthorize 완전제거 → 동적 @RequirePermission 마이그레이션 — Umbrella 설계 (Spec)

- 작성일: 2026-06-04
- 성격: 권한 모델 일관성 완성. 정적 Spring Security guard → DB-seeded 동적 권한으로 **behavior-preserving** 전환.
- 선행: SP-D1~D7(프레임워크·shared:security 통합·조회성 23건 전환). 본 작업 = **잔여 일괄 청산**.
- 결정: 개발책임자 "**전부 전환(진정 완전제거)**" (2026-06-04). MASTER 전용·다중role·isAuthenticated·커스텀 SpEL 모두 전환, **INTERNAL 2건만 서비스간 가드로 유지**.

---

## 1. 현황 (verify, 2026-06-04)

잔여 `@PreAuthorize` = **131건 / 13 서비스**. 유형:

| 유형 | 수 | 처리 |
|---|---|---|
| `hasRole/hasAnyRole/hasAuthority` | 73 | 전환 (MASTER 전용 ~47 + 다중role ~24 + INTERNAL 2) |
| ↳ `hasRole('INTERNAL')` | 2 | **유지** (서비스간 internal-token, 사용자 RBAC 아님) |
| `isAuthenticated()` | 9 | 전환 (sp-d7 정책: 별도 Guard 강제 시 descope) |
| 기타 SpEL/hasPermission/커스텀 | 27 | 개별 triage 후 전환 |
| permitAll/denyAll | 0 | — |

**전환 대상 = 129건**(131 − INTERNAL 2). 서비스 분포: auth(7)·inventory(6)·user/slip/partner/arologis(각5)·notification(4)·product/groupware/dc-config(각2)·partner-order/dashboard/accounting(각1).

## 2. 핵심 원칙

1. **Behavior-preserving**: 전환 후 접근 가능 주체(role 집합)가 **불변**. 정적 `hasAnyRole('A','B')` → page-code grant 가 동일 role 집합에만 부여되도록 auth seed 작성. widening/narrowing 금지(검증 의무).
2. **MASTER 전용 page-code 정책**: `hasRole('MASTER')` → 신규 `system.<domain>.<sub>` page-code + **MASTER 단독 grant**. MASTER 는 동적 모델에서 전 권한 보유하나, "완전제거" 위해 명시 page-code 부여(슈퍼유저 bypass 에 의존 금지 — endpoint 계약 명시화). 도메인별 page-code 신설(granularity = 도메인 단위, 과편 회피).
3. **🚨 실 HTTP 회귀 테스트 의무**([[feedback_enforcement_real_http_test]] — PR #316 회고): 권한 IT 가 `DynamicPermissionClient` 를 `@MockBean` 으로 mock 하면 endpoint 계약 변경이 **CI green 으로 위장(false-green)**. 전환 endpoint 는 **`MockRestServiceServer`/Testcontainers 실 HTTP 회귀 테스트**로 "이 role 은 허용/이 role 은 403" 을 실증. mock-only PASS 금지.
4. **배포 순서**: auth-service seed(신규 page-code + grant) **먼저 배포** → 각 서비스 컨트롤러 전환 배포. 슬라이스별 auth Vxx + 서비스 변경 묶음.
5. **INTERNAL 유지**: `hasRole('INTERNAL')` 2건은 서비스간 호출 가드 — 사용자 권한 모델 밖. 전환 제외(spec 명시).

## 3. Decomposition (per-batch 슬라이스 — 배포 단위)

소→대·저위험→고위험 순으로 패턴 확립 후 확장. 각 슬라이스 = auth seed Vxx + 대상 서비스 컨트롤러 전환 + 실 HTTP 회귀 테스트 + dual N=2 + CI + Docker 실 QA(권한 매트릭스 실 적중).

| 슬라이스 | 서비스(잔여수) | 누적 | 비고 |
|---|---|---|---|
| **M1 (패턴 확립)** | accounting(1)·partner-order(1)·dashboard(1)·product(2)·dc-config(2) | 7 | tail, 전 유형 표본 포함 — page-code+seed+실HTTP테스트 **템플릿 확립** |
| **M2** | notification(4)·groupware(2) | 6 | MASTER 전용 다수(알림 admin) |
| **M3** | user(5)·slip(5) | 10 | 사용자/전표 도메인 |
| **M4** | partner(5)·inventory(6) | 11 | 거래처/재고 |
| **M5 (최고위험)** | auth(7)·arologis(5) | 12 | auth 자체 가드(self-lockout 위험) + arologis 크로스테넌트(AROLOGIS_MASTER) |

> M5 의 auth-service 는 권한 시스템 자체 → lockout 위험 최고. M1~M4 로 패턴·테스트 신뢰 확보 후 마지막. arologis 는 독립 운영 단위([[project_arologis_independent.md]]) cross-tenant role 정합 별도 주의.

## 4. 슬라이스별 공통 절차 (verify-then-migrate)

1. 대상 서비스 각 `@PreAuthorize` 의 role 집합·endpoint 의미 확인 → page-code 결정(기존 도메인 page-code 재사용 우선, 없으면 신설).
2. auth seed Vxx: 신규 page-code + **동일 role 집합 grant**(behavior-preserving). RolePagePermission 템플릿 정합.
3. 컨트롤러: `@PreAuthorize(...)` → `@RequirePermission(page=..., action=...)`. import 정리.
4. **실 HTTP 회귀 테스트**: 전환 endpoint 마다 허용 role 200 + 비허용 role 403 (MockRestServiceServer 로 DynamicPermissionClient 실 HTTP, @MockBean 금지). 기존 IT 도 실 HTTP 로 보강.
5. dual 5-agent N=2([[feedback_cycle_n2_mandatory]]) — BE cross-check 가 운영 lockout/widening 단독 적발(PR #316 회고). Codex 구현([[feedback_codex_implements_claude_reviews]]).
6. CI green(skipped=0) + **Docker 실 QA**(실 게이트웨이+JWT, 전환 endpoint 권한 매트릭스 실 적중 — [[feedback_qa_docker_real_test]]).

## 5. 완료 기준 (전체)

1. 전환 대상 129건 전부 `@RequirePermission` 화, INTERNAL 2건만 잔존.
2. `grep -rE "@PreAuthorize.*hasRole|hasAnyRole|isAuthenticated" services/*/src/main` = INTERNAL 2건 외 0.
3. 전 전환 endpoint behavior-preserving 검증(role 집합 불변) + 실 HTTP 회귀 테스트 통과.
4. auth seed 누적 정합(중복 page-code/grant 없음), 배포 순서 런북.
5. 각 슬라이스 CI green + Docker 실 QA + dev-report + DECISIONS.

## 6. 위험 & 완화

| 위험 | 완화 |
|---|---|
| 운영 lockout (role 집합 변경) | behavior-preserving 의무 + BE dual cross-check + 실 HTTP 회귀(허용/거부 role 양방) |
| @MockBean false-green (#316 회고) | MockRestServiceServer/Testcontainers 실 HTTP 강제, mock-only PASS 금지 |
| MASTER bypass 의존 → 계약 모호 | MASTER 전용도 명시 page-code 부여(슈퍼유저 bypass 비의존) |
| auth-service self-lockout (M5) | M1~4 패턴 확립 후 최종, 권한 시스템 자체 endpoint 별도 정밀 |
| arologis cross-tenant role | AROLOGIS_MASTER/MANAGER 별도 grant 정합, 독립 운영 단위 경계 |
| 배포 순서 오류(seed 미배포 endpoint 403) | 슬라이스별 auth seed 선배포 런북 |

## 7. 결정 기록 (DECISIONS 예정)

- D-PAM-01: scope = **전부 전환(129)**, INTERNAL 2만 유지(개발책임자 2026-06-04).
- D-PAM-02: MASTER 전용 → 명시 `system.<domain>` page-code + MASTER 단독 grant(bypass 비의존).
- D-PAM-03: behavior-preserving 의무 + **실 HTTP 회귀 테스트 필수**(@MockBean false-green 금지, #316 회고).
- D-PAM-04: decomposition = 5 슬라이스(M1 tail 패턴확립 → M5 auth/arologis 최고위험 최종), 슬라이스별 auth seed 선배포.
