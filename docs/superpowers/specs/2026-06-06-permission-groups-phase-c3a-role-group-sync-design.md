# 동적 권한그룹 Phase C3a — 역할 변경 시 빌트인 role-group 자동 동기화

> 2026-06-06. PM 전권([[feedback_pm_permission_autonomy]]). C2 완료 후 C3 첫 슬라이스.
> 상위 spec: `2026-06-05-permission-groups-phase-c-fixed-role-removal-design.md` §4 C3.

## 1. 문제 (정찰 결과)
Phase A/B 가 권한그룹 시스템(account_groups + materializer)을 구축했고 V44 가 기존 계정을 role 별 빌트인 그룹에 1:1 배속했으나, **이후 role 변경(`AuthService.updateAccountRole`)이 accounts.role 만 바꾸고 account_groups 는 동기화하지 않음** → role 과 그룹 배속이 발산. 이는 C5(role enum 물리제거)의 전제(그룹이 신원의 단일 진실원)를 깨뜨린다.

## 2. 결정 — Option A (PM 판단, 개발책임자 취침 자율)
역할부여 UX 일원화에 두 방향:
- **A(본 슬라이스)**: role 변경 시 빌트인 role-group 자동 동기화. **UX(역할 드롭다운) 유지**, 무중단, 락아웃 0, behavior-preserving. role↔group 발산 해소 = C5 교량.
- **B(후속/개발책임자 검토)**: 그룹 배속 UI 가 role 드롭다운 대체(다중 그룹 일반 UX). 큰 UX 변경 → 개발책임자 결정 사항.
→ 안전·spec 정합·무중단인 **A** 를 자율 진행. B 는 PR 본문에 명시하여 개발책임자 후속 결정.

## 3. scope (auth-service)
`AuthService.updateAccountRole(id, newRole)` 가 role 변경 시:
1. 변경 전 role 의 **빌트인 role-group** 배속 해제(account_groups soft-delete).
2. `account.changeRole(newRole)`.
3. 새 role 의 빌트인 role-group 배속.
4. `EffectivePermissionMaterializer.materializeForAccount(id)` 재계산.
- **다른(수동 배속) 그룹은 보존** — 빌트인 role-group 만 swap(결정적 UUID `00000000-0000-0000-0000-0000000001XX`, V43: MASTER=100…DEVELOPER=109).
- 계정 생성(create) 시에도 초기 role-group 배속(V44 와 동일 보장) — 이미 보장되면 검증만.

## 4. 구현 노트
- role→빌트인그룹 UUID 매핑 = 코드 상수 `BUILTIN_ROLE_GROUP_IDS`(V43 결정적 UUID 반영, V43 주석 참조). (후속 정리: permission_groups.role_code 컬럼 도입 검토.)
- soft-delete 정합: AccountGroupRepository.findByAccountIdAndGroupIdAndIsDeletedFalse 패턴 재사용.
- MASTER bypass 는 role 기반(isMasterBypass)이라 그룹 동기화와 독립(C4 까지 불변) — 그래도 master group 동기화는 일관 수행.
- @Transactional 단일 트랜잭션.

## 5. behavior-preserving / 위험
- **권한(account_page_permissions) 불변 검증 의무**: V43 빌트인 role-group 의 grant 가 기존 role_page_permission_templates 와 동일하므로, role-group swap 후 materialize 결과가 role 직접 grant 와 동일해야 함(발산 0). IT 로 실증.
- 락아웃 0(additive group sync). 무중단.

## 6. 검증
- BE Testcontainers IT: role 변경(MANAGER→SALES) → account_groups 가 101 해제+102 배속 / 수동 그룹 보존 / account_page_permissions 가 새 role grant 반영.
- 전 서비스 빌드+JUnit. dual review(Claude TM·Codex TM 각각)+PM 종합. CI green. DECISIONS D-PGC-07.
- FE 무변경(UX 유지).
