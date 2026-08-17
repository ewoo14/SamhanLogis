param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$targets = @{
    'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/collab/dto/JournalCollabCommentResponse.java' = @('id', 'parentId')
    'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/collab/dto/JournalCollabSuggestionResponse.java' = @('id')
    'services/arologis-service/src/main/java/com/samhanair/logis/arologis/realtime/web/dto/ArologisAuditLogResponse.java' = @('id', 'entityId', 'actorId')
    'services/arologis-service/src/main/java/com/samhanair/logis/arologis/realtime/web/dto/ArologisEditRequestResponse.java' = @('id', 'entityId', 'requesterId', 'decidedById')
    'services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/MessageBulkSendResponse.java' = @('batchId')
    'services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleResponse.java' = @('ownerId', 'participantIds')
    'services/groupware-service/src/main/java/com/samhanair/logis/groupware/web/collab/dto/ApprovalCollabCommentResponse.java' = @('id', 'parentId')
    'services/groupware-service/src/main/java/com/samhanair/logis/groupware/web/collab/dto/ApprovalCollabSuggestionResponse.java' = @('id')
    'services/inventory-service/src/main/java/com/samhanair/logis/inventory/realtime/web/dto/InventoryAuditLogResponse.java' = @('id', 'entityId', 'actorId')
    'services/inventory-service/src/main/java/com/samhanair/logis/inventory/realtime/web/dto/InventoryEditRequestResponse.java' = @('id', 'entityId', 'requesterId', 'decidedById')
    'services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/DeductionResponse.java' = @('lotId')
    'services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/DpsSaveHistorySaveResponse.java' = @('id')
    'services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/InboundInspectionLineResult.java' = @('lineId')
    'services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/StockLotResponse.java' = @('sourceTransferId')
    'services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/StockMovementResponse.java' = @('lotId', 'referenceId', 'actorUserId')
    'services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/TransferDetailResponse.java' = @('sourceLotId', 'destinationLotId', 'requesterId', 'approverId')
    'services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/TransferResponse.java' = @('requesterId', 'approverId')
    'services/slip-service/src/main/java/com/samhanair/logis/slip/attachment/web/dto/SlipAttachmentResponse.java' = @('slipId')
    'services/slip-service/src/main/java/com/samhanair/logis/slip/comment/web/dto/SlipCommentResponse.java' = @('id', 'slipId')
    'services/slip-service/src/main/java/com/samhanair/logis/slip/dto/closing/SlipClosingBaselineResponse.java' = @('id')
    'services/slip-service/src/main/java/com/samhanair/logis/slip/dto/cutoff/SlipCutoffResponse.java' = @('id')
    'services/slip-service/src/main/java/com/samhanair/logis/slip/web/collab/dto/SlipCollabCommentResponse.java' = @('id', 'parentId')
    'services/slip-service/src/main/java/com/samhanair/logis/slip/web/collab/dto/SlipCollabSuggestionResponse.java' = @('id')
    'services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatch/dto/DispatchCollabSuggestionResponse.java' = @('id')
    'services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatch/dto/DispatchCommentResponse.java' = @('id', 'parentId')
    'services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipCleanupSaveHistorySaveResponse.java' = @('id')
}

$failures = [System.Collections.Generic.List[string]]::new()
foreach ($entry in $targets.GetEnumerator()) {
    $path = Join-Path $Root $entry.Key
    $source = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    foreach ($field in $entry.Value) {
        if ($source -match "(?m)^\s*(?:UUID|String|List<[^>]+>)\s+$([regex]::Escape($field))\b") {
            $failures.Add("$($entry.Key): $field")
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Output "UUID 미사용 응답 필드가 아직 존재합니다: $($failures.Count)"
    $failures
    exit 1
}

Write-Output "UUID 미사용 응답 필드 제거 계약 통과: $($targets.Count) DTO"
