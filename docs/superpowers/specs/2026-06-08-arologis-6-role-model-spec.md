# arologis 6-롤 모델 확장 — spec (2026-06-08)

> 개발책임자 지시: "아로로지스는 마스터, 매니저, 개발자, 영업사원, 회계사원, 배송기사 이렇게만 권한이 있으면 돼." **적용 범위 = 권한 모델 전체**(매트릭스 + HR 배정 둘 다, 2롤→6롤). [[arologis-desktop-backoffice]] 연장.

## 1. 목표
arologis 롤 모델을 현 2롤(AROLOGIS_MASTER/AROLOGIS_MANAGER)에서 **6롤**로 확장하고, Samhan 공용 시드가 깐 무관 5롤의 arologis.* grant 를 제거한다.

| 한국어 | arologis 롤(HR/JWT) | 중앙 정규화 코드(매트릭스 열) |
|---|---|---|
| 마스터 | AROLOGIS_MASTER | MASTER (read-only/bypass) |
| 매니저 | AROLOGIS_MANAGER | MANAGER |
| 개발자 | **AROLOGIS_DEVELOPER** (신규) | DEVELOPER |
| 영업사원 | **AROLOGIS_SALES** (신규) | SALES |
| 회계사원 | **AROLOGIS_ACCOUNTANT** (신규) | ACCOUNTANT |
| 배송기사 | **AROLOGIS_DRIVER** (신규 enum 등재) | DRIVER (정규화 이미 존재) |

**제거(매트릭스/시드)**: DISPATCH(배차담당자), INVENTORY(재고원), PARTNER(협력사), STAFF(사원), WAREHOUSE(창고원) — 어떤 arologis 사용자도 보유 불가한 Samhan 공용 시드 잔재(dead row).

## 2. 아키텍처 (기존 정규화 패턴 준수)
- arologis JWT `role` = AdminUserRole.name()(AROLOGIS_*). `DynamicPermissionClientConfig.normalize()` 가 중앙 코드로 변환 후 `role_page_permissions[centralRole][page]` 조회. 매트릭스(getRoleMatrix)는 중앙 코드로 키잉 → 6 열.
- AROLOGIS_MASTER = `PermissionAspect.isMasterBypass` 전체 통과(유지). 매트릭스 MASTER 열 = read-only(유지).
- 권한상승 가드(ArologisEmployeeService): "마스터 부여/변경 = 마스터 actor 만"(persisted DB 조회) 유지. 신규 4롤은 비마스터라 매니저도 배정 가능(기존 로직 자동 커버).

## 3. 변경 touch points
### BE (arologis-service)
1. `domain/auth/AdminUserRole.java` — enum 4값 추가 + javadoc.
2. `config/DynamicPermissionClientConfig.normalize()` — AROLOGIS_DEVELOPER→DEVELOPER, AROLOGIS_SALES→SALES, AROLOGIS_ACCOUNTANT→ACCOUNTANT 매핑 추가(AROLOGIS_DRIVER→DRIVER 기존).
3. `service/ArologisEmployeeService` — 가드 변경 불요(마스터 특례만 유지). 신규 롤 배정 경로 검토.
### BE (auth-service) 시드
4. `db/migration/V53__arologis_6_role_model.sql` (신규):
   - DELETE arologis.* role_page_permissions WHERE role_code IN (DISPATCH, INVENTORY, PARTNER, STAFF, WAREHOUSE).
   - INSERT 신규 4롤 grant(아래 §4 기본표). MASTER/MANAGER 행 불변.
5. `AuthFlywayV53SeedIT` — 제거 0건 + 신규 grant 검증.
### FE (arologis-desktop)
6. `api/arologisHr.ts` — `ArologisRole` 유니온 6값.
7. `routes/admin/EmployeesPage.tsx` — ROLE_OPTIONS 6 + ROLE_LABELS 6(마스터/매니저/개발자/영업사원/회계사원/배송기사). availableRoleOptions(마스터 grant 게이트) 유지.
8. `routes/admin/PermissionsPage.tsx` — 매트릭스 ROLE_LABELS 6 중앙코드 + 라벨(영업사원/회계사원/배송기사로 정정). 제거 5롤 라벨 삭제.
9. `stores/authStore.ts` — canManageHr/canManageDrivers = MASTER|MANAGER 유지(HR 관리 주체 비확대). 주석 6롤 갱신.

## 4. 신규 4롤 기본 grant (보수적·유용, 마스터가 매트릭스 UI 로 조정)
| page-code | 개발자 | 영업사원 | 회계사원 | 배송기사 |
|---|---|---|---|---|
| arologis.admin (배차 관리) | V/E | V | F | F |
| arologis.region | V/E | V | F | F |
| arologis.dispatch.admin | V/E | V | F | F |
| arologis.dispatch.ops | V/E | V | F | F |
| arologis.region.manage | V/E | F | F | F |
| arologis.edit-requests | V/E | F | F | F |
| arologis.edit-requests.decide | V/E | F | F | F |
| arologis.driver (기사앱) | V/E | F | F | **V/E** |
| arologis.hr.employees | V/E | F | F | F |
| arologis.hr.departments | V/E | F | F | F |
| arologis.accounting.cashbook | V/E | F | **V/E** | F |
| arologis.accounting.summary | V/E | F | **V/E** | F |
| arologis.admin.permissions | F | F | F | F |

- 개발자 = 권한관리 외 전권(power user). 회계사원 = 회계 전용. 영업사원 = 배차/지역 조회(view). 배송기사 = 기사앱 전용(모바일).
- 마스터 = bypass(전권). 매니저 = 기존 유지(권한관리 외 V/E). **개발책임자 매트릭스 UI 로 즉시 조정 가능.**

## 5. QA
- 풀스택 실화면: 6롤 매트릭스 노출(제거 5롤 미노출) + HR 6롤 드롭다운 + 신규 롤 직원 provisioning + 신규 롤 JWT 정규화 enforcement(예: AROLOGIS_ACCOUNTANT 로 회계 접근 가능/배차 차단) end-to-end. 증빙 `docs/qa/arologis-6-role-model/`.

## 6. 워크플로우
6단계: 클로드 기획+조기 PR → 개발(Codex 대체 클로드) → 클로드 5-agent 리뷰+fix → 크로스체크(Codex 대체)+fix → PM 판단 → 실 QA → 머지. Codex 회복(Jun 11) 후 추가 크로스 검증.
