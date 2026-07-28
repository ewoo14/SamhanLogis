# 레거시 GAS Drive 갱신 구현 계획

> **For agentic workers:** 이 계획은 현재 세션에서 순차 실행하며, 각 단계는 독립 검증 후 다음 단계로 진행한다.

**Goal:** Drive 라이브 정본 26개를 기존 저장소 폴더명에 반영하고, 자격 문자열 재마스킹과 CI 가드를 함께 적용한다.

**Architecture:** 원본은 읽기 전용 임시 경로에서 메모리로 읽는다. 프로젝트·파일 매핑을 적용한 뒤 의미 기반 자격 규칙만 치환하여 저장소에 UTF-8로 쓴다. `종합견적서`는 입력·출력 대상에서 제외한다.

**Tech Stack:** Python 3 표준 라이브러리(`pathlib`, `difflib`, `re`), Bash 정적 자격 가드, PowerShell 실행 환경.

## Global Constraints

- 원본의 실 자격 문자열은 터미널·보고서·커밋 메시지·PR 코멘트에 출력하지 않는다.
- 사용자 지정 원본 경로는 읽기 전용으로 취급하고 저장소로 그대로 복사하지 않는다.
- `tools/legacy-gas/종합견적서/`는 변경하지 않는다.
- 저장소 폴더명은 유지하고, Drive 제목과 다른 경우 §7 매핑표에 기록한다.
- 시크릿 외 로직·문자열·서식은 Drive 원본 바이트를 유지한다.
- git commit/push/checkout/reset/stash는 실행하지 않는다.

### Task 1: Baseline mapping and safe source inspection

**Files:**
- Read: `tools/legacy-gas/**`
- Read: user-provided Drive export under the temporary scratchpad path
- Modify: `docs/dev-reports/2026-07-28-legacy-gas-drive-refresh.md`

- [ ] 기존 `REDACTED_*` 13종을 파일·변수·문맥별로 집계한다.
- [ ] Drive 프로젝트 26개와 저장소 폴더 매핑을 확정한다.
- [ ] 원본의 자격 후보를 값 없이 분류하고, 기존 13종 외 신규 종류가 있는지 판정한다.

### Task 2: RED-first credential gate

**Files:**
- Modify: `scripts/check-credential-plaintext.sh`
- Temporary: `tools/legacy-gas/__guard_probe__.js`

- [ ] `tools/legacy-gas/` 화이트리스트를 제거한다.
- [ ] 가짜 Notion 토큰 프로브를 심고 가드가 exit 1인지 확인한다.
- [ ] 프로브를 제거한다.

### Task 3: Drive refresh and remasking

**Files:**
- Modify/Create: mapped folders under `tools/legacy-gas/`
- Preserve: `tools/legacy-gas/종합견적서/**`

- [ ] Drive 파일을 target basename으로 UTF-8 반영한다.
- [ ] 의미 기반 13종 규칙으로 자격 문자열만 placeholder로 치환한다.
- [ ] Drive 전용 `영업수수료 계산`을 신규 폴더로 추가한다.

### Task 4: Placeholder exception and report tables

**Files:**
- Modify: `scripts/check-credential-plaintext.sh`
- Modify: `docs/dev-reports/2026-07-28-legacy-gas-drive-refresh.md`

- [ ] `REDACTED_*`가 있는 일반 스캔 줄을 허용하되 KFTC/CODEF/INSUNG 예외 정책은 바꾸지 않는다.
- [ ] §7에 15건 폴더명 매핑과 26개 프로젝트별 파일·치환·판정을 채운다.

### Task 5: V1–V5 verification and handoff

**Files:**
- Create outside repository: `C:\Users\user\AppData\Local\Temp\claude\C--dev-Samhan-Public\7445e5b2-c181-4d85-abc3-95daebb19d9f\scratchpad\974-gas-refresh-impl.md`

- [ ] V1: 가드 PASS와 직접 고엔트로피 스캔을 모두 실행한다.
- [ ] V2: RED 원문 실행 결과를 기록한다.
- [ ] V3: 13종 placeholder 허용 결과를 기록한다.
- [ ] V4: 마스킹 라인 제외 `difflib` 일치 여부를 프로그램으로 확인한다.
- [ ] V5: `종합견적서` 상태가 공백인지 확인한다.
- [ ] 보고서 저장 직후 `ls -la`와 첫 40줄을 확인하고 보고서에 붙인다.
