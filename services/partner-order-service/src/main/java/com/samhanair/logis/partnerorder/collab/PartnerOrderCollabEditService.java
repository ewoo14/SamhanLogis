package com.samhanair.logis.partnerorder.collab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.CollabSuggestionService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.NotificationClient;
import com.samhanair.logis.partnerorder.client.UserIdResolver;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
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
 * 주문 협업 1-인 수정완료 서비스.
 *
 * <p>외부 UX 는 제안/수락 2단계가 아니라 권한자 본인의 "수정완료" 1회 커밋이다.
 * 내부 이력 테이블은 {@code partner_order_collab_suggestions} 를 사용하되, 신규 row 는 생성 즉시
 * ACCEPTED 로 닫아 proposer=decider=editor 계약을 보존한다.
 */
@Slf4j
@Service
public class PartnerOrderCollabEditService {

    private final PartnerOrderCollabSuggestionRepository suggestionRepository;
    private final CollabRealtimePublisher publisher;
    private final NotificationClient notificationClient;
    private final UserIdResolver userIdResolver;
    private final ObjectMapper objectMapper;

    public PartnerOrderCollabEditService(PartnerOrderCollabSuggestionRepository suggestionRepository,
                                         CollabRealtimePublisher publisher,
                                         NotificationClient notificationClient,
                                         UserIdResolver userIdResolver,
                                         ObjectMapper objectMapper) {
        this.suggestionRepository = suggestionRepository;
        this.publisher = publisher;
        this.notificationClient = notificationClient;
        this.userIdResolver = userIdResolver;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
    }

    /**
     * changeSet 검증, overlay batch 적용, ACCEPTED 이력 저장을 하나의 트랜잭션으로 수행한다.
     *
     * <p>알림 발송은 트랜잭션 내 동기 best-effort 다. 발송 실패가 수정완료 적용/이력 저장을 되돌리지 않는다.
     *
     * @return ACCEPTED 이력과 변경 후 주문 상세
     */
    @Transactional
    public Result commitEdit(PartnerOrderDocumentCollaborationPort port, UUID orderId,
                             UUID editorId, String editorName, String changeSet, String reason) {
        if (!port.canPropose(editorId, orderId) || !port.canDecide(editorId, orderId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "주문 수정완료 권한이 없습니다");
        }

        String enrichedChangeSet = port.enrichChangeSetWithBefore(orderId, changeSet);

        PartnerOrderDetailResponse updated = port.applyOverlayPatchBatch(
                orderId, enrichedChangeSet, editorId, editorName);

        PartnerOrderCollabSuggestion edit = PartnerOrderCollabSuggestion.create(
                port.documentType(), orderId, editorId, editorName, enrichedChangeSet, blankToNull(reason));
        edit.accept(editorId, editorName);
        PartnerOrderCollabSuggestion saved = suggestionRepository.save(edit);

        sendNotifications(
                List.copyOf(port.resolveNotificationRecipients(orderId, editorId)),
                "[주문 수정] " + updated.orderNumber(),
                limitBody(String.format("%s 님이 주문 %s 를 수정완료했습니다.%n변경: %s",
                        displayActor(editorName), updated.orderNumber(), summarizeChangeSet(enrichedChangeSet))),
                updated.orderNumber(), editorId);

        publisher.publish(orderId, CollabSuggestionService.EVENT_SUGGESTION_ACCEPTED,
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

    private void sendNotifications(List<String> rawRecipients, String subject, String body,
                                   String orderNo, UUID editorId) {
        Set<UUID> recipients = new LinkedHashSet<>();
        for (String rawRecipient : rawRecipients) {
            userIdResolver.resolve(rawRecipient)
                    .filter(resolved -> !resolved.equals(editorId))
                    .ifPresent(recipients::add);
        }
        if (recipients.isEmpty()) {
            return;
        }

        for (UUID recipient : recipients) {
            try {
                notificationClient.sendUserPush(recipient, subject, body);
            } catch (RuntimeException ex) {
                log.warn("[PartnerOrderCollab] 주문 수정완료 알림 발송 실패 — orderNo={} recipient={}",
                        orderNo, recipient, ex);
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
                joiner.add(field.getKey() + ": " + compact(before) + " → " + compact(after));
            }
            String summary = joiner.toString();
            return summary.isBlank() ? "변경 내역을 확인하세요." : summary;
        } catch (com.fasterxml.jackson.core.JsonProcessingException | RuntimeException ex) {
            log.debug("[PartnerOrderCollab] 주문 수정완료 알림 changeSet 요약 실패", ex);
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
    public record Result(PartnerOrderCollabSuggestion edit, PartnerOrderDetailResponse order) {
    }
}
