---
name: codex-review-sandbox-danger-access
description: Codex 리뷰도 danger-full-access여야 genuine 실테스트 실행 — read-only는 이 PC서 정적분석만
metadata:
  type: feedback
---

Codex MCP 리뷰(`mcp__codex__codex`)를 `sandbox: read-only`로 디스패치하면 이 PC 환경에선 vitest/playwright 실행에 필요한 캐시·아티팩트 **쓰기까지 차단**되어 **정적 코드 분석만** 가능하고 실테스트를 못 돌린다("읽기전용이라 파일 검토와 rg 기반 정적 재검만 수행"). QA 차원만 danger-full-access로 뒀고 FE/DevOps/BE를 read-only로 둔 게 실은 정적-only 함정.

**Why**: 캐논 워크플로우는 **리뷰=실QA 동반**(테스트 genuine 실행)이 필수인데, read-only 리뷰는 이를 무력화해 false-thoroughness(정적 통과처럼 보이나 미실행)를 만든다. 2026-07-06 #31 재수렴서 개발책임자 직접 지적("danger-full-access가 아니라 왜 read-only인지 확인요망").

**How to apply**: Codex 리뷰 중 **테스트를 돌려야 하는 차원(QA/FE/DevOps 검증)은 `sandbox: danger-full-access`**로 디스패치해 실테스트 실행. **Codex git은 여전히 금지**([[feedback_codex_sandbox_git]])·소스 미변경·PM 커밋 대행·사후 `git status`/`diff` 대조로 무변경 확인. 순수 정적 대조(BE 계약 grep 등)만 read-only 허용. → [[feedback_codex_plugin_setup]]의 "review=read-only" 는 소스 무변경 취지이지 테스트 미실행이 아님(정정).
