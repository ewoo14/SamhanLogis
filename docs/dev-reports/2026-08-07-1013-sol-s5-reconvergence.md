# PR #1088 / 이슈 #1013 — SOL 5.6 S5 표면 재수렴

- 검증일: 2026-08-07 (Asia/Seoul)
- 검증 HEAD: `33733bca3` (PM 제시값; git 명령 금지에 따라 별도 조회하지 않음)
- 범위: S5가 `DispatchesLayout`에 추가한 `수신 배차 그룹` GUI 진입점의 도달성
- 결론: **도달 결함 1건. 머지 비권고.**

## 결함 1 — 허가된 저장 MASTER 세션이 권한 조회 403 뒤 조용히 차단되고, 화면 안에서 복구할 수 없다

### 실 사용자 도달 경로

1. 이전에 로그인해 저장된 `admin`(`AROLOGIS_MASTER`) Electron 세션으로 앱을 연다.
2. 앱은 배차 화면까지 정상 진입하고 상단에 `아로로지스 관리자 (admin)`을 표시한다.
3. `GET /admin/arologis/permissions/my`가 403을 반환한다.
4. S5 링크 조건은 `isError`를 곧바로 권한 없음과 같은 `false`로 취급하므로 `수신 배차 그룹` 링크가 0개가 된다.
5. 사용자가 `/dispatches/received-groups`로 진입하더라도 같은 query를 쓰는 `PermissionGuard`가 `/`로 보낸다. `/`는 다시 `/dispatches`로 이동하므로 사용자는 수동 배차로 돌아온다.
6. 화면에는 권한 조회 실패, 재시도, 재인증 필요 안내가 없다. 같은 세션 안의 메뉴 이동이나 창 포커스로는 다시 조회하지 않는다.
7. 실제 R4에서는 로그아웃 후 같은 `admin / ${QA_AROLOGIS_ADMIN_PASSWORD}`로 재로그인해야 permissions 200이 되었고 링크 1개가 나타났다.

즉, **영구 차단은 아니다.** 실제 복구 경로는 로그아웃→재로그인이고, 네트워크 단절 뒤 재연결도 query 기본 동작상 재조회 계기가 될 수 있다. 그러나 R4에서 실측된 HTTP 403처럼 네트워크 재연결이 없는 실패는 `retry: 1` 종료 뒤 현재 화면에서 복구되지 않는다. 403은 axios의 401 토큰 갱신 경로에도 들어가지 않는다. 허가된 사용자가 원인을 알 수 없는 채 신규 진입점에서 차단되고 재로그인을 스스로 추론해야 하므로 실 사용자 도달 결함이다.

### 근거 원문과 실 건수

R4 원문:

```text
참고로 최초 Electron의 기존 저장 세션에서는 `GET /admin/arologis/permissions/my`가 403이어서 메뉴가 숨겨졌다. GUI에서 로그아웃 후 `admin / ${QA_AROLOGIS_ADMIN_PASSWORD}`로 재로그인하자 로그인 200 및 permissions 200이 되었고 `수신 배차 그룹` 메뉴가 표시됐다.
```

실 화면 대조:

- 실패 세션: `docs/qa/pr-1088/screenshots/r4-S1-sidebar-real-qa.png` — 기존 배차 링크 4개, 신규 링크 **0개**, 로그인 사용자 `admin` 표시.
- 재로그인 세션: `docs/qa/pr-1088/screenshots/r4-S1-sidebar-link-real-qa.png` — 기존 배차 링크 4개, 신규 링크 **1개**.
- 신규 링크 클릭 뒤 실제 수신 그룹: **1건**. `S19-20260805-01`, 차량 `S19 QA 차량 01`, 운송사 `AROLOGIS · 아로로지스`.
- 운영 배차: **26건**.

2026-08-07 읽기 전용 DB 재측정 원문:

```text
received_groups|dispatches|driver_locations|dispatch_notifications
1|26|0|0
(1 row)

group_no|dispatch_date|vehicle_label|carrier_code|carrier_name|is_deleted|active
S19-20260805-01|2026-08-05|S19 QA 차량 01|AROLOGIS|아로로지스|f|t
(1 row)
```

코드 좌표:

- `DispatchesLayout.tsx:12-14,43-45` — loading/error를 숨김으로 합성.
- `usePermissions.ts:26-27` — 5분 stale, 재시도 1회.
- `App.tsx:22-24` — 창 포커스 재조회 비활성.
- `PermissionGuard.tsx:29-39` — loading은 대기, error는 홈으로 이동.
- `client.ts:140` — 자동 토큰 갱신은 401만 대상이므로 실측 403은 그대로 남음.
- `LoginPage.tsx:91,114` — 재로그인 때 permissions query를 제거하여 실제 복구.

## MASTER·허용/거부 조합 대조

PM의 라우트/네비 전제는 맞다. 라우트는 `PermissionGuard pageCode="arologis.dispatch.ops" action="view"`이고 `requireMaster`를 쓰지 않는다. 네비와 라우트 가드는 같은 `usePermissions()` 결과를 쓴다.

`AROLOGIS_MASTER`는 `/my`에서 `MASTER`로 정규화된다. 현재 중앙 매트릭스 읽기 전용 실측은 다음과 같다.

```text
role_code|page_code|can_view|can_edit|is_deleted
ACCOUNTANT|arologis.dispatch.ops|f|f|f
DEVELOPER|arologis.dispatch.ops|t|t|f
DRIVER|arologis.dispatch.ops|f|f|f
MANAGER|arologis.dispatch.ops|t|t|f
MASTER|arologis.dispatch.ops|t|t|f
SALES|arologis.dispatch.ops|t|f|f
(6 rows)

active_rows|view_rows
6|4
(1 row)
```

따라서 성공 응답에서 MASTER 행은 `arologis.dispatch.ops`에 `VIEW`와 편집 6액션을 준다. 프런트는 액션명을 소문자로 정규화하므로 네비와 라우트 가드는 둘 다 `view=true`를 낸다. 백엔드 `PermissionAspect`의 `AROLOGIS_MASTER` bypass와 현재 성공 응답 사이에 이 페이지의 답 불일치는 없다.

조합 판정:

| 조합 | 네비 | 라우트 | 판정 |
|---|---|---|---|
| 권한 있음 + 조회 성공 | 표시 | 허용 | 정상 |
| 권한 없음 + 조회 성공 | 숨김 | 차단 | 정상; 보이면 안 되는 사용자에게 노출되지 않음 |
| 조회 중 | 일시 숨김 | 로더 | 성공 완료 뒤 함께 허용/차단되어 정상 |
| 권한 있음 + 조회 실패 | 숨김 | 차단 | **결함 1** |
| 권한 없음 + 조회 실패 | 숨김 | 차단 | 누수 없음 |

## 기존 4개 진입점 회귀

수동 배차·가배차 분류·미배차·실배차 비교는 권한 query 조건 밖의 고정 `links` 배열에 그대로 있다. R4 실패 세션과 성공 세션 양쪽 실 화면에서도 모두 **4/4 표시**됐다. 신규 링크 성공 세션에서는 총 5개 중 기존 네 경로가 동일한 순서로 유지됐다. S5 표면에서 기존 네 진입점의 도달 회귀는 발견하지 못했다.

## fix 지시서 — 불변식만

1. `arologis.dispatch.ops:view`가 유효한 사용자는 권한 조회의 일시 실패 또는 기존 저장 세션 상태 때문에 신규 GUI 진입점을 이유 없이 잃어서는 안 된다.
2. 권한 조회 실패는 권한 거부와 사용자에게 동일하게 보이면 안 된다. 사용자는 현재 화면에서 실패를 인지하고 복구를 발화할 수 있어야 한다.
3. 복구 뒤에는 앱 재설치나 계정 변경 없이 네비 조건과 라우트 가드가 동일한 허용 답으로 수렴해야 한다.
4. 권한이 없는 사용자는 로딩·실패·복구·이전 사용자 캐시 어떤 조합에서도 링크를 보거나 보호 화면에 도달해서는 안 된다.
5. 기존 네 배차 진입점의 라벨·순서·경로·클릭 도달성은 유지되어야 한다.
6. `AROLOGIS_MASTER`에 대한 네비·라우트·백엔드 실행 권한은 같은 허용 답을 유지해야 한다.

## 양방향 RED

- **RED-A — 차단되면 안 되는 사용자:** `arologis.dispatch.ops:view`가 있는 저장 세션에서 첫 권한 조회를 실패시킨 뒤 권한 서비스가 회복되는 조합. 현재는 신규 링크 0개이고 직접 라우트도 홈으로 되돌아가며, 화면 내 복구 발화점이 없어 RED다. 고친 뒤에는 사용자가 인지 가능한 현재 화면의 복구 경로를 통해 링크 1개와 라우트 허용이 함께 돌아와야 한다. **반대급부:** 이 복구가 마지막 성공 권한을 무기한 신뢰해 실제 회수된 사용자를 통과시키면 안 된다.
- **RED-B — 보이면 안 되는 사용자:** `arologis.dispatch.ops:view`가 없는 사용자에게 이전 허가 사용자의 성공 결과가 남아 있거나 실패→복구가 일어나는 조합. 링크는 끝까지 0개이고 직접 라우트도 차단되어야 한다. **반대급부:** fail-closed를 지킨다는 이유로 RED-A의 허가 사용자를 조용히 차단해서는 안 된다.

## 증거 무결성

R4의 실측 수치 `수신 배차 그룹 1`, `운영 배차 26`, `driver_locations 0`, `dispatch_notifications 0`은 2026-08-07 읽기 전용 재측정과 일치한다. `S19-20260805-01`의 날짜·차량·운송사도 일치했다. 원문/실측 수치 불일치는 발견하지 못했다.

## 이번 라운드가 보지 않은 것

- 배차 목록→상세 진입과 전표번호·문서번호 하이퍼링크/뒤로 가기: 이슈 #1094 범위.
- GPS·회신 내용 판정: 실측 표본이 각각 0건이므로 제외. 관리자 경로의 표본 생성 가능성만 범위상 결함으로 세지 않았다.
- 테스트 강도, mock 품질, 문서 과장, 가드의 일반적 완전성 등 검증 품질.
- S5가 만들지 않은 다른 서비스·다른 화면의 기능 및 권한 표면.

## 신규 파일

- `docs/dev-reports/2026-08-07-1013-sol-s5-reconvergence.md`
