# SP-09-4 KFTC 오픈뱅킹 — Codex BE cycle 1 review

대상: `feat/sp-09-4-kftc-shell` / `dee1f20c`  
모드: read-only, PR 댓글 미게시

## 결론

**BLOCK: cycle 2 진입 권고.** BE 관점 merge blocker 는 Flyway version 충돌 1건이다. 추가로 placeholder 4 키워드 정책 불일치와 자동 분개 IT 검증 공백은 cycle 2에서 같이 정리하는 것이 맞다.

## Findings

| ID | Severity | 위치 | 내용 |
|---|---|---|---|
| BE-C1-1 | Blocker | `services/accounting-service/src/main/resources/db/migration/V11__add_kftc_deposit_source_type_comment.sql`, `V11__add_tax_invoice_issuance_fields.sql` | 동일 accounting-service migration 경로에 `V11__` 파일이 2개다. Flyway는 동일 version 중복 시 validation/startup 실패가 난다. 신규 KFTC comment migration은 현재 최고 버전 이후 번호로 rename 필요. |
| BE-C1-2 | High | `KftcClientImpl.java:215-218`, `docs/dev-environment-setup-multi-pc.md:73` | repo 보안 정책은 `CHANGE_ME_LOCAL_ONLY`, `PLACEHOLDER_DEV_ONLY`, `changeme`, `dummy` 4 키워드 차단인데 런타임 guard는 `placeholder_dev_only`, `changeme`, `dummy`, `test`를 차단한다. `CHANGE_ME_LOCAL_ONLY`가 KFTC mode에서 통과할 수 있어 SP-09-1/2/3 회귀 가드와 불일치한다. |
| BE-C1-3 | Medium | `DepositMatchShellIT.java:268-309` | `testAutoMatchJournalDraftCreated` 이름과 달리 세금계산서를 만들지 않아 journal draft 생성 및 103/110 라인을 검증하지 않는다. 구현은 `DepositMatchService.java:56-59`, `241-251`에서 103/110을 사용하지만 회귀 테스트가 이 핵심 계약을 잠그지 못한다. |

## Cross-check

- REQUIRES_NEW self-invocation 회피: PASS. `DepositMatchAuditRecorder` 별도 bean + `@Transactional(propagation = REQUIRES_NEW)`이고 `DepositMatchService`에서 주입 호출한다.
- DTO shape / UUID 비공개: PASS. `DepositMatchResultDto`는 `journalDraftId`를 포함하지 않고 controller mapping도 6개 표시 필드만 만든다.
- HTTP status: PASS. `DEPOSIT_DATE_RANGE_INVALID`는 422, `KFTC_SUBMIT_FAILED`는 502로 매핑되어 있고 IT도 각각 검증한다.
- 권한: PASS. BE `@PreAuthorize("hasAnyRole('ACCOUNTANT', 'MANAGER', 'MASTER')")`, IT에서 SALES/WAREHOUSE/DRIVER/DISPATCH 403 검증.
- 자동 분개 구현: PASS 코드 근거 있음. 차변 103 보통예금 / 대변 110 외상매출금 생성. 단 BE-C1-3 테스트 공백 존재.

## Decision

BE는 **cycle 2 필요**. 최소 수정: migration version rename, KFTC placeholder 키워드 4종 정책 정합화, journal draft 103/110 검증 보강.
