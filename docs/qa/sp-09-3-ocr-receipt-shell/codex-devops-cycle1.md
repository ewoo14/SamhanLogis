# Codex DevOps Review — SP-09-3 OCR Receipt Shell cycle 1

## Verdict

cycle 2 진입 권고. env template의 Clova 키는 빈 값 유지로 맞고, `PATTERN_CLOVA`도 기본 env 직접 대입 탐지는 가능하다. 다만 runtime guard와 문서/스크립트 메시지의 placeholder 정책이 완전히 일관되지는 않는다.

## Findings

### Major — runtime placeholder guard가 Invoke URL까지 적용되지 않음

- 위치:
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ReceiptOcrClientImpl.java:128-145`
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ReceiptOcrClientImpl.java:163-168`
  - `infrastructure/env-templates/slip-service.env:107-109`
- Clova API key/secret은 4 키워드 placeholder를 막지만 `CLOVA_OCR_INVOKE_URL`은 blank만 막는다.
- 외부 vendor 키 보안 정책은 `CLOVA_OCR_API_KEY`, `CLOVA_OCR_SECRET_KEY`, `CLOVA_OCR_INVOKE_URL` 모두 빈 값 유지 + placeholder 금지로 문서화되어 있다.
- 수정 권고: Invoke URL에도 동일한 case-insensitive placeholder guard를 적용한다.

### Major — FE/QA mock의 UUID-like slipId가 비공개 정책과 충돌하고 실제 UUID도 아님

- 위치:
  - `clients/desktop/src/renderer/api/mock.ts:3992`
  - `clients/desktop/playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts:133`
- mock은 `slipId`를 반환한다. 하나는 `00000000-0000-0000-0000-ocr000000001` 로 UUID 형식도 아니다.
- BE/dev-report는 응답에 `slipId` 미포함, `slipNo`만 노출을 선언한다.
- 수정 권고: mock/QA에서 `slipId`를 제거하거나, 내부 UUID 전달 정책을 명확히 재승인한다.

### Minor — `PATTERN_CLOVA`는 현재 env명은 잡지만 vendor 명명 variant는 좁음

- 위치: `scripts/check-credential-plaintext.sh:70-72`, `:267-268`
- 현재 패턴은 `CLOVA_(OCR_)?(API_KEY|SECRET_KEY|INVOKE_URL)=...` 를 탐지한다.
- `docs/design/sp-09-3-ocr-receipt-shell/decisions.md:183` 에는 `NAVER_CLOVA_OCR_SECRET` 같은 naming이 언급된다.
- 수정 권고: 운영 표준을 `CLOVA_OCR_*`로 고정할지, `NAVER_CLOVA_*` variant도 guard에 포함할지 결정한다.

### Minor — guard 실패 안내가 SP-09 vendor placeholder 금지 정책과 일부 충돌

- 위치:
  - `scripts/check-credential-plaintext.sh:281`
  - `docs/dev-environment-setup-multi-pc.md:61-69`
- Dev environment 문서는 외부 vendor placeholder 사용 금지를 명시한다.
- guard 실패 안내는 "PLACEHOLDER_DEV_ONLY 또는 SET_BY_OPS_PC로 대체"를 안내한다.
- 수정 권고: vendor 키 위반 시에는 "빈 값 또는 env/secret manager 참조로 대체"라고 안내를 분기한다.

## Cross-check

- `slip-service.env`: `OCR_SUBMIT_METHOD=DRY_RUN`, Clova 3개 값 blank 확인.
- `arologis-service.env`: 인성데이타 vendor 값 blank 확인.
- credential plaintext guard: `PATTERN_CLOVA` 존재 확인.
- 4 placeholder 키워드: 문서/BE guard에는 명시되어 있으나 Invoke URL runtime guard 누락.
