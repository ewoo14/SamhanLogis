---
name: GitGuardian = PM 자동 false positive 처리 (2026-05-11 갱신)
description: dev-only 비밀번호/mock token (samhan_dev_pw / 123456 / placeholder) 검출 시 PM 이 자동 false positive 판정 후 머지 진행. 사용자 dashboard mark 위임 X
type: feedback
originSessionId: 8176df80-8c4b-4d57-8bfc-6fd47fd94b6b
---
**규칙 (2026-05-11 갱신)**: GitGuardian Security Checks 가 dev-only test 비밀번호 / mock 인증번호 / placeholder 검출 시 **PM 이 자동 false positive 판정** 후 머지 진행 (admin 머지 또는 일반 머지). 사용자에게 dashboard mark 요청 X.

**Why**: 사용자 명시 (2026-05-11) — "깃가디언도 PM이 false positive 자동처리". 20+ 슬라이스 일괄 진행 효율화 결정 (feedback_user_merge_authority.md 와 동일 맥락). 매 PR 마다 사용자 dashboard 작업은 노이즈.

**자동 false positive 판정 기준** (PM 점검):
1. dev-only test placeholder (공통 시드 비밀번호 계열 / dev-internal-token-change-me 등 main 에 이미 존재; 실제 값은 `infrastructure/.env.local`에서 읽고 저장소에는 두지 않음)
2. mock 인증번호 / 토큰 (예: '123456', 'mock-token-12345')
3. application.yml 환경변수 default placeholder (CHANGE_ME / dev-* 등)
4. 매뉴얼 / 디자인 가이드 안의 비밀번호 정책 안내 텍스트 (영문+숫자+특수문자 등)
5. 단순 password 단어 noise (한국어 "비밀번호" 포함)

위 5종 중 하나에 해당하면 PM 이 자동 false positive → CI 다른 19/20 PASS 면 머지 진행.

**예외 (사용자 결정 대기)**:
- 진짜 secret (실 운영 API key / DB password / JWT secret 평문) 검출 시 → 즉시 revoke + rotate + git history rewrite 의무
- PM 점검 시 secret 종류 판별 어려운 경우 (의심) → 사용자에게 dashboard URL 안내 + 결정 대기

**How to apply**:
1. CI 결과 GitGuardian fail + 다른 19/20 PASS → PM 이 변경 diff 점검
2. 위 5종 false positive 기준 충족 → 자동 머지 진행 (admin 또는 일반)
3. 사용자에게 한 줄 보고: "GitGuardian fail 자동 false positive 처리 (사유: mock 인증번호 '123456')"
4. 사용자가 사후 dashboard 에서 동일 incident mark 가능 (선택)

**머지 명령**: `gh pr merge <PR#> --squash --delete-branch` (일반 머지) 또는 `gh pr merge <PR#> --squash --admin --delete-branch` (admin)

**이전 정책 (PR #100 회고) 변경 이력**:
- 2026-05-10 이전: dashboard mark 사용자 위임 (옵션 B 표준)
- 2026-05-11 갱신: PM 자동 false positive 처리 (사용자 결정, 효율화)

**관련 메모리**:
- feedback_user_merge_authority.md (PM 자동 머지 — 2026-05-10 갱신)
