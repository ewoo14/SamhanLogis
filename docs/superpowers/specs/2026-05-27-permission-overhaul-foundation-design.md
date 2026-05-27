# 권한 체계 전면 재편 — 토대 설계 (Foundation Design)

> 2026-05-27 brainstorming 산출. 본 문서는 **분해·방향·인벤토리 방법론**을 확정한 토대이며, **프레임워크 상세 spec 은 Phase 0 인벤토리 완료 후** 별도 작성.

## 1. 목표 (사용자 요구)

role 기반(영업원/회계원/사무원 등) 권한 그룹화를 폐기하고:
- **계정(account) 단위 × 페이지 × 7 action** 권한을 개별 설정. MASTER 만 전권.
- MASTER 전용 UI: 계정별 페이지×action 체크박스, **개별 또는 일괄** 설정.
- 프로그램(메뉴) 접속 권한 포함 전면 재편.
- 7 action: **보기(접속) / 입력 / 수정 / 삭제 / 복원 / 다운로드 / 출력**.
  - 다운로드 = **PDF / PNG / EXCEL** 3종.
  - 복원 = 이전 기록 조회 후 롤백. 모든 페이지 데이터는 **전표 단위**, 전표번호 체계 = `YYYY/MM/DD-{전표번호}` (메뉴별).

## 2. 분해 (사용자 승인 — 인벤토리 먼저 → 프레임워크 → 기능)

| Phase | 내용 | PR |
|---|---|---|
| **0 인벤토리 (선행 필수)** | 전 프로그램·메뉴·페이지 + 7기능 구현 현황 audit (무엇이 이미 있고 무엇을 신규 구현할지). 토대. | 산출 = 인벤토리 문서 (코드 변경 X) |
| **1 권한 프레임워크** | account×page×7action 모델 + 마이그레이션 + PermissionAspect 7-action 확장 + 전 컨트롤러 @RequirePermission 재부착(action 매핑) + DynamicPermissionClient 7-action API + **MASTER 체크박스 UI**(계정별 개별/일괄). | **단일 PR 목표** (응집적, 사용자 "가급적 한 PR" 적용) |
| **2+ 기능 구현** | 복원(전 전표 버전이력+롤백) / 다운로드 PDF·PNG / 출력 을 **미구현 메뉴에 신규 구현**. 규모상 도메인별 다중 PR. Phase 1 권한이 게이팅. | 별도 트랙 (단일 PR 불가) |

## 3. 현행 → 목표 모델

**현행**: `accounts.role`(VARCHAR 1개) → `role_page_permissions(role_code, page_code, can_view, can_edit)` (role 단위, 2 action). PermissionAspect = VIEW/EDIT.

**목표**: `account_page_permissions(account_id, page_code, can_view, can_create, can_update, can_delete, can_restore, can_download, can_print)` (계정 단위, 7 action). MASTER = 전권 bypass(매트릭스 무관). 비-MASTER = 명시 grant 없으면 deny.
- (다운로드 PDF/PNG/EXCEL 세분: 단일 `can_download` + 포맷은 기능 레이어에서, 또는 3 컬럼 분리 — Phase 1 설계 시 결정.)

## 4. 규모 (gauge)

- **PageCode 173개** (auth-service enum) = 메뉴 우주 backbone.
- @RequirePermission annotation **~380개** 도메인 분포: inventory 62 / accounting 53 / slip 50 / arologis 43 / partners 40 / sales 34 / products 23 / messenger 13 / admin 13 / dispatch 12 / notifications 7 / estimates 7 / system 6 / ecount 6 / dashboard 4 / purchases 3 / dc-config 1 / aligo 1.
- 인벤토리 audit = 173 페이지 × 7 기능 ≈ 1,200 셀.

## 5. Phase 0 인벤토리 방법론

각 페이지(PageCode)에 대해 7 기능의 **구현 현황(있음/없음)** 매트릭스 작성:

| 컬럼 | 판정 기준 |
|---|---|
| 프로그램 | desktop / mobile / mobile-staff / web(estimate·order·design-system) / arologis-desktop · mobile |
| 메뉴·페이지 | PageCode + FE route/menu |
| 보기(VIEW) | 조회 endpoint (대부분 존재) |
| 입력(CREATE) | POST 생성 endpoint |
| 수정(UPDATE) | PUT/PATCH endpoint |
| 삭제(DELETE) | DELETE (soft delete) endpoint |
| **복원(RESTORE)** | 버전이력 조회 + 롤백 존재? (대부분 미구현 예상 — audit log/edit-request 부분 존재) |
| **다운로드** | Excel(POI 일부 존재) / PDF / PNG export 존재? 포맷별 |
| **출력(PRINT)** | 인쇄 view/endpoint 존재? (거래명세서/출고전표 등 일부) |

- 데이터 소스: BE 컨트롤러 endpoint (HTTP method → action) + FE 메뉴/버튼.
- 산출: `docs/permission-overhaul/menu-inventory.md` (도메인별 섹션 + 마스터 매트릭스 + "신규 구현 필요" 집계).
- 실행: 도메인별 fan-out 에이전트(Explore/general-purpose)로 병렬 audit 후 종합. **fresh 세션 권장** (정확성 + 컨텍스트).

## 6. action 매핑 컨벤션 (Phase 1)

HTTP/의미 → action: GET 조회=VIEW, POST 생성=CREATE, PUT/PATCH=UPDATE, DELETE=DELETE, 롤백=RESTORE, export=DOWNLOAD, 인쇄=PRINT. (조회+가공 SSE/realtime=VIEW.)

## 7. Phase 1 설계 시 결정할 open questions (인벤토리 후)

1. MASTER 외 role 완전 제거 vs 최소 유지(로그인 식별/감사용)? `accounts.role` 컬럼 처리.
2. account-level grant 만 vs role-template(일괄 적용 편의) 옵션 병행?
3. 다운로드 = 단일 can_download vs PDF/PNG/EXCEL 3 컬럼 분리?
4. 복원 메커니즘: 범용 versioning(공통 인프라) vs 도메인별? (Phase 2 범위 산정은 인벤토리 의존.)
5. role_page_permissions → account_page_permissions 마이그레이션(기존 role grant 를 그 role 계정들에 전개?) vs MASTER 가 신규 설정?
6. 일괄 설정 UX (페이지 전체 on/off, action 전체, 계정 복사 등).
7. MASTER bypass 를 PermissionAspect 에서 처리 vs grant 전개.

## 8. 워크플로우 (사용자 명시)

Claude 기획 → Codex 개발/수정 → Claude+Codex 리뷰/fix → **완전 무결함 시에만 PM 머지**. Phase 1 가급적 단일 PR. 기존 dual 5-agent 사이클 + CI green 의무 적용 ([[dual-5agent-review]] [[cycle-n2-mandatory]] [[codex-implements-claude-reviews]]).

## 9. 다음 단계

**Phase 0 인벤토리 실행** (도메인별 fan-out audit → `menu-inventory.md`). 완료 후 본 토대 + 인벤토리로 **Phase 1 프레임워크 상세 spec** 작성 → plan → Codex 구현.
