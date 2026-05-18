# SP-D5 사이드바 hidden 정책 유지 확인서

**슬라이스**: SP-D5 PermissionGuard 단일화 + Counter.builder + AOP 통합  
**작성일**: 2026-05-19  
**담당**: UI/UX Designer agent  
**참조**: `docs/design/sp-d1-dynamic-rbac/decisions.md` §3 사이드바 Hidden 정책

---

## 결론: SP-D1 사이드바 hidden 정책 100% 유지, 변경 없음

SP-D5 는 BE 가드 구현체를 `@PreAuthorize` → `@RequirePermission` AOP 로 교체한다.  
이 교체는 FE 가 소비하는 권한 API 응답 스키마를 변경하지 않으므로, 사이드바 동작은 동일하다.

---

## 1. SP-D1 사이드바 Hidden 정책 요약 (기준)

SP-D1 에서 확정된 정책 (`decisions.md` §3):

| 정책 항목 | 결정 내용 |
|---------|---------|
| hidden 방식 | `display: none` (조건부 렌더링) |
| 금지 방식 | `visibility: hidden`, `opacity: 0`, 회색 비활성화 |
| 카테고리 헤더 | 권한 있는 하위 항목 0개 시 함께 미렌더링 (DOM 제거) |
| 런타임 동기화 | `GET /permissions/my` — 로그인 세션 1회 + 매트릭스 저장 후 invalidation |
| SWR 패턴 | 매트릭스 저장 후 `queryClient.invalidateQueries(['rbac', 'me', 'pages'])` |

---

## 2. SP-D5 변경이 사이드바에 영향을 주지 않는 이유

### 2-1. 권한 API 응답 스키마 변경 없음

사이드바 렌더링은 `GET /permissions/my` 의 응답 body 에 의존한다.  
SP-D5 는 이 엔드포인트의 **응답 스키마를 변경하지 않는다**.

변경되는 것: BE 내부 권한 확인 로직 (annotation 기반 → AOP 기반)  
변경되지 않는 것: `GET /permissions/my` 응답 구조 (pageCode 배열, action 목록)

### 2-2. `usePermissions` hook 변경 없음

FE `usePermissions` hook 은 `GET /permissions/my` 응답을 소비하여 사이드바 항목 표시 여부를 결정한다.  
SP-D5 에서 이 hook 은 수정되지 않는다.

### 2-3. `AppLayout` 컴포넌트 변경 없음

사이드바를 렌더링하는 `AppLayout` 컴포넌트 (`clients/arologis-desktop`, `clients/web` 공통) 는 SP-D5 에서 수정되지 않는다.

---

## 3. 사이드바 hidden 정책 SP-D5 이후 상태 확인

| 확인 항목 | SP-D4 이전 상태 | SP-D5 후 상태 |
|---------|--------------|-------------|
| MASTER: 전체 22 페이지 사이드바 표시 | 정상 | 동일 |
| SALES: 매출 관련 3개만 표시 | 정상 | 동일 |
| DRIVER: 배차/기사 관련만 표시 | 정상 | 동일 |
| 권한 없는 카테고리 헤더 DOM 제거 | 정상 | 동일 |
| URL 직접 접근 시 403 redirect | 정상 | 동일 (AOP 403 = 기존 @PreAuthorize 403 동일) |
| 매트릭스 저장 후 사이드바 즉시 반영 | 정상 | 동일 (invalidation 경로 변경 없음) |

---

## 4. 403 페이지 일관성

SP-D5 AOP (`@RequirePermission`) 는 권한 없는 요청에 대해 `403 Forbidden` 을 반환한다.  
이는 기존 `@PreAuthorize` 의 동작과 HTTP status 동일하다.

따라서 FE `ForbiddenPage` 컴포넌트 (SP-D1 설계) 의 동작이 바뀌지 않는다:
- 403 페이지 레이아웃: 동일
- 사이드바 = URL 직접 접근 시도자 기준 렌더: 동일
- "사이드바에 없음 + 403" 이중 방어: 유지

---

## 5. AOP 도입이 사이드바 동기화 주기에 미치는 영향

`PermissionAspect` (`@Around`) 는 각 요청의 런타임 시점에 `DynamicPermissionClient` 를 통해 권한을 조회한다.  
이는 기존 `@PreAuthorize` + `PermissionGuard` 구조와 동일한 동기화 시점 (요청 단위) 이다.

사이드바 SWR 캐시 invalidation 주기 (매트릭스 저장 API 응답 후 1회) 는 AOP 와 무관하게 FE 에서 관리된다.  
따라서 사이드바 반영 지연, 깜빡임, 불일치 등의 시각적 부작용은 발생하지 않는다.

---

## 6. Designer 확인 서명

본 확인서는 SP-D1 decisions.md §3 의 모든 사이드바 정책이 SP-D5 이후에도 동일하게 유지됨을 확인한다.  
사이드바 관련 추가 디자인 작업은 SP-D5 에서 발생하지 않는다.
