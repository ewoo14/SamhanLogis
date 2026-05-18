# SP-09-2 Aligo SMS 실 발송 - Codex Designer Review Cycle 1

대상: PR #237, commit `87d1e5f7`

## Findings

### HIGH - 디자인 산출물은 per-message 이력인데 실제 구현은 batch audit 요약 화면

- 위치:
  - `docs/design/sp-09-2-aligo-sms-real-send/decisions.md:8-24`
  - `clients/desktop/src/renderer/routes/DispatchSmsSendAuditPage.tsx:244-326`
  - `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/01-send-audit-list.html`
- 내용: 디자인 decisions와 HTML 4장은 `발송 일시 / 수신자 / 메시지 요약 / 결과 / msg_id`의 per-message 이력을 전제로 합니다. 실제 React 화면은 `배차일 / 발송시각 / 실행자 / 성공 / 실패 / 발송금지 / 결과 / 상세`의 batch `SEND_AUDIT` 요약입니다.
- 영향: 리뷰어가 보는 QA HTML은 실제 제품 화면을 대표하지 않습니다. msg_id, 메시지 요약, 수신자 컬럼 중심의 디자인 판단이 실제 구현에 반영되지 않아 디자인 승인 근거가 약합니다.
- 권고: 둘 중 하나로 정렬하십시오. 실 구현이 batch audit라면 decisions와 4장 HTML을 batch 요약 화면 기준으로 다시 작성하고, per-recipient 정보는 상세 modal 디자인으로 제한하십시오.

### MEDIUM - 실패 상세의 "재발송 시도" 버튼이 미구현 액션처럼 보임

- 위치:
  - `docs/design/sp-09-2-aligo-sms-real-send/decisions.md:83-90`
  - `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/04-send-audit-failure.html`
- 내용: decisions에는 "재발송 버튼 실제 구현"을 미결 항목으로 둔 반면, 실패 HTML에는 주요 액션 버튼으로 `재발송 시도`가 노출됩니다.
- 영향: QA/PM 산출물에서 실제 동작 가능한 기능으로 오인될 수 있습니다.
- 권고: cycle 1 산출물에서는 버튼을 제거하거나 disabled 상태와 tooltip/권한 문구로 미구현임을 명확히 하십시오.

### LOW - 운영 계정 식별자가 상세 mock에 직접 표시됨

- 위치:
  - `docs/qa/sp-09-2-aligo-sms-real-send/screenshots/03-send-audit-detail.html`
- 내용: 성공 상세 mock에 `발송 계정 samhan2024`가 표시됩니다. 실제 API key는 아니지만 vendor 계정 ID 성격의 값이라 운영 화면 노출 정책이 필요합니다.
- 영향: credential plaintext guard에는 걸리지 않더라도 vendor 계정 식별자 노출이 불필요할 수 있습니다.
- 권고: 운영 추적에 필요한 값은 `msg_id`와 result code 중심으로 두고, vendor 계정 ID는 숨기거나 마스킹하십시오.

## Cross-check

- 수신자 마스킹: HTML 4장 모두 휴대폰 수신자는 `010-****-NNNN` 형식입니다.
- UUID 비공개: HTML 내 UUID 노출은 확인되지 않았습니다.
- 색상/토큰: 신규 토큰 없이 success/danger/warning 계열 사용은 적정합니다.

## Section Decision

Designer 산출물은 cycle 2에서 실제 React 화면/BE 계약과 다시 정렬해야 합니다. 현재 HTML은 구현 검증용 대표 이미지로 쓰기 어렵습니다.
