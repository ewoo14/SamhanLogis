# 배차 #3 — 수정제안 재배차 루프/수동기입 정책 dev report

## 범위

- 재배차 시작 endpoint: `POST /admin/dispatch-tasks/{taskId}/start-redispatch`
- 수정수락 task: `MODIFICATION_ACCEPTED -> DRAFT`
- 기존 발송 그룹: `DISPATCHED -> PENDING`
- 매핑 전표: `DISPATCHED -> UNDISPATCHED`
- 기존 arologis Dispatch: internal soft-delete 호출, 로컬 무연동 실패는 graceful warning
- 수동기입 vendor: `AROLOGIS`, `GYEONGGI_QUICK`, `JEONGUK_HWAMUL`, `OTHER` enum + DB CHECK
- 타사 수동 발송완료: 수동 기사/차량 입력 후 그룹 `DISPATCHED`, 매핑 전표 `DISPATCHED`

## 결정

- D-DMR-01: 재배차 진입은 전용 mutation으로만 수행한다. `MODIFICATION_ACCEPTED` 상태에서 바로 편집하지 않고 `start-redispatch` 성공 후 DRAFT 편집 흐름을 재사용한다.
- D-DMR-02: 수동기입 vendor는 자유 문자열을 금지하고 enum + CHECK로 표준화한다. 기존 arologis/외부 자동 매칭 source 문자열은 `AROLOGIS` 대표값으로 정규화하고, 기존 `MANUAL` 값은 `OTHER` 로 보존한다.
- D-DMR-03: arologis 재배차는 delete-recreate 정책을 유지한다. 기존 dispatch soft-delete 실패는 재배차 자체를 막지 않는다.
- D-DMR-04: 그룹별 dispatch-id 테이블화는 후속으로 남긴다. 이번 slice는 task 단일 `arologisDispatchId`를 재배차 시작 시 null로 비우고, 재발송 confirm 시 새 id로 갱신하는 기존 모델을 모순 없이 닫는다.

## multi-dispatch-id 검토

현재 `DispatchTask`는 단일 `arologisDispatchId`만 보유한다. 부분 발송과 그룹 단위 재발송을 정확히 추적하려면 `dispatch_vehicle_group` 또는 별도 `dispatch_group_arologis_mapping` 수준의 id 이력이 필요하다.

이번 범위에서는 스키마 확장을 하지 않는다. 대신 재배차 시작 시 기존 단일 id를 soft-delete 대상으로 명시 사용한 뒤 null 처리하고, 재발송 confirm에서 새 id를 task에 다시 저장한다. 이 방식은 전체 재배차 delete-recreate 흐름에는 일관적이나, 과거 부분 발송 id 감사에는 한계가 있다.
