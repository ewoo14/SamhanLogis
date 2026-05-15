# D-AX-11 아로로지스 배차 페이지 이전 설계

> 작성일: 2026-05-15  
> 상태: spec 초안  
> 범위: `clients/desktop` 에 남아 있는 아로로지스 배차 운영 화면을 `clients/arologis-desktop` 으로 이전

## 1. 배경

Phase 10.5 아로로지스 독립 분리에서 `clients/arologis-desktop` 과 `clients/arologis-mobile` 은 이미 생성됐다. 하지만 배차 운영 화면은 아직 Samhan Public desktop 에 산재해 있다.

현재 `clients/arologis-desktop/src/renderer/routes/dispatches/` 에는 `DISPATCH-DESIGN.md` 와 placeholder 만 있고, 실제 운영 화면은 `clients/desktop/src/renderer/routes/` 와 `api/`, `realtime/` 에 남아 있다. `migration/decisions/DECISIONS.md` 의 D-AX-11 은 이 상태를 후속 HIGH 우선순위로 명시한다.

## 2. 목표

- 아로로지스 데스크톱 앱에서 배차 운영자가 `/dispatches` 하위 메뉴로 실제 배차 업무를 수행한다.
- 이전 범위는 배차 운영 화면과 직접 의존 API, realtime client 로 제한한다.
- Samhan Public desktop 의 기존 동작은 이번 PR에서 깨지지 않게 둔다. 삭제는 별도 follow-up 으로 처리한다.
- UUID 는 화면에 노출하지 않는다. 사용자 노출 식별자는 전표번호, 거래처명, 거래처코드, 주소, 기사코드, 차량 순번으로 제한한다.

## 3. 포함 범위

### 이전 대상 화면

| 기존 파일 | 신규 위치 | 라우트 |
|---|---|---|
| `clients/desktop/src/renderer/routes/ArologisManualDispatchPage.tsx` | `clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx` | `/dispatches/manual` |
| `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx` | `clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx` | `/dispatches/pre-classify` |
| `clients/desktop/src/renderer/routes/ArologisUnassignedPage.tsx` | `clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx` | `/dispatches/unassigned` |
| `clients/desktop/src/renderer/routes/ArologisDispatchReconcilePage.tsx` | `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx` | `/dispatches/reconcile` |

### 이전 대상 API와 realtime

| 기존 파일 | 신규 위치 | 비고 |
|---|---|---|
| `clients/desktop/src/renderer/api/arologisManualApi.ts` | `clients/arologis-desktop/src/renderer/api/arologisManual.ts` | `apiClient` import 만 신규 앱 기준으로 정렬 |
| `clients/desktop/src/renderer/api/arologisDispatchApi.ts` | `clients/arologis-desktop/src/renderer/api/arologisDispatch.ts` | pre-classify / regional / unassigned |
| `clients/desktop/src/renderer/api/dispatchReconcileApi.ts` | `clients/arologis-desktop/src/renderer/api/dispatchReconcile.ts` | reconcile 페이지가 실제로 import 하는 경우만 이전 |
| `clients/desktop/src/renderer/realtime/ArologisRealtimeClient.ts` | `clients/arologis-desktop/src/renderer/realtime/ArologisRealtimeClient.ts` | shared `createRealtimeClient` 도 필요한 최소 단위로 이전 |

`DispatchSmsPage` 는 notification-service 의 `/admin/notifications/dispatch-batch/*` 를 호출한다. 이 기능은 아로로지스 배차 운영과 연관은 있지만 Samhan Public 알림 도메인 의존이 크므로 이번 D-AX-11 에서는 이전하지 않는다. 별도 D-AX 후속으로 다룬다.

## 4. 라우팅과 IA

`clients/arologis-desktop/src/renderer/routes/index.tsx` 의 `dispatches/*` placeholder 를 하위 라우트로 교체한다.

```text
/dispatches
  /manual
  /pre-classify
  /unassigned
  /reconcile
```

`/dispatches` index 는 운영자가 가장 자주 쓰는 `/dispatches/manual` 로 redirect 한다.

`AppLayout` 의 배차 nav 는 단일 “배차” 항목을 유지하되, 배차 화면 내부에서 탭 또는 세그먼트형 보조 nav 를 제공한다. 첫 PR에서는 단순 링크 바를 허용하고, `DISPATCH-DESIGN.md` 의 토큰 규칙을 지킨다.

## 5. 인증과 권한

아로로지스 데스크톱은 Samhan Public `RoleGuard` 를 쓰지 않는다. 자체 JWT 의 role 은 다음 세 값만 사용한다.

- `AROLOGIS_MASTER`
- `AROLOGIS_MANAGER`
- `AROLOGIS_DRIVER`

데스크톱 배차 화면은 `AROLOGIS_MASTER`, `AROLOGIS_MANAGER` 에게만 노출한다. 기존 파일의 `MASTER`, `MANAGER`, `DISPATCH` 권한 상수는 아로로지스 앱 내부에서 사용하지 않는다.

권한은 1차로 UI 진입을 숨기고, 2차는 arologis-service 의 admin endpoint 인증으로 막는다. 운영자가 직접 URL을 입력해도 토큰 role 이 맞지 않으면 화면은 접근 불가 안내를 보여준다.

## 6. 데이터 흐름

1. 로그인 후 `apiClient` 가 `VITE_AROLOGIS_API_BASE` 또는 `http://localhost:8097` 로 요청한다.
2. `apiClient` interceptor 가 자체 auth store 또는 Electron IPC 에서 access token 을 얻어 `Authorization: Bearer` 를 주입한다.
3. 배차 페이지는 `/admin/arologis/**` endpoint 만 직접 호출한다.
4. realtime 이 필요한 상세성 화면은 `ArologisDispatchRealtimeClient` 로 `/admin/arologis/dispatches/{id}/realtime` 을 구독한다.

## 7. 오류 처리

- 401: 기존 `apiClient` refresh flow 를 따른다. refresh 실패 시 `/login` 으로 보낸다.
- 403: 권한 불일치 안내를 보여주고 조작 버튼은 비활성화한다.
- 404 또는 schema mismatch: 화면 상단 alert 로 “배차 데이터를 불러오지 못했습니다” 를 표시하고 재시도 버튼을 둔다.
- 저장 실패: 기존 페이지의 field-level validation 은 유지하고, 서버 오류는 form 상단에 표시한다.

## 8. 테스트와 검증

### 로컬 검증

- `cd clients/arologis-desktop && npm run typecheck`
- `cd clients/arologis-desktop && npm run build`

### QA 시나리오

`docs/qa/arologis-dispatch-pages-extract/scenarios.md` 를 작성하고 최소 4장 캡처를 남긴다.

| 캡처 | 검증 |
|---|---|
| `01-manual-dispatch.png` | 수동 배차 폼, 미리보기, 저장 버튼 표시 |
| `02-pre-classify.png` | 권역/시도 분류 탭과 결과 표 |
| `03-unassigned.png` | 미배차 목록과 수동 배차 이동 링크 |
| `04-reconcile.png` | 운송사 실배차 비교 화면 |

실 Electron 실행이 어려운 환경에서는 기존 repo 패턴대로 mock PNG fallback 을 허용하되, typecheck/build 결과를 PR 본문에 명시한다.

## 9. 비목표와 후속

- 이번 PR에서 `clients/desktop` 의 원본 페이지를 삭제하지 않는다. 삭제는 아로로지스 앱 검증 후 후속 PR에서 처리한다.
- `DispatchSmsPage` 이전은 제외한다. notification-service 의 운영 도메인 분리 정책을 먼저 결정해야 한다.
- 모바일 cross-import 분리(D-AX-12)는 별도 spec 으로 진행한다.
- `/auth/me` schema 정합(D-AX-13)은 작은 별도 PR로 검증한다.

## 10. 접근안 비교

| 접근 | 장점 | 단점 | 판단 |
|---|---|---|---|
| A. 원본 유지 + 신규 앱에 복사/정렬 | Samhan Public 회귀 위험 낮음, 빠르게 검증 가능 | 중복 코드가 일시적으로 남음 | 채택 |
| B. `git mv` 로 즉시 이전 + 원본 삭제 | 중복 없음 | Samhan Public desktop 회귀 위험 큼 | 보류 |
| C. 공통 package 로 추출 | 장기 중복 최소화 | 현재 범위 대비 추상화 비용 큼 | 보류 |

채택안은 A다. 아로로지스 앱에서 먼저 기능을 살리고, QA 캡처와 build가 안정화된 뒤 원본 삭제를 따로 진행한다.

## 11. Self Review

- Placeholder 없음.
- D-AX-11 의 핵심인 4 page + API + realtime 이전 범위를 명시했다.
- D-AX-12, D-AX-13, DispatchSms 이전은 후속으로 분리해 scope creep 을 막았다.
- 권한 모델을 Samhan Public role 에서 아로로지스 자체 role 로 명확히 분리했다.
