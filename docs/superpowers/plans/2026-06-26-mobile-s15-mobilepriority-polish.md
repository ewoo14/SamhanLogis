# 모바일 슬15 — mobilePriority 폴리시 잔여 (plan, 에픽 마지막)

> 에픽 [모바일 레이아웃 갭 클로저](../specs/2026-06-26-mobile-layout-gap-closure-design.md) 슬15(마지막). 슬12a~14 머지 완결 후속.

## 문제
공용 DataTable 카드는 자동 적용되나, 저traffic admin 리스트 6종이 컬럼 우선순위(mobilePriority) 미튜닝 → 모바일 카드에서 전 컬럼 동일 노출(제목 강조·액션 숨김 안 됨).

## 대상 (6파일 / ~14 컬럼배열 — 정찰 확정)
- GroupwareApprovalTemplateAdminPage (DataTableColumn 2)
- PermissionGroupManagePage (2)
- AccountTreePage (2, DataTable 사용 확인)
- SalesClosingPage (3)
- MonthEndClosingPage (3)
- PeriodCloseListPage (2)
- ~~WarehousesPage~~ = **이미 mobilePriority 6개 보유(슬8 기처리) → 제외**
- 와이드 재무 리포트 7종 = 의도적 SKIP 유지(가로스크롤 적절).

## 접근 (슬5~11 패턴)
각 DataTable 컬럼 def에 `mobilePriority` 지정:
- **primary** = DOM 첫 컬럼 = 제목/식별자(양식명·권한그룹명·계정명·마감명 등). WCAG 1.3.2 시각순서=DOM순서.
- **secondary** = 핵심 데이터(상태·일자·금액·담당 등, 모바일 2열).
- **hidden** = 액션 버튼·UUID성·저우선 메타. 단 '선택이 핵심기능'이면 secondary 유지(슬12a 교훈).

## 불변
- **데스크탑 무변동**: mobilePriority=하위호환 선택필드(미지정=현행). 데스크탑 컬럼 순서/표시 무변경. testid/핸들러 보존. Flyway 0, BE 무변경, FE only.

## 워크플로우
canonical 8단계. 라이브 QA 390/1280(카드 primary 제목·secondary 2열·hidden 숨김·데스크탑 무회귀). admin dev_master 403/무시드 정직 보고. 매 Bundle ScheduleWakeup.
**슬15 완결 = 모바일 레이아웃 갭 클로저 에픽(슬12~15) 전체 종료.**
