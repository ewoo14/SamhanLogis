package com.samhanair.logis.accounting.collab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.NotificationClient;
import com.samhanair.logis.accounting.client.UserIdResolver;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.CollabSuggestionService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
 * 회계전표 협업 1-인 수정완료 서비스.
 *
 * <p>외부 UX 는 제안/수락 2단계가 아니라 권한자 본인의 "수정완료" 1회 커밋이다.
 * 내부 이력 테이블은 {@code journal_collab_suggestions} 를 사용하되, 신규 row 는 생성 즉시
 * ACCEPTED 로 닫아 proposer=decider=editor 계약을 보존한다.
 */
@Slf4j
@Service
public class JournalCollabEditService {

    private final JournalCollabSuggestionRepository suggestionRepository;
    private final CollabRealtimePublisher publisher;
    private final NotificationClient notificationClient;
    private final UserIdResolver userIdResolver;
    private final ObjectMapper objectMapper;

    public JournalCollabEditService(JournalCollabSuggestionRepository suggestionRepository,
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
     * @return ACCEPTED 이력과 변경 후 회계전표 상세
     */
    @Transactional
    public Result commitEdit(JournalDocumentCollaborationPort port, UUID journalId,
                             UUID editorId, String editorName, String changeSet, String reason) {
        if (!port.canPropose(editorId, journalId) || !port.canDecide(editorId, journalId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "회계전표 수정완료 권한이 없습니다");
        }

        String enrichedChangeSet = port.enrichChangeSetWithBefore(journalId, changeSet);

        JournalDetailResponse updated = port.applyOverlayPatchBatch(journalId, enrichedChangeSet, editorId, editorName);

        JournalCollabSuggestion edit = JournalCollabSuggestion.create(
                port.documentType(), journalId, editorId, editorName, enrichedChangeSet, blankToNull(reason));
        edit.accept(editorId, editorName);
        JournalCollabSuggestion saved = suggestionRepository.save(edit);

        sendNotifications(
                List.copyOf(port.resolveNotificationRecipients(journalId, editorId)),
                "[회계전표 수정] " + updated.journalNo(),
                limitBody(String.format("%s 님이 회계전표 %s 를 수정완료했습니다.%n변경: %s",
                        displayActor(editorName), updated.journalNo(), summarizeChangeSet(enrichedChangeSet))),
                updated.journalNo(), editorId);

        publisher.publish(journalId, CollabSuggestionService.EVENT_SUGGESTION_ACCEPTED,
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
                                   String journalNo, UUID editorId) {
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
                log.warn("[JournalCollab] 회계전표 수정완료 알림 발송 실패 — journalNo={} recipient={}",
                        journalNo, recipient, ex);
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
            log.debug("[JournalCollab] 회계전표 수정완료 알림 changeSet 요약 실패", ex);
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
    public record Result(JournalCollabSuggestion edit, JournalDetailResponse journal) {
    }
}
