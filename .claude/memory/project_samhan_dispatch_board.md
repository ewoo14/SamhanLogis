---
name: samhan-dispatch-board-phase-a
description: 2026-05-14 — Samhan Public 출고전표 → 배차담당자 → 배차 메뉴 → 아로로지스 발송 흐름의 Phase A 완료 (Mock matcher 활용, Phase B~F 별도)
metadata:
  type: project
---

Samhan Public 의 배차 메뉴 + 아로로지스 service-to-service 발송 흐름 Phase A.

**Why:** 사용자 메시지 (2026-05-14) — 출고전표 → 창고 출고/검수 → 배차담당자 → arologis → 인성데이타 기사 매칭 → GPS → 서명 → 사본 6 Phase 흐름. Phase 단위 분할 결정 (A~F).

**How to apply:**

Phase A 9 결정 (D-DB-01~09):

| # | 결정 |
|---|---|
| D-DB-01 | 배차 도메인 = slip-service 안 신규 (dispatch_task + dispatch_vehicle_group + dispatch_vehicle_group_slip + dispatch_matched_driver) |
| D-DB-02 | drag-and-drop = @dnd-kit/core (desktop) + mobile long-press 250ms fallback (react-native-gesture-handler 도입 Phase B 후보) |
| D-DB-03 | 차량 9 종류 = MOTORCYCLE/DAMAS/TONNAGE_1/1_5/2_5/3/5/10/20. arologis VehicleTonnage 확장 |
| D-DB-04 | Slip.dispatchStatus column = slips 테이블 (UNDISPATCHED/DISPATCHING/DISPATCHED) |
| D-DB-05 | 발송 endpoint = POST /internal/arologis/dispatches |
| D-DB-06 | UI = desktop + mobile-staff (AppRootNavigator dispatch mode) |
| D-DB-07 | Phase A 매칭 = MockDriverMatcher |
| D-DB-08 | 회신 endpoint = /internal/slip/dispatch-tasks/{id}/confirm + /unavailable. slip-service port = 8086 |
| D-DB-09 | 알림 = notification-service Aligo |

**환경변수 표준**:
- SAMHAN_AROLOGIS_DISPATCH_URL=http://arologis-service:8097
- SAMHAN_SLIP_DISPATCH_TASK_URL=http://slip-service:8086
- SAMHAN_AROLOGIS_MOCK_FAIL_RATE=0.0

**후속 Phase**: B (인성데이타) / C (수정/취소) / D (GPS) / E (카톡/문자) / F (서명+사본)

**참조:** [[project_arologis_independent]] / [[feedback_integrated_pr_pattern]] / [[feedback_multi_agent_team_pattern]]
