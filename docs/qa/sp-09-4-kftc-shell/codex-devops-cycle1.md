# SP-09-4 KFTC 오픈뱅킹 — Codex DevOps cycle 1 review

대상: `feat/sp-09-4-kftc-shell` / `dee1f20c`  
모드: read-only, PR 댓글 미게시

## 결론

**BLOCK: cycle 2 진입 권고.** DevOps 관점 blocker는 Flyway migration version 중복이다. credential guard는 큰 방향은 맞지만 runtime placeholder 4키워드 정책과 맞춰야 한다.

## Findings

| ID | Severity | 위치 | 내용 |
|---|---|---|---|
| DO-C1-1 | Blocker | `services/accounting-service/src/main/resources/db/migration/` | `V11__add_kftc_deposit_source_type_comment.sql`과 `V11__add_tax_invoice_issuance_fields.sql`가 동시에 존재한다. Flyway duplicate version으로 accounting-service 기동/CI가 깨질 수 있다. |
| DO-C1-2 | High | `KftcClientImpl.java:215-218`, `docs/dev-environment-setup-multi-pc.md:73` | 문서 정책의 4키워드(`CHANGE_ME_LOCAL_ONLY`, `PLACEHOLDER_DEV_ONLY`, `changeme`, `dummy`)와 runtime guard의 4키워드(`placeholder_dev_only`, `changeme`, `dummy`, `test`)가 다르다. DevOps credential policy와 runtime policy가 불일치한다. |
| DO-C1-3 | Low | `scripts/check-credential-plaintext.sh:74-77`, `infrastructure/env-templates/accounting-service.env:51-55` | `PATTERN_KFTC`는 민감 3키만 잡고 blank env-template은 통과한다. 의도는 맞다. 다만 cycle 2에서 실값/placeholder 4키워드에 대한 스크립트 테스트 근거를 PR body나 dev-report에 남기면 좋다. |

## Cross-check

- `PATTERN_KFTC` blank 통과: PASS. `KFTC_API_KEY=`, `KFTC_CLIENT_ID=`, `KFTC_CLIENT_SECRET=`는 패턴에 걸리지 않는다.
- 실 값 차단: PASS 정규식 기준. `KFTC_API_KEY=abc` 형태는 매칭된다.
- placeholder 차단: PASS in script, WARN in runtime. script는 KFTC label에 placeholder whitelist를 적용하지 않아 값이 있으면 잡는다. runtime은 `CHANGE_ME_LOCAL_ONLY` 누락.
- env-template: PASS. 민감 키 3개 빈 값, `KFTC_SUBMIT_METHOD=DRY_RUN`.
- accounting-service IT `@MockBean KftcClient`: PASS. grep 기준 20개 테스트 파일에서 `KftcClient` mock bean 또는 field가 확인된다.

## Decision

DevOps는 **cycle 2 필요**. migration version rename은 merge blocker이고, runtime placeholder 4키워드 정책 정합화는 Phase 11 실 연동 전 필수 가드다.
