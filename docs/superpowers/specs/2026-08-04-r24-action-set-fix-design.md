# R24 액션 집합·업무 라벨 정합성 설계

## 목표

전표 상세 화면의 상태별 액션 집합을 `Slip` 도메인의 허용 전이와 일치시키고, PROCESSING 완료 액션의 표시 문구가 재고 반영 결과를 알리게 한다.

## 범위와 제약

- OUTBOUND와 INBOUND의 공용 상세 화면을 함께 수정한다.
- INSPECTING에서는 `inspect`와 `reject`를 노출한다. 반려 사유 입력/버튼은 기존 권한 가드를 사용한다.
- `/complete`, `complete()` 및 재고 반영 시점은 변경하지 않는다.
- `inbound.inspection` 별도 상태 머신과 미추적 QA 파일은 건드리지 않는다.

## 검증 설계

- 화면 액션 함수 테스트로 INSPECTING의 reject 노출을 RED/GREEN 검증한다.
- PROCESSING의 공용 라벨 테스트로 `검수 시작`이 제거되고 `재고 반영 후 검수 대기`가 양 전표 유형의 실제 결과를 설명하는지 검증한다.
- 기존 lifecycle contract 테스트와 타입 검사를 실행한다.
