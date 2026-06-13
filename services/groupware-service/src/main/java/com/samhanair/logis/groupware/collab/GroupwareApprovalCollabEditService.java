package com.samhanair.logis.groupware.collab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.CollabSuggestionService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.dto.ApprovalLineAdminResponse;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.notification.publisher.NotificationSeverity;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.StringJoiner;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 그룹웨어 결재 협업 1-인 수정완료 서비스.
 *
 * <p>외부 UX 는 제안/수락 2단계가 아니라 권한자 본인의 "수정완료" 1회 커밋이다.
 * 내부 이력 테이블은 {@code approval_collab_suggestions} 를 사용하되, 신규 row 는 생성 즉시
 * ACCEPTED 로 닫아 proposer=decider=editor 계약을 보존한다.
 */
@Slf4j
@Service
public class GroupwareApprovalCollabEditService {

    private final ApprovalCollabSuggestionRepository suggestionRepository;
    private final CollabRealtimePublisher publisher;
    private final NotificationPublisher notificationPublisher;
    private final ObjectMapper objectMapper;

    public GroupwareApprovalCollabEditService(ApprovalCollabSuggestionRepository suggestionRepository,
                                              CollabRealtimePublisher publisher,
                                              NotificationPublisher notificationPublisher,
                                              ObjectMapper objectMapper) {
        this.suggestionRepository = suggestionRepository;
        this.publisher = publisher;
        this.notificationPublisher = notificationPublisher;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
    }

    /**
     * changeSet 검증, overlay batch 적용, ACCEPTED 이력 저장을 하나의 트랜잭션으로 수행한다.
     *
     * <p>알림 발송은 트랜잭션 내 동기 best-effort 다. 발송 실패가 수정완료 적용/이력 저장을
     * 되돌리지 않는다.
     */
    @Transactional
    public Result commitEdit(GroupwareApprovalDocumentCollaborationPort port, UUID approvalId,
                             UUID editorId, String editorName, String changeSet, String reason) {
        if (!port.canPropose(editorId, approvalId) || !port.canDecide(editorId, approvalId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "결재 수정완료 권한이 없습니다");
        }

        String enrichedChangeSet = port.enrichChangeSetWithBefore(approvalId, changeSet);
        ApprovalLineAdminResponse updated = port.applyOverlayPatchBatch(
                approvalId, enrichedChangeSet, editorId, editorName);

        ApprovalCollabSuggestion edit = ApprovalCollabSuggestion.create(
                port.documentType(), approvalId, editorId, editorName, enrichedChangeSet, blankToNull(reason));
        edit.accept(editorId, editorName);
        ApprovalCollabSuggestion saved = suggestionRepository.save(edit);

        // 알림 = 트랜잭션 내 동기 best-effort (§7 에픽 결정 — AFTER_COMMIT 금지).
        sendNotifications(
                List.copyOf(port.resolveNotificationRecipients(approvalId, editorId)),
                "[결재 수정] " + updated.approvalNo(),
                limitBody(String.format("%s 님이 결재 %s 를 수정완료했습니다.%n변경: %s",
                        displayActor(editorName), updated.approvalNo(), summarizeChangeSet(enrichedChangeSet))),
                updated.approvalNo(),
                approvalId);

        publisher.publish(approvalId, CollabSuggestionService.EVENT_SUGGESTION_ACCEPTED,
                java.util.Map.of(
                        "id", saved.getId().toString(),
                        "documentType", saved.getDocumentType().name(),
                        "proposerName", saved.getProposerName(),
                        "status", saved.getStatus().name(),
                        "decidedByName", saved.getDecidedByName()));
        return new Result(saved, updated);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private void sendNotifications(List<String> rawRecipients, String title, String body,
                                   String approvalNo, UUID approvalId) {
        Set<UUID> recipients = new LinkedHashSet<>();
        for (String rawRecipient : rawRecipients) {
            try {
                recipients.add(UUID.fromString(rawRecipient));
            } catch (IllegalArgumentException ex) {
                log.debug("[ApprovalCollab] UUID 가 아닌 알림 수신자 skip — raw={}", rawRecipient);
            }
        }
        for (UUID recipient : recipients) {
            try {
                notificationPublisher.publish(new NotificationPublishRequest(
                        "APPROVAL",
                        NotificationSeverity.INFO,
                        title,
                        body,
                        null,
                        recipient,
                        null,
                        approvalNo,
                        "/groupware/approvals/" + approvalId
                ));
            } catch (RuntimeException ex) {
                log.warn("[ApprovalCollab] 결재 수정완료 알림 발송 실패 — approvalNo={} recipient={}",
                        approvalNo, recipient, ex);
            }
        }
    }

    private String summarizeChangeSet(String enrichedChangeSet) {
        try {
            JsonNode root = objectMapper.readTree(enrichedChangeSet);
            if (root == null || !root.isObject()) {
                return "변경 내역을 확인하세요.";
            }
            StringJoiner joiner = new StringJoiner("; ");
            Iterator<java.util.Map.Entry<String, JsonNode>> fields = root.fields();
            while (fields.hasNext()) {
                java.util.Map.Entry<String, JsonNode> field = fields.next();
                JsonNode change = field.getValue();
                String before = readNullableText(change, "before");
                String after = readNullableText(change, "after");
                joiner.add(field.getKey() + ": " + compact(before) + " -> " + compact(after));
            }
            String summary = joiner.toString();
            return summary.isBlank() ? "변경 내역을 확인하세요." : summary;
        } catch (com.fasterxml.jackson.core.JsonProcessingException | RuntimeException ex) {
            log.debug("[ApprovalCollab] 결재 수정완료 알림 changeSet 요약 실패", ex);
            return "변경 내역을 확인하세요.";
        }
    }

    private String readNullableText(JsonNode change, String fieldName) {
        if (change == null || !change.has(fieldName) || change.get(fieldName).isNull()) {
            return "(비어 있음)";
        }
        JsonNode value = change.get(fieldName);
        if (value.isTextual() || value.isNumber() || value.isBoolean()) {
            return value.asText();
        }
        return value.toString();
    }

    private String compact(String value) {
        String normalized = value == null ? "(비어 있음)" : value.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= 120) {
            return normalized;
        }
        return normalized.substring(0, 117) + "...";
    }

    private String displayActor(String editorName) {
        return editorName == null || editorName.isBlank() ? "수정자" : editorName;
    }

    private String limitBody(String body) {
        if (body.length() <= 2000) {
            return body;
        }
        return body.substring(0, 1997) + "...";
    }

    /** 수정완료 결과. */
    public record Result(ApprovalCollabSuggestion edit, ApprovalLineAdminResponse approval) {
    }
}
