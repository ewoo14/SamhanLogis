# SP-09-4 KFTC 오픈뱅킹 — Codex FE cycle 1 review

대상: `feat/sp-09-4-kftc-shell` / `dee1f20c`  
모드: read-only, PR 댓글 미게시

## 결론

**FE 단독 blocker는 없음.** 다만 mock error code와 문서/주석의 DTO 표현이 BE 계약과 어긋나 cycle 2에서 정리 권고한다.

## Findings

| ID | Severity | 위치 | 내용 |
|---|---|---|---|
| FE-C1-1 | Medium | `clients/desktop/src/renderer/api/mock.ts:4015`, `4038` | mock 502 응답 code가 `KFTC_GATEWAY_ERROR`다. BE/ErrorCode/IT 계약은 `KFTC_SUBMIT_FAILED`다. FE API는 status 502만 보고 `KftcGatewayError`를 던져 화면은 동작하지만, mock contract가 cross-check의 “502 KFTC_SUBMIT_FAILED placeholder”와 불일치한다. |
| FE-C1-2 | Medium | `docs/dev-reports/sp-09-4-kftc-shell.md:136-144` | dev-report의 FE 타입 예시에 `journalDraftId?: string`이 포함되어 있다. 실제 `depositMatchApi.ts` 타입에는 없고 BE DTO에도 없다. UUID 비공개 정책은 구현상 PASS지만 문서가 잘못된 계약을 암시한다. |
| FE-C1-3 | Low | `clients/desktop/src/renderer/api/mock.ts:4041-4078` | mock 주석에는 `journalDraftId?`가 언급되어 있고, 일부 mock row는 `matchedTaxInvoiceNo: null`인데 `status: 'MATCHED'`다. 현재 BE 로직은 세금계산서 매칭 실패 시 `UNMATCHED`를 반환하므로 mock 데이터 의미가 느슨하다. |

## Cross-check

- DTO shape 1:1: PASS. FE `DepositMatchResult` 필드는 BE `DepositMatchResultDto`와 대응하며 `journalDraftId`가 없다.
- HashRouter: PASS. route는 `/accounting/deposit-match`, Playwright URL은 `/#/accounting/deposit-match?mockRole=...`.
- 권한 매트릭스: PASS. `DEPOSIT_MATCH_ROLES = ['ACCOUNTANT', 'MANAGER', 'MASTER']`이고 route가 `RoleGuard`로 감싼다.
- 422/502 화면 처리: PASS. `fetchAndMatchDeposits`는 422/502를 별도 에러 클래스로 변환하고 `DepositMatchPage`는 한국어 메시지를 표시한다.
- UUID 비공개: PASS 구현 기준. 화면 컬럼은 비즈니스 식별자만 표시한다.

## Decision

FE는 **cycle 2 권고(비차단)**. BE/DevOps blocker 수정 시 mock code를 `KFTC_SUBMIT_FAILED`로 맞추고 문서/주석의 `journalDraftId` 언급을 제거하는 것이 좋다.
