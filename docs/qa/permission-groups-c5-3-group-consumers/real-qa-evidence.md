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

## 3. QA-3 — 그룹 OR 경로 단독 실증 (⚠️ 성격: PR-2 선검증, PR-1 완성 QA 아님) ✅
> dual review P1-2 반영 명시: 본 시나리오는 **게이트웨이 미경유 직접 호출**(:18086)로
> HeaderAuthenticationFilter(X-User-Id 단독 인증) + SlipSalesAccessGuard(그룹 OR) 의
> 서비스-레이어 동작을 실증한다. 정상 운영 경로(게이트웨이)는 PR-1 에서 여전히 role 을
> 주입하므로 그룹-단독 분기는 실트래픽에 존재하지 않는다 — "JWT→게이트웨이→downstream"
> 전체 사슬의 role-부재 실증은 **PR-2 게이트 2**(role 클레임 제거 후 전 매트릭스)에서 수행.
slip-service 직접 호출(:18086), **X-User-Role 헤더 완전 부재** 상태에서 X-User-Id + X-User-Groups 만 전달:
| 헤더 | 실측 | 의미 |
|---|---|---|
| groups=…102(영업원), role 부재 | **200** | HeaderAuthenticationFilter X-User-Id 단독 인증 + SlipSalesAccessGuard 그룹 OR 경로 동작 |
| groups=…103(창고원), role 부재 | **403** | 비허용 그룹 정확 차단 (fail-secure) |

→ X-User-Role 이 사라져도 그룹 집합만으로 인가가 동등하게 판정됨을 **런타임 실증**. PR-2(제거)의 안전 근거.

## 4. partnerCode 실측 (BE agent, 코드 분석)
- partner-auth JWT 클레임에 partnerCode **부재**(jti/sub/role/exp/iat/departmentName), 게이트웨이 X-Partner-Code 주입 필터 **없음**, FE 주입 헤더는 신뢰 불가.
- → PR-1 에서 PARTNER 판정은 role 유지. **PR-2 선행 작업으로 partner-auth JWT partnerCode 클레임 + 게이트웨이 주입(additive) 추가 후 전환** (계획서 보정).

## 5. dual review 반영 (1차 push 후 적발·수정)
- **P1 락아웃(Codex·BE·QA 합치)**: logging-service 라우트 allowedRoles+allowedGroups 동시 지정 = 순차 검사(사실상 AND) → groups claim 없는 구버전 토큰(C5-1 이전, TTL 1h)·그룹 미배속 MASTER/MANAGER 신규 차단. → **라우트에서 allowedGroups 제거**(PR-2 에서 단독 지정으로 교체), 필터 Javadoc AND 의미 명시.
- **P1 widening 실적발(CI user+inventory IT)**: 구 "anonymous"(userId+role없음) 케이스 403→200. 분석 = 이 조합은 C5 에서 정당한 인증 형태(인가는 @RequirePermission account-mode, role-무관·IT는 client allow mock)이며 신뢰 모델상 신규 권한 아님(헤더는 게이트웨이 주입 전제, 위조 가능성은 구필터와 동일). → IT 재정의: 진짜 anonymous(헤더 전무)=403 + `noRoleAllowed`(200)/`noRoleForbidden`(403) 계약 박제 — **role 없어도 권한 deny 시 403** 이 핵심 가드.
- **P1 dead code**: PermissionAspect.extractGroups 제거(파서 단일 공개 유지, PR-2 소비 예정 Javadoc). slip 중복 파서 → 공유 parseGroupsHeader 사용(P2).
- **FE P1**: mock builtin 플래그 V43 정합(MASTER 만 true) / groupsJson 역직렬화 형태 검증 / 헬퍼 UUID 카탈로그 기반 재설계(이름 rename 취약 제거).
- **P2**: 말미 콤마·중복 UUID 경계 테스트 추가.

## 6. 검증 요약
- shared:security·api-gateway·slip·auth·user·inventory test green (재실행 — IT 재정의 포함).
- 전 14서비스 compileJava+compileTestJava SUCCESSFUL.
- FE: typecheck/lint 0. 실행 spec(17): applayout 2 · permission-groups 3 · permission-delegation 2 · sp-d1-dynamic-rbac 6 · matrix 2 · bulk 2 (가드/라우팅 변경 0 = 전체 suite 비해당, [[feedback_fe_guard_removal_contract_tests]] 판단 근거).
- 스크린샷: 백엔드 전용 PR 텍스트 원문 증빙 전례(#411·#413) 적용 — GUI 화면 없음 정직 고지. FE 화면 변화가 생기는 PR-2 부터 실 스크린샷 첨부.
