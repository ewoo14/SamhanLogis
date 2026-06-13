package com.samhanair.logis.slip.collab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.CollabSuggestionService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.UserIdResolver;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.StringJoiner;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 전표 협업 1-인 수정완료 서비스.
 *
 * <p>외부 UX 는 제안/수락 2단계가 아니라 권한자 본인의 "수정완료" 1회 커밋이다.
 * 내부 이력 테이블은 기존 {@code slip_collab_suggestions} 를 재사용하되, 신규 row 는
 * 생성 즉시 ACCEPTED 로 닫아 proposer=decider=editor 계약을 보존한다.
 */
@Slf4j
@Service
public class SlipCollabEditService {

    private final SlipCollabSuggestionRepository suggestionRepository;
    private final CollabRealtimePublisher publisher;
    private final NotificationClient notificationClient;
    private final UserIdResolver userIdResolver;
    private final ObjectMapper objectMapper;

    public SlipCollabEditService(SlipCollabSuggestionRepository suggestionRepository,
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
     * @return ACCEPTED 이력과 변경 후 전표 상세
     */
    @Transactional
    public Result commitEdit(SlipDocumentCollaborationPort port, UUID slipId,
                             UUID editorId, String editorName, String changeSet, String reason) {
        String enrichedChangeSet = port.enrichChangeSetWithBefore(slipId, changeSet);
        if (!port.canPropose(editorId, slipId) || !port.canDecide(editorId, slipId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "전표 수정완료 권한이 없습니다");
        }

        SlipDetailResponse updated = port.applyOverlayPatchBatch(slipId, enrichedChangeSet, editorId, editorName);

        SlipCollabSuggestion edit = SlipCollabSuggestion.create(
                port.documentType(), slipId, editorId, editorName, enrichedChangeSet, blankToNull(reason));
        edit.accept(editorId, editorName);
        SlipCollabSuggestion saved = suggestionRepository.save(edit);
        notifyResolvedRecipients(port, slipId, editorId, updated, editorName, enrichedChangeSet);
        publisher.publish(slipId, CollabSuggestionService.EVENT_SUGGESTION_ACCEPTED,
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

    /**
     * 수정완료 성공 후 해당 전표의 기여자와 다음 결재자에게 푸시 알림을 보낸다.
     *
     * <p>알림은 전표 수정 트랜잭션의 부가 효과이므로 실패해도 수정완료 적용/이력 저장을 되돌리지 않는다.
     * 수신자 식별자는 도메인 포트가 작성자/수정 이력/댓글/다음 결재자에서 모으고, UUID 가 아닌
     * username 은 auth-service 내부 조회로 accountId 를 확인한다. null/blank, resolve 실패, 중복,
     * 현재 수정자는 skip 한다. 본문에는 전표번호·수정자명·필드별 before→after 요약만 포함하고 내부
     * UUID 는 노출하지 않는다.
     */
    private void notifyResolvedRecipients(SlipDocumentCollaborationPort port, UUID slipId, UUID editorId,
                                          SlipDetailResponse slip, String editorName,
                                          String enrichedChangeSet) {
        Set<UUID> recipients = new LinkedHashSet<>();
        for (String rawRecipient : port.resolveNotificationRecipients(slipId, editorId)) {
            userIdResolver.resolve(rawRecipient)
                    .filter(resolved -> !resolved.equals(editorId))
                    .ifPresent(recipients::add);
        }
        if (recipients.isEmpty()) {
            return;
        }

        String subject = "[전표 수정] " + slip.slipNo();
        String body = limitBody(String.format("%s 님이 전표 %s 를 수정완료했습니다.%n변경: %s",
                displayActor(editorName), slip.slipNo(), summarizeChangeSet(enrichedChangeSet)));
        for (UUID recipient : recipients) {
            try {
                notificationClient.sendUserPush(recipient, subject, body);
            } catch (RuntimeException ex) {
                log.warn("[SlipCollab] 전표 수정완료 알림 발송 실패 — slipNo={} recipient={}",
                        slip.slipNo(), recipient, ex);
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
            log.debug("[SlipCollab] 전표 수정완료 알림 changeSet 요약 실패", ex);
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
    public record Result(SlipCollabSuggestion edit, SlipDetailResponse slip) {
    }
}
