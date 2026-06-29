---
name: 한국어 의무 — 커밋 / PR / Issue / 보고
description: SamhanLogis 프로젝트의 모든 git commit message, GitHub PR·Issue(제목+본문), 그리고 사용자 대면 보고·대화·설명은 한국어로만 작성
type: feedback
originSessionId: 78cac99d-5dee-47ca-8254-3834a088f393
---
**규칙**: 본 프로젝트의 다음 항목은 모두 **한국어**로만 작성한다.
1. **Git commit message** — subject + body
2. **GitHub Pull Request** — 제목 + 본문 (Summary, Test plan 포함)
3. **GitHub Issue** — 제목 + 본문 (모든 라벨 설명, 댓글 포함)
4. **사용자 대면 보고·대화·설명** — 채팅 응답·진행 보고·분석 narration·도구 설명 모두 한국어 (영어 narration 지양)

단 다음은 예외:
- Conventional commit prefix (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`) — 도구 표준
- Co-Authored-By trailer (`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`) — 번역 금지
- 코드 / 파일경로 / 명령어 / URL 등 인용은 그대로
- 라벨 키 자체 (`team:auth`, `priority:high` 등) — 라벨 시스템은 영문 키 유지

**Why**: 사용자(대표)가 명시적으로 두 차례 요청.
- 1차: "깃에 커밋할때는 한국어로 할것"
- 2차: "깃허브 커밋 메세지는 반드시 한국어로만 작성하고, Pull requests와 Issues 모두 한국어로 해줘야해"
- 3차 (2026-06-29): 회사 PC 재개 세션 중 영어 narration·도구 설명에 "한국어로 해야지" 지적 → 사용자 대면 보고·대화도 한국어 의무로 확장.
이 저장소의 기존 커밋들도 대부분 한국어임 (예: "feat: 도메인 활용 전략 — samhan-air.com 서브도메인 (4장)", "v2.0: 팀 조직 개편…"). 일관성과 팀 가독성 모두 한국어가 옳음.

**과거 위반 사례 (2026-05-04)**: Phase 1 commit `b574f49`를 영어로 작성하는 실수. 이 메모리를 사전에 확인하지 않은 결과. **앞으로 commit/PR/Issue 작성 직전에 반드시 본 메모리를 확인할 것.**

**적용 방법**:
- Commit 작성 직전: subject 후보를 한국어로 먼저 만들고, prefix만 영어 표준 단어를 붙인다.
- PR 작성 시 `gh pr create`의 `--title`, `--body` 모두 한국어. Test plan 항목도 한국어 체크박스.
- Issue 작성 시 `gh issue create`의 `--title`, `--body` 모두 한국어.
- 한국어 본문에 영문 코드/명령어 인용은 백틱 또는 코드블럭으로 감싸서 자연스럽게.
- subject ≤ 70자 권장.

**커밋 메시지 템플릿**:
```
feat: <한국어 한 줄 요약>

<무엇이 왜 필요했는지 한국어로 한두 문단>

주요 변경:
- <항목 1>
- <항목 2>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**PR 본문 템플릿**:
```
## 요약
- <변경 의도 1>
- <변경 의도 2>

## 테스트 계획
- [ ] <검증 항목 1>
- [ ] <검증 항목 2>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
