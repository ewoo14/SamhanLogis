# UUID API 응답 노출 정찰

> 조사일: 2026-08-17  
> 조사 기준: 로컬 `main` `607592515` (조사 시작 시 `origin/main`보다 3커밋 뒤). 원격 3커밋의 변경 파일도 대조했으며 UUID 응답 DTO 변경은 없었다.  
> 변경 범위: 이 보고서만 생성. 서비스 코드·클라이언트 코드·DB·이슈·PR은 변경하지 않았다.

## ① 한 장 요약

**172개 응답 DTO · 272개 raw UUID 필드**가 직렬화 경계에 남아 있다.

| 구분 | DTO/shape | 필드 | 네 클라이언트의 실제 소비 |
|---|---:|---:|---:|
| Java `UUID`/`List<UUID>`/UUID map key·value | 156 | 247 | 사용/미사용 합계에 포함 |
| `String`이지만 UUID 원문을 담음 | 16 | 25 | 사용/미사용 합계에 포함 |
| 합계 | **172** | **272** | **사용 55 · 미사용 217** |

클라이언트별 직접 소비 필드는 `desktop` 54개, `order-app` 1개, `estimate-app` 0개, `mobile` 0개다. 동일 필드를 여러 클라이언트가 소비해도 필드 합계에서는 한 번만 센다. `mobile`은 order-app WebView를 임베드하므로 `order-app`의 `draftId` 1개를 간접 소비하지만 직접 소비 수에는 넣지 않았다.

별도 표면으로 DTO가 아닌 `ApiResponse<UUID>`, `Map<UUID, …>`, `Map<String, String>` 응답 **13개 endpoint**가 있다. 이 13개는 위 172/272 분모에 넣지 않았다. 대표 근거는 `user-service/.../InternalUserController.java:249,278`, `notification-service/.../NotificationCenterInternalController.java:33`, `product-service/.../ProductInternalController.java:291`, `PriceHistoryInternalController.java:94`, `arologis-service/.../ArologisAdminController.java:139,157,257,319`, `DispatchAdminV1Controller.java:164,193`, `RegionAdminController.java:133`이다.

조사에서 말하는 “사용”은 타입 선언이 아니라 응답 속성을 읽어 다음 요청의 path/body, 비교값, React/query key로 쓰는 경우다. 화면에 글자로 표시하는 raw UUID는 확인되지 않았다.

## ② 전수 목록

표기: `U`는 네 클라이언트 중 하나가 실제 읽음, `N`은 네 클라이언트에서 직접 읽지 않음. 한 행의 `N=나머지`는 같은 행에 열거된 필드 중 U로 명시되지 않은 전부다.

### accounting-service — 31필드

| 파일:줄 | 필드 | 사용 |
|---|---|---|
| `editrequest/web/dto/AccountingEditRequestResponse.java:18-26` | requestId, entityId, requesterId, decidedById | U 전부 — desktop이 승인/거절 path와 행 모델에 사용 (`accountingEditRequest.ts:52-60`) |
| `web/collab/dto/JournalCollabCommentResponse.java:16,20` | id, parentId | N |
| `web/collab/dto/JournalCollabSuggestionResponse.java:17` | id | N |
| `web/dto/AccountingPeriodResponse.java:13` | id | U — desktop 마감 mutation key |
| `web/dto/CashReceiptResponse.java:15` | id | U — desktop 상세/확정/취소 path |
| `web/dto/JournalPartnerSearchResponse.java:12` | partnerId | U — desktop 분개 요청 payload |
| `web/dto/Mig8OrderExportResponse.java:16` | partnerId | N(내부 호출) |
| `web/dto/Mig8OrderLineExportResponse.java:10` | productId | N(상위 내부 DTO 중첩) |
| `web/dto/SalesCommissionSettlementResponse.java:13` | id | U — desktop 상세/확정 path |
| `web/dto/SettlementApprovalClaimResponse.java:10` | claimToken | N(내부 호출) |
| `web/dto/TaxInvoiceBatchHistoryResponse.java:17` | batchId | U — desktop 배치 상세 key |
| `web/dto/TaxInvoiceBatchPreviewResponse.java:14` | batchId | U — desktop 배치 실행 key |
| `web/dto/TaxInvoiceDetailResponse.java:18,21,36-37` | id, partnerId, journalId, reverseJournalId | U: id, partnerId, journalId; N: reverseJournalId |
| `web/dto/TaxInvoiceLineResponse.java:13` | lineId | U — desktop 편집 line key |
| `web/dto/TaxInvoiceResponse.java:13,15,25-26` | id, partnerId, journalId, reverseJournalId | U: id, partnerId, journalId; N: reverseJournalId |
| `web/dto/PurchaseAccountingSlipResponse.java:11,48` | id(String UUID) | U — desktop 상세/수정 path |
| `web/dto/SalesAccountingSlipResponse.java:11,48` | id(String UUID) | U — desktop 상세/수정 path |
| `web/dto/SupplierProfileResponse.java:27,96` | id(String UUID) | U — desktop 수정/삭제 path |
| `web/dto/TaxInvoiceSummaryResponse.java:21,79` | id(String UUID) | U — desktop 상세 path (`taxInvoiceApi.ts:83-85`) |
| `web/dto/TaxInvoiceBatchCandidateResponse.java:25,34` | salesSlipId(String UUID) | U — desktop 배치 발행 요청 payload |

### arologis-service — 17필드

| 파일:줄 | 필드 | 사용 |
|---|---|---|
| `dto/MeResponse.java:12` | userId | N(네 클라이언트 기준; arologis client는 별도) |
| `dto/RegionResponse.java:16` | id | U — desktop 지역 수정/삭제 path |
| `dto/dispatch/ArologisDispatchResponse.java:10-11` | arologisDispatchId, samhanDispatchTaskId | N(내부 호출) |
| `realtime/web/dto/ArologisAuditLogResponse.java:12-15` | id, entityId, actorId | N(네 클라이언트 기준) |
| `realtime/web/dto/ArologisEditRequestResponse.java:15-23` | id, entityId, requesterId, decidedById | N(네 클라이언트 기준) |
| `web/dto/DispatchSaveHistoryDetailResponse.java:23` | id | U — desktop 저장 이력 선택 key |
| `web/dto/DispatchSaveHistorySaveResponse.java:12` | id | N |
| `web/dto/DispatchSaveHistoryListRow.java:25` | id | U — desktop 이력 상세 조회 key |
| `dto/DispatchResponse.java:15,23` | dispatchId(String UUID) | U — desktop 다음 요청 path/body |
| `dto/DispatchPageResponse.java:33,42` | content[].dispatchId(String UUID) | U — desktop 상세 라우팅 (`arologisAdminDispatchApi.ts:112-115`) |
| `dto/DispatchDetailResponse.java:32,56` | dispatchId(String UUID) | U — desktop auto-match/manual-assign path/body |

### auth-service — 17필드

| 파일:줄 | 필드 | 사용 |
|---|---|---|
| `web/InternalAccountController.java:47` | accountId | N(내부 호출) |
| `web/dto/ApprovalLineDefaultApproverView.java:9` | userId | U — desktop 결재선 설정 mutation |
| `web/dto/ApprovalLineRoleView.java:9` | id | U — desktop role path |
| `web/dto/ApproverView.java:6` | id, refId | U 전부 — desktop approver 제거/표시 매핑 |
| `web/dto/internal/InternalAccountLookupResponse.java:6` | accountId | N(내부 호출) |
| `web/dto/AccountSearchResult.java:6` | id | U — desktop 계정 선택값 |
| `web/dto/ApprovalLineGroupOption.java:6` | id | U — desktop 그룹 선택값 |
| `web/dto/ApprovalLineRoleResolutionItem.java:22-23` | approverGroupId, approverUserIds[] | N(내부 결재선 해석) |
| `service/PermissionGroupService.java:170-171` | GroupSummary.id | U — desktop 그룹 path |
| `service/AccountGroupService.java:228-231` | accountId, groupId | U 전부 — desktop 배속 mutation path |
| `service/AccountPermissionService.java:401` | AccountSummary.id | U — desktop 계정 권한 path |
| `service/dto/LoginResponse.java:24,65` | userId, groups[].id (String UUID) | U 전부 — desktop auth/policy key |
| `service/dto/RegisterResponse.java:4`, `service/AuthService.java:193` | userId(String UUID) | N |
| `web/dto/MeResponse.java:17`, `service/AuthService.java:252-253` | userId(String UUID) | U — desktop presence/auth key |

### dashboard-service — 4필드

`dto/AppNoticeAdminImageResponse.java:8 id`(U desktop 이미지 mutation), `AppNoticeAdminResponse.java:10 id`(U), `AppNoticeResponse.java:10 id`(N), `AppReleaseResponse.java:12 id`(U desktop 수정/삭제).

### dc-config-service — 4필드

`audit/web/dto/DcConfigAuditLogResponse.java:10-13 id, entityId, actorId`(N), `dto/PartnerInternalResponse.java:18 partnerId`(N, 내부 호출).

### groupware-service — 26필드

| 파일:줄 | 필드 | 사용 |
|---|---|---|
| `dto/ApprovalAttachmentResponse.java:29` | id | U — desktop 삭제 path |
| `dto/ApprovalLineAdminResponse.java:36-45` | approvalId, requesterId, templateId, documentTemplateId | U 전부 — 상세/필터/템플릿·핀 조회 (`groupwareApproval.ts:92-115`, `ApprovalDocView.tsx:70-77,126,181-218`) |
| `dto/ApprovalLineAdminResponse.java:74-75` | steps[].approverGroupId, approverId | U 전부 — 그룹명 매핑·작성자 판정 |
| `dto/ApprovalLineInternalResponse.java:21,23` | approvalId, requesterId | N(내부 호출) |
| `dto/ApprovalTemplateResponse.java:21,32` | id, fields[].id | U 전부 — desktop 편집/reorder key |
| `dto/ApproverSearchResponse.java:7` | userId | U — desktop approver 선택값 |
| `dto/DocumentTemplateResponse.java:10` | id | U — desktop 상세/수정 path |
| `dto/DocumentTemplateRevisionResponse.java:9` | templateId | U — desktop revision 조회 path |
| `dto/MessageBulkSendResponse.java:8` | batchId | N |
| `dto/MessageResponse.java:21-24` | messageId, senderId, recipientId | U: messageId; N: senderId, recipientId (`messengerApi.ts:80-82`) |
| `dto/RecipientSearchResponse.java:12` | userId | U — desktop 발송 payload |
| `dto/ScheduleResponse.java:23-30` | scheduleId, ownerId, participantIds[] | U: scheduleId; N: ownerId, participantIds |
| `dto/UnreadCountResponse.java:12` | userId | N(내부 호출) |
| `web/collab/dto/ApprovalCollabCommentResponse.java:15,19` | id, parentId | N |
| `web/collab/dto/ApprovalCollabSuggestionResponse.java:17` | id | N |

### inventory-service — 53필드

| 파일:줄 | 필드 | 사용 |
|---|---|---|
| `attachment/web/dto/InspectionAttachmentResponse.java:17-18` | id, inspectionId | U: id; N: inspectionId |
| `realtime/web/dto/InventoryAuditLogResponse.java:14-17` | id, entityId, actorId | N |
| `realtime/web/dto/InventoryEditRequestResponse.java:15-23` | id, entityId, requesterId, decidedById | N |
| `web/dto/AuditDetailResponse.java:52-53` | lines[].id, productId | U 전부 — desktop line mutation/key |
| `web/dto/DeductionResponse.java:9,20` | productId, deductedLots[].lotId | U: productId; N: lotId |
| `web/dto/DpsSaveHistoryDetailResponse.java:26` | id | U — desktop history key |
| `web/dto/DpsSaveHistorySaveResponse.java:14` | id | N |
| `web/dto/DpsSaveHistoryListRow.java:26` | id | U — desktop detail path |
| `web/dto/EcountWarehouseAliasResponse.java:9` | warehouseId | N(내부 호출) |
| `web/dto/InboundInspectionDetailResponse.java:29-30` | inspectionId, slipId | U 전부 — desktop 저장/첨부 path |
| `web/dto/InboundInspectionLineResponse.java:20-21` | lineId, slipLineId | U: lineId; N: slipLineId |
| `web/dto/InboundInspectionLineResult.java:16` | lineId | N(응답 결과에서 직접 미사용) |
| `web/dto/InboundInspectionSummaryResponse.java:26-27` | inspectionId, slipId | U 전부 — desktop row/detail path |
| `web/dto/ProductBalanceResponse.java:18` | productId | U — desktop 재고 매칭 |
| `web/dto/ReservationResponse.java:18` | productId | N(서버 호출 응답) |
| `web/dto/SafetyStockAlertResponse.java:30` | productId | U — desktop 품목 상세 연결 |
| `web/dto/SafetyStockConfigResponse.java:17-18` | id, productId | U 전부 — desktop mutation/filter |
| `web/dto/StockInstanceResponse.java:19,25` | id, productId | U 전부 — desktop row/mutation |
| `web/dto/StockLotResponse.java:12-23` | id, productId, sourceTransferId | U: id, productId; N: sourceTransferId |
| `web/dto/StockMovementResponse.java:11-19` | id, lotId, productId, referenceId | U: id, productId; N: lotId, referenceId |
| `web/dto/TransferDetailResponse.java:14,57-63` | id; lines[].id, productId, sourceLotId, destinationLotId | U: id, lines[].id, productId; N: sourceLotId, destinationLotId |
| `web/dto/TransferResponse.java:12` | id | U — desktop detail path |
| `web/dto/WarehouseByCodeResponse.java:15` | warehouseId | N(내부 호출) |
| `InboundInspectionDetailResponse.java:33`, `InboundInspectionSummaryResponse.java:33` | inspectorId(String UUID 가능) | N |
| `ReservationResponse.java:24`, `StockMovementResponse.java:22` | actorUserId(String UUID) | N |
| `TransferResponse.java:22-23`, `TransferDetailResponse.java:25-26` | requesterId, approverId(String UUID) | N |

### notification-service — 8필드

`dto/ChatRoomMappingResponse.java:17 id`(U desktop admin mutation), `NotificationAdminResponse.java:27,29 requestId,recipientId`(N), `NotificationStatusResponse.java:25,27 requestId,recipientId`(N, 내부), `web/dto/DispatchSmsSaveHistoryDetailResponse.java:12 id`(U desktop), `DispatchSmsSaveHistorySaveResponse.java:12 id`(N), `DispatchSmsSaveHistoryListRow.java:23 id`(U desktop).

### partner-order-service — 14필드

`audit/web/dto/PartnerOrderAuditLogResponse.java:26-29 id,partnerOrderId,actorId`(N), `editrequest/web/dto/PartnerOrderEditRequestResponse.java:18-26 id,partnerOrderId,requesterId,decidedById`(N), `web/collab/dto/PartnerOrderCollabCommentResponse.java:16,20 id,parentId`(N), `PartnerOrderCollabSuggestionResponse.java:17 id`(N), `web/dto/DraftResponse.java:17,25 draftId`(U order-app confirm path `samhanApi.ts:394-401`), `DraftDetailResponse.java:17,26 draftId`(N), `PartnerOrderDetailResponse.java:155-156,189-190 lines[].productId,lineId`(U desktop 상세 line key/payload).

### partner-service — 15필드

`dto/BlockedPartnerResponse.java:22 id`(U desktop), `PartnerBusinessNumberResponse.java:18 partnerId`(N 내부), `PartnerDirectoryResponse.java:23 partnerId`(N 내부), `PartnerInternalResponse.java:29 partnerId`(N 내부), `PartnerQuickSearchResponse.java:8 id`(U desktop 선택값), `PartnerSummaryResponse.java:33 partnerId`(U desktop 상세 연결), `editrequest/web/dto/PartnerEditRequestResponse.java:17-25 requestId,entityId,requesterId,decidedById`(N), `tab/dto/PartnerContactResponse.java:21 id`(U desktop 수정/삭제), `PartnerShippingAddressResponse.java:22 id`(U desktop 수정/삭제), `web/dto/PartnerAttachmentResponse.java:31-40 id,partnerId,uploadedBy`(U: id; N: partnerId, uploadedBy).

### product-service — 10필드

`audit/web/dto/ProductAuditLogResponse.java:15-18 id,productId,actorId`(N), `editrequest/web/dto/ProductEditRequestResponse.java:15-23 id,productId,requesterId,decidedById`(N), `web/dto/EcountAliasResolveResponse.java:6 resolved(UUID)`(N 내부), `ExpandedLineResponse.java:20 productId`(N 내부), `SpecKeyTemplateResponse.java:10 id`(U desktop spec mutation).

### slip-service — 59필드

| 파일:줄 | 필드 | 사용 |
|---|---|---|
| `attachment/web/dto/SlipAttachmentResponse.java:11-12` | id, slipId | U: id; N: slipId |
| `audit/web/dto/SlipAuditLogResponse.java:27-30` | id, slipId, actorId | N |
| `comment/web/dto/SlipCommentResponse.java:22-23` | id, slipId | N |
| `delivery/web/dto/DeliveryBatchResponse.java:29` | id | U desktop batch path |
| `dto/closing/SlipClosingBaselineResponse.java:10` | id | N |
| `dto/cutoff/SlipCutoffResponse.java:22` | id | N |
| `dto/dispatch/ArologisDispatchResponse.java:18-19` | arologisDispatchId, samhanDispatchTaskId | N(서비스 간 DTO) |
| `dto/dispatch/DispatchTaskDetailResponse.java:18,22,31` | id, arologisDispatchId, duplicateSlipIds[] | U: id, arologisDispatchId; N: duplicateSlipIds |
| `DispatchTaskDetailResponse.java:60,94-95` | vehicles[].id; slips[].id, slipId | U 전부 — desktop group/slip mutation |
| `dto/dispatch/DispatchTaskResponse.java:27,31` | id, arologisDispatchId | U 전부 |
| `dto/dispatch/DispatchTaskSummaryResponse.java:11,19` | id, arologisDispatchId | U 전부 |
| `dto/dispatch/DispatchVehicleGroupResponse.java:7` | id | U |
| `dto/dispatch/DispatchVehicleGroupSlipResponse.java:7-8` | id, slipId | U 전부 |
| `dto/dispatch/SlipBoardResponse.java:23` | id | U |
| `dto/dispatchgroup/DispatchGroupResponse.java:14` | slipNos map UUID key | N(서버 조립용) |
| `dto/external/ExternalCarrierResponse.java:15` | id | U desktop |
| `dto/external/ExternalDispatchResponse.java:24` | id | U desktop |
| `editrequest/web/dto/SlipEditRequestResponse.java:33-41` | id, slipId, requesterId, decidedById | N |
| `web/SlipInternalController.java:355,358-359` | lookup.slipId; scan.slipId, productIds[] | N(내부) |
| `web/collab/dto/SlipCollabCommentResponse.java:16,20` | id, parentId | N |
| `SlipCollabSuggestionResponse.java:21` | id | N |
| `web/dispatch/dto/DispatchCollabSuggestionResponse.java:17` | id | N |
| `DispatchCommentResponse.java:16,20` | id, parentId | N |
| `web/dto/AdminSignatureResponse.java:26` | slipId | N |
| `CompensationFailureResponse.java:30` | id | U desktop recovery key |
| `DailyClosingRowResponse.java:35-36` | slipId, lineId | U 전부 — desktop edit payload |
| `ExpandedSlipLineResponse.java:8` | productId | N(lookup 응답에서 modelCode 사용) |
| `InternalSignatureResponse.java:27` | slipId | N(내부) |
| `PartnerLedgerSalesResponse.java:22` | partnerId | N(내부) |
| `SlipCleanupResponse.java:50` | entries[].id | U desktop cleanup key |
| `SlipCleanupSaveHistoryDetailResponse.java:23` | id | U desktop |
| `SlipCleanupSaveHistorySaveResponse.java:12` | id | N |
| `SlipCleanupSaveHistoryListRow.java:25` | id | U desktop |
| `web/dto/SlipSummary.java:16,21,27` | slipId, partnerId, lines[].lineId | U desktop 검색/상세 연결 |
| `estimate/snapshot/web/dto/QuoteSnapshotResponse.java:10,23` | id(String UUID) | U desktop snapshot key |

### user-service — 14필드

`service/dto/EmployeeProjection.java:8 id`(N, 서버 projection), `web/dto/AdminUserCreateResponse.java:26,30 id,departmentId`(U: departmentId; N: id), `BulkVerifyResponse.java:12 exists Map<UUID,Boolean>`(N 내부), `DepartmentResponse.java:8 id`(U desktop), `EmployeeResponse.java:10,15 id,departmentId`(U 전부), `InternalEmployeeCodeResponse.java:6 userId`(N 내부), `InternalEmployeeDirectoryResponse.java:17 userId`(N 내부), `InternalEmployeeLookupResponse.java:6 employeeId`(N 내부), `InternalEmployeeSearchResponse.java:11 userId`(N 내부), `InternalUserResponse.java:17 id`(N 내부), `RoleHistoryResponse.java:21 id`(N), `service/dto/OrgChartNode.java:8 id`(U desktop org tree key).

### raw UUID 필드 0개인 서비스

`api-gateway`, `eureka-server`, `logging-service`, `partner-auth-service`는 위 기준의 raw UUID 응답 DTO가 0개다. `logging-service`의 `resourceId`는 `AuditSanitizer.display(...)`를 거쳐 UUID literal을 가리므로 제외했다(`ActivityLogService.java:71-79`, `SafeAuditLogResponse.java:10-16`).

## ③ 대체 식별자 현황

| 자원군 | 저장소에 이미 있는 식별자 | 근거 | 없는/불충분한 지점 |
|---|---|---|---|
| 슬립·회계전표·세금계산서 | `slipNo`, `journalNo`, `taxInvoiceNo` | `PurchaseAccountingSlipResponse.java:12`, `TaxInvoiceSummaryResponse.java:24`; slip DTO 전반 | audit/edit-request/comment 자체 행 번호는 없음 |
| 거래처 | `partnerCode`, `businessNumber/bizNo` | `PartnerPublicResponse.java:17`, `Partner4TabController.java:77` | 첨부행·담당자행·배송지행 공개키 없음 |
| 품목 | `modelCode`, `productCode` | `ProductCatalogController.java:253,352`, `StockInstanceController.java:293,354` | audit/edit-request/spec-template 자체 행 공개키 없음 |
| 창고·이동 | `warehouseCode`, `transferNo` | `TransferResponse.java:13,16,19` | lot/movement/audit line 공개키 없음 |
| 배차 | `taskCode`, `dispatchDate+dispatchType`, 차량/정차 `sequence`, `driverCode`, `slipNo` | desktop `arologisAdminDispatchApi.ts:28-31,103-115`; D-AX DTO 주석 | admin Dispatch 자체의 단일 공개키는 없음 |
| 결재 | `approvalNo`, 단계 `sequence` | `ApprovalLineAdminResponse.java:36-49` | template/document-template/attachment/schedule/message 공개 번호는 없음 |
| 사용자·조직 | `loginId`, `employeeCode`, 부서명/코드 | `InternalAccountController.java:72`, `InternalUserController.java:188` | permission-group/approval-role 자체 공개 코드는 없음 |
| 임시저장·저장이력 | `draftSeq`, `savedAt`, 사용자 label | `DraftResponse.java:18-21`, 각 `*SaveHistoryListRow` | 현재 mutation endpoint는 UUID id에 의존 |

기존 opaque 패턴도 이미 있다: slip/product/inventory/accounting/notification의 `OpaqueUuidSerializer`·decoder·path converter. 이 표는 새 체계를 선택하지 않고 현재 존재 여부만 기록한다.

## ④ 예외 판단이 필요한 지점

이 정찰에서는 고르지 않는다.

1. **외부 클라이언트 응답만 범위로 볼지, gateway를 통과하지 않는 `/internal/**` 응답도 포함할지**: 결정문은 “API 요청/응답 전부”라고 쓰였고(`docs/decisions/2026-08-13-uuid-never-exposed.md:9`), 과업 지시는 service-to-service UUID는 정상이라고 했다. 두 문장을 함께 적용할 경계 확정이 필요하다. 내부 전용 DTO는 총계에 포함하고 표에서 `내부`로 표시했다.
2. **감사 로그의 저장/조인 UUID와 감사 조회 API 응답 UUID를 같은 것으로 볼지**: 저장된 `actorId/entityId`는 내부 조인·감사 근거다. 그러나 `*AuditLogResponse`는 desktop이 받을 수 있는 API 응답이다. 저장은 정상이라는 사실만으로 응답 예외가 되는지는 별도 판단점이다.
3. **관리자 desktop을 “외부 클라이언트”로 볼지**: 관리자 전용이어도 브라우저/Electron 경계를 넘는다. 현재 `approvalId`, `dispatchId`, 재고 id가 실제로 다음 요청에 재사용된다.
4. **opaque token도 금지 대상인지**: 결정문은 UUID “형태”가 경계를 넘지 않게 하는 기존 codec을 정본으로 적었다. 과업 문구 “UUID는 오직 서버 PK”를 opaque reference 자체 금지로 읽을지는 별도 판단점이다.
5. **`arologis-desktop`, `arologis-mobile`, `mobile-staff`, `internal-chat-desktop`도 클라이언트 소비 조사에 넣을지**: 이번 지시는 `desktop/order-app/estimate-app/mobile` 네 경로를 지정했다. 아로로지스 DTO 일부는 지정 밖 두 클라이언트가 소비한다.
6. **비정형 13 endpoint를 DTO 정비 슬라이스에 함께 넣을지**: DTO 전수 숫자와 별개지만 raw UUID 응답이라는 데이터 경계는 같다.

## ⑤ 착수 계획 제안

판정이나 구현안 선택 없이 의존 순서만 적는다.

1. **슬라이스 A — 직접 소비 55필드**: 응답 필드와 같은 UUID를 받는 path/body/비교/key를 한 묶음으로 추적한다. 단순 삭제 시 동작이 끊기는 범위다.
2. **슬라이스 B — 미사용 217필드**: 외부 controller 응답과 내부 controller 응답을 분리한 목록으로 계약 테스트 대상을 만든다. 네 클라이언트에서 직접 소비는 없다.
3. **슬라이스 C — 비정형 13 endpoint**: `ApiResponse<UUID>`와 UUID map key/value를 DTO 표면과 별도로 다룬다.
4. **슬라이스 D — 예외 경계 확정 후 내부/감사 축**: ④의 결정 결과에 따라 내부 통신·감사 조회를 포함하거나 보존한다.
5. **슬라이스 E — 회귀 계약**: raw UUID literal 응답 0, 기존 공개 식별자 유지, 응답과 다음 요청 경계 동시 검증을 서비스별로 묶는다.

슬라이스 수는 **5개**이며, 순서는 클라이언트 동작 의존성 → 무소비 응답 → 비정형 응답 → 판단 대기 축 → 전수 회귀 계약이다.

## ⑥ 프로세스 회수

- 조사 중 새 애플리케이션·브라우저·Gradle·Node 서버·컨테이너를 기동하지 않았다.
- 사용한 명령은 `rg`, `git/gh` read, 짧은 인라인 Python 정적 파서, `docker ps`, PowerShell 조회뿐이다. 인라인 Python은 명령 종료와 함께 회수됐다.
- 공유 컨테이너는 중지·재시작·변경하지 않았다.
- 시작 시 실행 컨테이너 24개, 종료 시 대조 대상도 24개다.
- 타임아웃된 정적 검색에서 남은 이 정찰 소유 Python wrapper/worker PID `30032/49692`를 명령행·시작시각으로 식별해 회수했다.
- **이 정찰 기동 프로세스 잔여 0개 · 기동 컨테이너 잔여 0개**.
- 환경 전체에는 2026-08-15부터 실행 중인 타 라운드 Python HTTP server 프로세스 8개가 남아 있다. 이 정찰 소유가 아니므로 건드리지 않았다.

## 조사 한계와 재현 기준

- DTO 수치는 raw Java source의 record component/field, 중첩 list/map, `String` 생성 경로(`UUID.toString`)를 교차 집계했다.
- opaque serializer/codec과 `AuditSanitizer.display`가 적용된 필드는 제외했다.
- 클라이언트 사용 수치는 test/mock/fixture/node_modules를 제외한 실행 source의 property read와 다음 요청 사용을 대조했다.
- 현재 worktree에는 다른 라운드의 미추적 파일이 다수 있었으며 읽기만 하고 수정하지 않았다.
