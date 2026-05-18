# SP-D5 사이드바 영향 0 검증

> 작성일: 2026-05-19
> 담당: QA Agent
> 관련 슬라이스: SP-D5 PermissionGuard 단일화 + AOP

---

## 1. 검증 목적

SP-D5 는 순수 BE AOP 레이어 변경이다.
FE(`clients/arologis-desktop`, `clients/web/design-system`) 와 사이드바 hidden 정책에 영향을 주어서는 안 된다.

본 문서는 SP-D1 에서 확립한 **사이드바 hidden 정책**이 SP-D5 이후에도 동일하게 유지됨을 검증한다.

---

## 2. SP-D1 사이드바 hidden 정책 현황

SP-D1 에서 FE `usePermissions` hook + `PermissionGuard` 컴포넌트를 통해 구현된 정책:

- `permissions/my` API 응답의 `canView=false` 페이지 코드는 사이드바 항목 `display: none` 처리
- URL 직접 진입 시 `PermissionGuard` → `<Navigate to="/" replace />` 리다이렉트
- SP-D2~D4 거쳐 누적된 PageCode 기준 총 41개 이상 항목에 적용 중

**SP-D5 변경 범위**:
- `shared/security` 모듈 (BE 전용) 신규 추가
- 각 서비스 controller/aspect 변경 (BE 전용)
- FE 코드 (`clients/arologis-desktop`, `clients/web/design-system`) 변경 0건

---

## 3. 사이드바 영향 없음 확인 체크리스트

### 3-1. FE 파일 변경 0건 확인

SP-D5 PR 변경 파일 목록에서 다음 경로 미포함 확인:

| 경로 | 변경 여부 |
|------|-----------|
| `clients/arologis-desktop/src/` | 변경 없음 |
| `clients/web/design-system/src/` | 변경 없음 |
| `clients/desktop/src/` | 변경 없음 |
| `clients/mobile-staff/` | 변경 없음 |

**검증 명령** (PR diff 기준):
```bash
git diff --name-only origin/main...HEAD | grep -E "^clients/"
# 기대 결과: 0건
```

---

### 3-2. API 응답 스펙 변경 0건 확인

`GET /auth/admin/permissions/my` 응답 DTO 변경 없음 확인:
- `pageCode`, `canView`, `canEdit` 필드 구조 유지
- SP-D5 AOP 는 요청 시점 인터셉트만 수행, permissions/my 응답 변경 없음

```bash
# auth-service permissions 관련 DTO 변경 없음 확인
git diff --name-only origin/main...HEAD | grep -E "auth-service.*Permission"
# 기대 결과: 0건 또는 PermissionAspect 관련 신규 파일만
```

---

### 3-3. 사이드바 data-testid 항목 유지 확인

SP-D1~D4 에서 검증된 사이드바 data-testid 기반 hidden 정책이 SP-D5 이후에도 동일:

| data-testid | 표시 역할 | SP-D5 이후 영향 |
|------------|-----------|-----------------|
| `sidebar-dispatch-board` | DISPATCH / MASTER / MANAGER | 없음 |
| `sidebar-arologis-sms-send-audit` | DISPATCH / MASTER / MANAGER | 없음 |
| `sidebar-admin-permissions` | MASTER 전용 | 없음 |
| `sidebar-estimates-list` | SALES / MASTER / MANAGER / ACCOUNTANT | 없음 |
| `sidebar-partner-order-list` | SALES / MASTER / MANAGER / ACCOUNTANT | 없음 |
| `sidebar-warehouses` | WAREHOUSE / MASTER / MANAGER | 없음 |
| `sidebar-arologis-admin` | DISPATCH / MASTER | 없음 |

---

### 3-4. Playwright 회귀 검증 (SP-D4 spec 재실행)

SP-D5 적용 후 SP-D4 Playwright spec 전체 재실행:

```
clients/desktop/playwright/sp-d4-remaining-pages-permission-migration/sp-d4-remaining-pages-permission-migration.spec.ts
```

기대 결과:
- T01~T14 전체 14 케이스 GREEN
- 사이드바 hidden/visible 판정 변경 0건
- URL redirect 동작 변경 0건

---

## 4. mock.ts 사이드바 영향 없음 확인

SP-D5 는 BE AOP 계층 변경이므로 Playwright mock(`clients/desktop/src/renderer/api/mock.ts`) 변경이 불필요하다.

- `SP_D1_DEFAULT_VIEW` 배열 변경 0건
- `SP_D4_PERMISSION_MATRIX` 변경 0건
- 사이드바 관련 mock response 변경 0건

```bash
git diff --name-only origin/main...HEAD | grep mock.ts
# 기대 결과: 0건 (mock.ts 미수정)
```

---

## 5. 회귀 방지 결론

| 항목 | 기대 상태 |
|------|-----------|
| FE 파일 변경 | 0건 |
| 사이드바 data-testid hidden 정책 | 유지 |
| `permissions/my` API 응답 스펙 | 변경 없음 |
| SP-D4 Playwright 14 케이스 | 전체 GREEN |
| mock.ts 변경 | 0건 |

SP-D5 는 BE AOP 계층에 국한된 변경이므로 사이드바 정책 및 FE 동작에 영향을 주지 않는다.
