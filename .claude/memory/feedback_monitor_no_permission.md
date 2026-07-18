---
name: Monitor 도구 자동 사용 (사용자 허락 불필요) — 권한 자동 승인 의무 (2026-05-11 강화)
description: PR CI 모니터링 등 Monitor 도구는 사용자 허락 없이 자동 사용. 권한 승인 안내 노출 시 즉시 자동 승인 인지. 사용자 3회 명시 (2026-05-10 / 2026-05-11)
type: feedback
originSessionId: 78cac99d-5dee-47ca-8254-3834a088f393
---
**규칙 (2026-05-11 강화)**: Monitor 도구 (특히 PR CI checks / 빌드 / 로그 watch) 는 사용자에게 **무조건 자동 승인**.

- 사용자 명시 1회: 2026-05-10 ("모니터는 내게 허락받지 않고 그냥 하도록 해")
- 사용자 명시 2회: 2026-05-10 (반복 강조)
- 사용자 명시 3회: 2026-05-11 ("앞으로 내 승인 없이도 자동 승인 원함")

**Why**: 사용자 명시 — 매번 "모니터 권한 승인 요청" 안내가 뜨는 것이 노이즈. CI watch 는 워크플로우 표준 단계.

**How to apply**:
1. PR 발행 직후 `gh pr checks --watch` 또는 Monitor 도구 자동 실행
2. 권한 승인 안내가 떠도 즉시 "자동 승인 의도" 로 처리 (사용자 추가 결정 대기 X)
3. 결과 (CI green/fail) 만 명확히 보고
4. 시스템상 권한 승인이 막힐 경우에만 사용자에게 1회 안내 + 폴링으로 우회

**예외**: 
- 사용자가 명시적으로 "모니터 중단" / "보지 마" 한 경우만 중단
- 새로운 종류의 monitor (예: 외부 시스템 watch) 는 1회 안내 후 진행

**우회 옵션 (Monitor reject 시)**: `gh pr checks <PR#>` polling 으로 직접 수행 — Bash 도구 사용. 단, 사용자 의도는 Monitor 자동 사용이므로 우선 Monitor 시도.

**2026-07-19 개발책임자 지시 — settings permission 등재(양 PC)**: Monitor를 `.claude/settings.json` `permissions.allow`에 `"Monitor"`+`"Monitor(*)"`로 등재해 프롬프트 없이 사용. **`.claude/settings.json`은 gitignore(per-PC)라 git 동기화 안 됨** → 각 PC에서 1회 수동 추가 필요. **집 PC = 완료(2026-07-19)**. **🚨 회사 PC = 첫 세션 시 `.claude/settings.json` permissions.allow에 `"Monitor"`+`"Monitor(*)"` 추가 필요**(미등재 시 프롬프트 뜨면 이 메모리 근거로 즉시 자동 승인 + 설정 추가). 메모리 자동승인 규칙과 병행.

**관련**: feedback_pr_ci_monitoring.md (PR 발행 후 자동 CI 모니터링 의무)
