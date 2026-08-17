# UUID 미사용 응답 필드 제거 — 1차 슬라이스

## ① 미사용 재검증 결과

정찰 기준은 `docs/dev-reports/2026-08-17-uuid-exposure-recon/report.md`의 217개 목록으로 고정했다. desktop, order-app, estimate-app, mobile, mobile-staff, arologis-desktop의 실행 소스·테스트·문서/README를 필드명으로 재검색했다.

결과는 **217개 중 48개 실제 제거**다. 33개 응답 DTO에서 외부 응답 필드를 제거했다.

재검증 중 참조가 확인되어 제거하지 않은 것은 15개다. `reverseJournalId`(desktop 세금계산서), `senderId`/`recipientId`(desktop 메신저), `slipLineId`(desktop 검수), `duplicateSlipIds`(desktop 배차), slip 감사·수정요청의 `id`/`slipId`/`actorId`/`requesterId`/`decidedById`(mobile-staff)다. 내부 통신 DTO·요청 DTO와 서버 조인 키도 보존했다.

재검증 스크립트: `scripts/verify-uuid-unused-removal.ps1`

## ② RED 원문

RED 가드는 제거 전 다음과 같이 실패했다.

```text
UUID 미사용 응답 필드가 아직 존재합니다: 63
services/.../JournalCollabCommentResponse.java: id
services/.../TaxInvoiceDetailResponse.java: reverseJournalId
services/.../ArologisAuditLogResponse.java: id, entityId, actorId
services/.../MessageResponse.java: senderId, recipientId
services/.../StockMovementResponse.java: lotId, referenceId, actorUserId
services/.../SlipAuditLogResponse.java: id, slipId, actorId
... (제거 후보 63개 전부 출력)
```

이후 클라이언트 재검증으로 15개를 후보에서 되돌렸고, 48개만 제거했다.

양방향 계약은 다음을 확인한다.

- 제거 방향: 계약 가드가 26개 최종 대상 DTO에서 48개 필드 선언을 찾지 못한다.
- 보존 방향: DTO의 비 UUID 비즈니스 필드와 실제 클라이언트가 사용하는 UUID 필드는 유지되고, 5개 서비스 compile/test 컴파일이 통과한다.

## ③ 제거 목록(서비스별)

- accounting-service: 협업 댓글/제안 `id`, `parentId`; 세금계산서 `reverseJournalId`는 참조 확인으로 복원하여 최종 제거하지 않음.
- arologis-service: `ArologisAuditLogResponse`의 `id`, `entityId`, `actorId`; `ArologisEditRequestResponse`의 `id`, `entityId`, `requesterId`, `decidedById`.
- groupware-service: `MessageBulkSendResponse.batchId`, `ScheduleResponse.ownerId`/`participantIds`, 협업 댓글·제안의 `id`/`parentId`.
- inventory-service: audit/edit-request 응답 식별자, deduction lot `lotId`, DPS 저장 응답 `id`, stock lot `sourceTransferId`, stock movement `lotId`/`referenceId`/`actorUserId`, transfer 응답의 requester/approver.
- slip-service: 첨부 `slipId`, 협업 댓글·제안·배차 댓글의 `id`/`parentId`, closing/cutoff 응답 `id`, cleanup 저장 응답 `id`.

생성자·매핑·테스트 픽스처도 함께 갱신했다. 서버 도메인 엔티티의 PK, 내부 조인, 권한·감사 저장은 변경하지 않았다.

## ④ GREEN

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-uuid-unused-removal.ps1` 통과: 26 DTO.
- `./gradlew :services:accounting-service:compileJava :services:arologis-service:compileJava :services:groupware-service:compileJava :services:inventory-service:compileJava :services:slip-service:compileJava --no-daemon` 통과.
- 5개 서비스 test compile 통과.
- 핵심 단위 테스트 통과: inventory `StockServiceTest`, groupware `ScheduleServiceTest`.
- `git diff --check` 통과.
- desktop `npm run typecheck`, `npm run lint`, `npm run build` 통과.
- design-system `npm run build` 통과.
- 전체 서비스 통합 테스트는 기존 격리 환경의 `ArologisJwtProperties` 필수 설정 부재로 실패했다. 변경 코드 컴파일 실패가 아니다.

## ⑤ 참조가 있어 뺀 것

6개 클라이언트 재검색에서 실제 사용이 확인된 15개는 제거하지 않았다. 이 목록은 후속 55개 대체 식별자 슬라이스로 이동한다. 정찰 목록의 internal-only DTO와 request DTO도 서버 내부 통신·요청 계약 보존을 위해 이번 응답 제거에서 제외했다.

## ⑥ 라이브 캡처

이번 라운드에서는 공유 컨테이너·공유 DB를 건드리지 않기 위해 격리 스택을 기동하지 않았다. 따라서 실 API 화면 캡처는 생성하지 않았으며, 라이브 QA를 완료했다고 주장하지 않는다. desktop 정적 typecheck/lint/build와 DTO 계약 가드·핵심 단위 테스트를 증거로 남겼다.

## ⑦ 프로세스 회수

이번 라운드에서 실행한 Gradle·npm 프로세스는 명령 종료 시 회수되었고 Gradle daemon도 종료됐다. 격리 컨테이너는 기동하지 않았으므로 회수 대상은 0개다. 공유 컨테이너와 타 라운드 프로세스는 건드리지 않았다. JAR·바이너리는 생성·보존하지 않았다.
