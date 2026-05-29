# 조기 PR + Docker 실 QA 스크린샷 + Codex-다운 Claude 전면 대체 (표준 프로세스)

> 2026-05-29 사용자 지시 (Phase 2 RESTORE 진행 중 표준화).

## 적용 규칙 (매 슬라이스)

1. **PR 조기 생성**: spec/plan **문서화 단계에서 PR 을 먼저 생성**한다(구현 완료 후가 아님). 이후 구현 커밋을 그 PR 에 누적([[feedback_integrated_pr_pattern]] + [[feedback_tm_led_agent_discussion]]). PR 본문은 TM 이 단계별로 갱신.

2. **Codex 다운 → Claude 에이전트 전면 대체**: Codex 크레딧/연결 불가 동안 **구현 + dual 리뷰(BE/FE/QA/DevOps/Designer) 모두 Claude 서브에이전트가 대체**한다([[feedback_dual_5agent_review]] 환경 한계 예외, [[feedback_codex_implements_claude_reviews]] 의 Codex 전제 미충족 시). **Codex 회복 감지 시(다음 디스패치 시도에서 usage limit 해제 확인) 사용자에게 즉시 직접 알림** 후 원래 Codex 구현/리뷰 체제로 복귀.

3. **Docker 실 QA + 실사용 스크린샷 의무**: 머지 전 **Docker 로컬 스택(launch-local-stack.ps1)으로 실서버 기동 후, 마치 실사용하듯 기능의 전 진행/테스트 장면을 단계별로 촬영**한다(예: 목록→상세→편집→버전이력→복원 confirm→결과). 스크린샷은 `docs/qa/<slice>/*.png`. **PR 본문에 스크린샷이 잘 보이도록** 인라인 첨부([[feedback_pr_qa_screenshots]] 강화 — code-read/Playwright PASS 만으로 대체 금지, 실 화면 캡처 필수). [[feedback_qa_docker_real_test]] 와 결합.

4. **TM 종합**: PR 의 reviewer 산출 + QA + 사이클을 **TM 이 통합 정리**해 PR 코멘트/본문에 게시.

## 비고
- Docker 스택은 자원 확보 위해 down 했을 수 있음 → QA 전 재기동 필요(`.\scripts\launch-local-stack.ps1`).
- 스크린샷 촬영: desktop(Electron)은 Playwright electron 또는 gstack, web client 는 gstack 활용. 실 백엔드(Docker) 대상.
