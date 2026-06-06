## Designer 리뷰 — PR #417 Cycle 1

### 결함표

| ID | 심각도 | 위치 | 내용 | 본 PR 처리 |
|---|---:|---|---|---|
| D-CX-001 | P2 | `SalesClosingPage.tsx:425`, `:442`; `MonthEndClosingPage.tsx:488`, `:510`; `PeriodCloseListPage.tsx:330`, `:347` | 마감 실행/역마감 판정은 `canAccess(pageCode, action)`로 전환됐지만, disabled title/거부 문구가 여전히 `ACCOUNTANT / MASTER`, `MASTER 권한자` 역할명 기준이다. 권한그룹 seed/custom grant 기준과 사용자 안내가 어긋난다. | 즉시 수정: "마감 실행 권한 필요", "역마감 권한 보유자" 등 page-code 권한 기반 문구로 교체. 상단 Javadoc의 구 role/@PreAuthorize 설명도 `@RequirePermission` 기준으로 현행화. |
| D-CX-002 | P2 | `AppLayout.tsx:314`, `:317`, `:463`, `:863`; `routes/index.tsx:1206`, `:1303` | 일부 사이드바 항목이 라우트 진입 page-code가 아닌 action-only page-code까지 OR로 포함한다. `/admin/regions`는 라우트가 `arologis.region(view)`인데 사이드바는 `arologis.region.manage(view)`만 있어도 노출된다. `/admin/blocked-partners`도 라우트는 `partners.block(view)`인데 `partners.block.bulk(view)`만 있어도 노출된다. custom group에서 FE-shows-BE-redirect가 재발한다. | 즉시 수정: 사이드바 show는 라우트 guard와 같은 `arologis.region(view)`, `partners.block(view)`만 사용. manage/bulk 권한은 페이지 내부 버튼 가시성에만 사용. |

UUID 사용자 노출은 클라이언트 렌더 영역 기준 0건이다. `session.ts`/mock의 UUID는 내부 비교·테스트 데이터이고 화면 라벨로 렌더되지 않는다. `requiredRole` prop은 `SidebarLink`에서 렌더/tooltip에 쓰이지 않는 deprecated prop이라 사용자 오해는 없다.

### Claude 발견 평가표

| Claude 항목 | 평가 | 3374a0c9 fix 평가 | 근거 |
|---|---|---|---|
| D-001 매출마감 과다노출 | valid | valid | `showAccounting` → `showAccountingPeriodClose`로 판매/회계 양쪽 메뉴 조건이 라우트 `accounting.period-close(view)`와 맞춰졌다. |
| D-002 arologis 이원화 | valid | mostly valid | 수동/가배차/미배차/SMS/발송이력/실배차/admin은 라우트와 동일 page-code로 정렬됐다. 단 인접한 배차지역 관리에서 `region.manage` OR가 남아 D-CX-002로 별도 발견. |
| D-003 dead 블록 | valid, low risk | valid, not over-engineering | 빈 `showAdmin` 렌더 블록 제거는 적절하다. `showAdmin` 자체는 단톡방 매핑의 MASTER 제외 UI 분기에만 남아 있어 사용자 UUID 노출 없음. |
| D-005 마감 role 판정 | valid | partial | 버튼 가시성 판정은 `canAccess`로 바뀌었지만 사용자 문구/Javadoc의 role 기준 설명이 남아 D-CX-001로 즉시 수정 필요. |

### 판정

**CHANGES REQUESTED**

본 PR 즉시 처리 대상은 D-CX-001, D-CX-002 두 건이다. PermissionGuard의 홈 redirect UX 자체는 현재 패턴 내에서 일관적이며 추가 결함으로 보지 않는다.
