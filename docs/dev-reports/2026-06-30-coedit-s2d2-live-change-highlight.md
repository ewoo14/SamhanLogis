# 2026-06-30 코-에디팅 S2d-2 라이브 변경 하이라이트

## 범위

- 임계 전 Yjs 라이브 코-에디팅 중 타 사용자가 방금 수정한 필드를 사용자 색으로 약 2.5초 펄스 하이라이트한다.
- 접근법 A를 채택했다: awareness `lastEdit:{fieldPath,ts}`만 추가하고, 서버는 기존 opaque base64 awareness relay를 그대로 사용한다.
- BE 및 `slip-service` 변경은 없다.

## 구현

- `createCoeditProvider.ts`
  - `EDIT_HIGHLIGHT_MS = 2500`
  - `RemoteFieldEdit`
  - `setLocalLastEdit(fieldPath)`
  - `getRemoteEdits(fieldPath?, now?)`
  - 단일 `Y.Text` provider와 문서형 provider 양쪽에 동일 API를 추가했다.
- `CollaborativeSlipInput.tsx`
  - 값 변경 직후 `provider.setLocalLastEdit(fieldPath)`를 송신한다.
  - 원격 `lastEdit`가 있으면 `slip-coedit-edit-pulse` 오버레이와 `{displayName} 수정` 배지를 표시한다.
  - awareness update가 없어도 2.5초 뒤 재평가해 펄스를 소멸시킨다.
- `CollaborativeTextField.tsx`
  - 메모 필드는 `header.<fieldName>` fieldPath로 lastEdit를 송신한다.
  - 원격 편집 시 `memo-coedit-edit-pulse` 오버레이, 사용자색 테두리, 수정 배지를 표시한다.

## 테스트

- `createCoeditProvider.test.ts`
  - 원격 lastEdit fieldPath 매칭
  - 2.5초 만료 제외
  - 본인 clientID 제외
  - 단일 `Y.Text` provider와 문서 provider 모두 검증
- `CollaborativeSlipInput.test.tsx`
  - 원격 lastEdit 펄스 표시
  - `{displayName} 수정` 배지 표시
  - fake timer 2.5초 후 소멸
- `CollaborativeTextField.test.tsx`
  - 메모 원격 lastEdit 펄스 표시
  - 로컬 변경 시 `setLocalLastEdit('header.memo')` 송신

## QA 캡처

- mock provider lastEdit 상태를 Playwright 정적 DOM으로 렌더해 펄스 하이라이트와 `{displayName} 수정` 배지를 캡처했다.
- 산출: `docs/qa/coedit-s2d2-live-change-highlight/screenshots/01-live-change-highlight-pulse.png`

## 비대상

- 저장 redline 수락/거절 UI 없음.
- 편집모드 내 라이브 redline stack 없음(S2d-2b 후보).
- 서버 스키마, API, relay 계약 변경 없음.
