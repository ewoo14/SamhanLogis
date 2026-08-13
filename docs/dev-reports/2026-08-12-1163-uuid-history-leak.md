# #1163 UUID 이력·감사 기록 노출 잔여 경로

작성일: 2026-08-12  
브랜치: `fix/1163-uuid-history-leak`  
기준: `origin/main` `72cab52eb`

## 결론

확정 좌표 2곳과 계열 sweep에서 발견한 추가 경로를 닫았다.

- 창고 이력 화면은 `actorName=null`·UUID·UUID 변형을 모두 `변경자 미상`으로 표시한다. `SYSTEM_ACTOR_ID`는 계속 `시스템`이다.
- inventory 감사 저장은 UUID를 `actorName`에 저장하지 않는다. `actorId`는 그대로 저장한다.
- accounting의 `DepositMatchAuditRecorder`와 공통 audit 저장 서비스 10곳도 UUID 표시명 가드로 통일했다.
- desktop API, design-system `AuditOverlay`, redline/version-history 소비자도 UUID 모양 문자열을 사용자 텍스트로 내보내지 않는다.
- 내부 route key·join key·`actorId`·`deletedBy` 키는 제거하지 않았다.

## RED-A 원문과 결과

먼저 다음 표적을 RED로 만들고 구현 후 GREEN을 확인했다.

| RED 표적 | 구현 전 관찰 | 구현 후 |
|---|---|---|
| `actorName=null` 창고 revision | 화면 fallback이 UUID 앞 8자를 표시 | `EditWarehouseModal.tsx:333-335,360`에서 `변경자 미상` |
| UUID caller inventory 감사 | 저장 actorName이 caller UUID로 이어짐 | `WarehouseService.java:372-390`, `InventoryAuditLogRecorder.java:77`에서 공통 resolver 적용; actorName=`변경자 미상`, actorId 보존 |
| accounting 입금매칭 감사 | `DepositMatchAuditRecorder.java`가 actor UUID prefix를 이름 필드에 기록 | `DepositMatchAuditRecorder.java:57,69`에서 `변경자 미상` |
| UUID 변형·invisible wrapper | canonical 외 `{32hex}`, `urn:uuid:32hex`, zero-width wrapper가 잔존 가능 | 공통/FE resolver가 변형을 식별하고 표시하지 않음 |

회귀 표적은 [ActorDisplayNameTest.java](../../shared/common/src/test/java/com/samhanair/logis/common/security/ActorDisplayNameTest.java)와 inventory `WarehouseServiceTest`/`WarehouseActorStorageIT`에 남겼다. 정상 이름은 원문을 보존하고, system sentinel은 `system`/화면 `시스템`을 유지한다.

## 변경 좌표

| 좌표 | 발화 조건 | 조치 | 근거 |
|---|---|---|---|
| desktop 창고 이력 | `actorName`이 null 또는 UUID | UUID fragment fallback 제거, `변경자 미상` | `clients/desktop/src/renderer/components/EditWarehouseModal.tsx:333-335,360` |
| inventory 창고 감사 | `X-User-Id`가 UUID이고 이름이 없거나 UUID | 저장 actorName을 공통 resolver로 결정 | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/WarehouseService.java:372-394` |
| inventory audit recorder | recorder 직접 호출에 UUID actorName 전달 | 저장·event payload 양쪽에 safe name 사용 | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/realtime/service/InventoryAuditLogRecorder.java:77-86` |
| accounting 입금매칭 | actorId가 있으면 actorId를 이름으로 대체하던 경로 | `변경자 미상` 기록, actorId는 유지 | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DepositMatchAuditRecorder.java:51-69` |
| 공통 audit 저장 | actorId/callerId가 UUID이고 actorName이 비어 있거나 UUID | `ActorDisplayName.resolve` 적용 | accounting `AccountingAuditLogService:60,93`; arologis `ArologisAuditLogRecorder:64`; dc-config `DcConfigAuditLogService:51`; inventory `InventoryAuditLogRecorder:77`; notification `NotificationAuditLogService:54`; partner-order `PartnerOrderAuditLogService:86,141`; partner `PartnerAuditLogService:54,76`; product `ProductAuditLogService:71,98`; slip `SlipAuditLogService:85,123`; user `UserAuditLogService:65` |
| partner revision/edit requests | principal/caller UUID가 display name으로 전달 | UUID 변형을 null/unknown으로 차단 | `services/partner-service/src/main/java/com/samhanair/logis/partner/tab/web/Partner4TabController.java:154-163`; `services/partner-service/src/main/java/com/samhanair/logis/partner/revision/web/PartnerRevisionController.java:148` |
| desktop audit API | actorName이 actorId와 다른 UUID 모양이어도 normalize 결과가 표시 | UUID 모양 자체를 unknown으로 정규화 | `clients/desktop/src/renderer/api/createAuditApi.ts:49-70` |
| design-system AuditOverlay | 행 actorId와 같은 UUID만 숨기던 조건 | canonical, brace, URN, 32hex UUID를 모두 숨김 | `clients/web/design-system/src/components/AuditOverlay/AuditOverlay.tsx:86-106`; `clients/web/design-system/src/utils/actorName.ts:2-15` |

## 전수 sweep O/X 표

O는 해당 후보를 수정했거나, 내부 키라 화면 문자열이 아닌 경우다. N/A는 해당 서비스 main 소스에서 actor/caller 이름 표시·감사 저장 후보가 발견되지 않은 경우다.

| 서비스 | 판정 | 좌표·발화 조건 | 고쳤는가 / 안전 근거 |
|---|---|---|---|
| accounting-service | O | `DepositMatchAuditRecorder`, generic audit, journal collab | 수정. audit 저장은 `AccountingAuditLogService:60,93`, 입금매칭은 `DepositMatchAuditRecorder:57,69`; collab 삭제자의 callerId는 내부 키이며 authorName resolver는 `JournalCollabController:300-314` |
| arologis-service | O | realtime audit actorName | 수정. `ArologisAuditLogRecorder:64` |
| auth-service | N/A | actor/caller 표시 audit 후보 없음 | sweep 결과 해당 main 경로 없음 |
| dashboard-service | N/A | actor/caller 표시 audit 후보 없음 | sweep 결과 해당 main 경로 없음 |
| dc-config-service | O | partner DC 변경 audit | 수정. `DcConfigAuditLogService:51`, controller `PartnerDcConfigsController:119-120` |
| groupware-service | O | collab comment authorName에 callerName 전달 | UUID canonical/32hex/URN guard 유지. `GroupwareApprovalCollabController:340-354`; `resolveDeleter`는 soft-delete 내부 키 |
| inventory-service | O | warehouse audit 및 realtime audit | 수정. `WarehouseService:372-394`, `InventoryAuditLogRecorder:77-86`, controller `InventoryAuditController:323-324` |
| logging-service | N/A | actor/caller 사용자 표시 audit 후보 없음 | sweep 결과 해당 main 경로 없음 |
| notification-service | O | notification audit | 수정. `NotificationAuditLogService:54` |
| partner-auth-service | N/A | actor/caller 표시 audit 후보 없음 | sweep 결과 해당 main 경로 없음 |
| partner-order-service | O | revision, delete-name, generic audit, collab | 기존 guard와 공통 guard 확인. `PartnerOrderRevisionService:632-644`, `PartnerOrderSummaryResponse:77-85`, `PartnerOrderDetailResponse:107-115`, `PartnerOrderAuditLogService:86,141`, `PartnerOrderCollabController:264-281` |
| partner-service | O | partner audit, 4-tab principal, edit request | 수정/guard 확인. `PartnerAuditLogService:54,76`, `Partner4TabController:154-163`, `PartnerRevisionController:148`, `PartnerEditRequestController:135` |
| product-service | O | product audit/edit request | 수정. `ProductAuditLogService:71,98`, `ProductEditRequestController:163` |
| slip-service | O | slip audit, version history, estimate/dispatch collab | 기존 `ActorNameSanitizer`·resolver와 공통 audit guard 확인. `SlipAuditLogService:85,123`, `SlipService:813-826`, `EstimateService:625-634`, `SlipDuplicateService:200-209`, `SlipCollabController:319-333`, `EstimateCollabController:310-324` |
| user-service | O | user audit | 수정. `UserAuditLogService:65` |

### 화면 slice/fallback 후보

- `clients/desktop/src/renderer/routes/admin/AccountingEditRequestsPage.tsx:47-50,192-196`의 `req.id.slice(0, 8)`은 row `data-testid`와 React key에만 사용되고 사용자 텍스트에는 들어가지 않는다. 표시 셀은 `requesterName` 등이다. O(안전, 화면 문자열 아님).
- `clients/web/design-system/src/components/SignatureViewer/SignatureViewer.tsx:65`의 `signatureHash.slice(0, 8)`은 같은 파일 주석 `:10-16`에서 SHA-256 hex 검증코드의 짧은 표기로 명시되어 있다. UUID 식별자 slice가 아니므로 O(의도된 서명 hash 표시).
- 그 외 `.slice(0, 8)`, `substring(0, 8)`, `?? actorId`, `|| actorId` 검색 결과는 테스트 ID·mock reference·날짜·서명 hash였고 사용자 actor 표시 fallback은 아니었다.

따라서 `.slice(0, 8)`이 사용자 UUID 표시 규약이라는 문서/테스트는 발견하지 못했다. 반대로 UUID-shaped actorName을 보존하던 기존 테스트는 UUID 비공개 불변식과 충돌하는 결함 고정 테스트였으므로 숨김 기대값으로 교정했다. 정상적인 비-UUID 이름의 표시는 변경하지 않았다.

## 내부 식별자 보존 확인

`actorId`는 audit row와 color/join 입력으로 계속 전달한다. collab의 `resolveDeleter(callerId)`도 `deletedBy` 내부 키를 위한 것이며, `CollabCommentRecord`의 `authorName`과 API response DTO의 사용자 표시 필드와 분리되어 있다. 따라서 UUID route/join/soft-delete key를 없애지 않았다.

## 라이브 QA

- 스펙 디렉터리/파일: `clients/desktop/playwright/1163-uuid-history-leak-real-qa/1163-r4-readonly-live-ui-real-qa.spec.ts`
- hash route: `http://127.0.0.1:4174/#/admin/warehouses`
- API datasource URL: `http://127.0.0.1:8080` gateway 경유; shared DB는 조회만 수행했고 DB write는 하지 않았다.
- Playwright: headless renderer project, chromium-1217, read-only GET + login POST만 수행.
- 실 응답 증거: `actorNames=["a0000000-0000-0000-0000-000000000001"]`, `auditRowCount=1`; UI panel text에는 UUID regex가 없었고 1 test passed.
- screenshot: [warehouse-audit-readonly-live-ui.png](../qa/2026-08-12-1163-uuid-history-leak/screenshots/_local/warehouse-audit-readonly-live-ui.png)
- 캡처 경로는 스펙의 `resolveQaShotsDir()`를 경유했다(`:4,13-16,149`). 미추적 로컬 실행이므로 resolver가 `_local` 하위에 저장했다.
- 전용 renderer `4174`와 `samhan-inventory-service` 컨테이너는 QA 후 종료했다. 다른 worktree의 포트/서비스는 건드리지 않았다.

## 검증

- `:services:inventory-service:test --no-daemon`: BUILD SUCCESSFUL, 501 tests, failures 0, errors 0, skipped 1.
- `:services:inventory-service:test --tests WarehouseActorStorageIT --tests WarehouseServiceTest --tests InventoryAuditLogRecorderTest`: BUILD SUCCESSFUL.
- accounting focused audit tests: BUILD SUCCESSFUL.
- desktop `npm test`: Vitest 전체 통과.
- design-system `npm run build && npm test`: 28 files / 250 tests 통과.
- desktop Playwright live QA: 1 passed.
- desktop `npm run typecheck`: `tsc` 단계는 통과. 마지막 `real-qa-scope.test.cjs`는 PM이 아직 git add하지 않은 새 스펙 1개 때문에 실패했다. 새 경로 자체는 계약 테스트에 반영했으며, PM이 파일 rename/add를 커밋하면 해소된다.

git 조작은 수행하지 않았다. 커밋·PR은 PM이 대행해야 한다.
