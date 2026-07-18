# #825 슬4 칩 복수선택 표준 컴포넌트 감사 보고서

기준일: 2026-07-18
범위: `MultiSelectAutocomplete<TOption, TSelected>`, `FreeTextChipInput`, 그룹웨어 결재 3화면

## 구현 감사표

| 분류 | 화면·기능 | 판정 | 근거 |
|---|---|---|---|
| 이미 칩(리팩터) | 결재작성 결재선·추가 결재자 | 완료 | `MultiSelectAutocomplete<ApproverOption, ApproverOption>`로 전환. `userId` key dedup, `approverIds` 배열 순서, prefill edit version guard, 제거 후 재번호를 adapter에서 유지 |
| 이미 칩(리팩터) | 결재선 설정 역할별 결재자 | 완료 | `MultiSelectAutocomplete<ApprovalLineApproverOption, ApprovalLineApprover>`로 전환. `${type}:${refId}` 복합 key 필터, add POST, 저장 `id` DELETE, pending id 제거 차단, 낙관 추가·치환·rollback을 유지 |
| 이미 칩(참조·무변경) | 첨부 문서참조·파일 | 유지 | 슬4 스코프의 칩 표준화 대상이 아니며 기존 첨부 동작을 변경하지 않음 |
| 슬5 이관 | CODEF import scope | 이관 | `CodefImportScope` 빈 범주→전체 materialize 상태머신은 슬5에서 처리. 슬4에서 checkbox를 변경하지 않음 |
| (a) 신규 | 결재양식 SELECT 옵션 | 완료 | CSV `Input`을 `FreeTextChipInput`으로 교체. draft는 `options: string[]`, 경계는 `optionsJson` JSON 배열 문자열을 유지하며 round-trip 테스트 추가 |
| (c) 후속 | 세금계산서 묶음발행 원천전표 목록 | 후속 | 기존 표 checkbox를 유지하고 슬4에서 칩으로 바꾸지 않음 |
| (b) 유지 | 권한그룹 M:N | 유지 | 기존 권한그룹 관리 계약을 변경하지 않음 |
| (b) 유지 | 발송금지 | 유지 | 슬2의 기존 칩/검색 계약을 변경하지 않음 |
| (b) 유지 | 세트·사양 | 유지 | 표 입력 및 사양 구조를 칩으로 확장하지 않음 |
| 후속 | 슬6 쪽지 수신자 | 후속 | 이번 슬라이스의 소비처에서 제외. 별도 수신자 정책 검토 필요 |

## foundation 계약 감사

- `MultiSelectAutocomplete`는 기존 `AsyncAutocomplete(value={null})`와 `TagChip`만 조합한다.
- 검색 결과는 `getOptionKey`와 `getSelectedKey` 비교로 이미 선택된 항목을 제외하며, base `AsyncAutocomplete`는 수정하지 않았다.
- `onAdd`·`onRemove`는 배열 전체가 아닌 delta 계약이다. add/remove 뒤 내부 input으로 focus를 복귀한다.
- `max` 도달은 외부 검색만 정지하고 기존 칩 제거는 허용한다. `disabled`는 입력과 제거를 모두 비활성화한다.
- opaque DOM id는 `AsyncAutocomplete`의 index 기반 id를 상속한다. 업무 key·UUID는 React key/dedup 전용이다.
- `FreeTextChipInput`은 `TagInput`을 재사용하지 않고 `Input`과 `TagChip`으로 구현한다. trim, 빈값 차단, 대소문자 무시 dedup(첫 항목 우선), Enter/쉼표 확정, clipboard 분해, IME composing guard, maxLength를 검증한다.

## 검증 기록

- design-system `npm run test`: 20개 파일, 88개 테스트 통과.
- design-system `npm run typecheck`: 통과.
- design-system `npm run build`: 통과.
- desktop 결재·API 관련 Vitest: 통과.
- desktop `npm run typecheck`: 통과.
- AC-5 Playwright mock hard gate: 4개 테스트 통과. 자동 webServer(`vite.config.ts` 명시) 기동까지 확인.

## 미이관·리스크

- 실제 백엔드 라이브 환경의 결재 mutation은 이번 mock hard gate 범위 밖이며, 기존 API 계약과 mock stateful handler를 유지했다.
- `max`·IME·clipboard 세부 동작은 design-system Vitest에서 직접 검증하고, 실제 소비처 Playwright에서는 결재 화면의 순서·복합 key·focus·UUID 비공개를 검증했다.
