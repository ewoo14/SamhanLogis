## 개요

개발책임자 정책(2026-06-09): **"견적서나 주문서는 언제든지 출고전표로 전환할 수 있어야 한다."**

기존 견적 전환은 `QUOTE_ACCEPTED` 단계에서만 가능하도록 강제돼 있었습니다. 이를 폐기하고 **DRAFT/SENT/ACCEPTED 어느 단계서도 전환 가능**하도록 완화합니다. 이미 변환됨(`QUOTE_CONVERTED`)·거절됨(`QUOTE_REJECTED`) 견적만 409 CONFLICT 로 차단(이중 발행·거절 후 전환 방지).

## 변경 사항

### Backend (slip-service)
- `EstimateService.convert` — `QUOTE_ACCEPTED` 강제 게이트 폐기. CONVERTED/REJECTED 만 `BusinessException(CONFLICT)` 선차단(slip-service `GlobalExceptionHandler` 가 `IllegalStateException → 500` 이므로 BE 단에서 409 매핑 보존).
- `Estimate.markConverted` — 동일 정책 단일 진실원. `IllegalStateException → BusinessException(CONFLICT)` 로 도메인 컨벤션 정합.
- `EstimateController` `/convert` Javadoc/OpenAPI — 임의 상태 전환 설명으로 갱신(409 사유 = "이미 변환됨/거절됨").

### Frontend (desktop)
- `EstimateDetailPage` — 전표 변환 버튼 노출 게이트 `isAccepted` → `!isLocked` (DRAFT/SENT/ACCEPTED 노출, CONVERTED/REJECTED 숨김). 미사용 `isAccepted` 제거.

### 주문서(partner-order)
- convert 경로는 **이미** DRAFT/ON_HOLD 허용 + slipNo 이중발행 가드 보유 → 코드 변경 불요(정찰로 확인).

## 테스트
- `EstimateDomainTest` — 신규 2종: ① DRAFT 직접 `markConverted` 성공(임의상태 정책), ② CONVERTED/REJECTED 재전환 `CONFLICT`. 기존 `statusTransition_invalidStage` 에서 DRAFT→markConverted CONFLICT 단언 제거(정책 변경 반영).
- `EstimateControllerIT` — 신규: DRAFT 견적 직접 `/convert` → 200 `QUOTE_CONVERTED` + 재전환 → 409.
- ✅ `:services:slip-service:compileTestJava` 통과, `EstimateDomainTest` 통과, 데스크톱 `npm run typecheck` 통과.

## QA (예정 — 후속 커밋)
- [ ] Docker 실서버: 데스크톱에서 DRAFT 견적 생성 → 곧바로 전표 변환 → 출고전표(DRAFT) 생성 실 화면 캡처

> 조기 PR 패턴([[feedback_open_pr_early]]) — 구현 1차 완료 즉시 PR. Docker 실 UI QA 스크린샷은 본 PR 위 후속 커밋으로 첨부.
> Codex 사용한도 다운(~6/11) 중 — dual review 는 Claude 대체 진행 후 회복 시 알림([[feedback_early_pr_docker_qa_screenshots]] 환경 한계 예외).

연관 Issue: (없음 — 에픽 후속 슬라이스)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
