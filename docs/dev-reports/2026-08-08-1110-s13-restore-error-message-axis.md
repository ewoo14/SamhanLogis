# PR #1115 / 이슈 #1110 — S13 복원 오류 문구 축

## 결론

S12 SOL 재수렴에서 확인된 도달 결함 1건을 수정했다. 복원 요청의 403 권한 거부는
서버 원문을 노출하지 않고 권한 문제와 조치 대상을 안내하며, 409 업무 충돌만 기존처럼
서버 메시지를 표시한다. 500 계열과 입력 오류는 일반 문구를 유지한다.

## 원인

`PartnerOrderRevisionController#restoreRevision`은
`@RequirePermission(page = "sales.partner-order.revisions", action = RESTORE)`로 보호된다.
권한이 없으면 `PermissionAspect`가 `AccessDeniedException`을 던지고, partner-order-service의
`GlobalExceptionHandler`가 이를 403 `FORBIDDEN` 응답으로 변환한다.

기존 `partnerOrderRestoreErrorMessage`는 409가 아니면 모두
`주문 복원에 실패했습니다. 다시 시도해 주세요.`로 반환했다. 따라서 403도 재시도 안내로
묻혔다. 협업 패널은 이미 버전이력 패널을 렌더링하므로 해당 helper의 반환값이 실제 복원
오류 toast에 연결되어 있다.

## 복원 경로 상태 코드 전수 판정

| 상태 코드 | 발생 근거 | 사용자가 스스로 해결 가능한가 | 화면 처리 | 판정 근거 |
|---|---|---:|---|---|
| 400 | `int` path variable 변환 실패, 요청 형식 오류, `GlobalExceptionHandler`의 입력 오류 매핑 | 아니오 | 일반 문구 | 정상 UI가 만드는 요청이 아니며 서버 내부 입력 상세를 노출할 이유가 없다. |
| 401 | 인증 경계에서 인증 토큰이 없거나 만료된 요청 | 예 | `로그인이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.` | 사용자가 재로그인할 수 있다. 인증 원문은 노출하지 않는다. |
| 403 | `@RequirePermission(RESTORE)` 권한 거부 또는 `AccessDeniedException` | 예 | `주문 복원 권한이 없습니다. MASTER, MANAGER 또는 SALES 권한이 있는 담당자에게 요청해 주세요.` | 복원 권한 시드가 MASTER/MANAGER/SALES에만 있고, 권한 보유 담당자에게 요청하는 조치가 가능하다. |
| 404 | 주문 식별자 부재, 대상 revision 부재, 복원 서비스의 주문/revision 조회 실패 | 예 | `복원할 주문 또는 버전을 찾을 수 없습니다. 최신 주문 정보를 확인해 주세요.` | 최신 주문 정보를 확인하면 stale 화면/없는 revision 문제를 사용자가 해소할 수 있다. UUID나 내부 원문은 노출하지 않는다. |
| 409 | `CONFIRMING`/`CANCELED` 복원 가드, row-lock 경합, optimistic lock/채번 충돌 | 예 | 서버 메시지 표시 | 현재 PR의 기존 계약이다. 업무 충돌 원인과 재조회 조치를 서버가 제공하므로 409만 원문을 허용한다. |
| 422 | 복원 controller/service/handler에 발생 경로 없음 | 해당 없음 | 일반 문구 fallback | `GlobalExceptionHandler`는 422를 별도 매핑하지 않으며 복원 코드에도 422 생성이 없다. 향후 프록시가 보내더라도 내부 원문은 감춘다. |
| 5xx | 처리되지 않은 예외, 내부 오류 (`handleUnknown`) | 아니오 | 일반 문구 | 내부 사정/스택/DB 원문을 사용자에게 노출하지 않는다. |

## 변경 내용

- `PartnerOrderVersionHistoryPanel.tsx`
  - 401/403/404를 고정된 한국어 조치 안내로 분기.
  - 409에서만 비어 있지 않은 서버 `message`를 표시.
  - 400/422/5xx 및 비-Axios 오류는 기존 일반 문구 유지.
  - 화면에 UUID, 서버 내부 오류 원문, 역할 약어를 노출하지 않음.
- `partnerOrderRestoreErrorMessage.test.ts`
  - 403 권한 안내와 내부 원문 비노출 검증.
  - 401 재로그인, 404 최신 상태 확인 안내 검증.
  - 400/422/500 일반 문구 및 409 원문 계약 회귀 검증.

## 검증

- 변경 파일 참조 테스트: **4 files / 34 tests passed**
  - `partnerOrderRestoreErrorMessage.test.ts` — 7
  - `PartnerOrderCollaborationPanel.history-bridge.test.tsx` — 2
  - `PartnerOrderCollaborationPanel.coedit.test.tsx` — 5
  - `SalesPartnerOrderDetailPage.coedit.test.tsx` — 20
- `npm run typecheck` — **passed**
- 백엔드 락, commitId 멱등, endpoint는 변경하지 않음.

## 신규 파일

- 본 보고서 파일 1개.
