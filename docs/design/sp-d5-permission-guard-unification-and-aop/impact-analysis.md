# SP-D5 PermissionGuard 단일화 + AOP 통합 — 디자인 영향 분석

**슬라이스**: SP-D5 PermissionGuard 단일화 + Counter.builder + AOP 통합  
**작성일**: 2026-05-19  
**담당**: UI/UX Designer agent  
**참조**: SP-D1~D4 누적 산출물, `docs/design/sp-d1-dynamic-rbac/decisions.md`

---

## 결론: 사용자 화면 영향 0 (Zero Impact)

SP-D5 는 **BE 인프라 전용 슬라이스**이다.  
사용자가 보는 어떤 화면도, 어떤 디자인 토큰도, 어떤 컴포넌트도 변경되지 않는다.

---

## 1. SP-D5 변경 범위 요약

| 레이어 | 변경 내용 | 파일 위치 |
|--------|----------|----------|
| BE 메트릭 | `PermissionGuardMetrics` — Micrometer `Counter.builder("permission_guard_denied_total")` 신규 | `arologis-service` / `samhan-public` 내부 |
| BE AOP | `@RequirePermission(page, action)` annotation 신규 | `shared/security` 공통 라이브러리 |
| BE AOP | `PermissionAspect` (`@Around`) 신규 | `shared/security` 공통 라이브러리 |
| BE 정리 | SP-D1~D4 마이그레이션된 ~25 endpoint `@PreAuthorize` 제거 | 각 service 컨트롤러 |
| BE 공통화 | `DynamicPermissionClient` interface → `shared/security` 이동 | 공통 라이브러리 |

**FE 변경**: 없음  
**design-system 변경**: 없음  
**모바일 변경**: 없음  
**CSS/토큰 변경**: 없음

---

## 2. 영역별 영향 상세

### 2-1. 사이드바 (AppLayout)

**영향: 없음**

SP-D1 결정 (사이드바 hidden 정책) 은 FE `usePermissions` hook + `GET /permissions/my` API 응답 기반으로 동작한다.

SP-D5 가 변경하는 것은 BE 내부 가드 구현체 (`@PreAuthorize` → `@RequirePermission` AOP) 뿐이다.  
`GET /permissions/my` 응답 스키마는 변경되지 않는다.  
따라서 사이드바 렌더링 로직, hidden 정책, 카테고리 헤더 미렌더링 정책 모두 그대로 유지된다.

- `AppLayout` 컴포넌트: 수정 없음
- `usePermissions` hook: 수정 없음
- 사이드바 CSS: 수정 없음
- SP-D1 결정 (display:none, 카테고리 헤더 DOM 제거) 유지

### 2-2. PermissionMatrixPage (마스터용 7역할 × 22페이지 매트릭스)

**영향: 없음**

`PermissionMatrixPage` 는 `GET /admin/permissions` / `PATCH /admin/permissions` 를 호출한다.  
SP-D5 는 해당 엔드포인트의 응답 스키마를 변경하지 않으며, 엔드포인트를 제거하거나 이동시키지 않는다.

SP-D5 의 AOP 적용 대상은 **비즈니스 엔드포인트** (배차, 매출, 매입 등 ~25개) 이다.  
권한 관리 화면 자체 (`/admin/permissions`) 는 MASTER 전용 특수 엔드포인트로서 AOP 마이그레이션 대상이 아니다.

- 매트릭스 그리드 레이아웃: 수정 없음
- 체크박스 dirty 상태 시각화: 수정 없음
- sticky 헤더/열 z-index 계층: 수정 없음
- 저장 버튼 상태 (disabled/active): 수정 없음
- 접근성 속성 (scope, aria-live): 수정 없음

### 2-3. 인쇄 양식 (전표 / 거래명세서 / 세금계산서)

**영향: 없음**

SP-D5 는 `shared/security` 공통 라이브러리와 각 서비스 컨트롤러 annotation 만 수정한다.  
인쇄 렌더링 경로 (`slip-service`, NTS 연동, `DispatchView` print CSS) 는 전혀 건드리지 않는다.

legacy 100% 매칭 원칙 (docs/migration/legacy-print-forms/ PNG 픽셀 단위 일치) 적용 대상이 아니다.

- `slip-service` 변경: 없음
- `DispatchView` A4 print CSS: 수정 없음
- NTS 전자세금계산서 연동 (SP-09-1): 수정 없음
- 인쇄 typography (12px 명조계열): 수정 없음
- `docs/migration/legacy-print-forms/` 대조 대상 신규 파일: 없음

### 2-4. 모바일 서명 UX

**영향: 없음**

모바일 서명 흐름 (`clients/mobile-staff`) 은 `sign-service` / `slip-service` 의 서명 엔드포인트를 호출한다.  
SP-D5 의 AOP 마이그레이션 대상 ~25 엔드포인트에 서명 관련 엔드포인트는 포함되지 않는다.

- `SignatureScreen` (50KB PNG hash + APP source): 수정 없음
- 서명 제출 API 경로: 수정 없음
- 모바일 서명 UX 흐름 (서명판 → 제출 → 완료 화면): 수정 없음
- `clients/mobile-staff/src/theme/tokens.ts` (RN 토큰): 수정 없음

### 2-5. 데스크탑 클라이언트 (아로로지스 / Samhan Public desktop)

**영향: 없음**

아로로지스 데스크탑 (`clients/arologis-desktop`) 과 Samhan Public 데스크탑은 FE 소비자이다.  
SP-D5 는 BE 가드 구현체만 교체하므로, API 응답이 달라지지 않는 한 FE 에 영향이 없다.

`VehicleMatchStatusBadge` (SP-10-2), `DispatchDetailPage` 등 기존 컴포넌트: 수정 없음.  
403 차단 시나리오: 동일 `ForbiddenPage` 컴포넌트 재사용, 화면 변경 없음.

### 2-6. 디자인 시스템 토큰

**영향: 없음**

`clients/web/design-system/src/tokens/tokens.css` : 수정 없음  
`clients/web/design-system/src/tokens/index.ts` : 수정 없음  
`clients/mobile-staff/src/theme/tokens.ts` : 수정 없음

색상 (brand/neutral/semantic/vendor 5색) / 타이포그래피 (Pretendard 9 weight) / 간격 / 반경 / 그림자 토큰 전부 그대로 유지된다.

### 2-7. 색상 / 타이포그래피 / 컴포넌트

**영향: 없음**

| 항목 | 현재 상태 | SP-D5 후 상태 |
|------|---------|--------------|
| Primary brand (#2D77A8) | 유지 | 유지 |
| Warning orange (#E9A53D) | 유지 | 유지 |
| Error red (#D6504A) | 유지 | 유지 |
| Success green (#2A9D8F) | 유지 | 유지 |
| Neutral gray scale | 유지 | 유지 |
| Pretendard 9 weight self-host | 유지 | 유지 |
| 한국어 본문 14px regular | 유지 | 유지 |
| 헤더 18px semibold | 유지 | 유지 |
| 인쇄 12px 명조계열 | 유지 | 유지 |

---

## 3. SP-D5 가 Designer 관점에서 유일하게 관련되는 지점

### 3-1. 403 응답 화면 (간접)

SP-D5 AOP 는 권한 없음 시 `403 Forbidden` 을 반환한다 (기존 `@PreAuthorize` 와 동일 HTTP status).  
FE `ForbiddenPage` 컴포넌트는 SP-D1 에서 이미 설계 완료되었으며, SP-D5 에서 변경되지 않는다.

- 403 페이지 레이아웃: 변경 없음
- 403 페이지 메시지 문구: 변경 없음 (추가 `requestedPath` props 는 SP-D1 결정 사항)

### 3-2. Grafana 대시보드 (메트릭 전용)

`permission_guard_denied_total` Counter 는 Grafana / Prometheus 에서 소비된다.  
해당 대시보드는 **DevOps/운영 전용 화면**이며 Samhan Public / 아로로지스 사용자 화면에 표시되지 않는다.  
별도 `metrics-dashboard-mock.md` 에서 DevOps 협업 참고용 텍스트 mock 을 제공한다.

---

## 4. 디자인 Action Item

SP-D5 로 인해 Designer agent 가 수행해야 할 작업: **없음**

| 기존 규칙 | 적용 여부 |
|---------|---------|
| 인쇄 양식 3~5회 iteration 의무 | 적용 안 함 (인쇄 변경 없음) |
| 디자인 토큰 변경 시 typography.ts / colors.ts 수정 | 적용 안 함 (토큰 변경 없음) |
| PR 본문 QA 스크린샷 첨부 | FE 산출물 없으므로 Designer 스크린샷 해당 없음 |
| legacy-print-forms/<slug>.png 신규 추가 | 적용 안 함 |
| design-system token 변경 PR | 발행 안 함 |

---

## 5. 근거 체인

```
SP-D5 변경
  → BE 내부 (annotation + AOP + Micrometer Counter)
  → API 응답 스키마 동일
  → FE hook / 컴포넌트 입력 동일
  → 화면 렌더 결과 동일
  → 사용자 체감 변화 없음
```

Frontend agent 검증 항목: `GET /permissions/my` 응답 body 구조 SP-D4 이전과 100% 동일 여부 확인 (SP-D5 PR QA).  
QA agent 검증 항목: 기존 Playwright 시나리오 회귀 없음 (사이드바 hidden, 매트릭스 저장, 403 redirect).
