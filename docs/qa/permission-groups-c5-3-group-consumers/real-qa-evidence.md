# C5-3 (PR-1) 소비처 그룹 전환 — 게이트 1 실 Docker QA 증빙

> 2026-06-06 개발책임자 입회 cutover 세션. 본 브랜치(`d7739ac5`+`456236ed`) 재빌드/재배포(auth·gateway·slip·inventory) 후 실 캡처만. 목업 0 ([[feedback_no_fake_data_ever]]).
> 게이트 1 정의: 기존 역할 매트릭스 회귀 0 + LoginResponse.groups 실값 + 그룹 OR 경로 단독 실증.

## 0. 환경 특이사항 (호스트 포트 충돌)
- 호스트 `influxd`(PID 8676, HW 모니터링류)가 127.0.0.1:8086 선점 → slip-service 호스트 포트만 `docker-compose.slip-port-override.yml` 로 18086 우회 (컨테이너 내부 8086·서비스간 URL·게이트웨이 라우팅 불변).
- 4 컨테이너 전부 (healthy) 확인 후 QA.

## 1. QA-1 — LoginResponse.groups 실값 ✅
```
POST /api/auth/login (dev_master) →
  groups = [{"id": "00000000-0000-0000-0000-000000000100", "name": "마스터", "builtin": true}]
  role   = MASTER   (기존 필드 불변)
POST /api/auth/login (dev_sales) →
  groups = [{"id": "00000000-0000-0000-0000-000000000102", "name": "영업원", "builtin": false}]
  role   = SALES
```

## 2. QA-2 — 기존 역할 매트릭스 회귀 0 (role 경로 보존) ✅
| 계정 | 요청 | 실측 | 기대 |
|---|---|---|---|
| dev_master | GET /auth/admin/permission-groups | **200** | 200 (MASTER bypass) |
| dev_sales | GET /auth/admin/permission-groups | **403** | 403 (@RequirePermission deny) |
| dev_sales | GET /api/slips/query?slipType=OUTBOUND | **200** | 200 (SALES 허용) |
| dev_warehouse | GET /api/slips/query?slipType=OUTBOUND | **403** | 403 (차단 보존) |
| dev_master | GET /api/slips/query?slipType=OUTBOUND | **200** | 200 |

## 3. QA-3 — 그룹 OR 경로 단독 실증 (PR-2 제거 후 동작 선검증) ✅
slip-service 직접 호출(:18086), **X-User-Role 헤더 완전 부재** 상태에서 X-User-Id + X-User-Groups 만 전달:
| 헤더 | 실측 | 의미 |
|---|---|---|
| groups=…102(영업원), role 부재 | **200** | HeaderAuthenticationFilter X-User-Id 단독 인증 + SlipSalesAccessGuard 그룹 OR 경로 동작 |
| groups=…103(창고원), role 부재 | **403** | 비허용 그룹 정확 차단 (fail-secure) |

→ X-User-Role 이 사라져도 그룹 집합만으로 인가가 동등하게 판정됨을 **런타임 실증**. PR-2(제거)의 안전 근거.

## 4. partnerCode 실측 (BE agent, 코드 분석)
- partner-auth JWT 클레임에 partnerCode **부재**(jti/sub/role/exp/iat/departmentName), 게이트웨이 X-Partner-Code 주입 필터 **없음**, FE 주입 헤더는 신뢰 불가.
- → PR-1 에서 PARTNER 판정은 role 유지. **PR-2 선행 작업으로 partner-auth JWT partnerCode 클레임 + 게이트웨이 주입(additive) 추가 후 전환** (계획서 보정).

## 5. 검증 요약
- shared:security·api-gateway·slip-service·auth-service test green (신규: parseGroupsHeader 5 + allowedGroups 4 + SlipSalesAccessGuard 그룹 9).
- 전 14서비스 compileJava+compileTestJava SUCCESSFUL.
- FE: typecheck/lint 0, 핵심 spec 17 통과 (groups 수신 배선, role 소비 무변경).
