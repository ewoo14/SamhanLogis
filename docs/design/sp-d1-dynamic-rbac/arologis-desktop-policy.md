# SP-D1 arologis-desktop 사이드바 Hidden 정책 적용 여부 결정

**슬라이스**: audit Slice C — arologis-desktop 사이드바 hidden 정책 적용 감사  
**작성일**: 2026-05-19  
**담당**: FE Designer agent (audit cycle 1 QA 권고 해소)  
**참조**: `docs/design/sp-d1-dynamic-rbac/decisions.md` §3

---

## 결론: Option B — SP-D1 사이드바 Hidden 정책 비대상 (코드 변경 없음)

arologis-desktop 은 단일 운영 도구(MASTER + MANAGER 전용)이므로  
멀티 role 환경을 전제로 하는 SP-D1 hidden 정책의 적용 대상이 아니다.

---

## 1. 결정 근거

### 1-1. arologis-desktop Role 구조

`clients/arologis-desktop/src/renderer/stores/authStore.ts` 주석 및 `authStore.canManageDrivers()` 함수 정의 기준:

| Role | 대상 클라이언트 | 접근 범위 |
|------|--------------|---------|
| `AROLOGIS_MASTER` | arologis-desktop | 모든 메뉴 (배차 + 기사 관리) |
| `AROLOGIS_MANAGER` | arologis-desktop | 배차 / 기사 관리 / 조회 |
| `AROLOGIS_DRIVER` | mobile-staff (앱) | 모바일 전용 — arologis-desktop 미접근 |

arologis-desktop 에 접근하는 role 은 `AROLOGIS_MASTER` 와 `AROLOGIS_MANAGER` 두 가지뿐이며,  
두 role 모두 배차와 기사 관리 메뉴에 대한 접근 권한을 보유한다.

### 1-2. 현재 메뉴 구성

`clients/arologis-desktop/src/renderer/components/AppLayout.tsx` 기준:

| 메뉴 항목 | 경로 |
|---------|------|
| 배차 | `/dispatches` |
| 기사 관리 | `/drivers` |

메뉴가 2개뿐이며, AROLOGIS_MASTER / AROLOGIS_MANAGER 양쪽 모두 접근 가능하다.  
숨겨야 할 메뉴 항목이 role 분기 기준으로 존재하지 않는다.

### 1-3. SP-D1 Hidden 정책의 전제 조건

SP-D1 (`decisions.md` §3) 의 hidden 정책은 다음 전제 조건을 갖는다:

- **멀티 role 환경**: MASTER / MANAGER / SALES / ACCOUNTING / DRIVER 등 여러 role 이 동일 클라이언트를 사용
- **페이지별 접근 매트릭스**: `GET /permissions/my` 로 동적 권한 목록을 조회
- **카테고리 헤더 포함 미렌더링**: 권한 있는 하위 항목이 없으면 카테고리 헤더도 DOM 에서 제거

arologis-desktop 은 이 세 조건 중 어느 것도 해당하지 않는다.

### 1-4. 독립 운영 단위 특성

아로로지스는 Samhan Public 에서 분리된 독립 운영 단위(Phase 10.5)다.  
`project_arologis_independent.md` 에 따라 자체 role 체계 (`AROLOGIS_*`) 를 사용하며,  
Samhan Public desktop 의 동적 RBAC 매트릭스(`/admin/permissions`)와 분리된 시스템이다.

---

## 2. 현재 구현 상태 (변경 없음 확인)

| 파일 | 현재 상태 | 평가 |
|-----|---------|-----|
| `AppLayout.tsx` | 배차 + 기사 관리 NavLink 2개 — role 분기 없음 | 정상 (분기 불필요) |
| `ProtectedRoute.tsx` | 미인증 시 `/login` 리다이렉트 — role 체크 없음 | 정상 (전체 메뉴 접근 허용) |
| `authStore.ts` | `canManageDrivers()` — AROLOGIS_MASTER/MANAGER CUD 가드 | 정상 (UI 내 세부 기능 분기만) |
| `routes/index.tsx` | `createHashRouter` — SP-D1 hidden 적용 없음 | 정상 (적용 불필요) |

---

## 3. 향후 적용 조건 (의무 사항)

다음 조건 중 하나라도 충족되면 SP-D1 hidden 정책 적용이 **의무**가 된다:

1. arologis-desktop 에 `AROLOGIS_DRIVER` 이상 하위 role 이 접근 가능해질 때
2. 메뉴 항목이 3개 이상으로 확대되고 role별 접근 제한이 필요해질 때
3. 동적 RBAC 매트릭스가 아로로지스 `AROLOGIS_*` role 에도 적용 범위가 확대될 때

위 조건이 발생하면 별도 슬라이스로 분리하여 적용한다. 본 슬라이스에서는 코드 변경을 하지 않는다.

---

## 4. audit cycle 1 QA 권고 해소 확인

| QA 권고 내용 | 해소 방법 |
|------------|---------|
| `routes/index.tsx` SP-D1 hidden 정책 미적용 여부 점검 | 본 문서에서 비대상 결정 + 근거 명시 |
| 정책 결정 문서 부재 | 본 문서 (`arologis-desktop-policy.md`) 신규 작성 |

---

## 5. 관련 파일 참조

| 파일 | 용도 |
|-----|------|
| `clients/arologis-desktop/src/renderer/components/AppLayout.tsx` | 사이드바 메뉴 정의 |
| `clients/arologis-desktop/src/renderer/routes/index.tsx` | 라우트 정의 |
| `clients/arologis-desktop/src/renderer/stores/authStore.ts` | Role 정의 + canManageDrivers 가드 |
| `clients/arologis-desktop/src/renderer/components/ProtectedRoute.tsx` | 인증 가드 |
| `docs/design/sp-d1-dynamic-rbac/decisions.md` §3 | SP-D1 사이드바 Hidden 정책 원문 |
| `.claude/memory/project_arologis_independent.md` | 아로로지스 독립 운영 단위 컨텍스트 |
