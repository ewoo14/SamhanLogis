# C5-4 (PR-2) role 와이어 제거 — 게이트 2 실 Docker QA 증빙 (전 서비스 재배포)

> 2026-06-06 개발책임자 입회 cutover 세션. **전 서비스 재빌드/재배포**(bootJar 전체 + compose build/up — ALL_HEALTHY 확인) 후 실 캡처만. 목업 0 ([[feedback_no_fake_data_ever]]).
> 게이트 2 = X-User-Role/JWT role 클레임 소멸 상태에서 전 역할 매트릭스 동등 + PARTNER/MASTER 위임/arologis 전 경로 실증.

## 0. 환경
- 브랜치 `feat/permission-groups-c5-4-role-wire-removal`(`f5bb1075`) 전 서비스 재배포. influxd 호스트 포트 선점(8086/8088) → slip/partner-order 호스트 포트 override(18086/18088, 컨테이너/라우팅 불변).
- logging-service 는 compose 스택에 미포함(기존과 동일) — 게이트웨이 필터 검증은 503/403 차등으로 실증(§3).

## 1. QA-1 — JWT role 클레임 소멸 (5 역할 실 로그인) ✅
```
dev_master     → {"role": null, "groups": "…100", "isSystemMaster": true}
dev_manager    → {"role": null, "groups": "…101", "isSystemMaster": null}
dev_sales      → {"role": null, "groups": "…102"}
dev_warehouse  → {"role": null, "groups": "…103"}
dev_accountant → {"role": null, "groups": "…104"}
```
→ **전 역할 JWT 에 role 클레임 부재**. 신원 = groups + isSystemMaster. (LoginResponse body 의 role 필드는 유지 — FE 호환, 제거는 PR-3)

## 2. QA-2 — 전 역할 인가 매트릭스 동등 ✅
| 계정 | 요청 | 실측 | 동등성 근거 |
|---|---|---|---|
| master | 권한그룹 관리 | **200** | isSystemMaster bypass (C4-3 후 단독 키) |
| manager / sales | 권한그룹 관리 | **403/403** | @RequirePermission deny |
| sales | 매출조회 OUTBOUND | **200** | 그룹102 ∈ 슬립 가드 허용집합 |
| warehouse | 매출조회 OUTBOUND | **403** | 차단 보존 |
| warehouse | 매입조회 INBOUND | **200** | 그룹103 ∈ 매입 가드 허용집합 |
| accountant | 매입조회 INBOUND | **403** | 기존 role 허용집합 {WAREHOUSE,MANAGER,MASTER} 동등 (ACCOUNTANT 비포함) |
| master | 매출조회 OUTBOUND | **200** | bypass |
| master/sales/warehouse | permissions/my | **200/200/200** | account-mode role-무관 |

## 3. QA-3 — logging-service 라우트 allowedGroups 단독 ✅
| 계정 | /api/logs | 의미 |
|---|---|---|
| master(그룹100) | **503** | 게이트웨이 그룹 검사 **통과**(백엔드 미기동 → 503 ≠ 403) |
| manager(그룹101) | **503** | 통과 |
| sales(그룹102) | **403** | 게이트웨이 차단 |
→ allowedRoles 완전 대체 후에도 그룹 기반 라우트 가드 정상.

## 4. QA-4 — PARTNER 와이어 (partnerCode 클레임 → X-Is-Partner → Aspect 거절) ✅
정직 고지: QA 환경 partner_auth seed 0 (파트너 계정 무) → **partner-auth 발급과 동일 형식의 JWT 를 dev 시크릿으로 주조**(sub+partnerCode 클레임, HS256)해 실 게이트웨이 와이어 경로를 실증. 운영 발급 경로 자체는 PartnerAuthServiceTest(partnerCode 클레임)·게이트웨이 단위 테스트(X-Is-Partner 주입)로 검증.
| 요청 | 실측 | 의미 |
|---|---|---|
| permissions/my | 200 | PARTNER 자기조회 분기 |
| 권한그룹 관리 | **403** | PermissionAspect PARTNER 거절 (X-Is-Partner 기반, role 없음) |
| 매출조회 OUTBOUND | **403** | 슬립 가드 차단 |

## 5. QA-5 — MASTER 위임 작업 (ManagementPageMutationGuard isSystemMaster 경로) ✅
```
master 그룹 생성 → eca38f90-… (200)
master 그룹 배속(dev_sales) → 200 / 해제 → 204 / 그룹 삭제 → 204
sales  그룹 생성 시도 → 403 (비 isSystemMaster 거절 — fail-secure)
```
→ Phase B 위임 봉쇄 가드가 role 없이 X-Is-System-Master 단독으로 동작. QA 부산물 완전 원복(삭제 204).

## 6. QA-6 — arologis 독립 운영 단위 격리 ✅
```
POST :8097/auth/admin/login (admin) → 200
accessToken(HS512, iss=arologis-service) claim: "role":"AROLOGIS_MASTER"
```
→ arologis 는 자체 JWT/role 체계 유지 — Samhan role 제거 무영향.

## 6.5 dual review P0/P1 교정 후 보강 실QA (재배포 — gateway/partner-order/dc-config) ✅

**P1-a 게이트웨이 X-Is-Partner 스푸핑 차단** (게이트웨이 경유 실 와이어):
```
[A] 파트너 JWT(partnerCode 클레임) → 권한그룹 관리      : 403 (X-Is-Partner=true 정상 주입 → Aspect 거절)
[B] Samhan직원 JWT + 위조 X-Is-Partner:true → permissions/my : 200 (게이트웨이 false 강제 덮어씀 = 위조 무시)
[C] 대조 Samhan직원 정상                                : 200
```

**P0 파트너 자기범위 우회 차단** (partner-order :18088 직접, 게이트웨이 주입 헤더 모사):
```
[본인]   X-Is-Partner:true + X-Partner-Code:P-QA-001, partnerId=P-QA-001 → 200  (본인 범위 통과)
[타거래처] X-Is-Partner:true + X-Partner-Code:P-QA-001, partnerId=P-OTHER  → 403  (자기범위 차단 = 우회 봉쇄)
[내부직원] X-Is-Partner 없음 + groups, partnerId=P-OTHER                  → 200  (내부 role 자기범위 무관)
```
→ C5-4 후 ROLE_PARTNER authority 소멸로 발생했던 자기범위 우회(P0)가 X-Is-Partner 헤더 직접 판정으로 봉쇄됨을 런타임 실증. 단위 12케이스(PartnerSelfScopeGuardTest) + 게이트웨이 스푸핑 3케이스 동반.

## 7. PM 통합 검증 적발·교정 이력 (구현 agent 1·2차 이후)
- **락아웃 클래스 누락 적발**: EstimatePermissionGuard·auth 위임 가드 3곳(actor role 판정) → X-Is-System-Master 전환(`0c3749cc`).
- 401 강화 분기 제거 여파(missingUserId 계약 14) → **identity 부분-헤더 재키잉 복원**(`f5bb1075`).
- slip/user/accounting MASTER bypass·InventoryClient 헤더 단언 테스트 12사이트 갱신(`31dc5160`·`f5bb1075`).

## 8. 검증 요약
- 전 모듈 compileJava+compileTestJava + shared:common/security·gateway·auth·slip·user·inventory·accounting·partner-auth test green.
- 필터 ROLE_* authority 분기는 의도 잔존(arologis hasRole + 잔존 토큰 호환, actor 판정 아님 — 정리는 후속).
- DB 백업 `backups/c5-cutover-pre-20260606-180731.sql` + 직전 이미지 롤백 가능.
