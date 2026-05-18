# SP-09-2 Aligo SMS 실 발송 - Codex DevOps Review Cycle 1

대상: PR #237, commit `87d1e5f7`

## Findings

### MEDIUM - 문서의 `ALIGO_*` alias와 실제 Spring property binding이 불일치

- 위치:
  - `infrastructure/env-templates/notification-service.env:39-46`
  - `docs/dev-environment-setup-multi-pc.md:45-48`
  - `services/notification-service/src/main/resources/application.yml:47-51`
- 내용: 운영 문서/템플릿은 `SAMHAN_ALIGO_KEY`와 함께 `ALIGO_API_KEY`, `ALIGO_USER_ID`, `ALIGO_SENDER` alias를 병기합니다. 그러나 `application.yml`은 `SAMHAN_ALIGO_KEY`, `SAMHAN_ALIGO_USERID`, `SAMHAN_ALIGO_SENDER`만 읽습니다.
- 영향: 운영자가 alias 이름만 채우면 adapter는 기본 `CHANGE_ME_LOCAL_ONLY`/blank로 남아 stub-success를 반환합니다. 실 발송 cutover에서 "성공처럼 보이는 미발송"이 발생할 수 있습니다.
- 권고: application.yml에 chained fallback을 추가하거나, 문서에서 alias 병기를 제거하고 `SAMHAN_*`만 공식 변수로 고정하십시오.

### LOW - credential guard는 통과 가능하나 ALIGO 값 스캔 범위 설명이 불명확함

- 위치:
  - `scripts/check-credential-plaintext.sh:62`
  - `infrastructure/env-templates/notification-service.env:43-46`
- 내용: `PATTERN_ALIGO='ALIGO_KEY\s*=\s*...'`는 `SAMHAN_ALIGO_KEY=`의 substring도 잡을 수 있지만, 의도적으로 `SAMHAN_ALIGO_KEY`를 스캔한다는 설명은 없습니다. 현재 템플릿 값은 blank라 미탐지입니다.
- 영향: guard 동작은 대체로 안전하지만, 향후 변수명이 늘어날 때 정책 해석이 흔들릴 수 있습니다.
- 권고: guard 주석에 `SAMHAN_ALIGO_KEY`도 검사 대상임을 명시하거나 패턴을 명시적으로 확장하십시오.

### LOW - repo 기존 workflow에 `|| true`가 남아 있음

- 위치:
  - `.github/workflows/qa-e2e.yml:51`
  - `.github/workflows/qa-e2e.yml:104`
- 내용: 이번 target file 변경은 아니지만, repo 전체 grep 기준으로 `|| true`가 남아 있습니다.
- 영향: 사용자 cross-check가 "SP-09-1 cycle 1 H1 회귀"를 지목했으므로, PR 범위 밖이라도 CI 신뢰성 문맥에서 잔존 리스크입니다.
- 권고: 본 PR blocker로 보지는 않되, 별도 CI hardening backlog 또는 같은 PR에서 qa-e2e soft-pass 정책을 명확히 정리하십시오.

## Cross-check

- credential-plaintext guard `PATTERN_ALIGO`: target env/doc에서 실 key 미탐지. blank placeholder 유지.
- Aligo env template: `SAMHAN_ALIGO_*` blank라 local/dev는 stub-success.
- 외부 vendor 비용/실 호출: 템플릿 기준 실 발송은 명시적 secret 주입 전 비활성.

## Section Decision

DevOps 단독 merge blocker는 아닙니다. 다만 env alias mismatch는 실 발송 cutover 사고로 이어질 수 있어 cycle 2에서 문서 또는 property fallback 정렬을 권고합니다.
