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
import java.util.List;
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
     * <p>권한 검사는 changeSet baseline 정규화 이전에 수행하여 무효 actor 가 수정 경로에
     * 진입하지 못하도록 차단한다.
     *
     * <p>알림 발송은 기존 {@code SlipEditRequestService.notifyTargetRole} 와 동일하게 트랜잭션 내 동기
     * best-effort 다(발송 실패가 수정완료를 되돌리지 않음). 수신자 소수 + 타임아웃 가드로 커넥션 점유는 제한적.
     *
     * @return ACCEPTED 이력과 변경 후 전표 상세
     */
    @Transactional
    public Result commitEdit(SlipDocumentCollaborationPort port, UUID slipId,
                             UUID editorId, String editorName, String changeSet, String reason) {
        // 권한 체크를 baseline 정규화 이전에 수행한다.
        if (!port.canPropose(editorId, slipId) || !port.canDecide(editorId, slipId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "전표 수정완료 권한이 없습니다");
        }

        String validatedChangeSet = port.enrichChangeSetWithBefore(slipId, changeSet);

        SlipDetailResponse updated = port.applyOverlayPatchBatch(slipId, validatedChangeSet, editorId, editorName);

        SlipCollabSuggestion edit = SlipCollabSuggestion.create(
                port.documentType(), slipId, editorId, editorName, validatedChangeSet, blankToNull(reason));
        edit.accept(editorId, editorName);
        SlipCollabSuggestion saved = suggestionRepository.save(edit);

        // 알림 — 기여자+다음결재자에게 best-effort 발송. 기존 SlipEditRequestService.notifyTargetRole 와
        // 동일하게 트랜잭션 내 동기 발송이다(발송 실패가 수정완료 적용/이력 저장을 되돌리지 않음, 수신자 소수
        // + NotificationClient connect/read 타임아웃 가드). collab-core 전 문서가 따를 일관 패턴.
        sendNotifications(
                List.copyOf(port.resolveNotificationRecipients(slipId, editorId)),
                "[전표 수정] " + updated.slipNo(),
                limitBody(String.format("%s 님이 전표 %s 를 수정완료했습니다.%n변경: %s",
                        displayActor(editorName), updated.slipNo(), summarizeChangeSet(validatedChangeSet))),
                updated.slipNo(), editorId);

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
     * 수정완료 적용/이력 저장 후 수신자 목록에 푸시 알림을 발송한다(트랜잭션 내 동기 best-effort).
     *
     * <p>알림은 best-effort 이므로 개별 발송 실패가 전체 수정완료 적용/이력 저장을 되돌리지 않는다.
     * 수신자 식별자(UUID 또는 loginId)는 auth-service 내부 조회로 accountId 로 정규화하며,
     * resolve 실패·중복·현재 수정자는 skip 한다. 본문에는 전표번호·수정자명·필드별 before→after
     * 요약만 포함하고 내부 UUID 는 노출하지 않는다.
     *
     * @param rawRecipients 포트가 모은 수신자 식별자 목록 (UUID 또는 loginId 혼합)
     * @param subject       알림 제목
     * @param body          알림 본문 (2000자 이내)
     * @param slipNo        로그용 전표번호
     * @param editorId      현재 수정자 UUID (self-skip 용)
     */
    private void sendNotifications(List<String> rawRecipients, String subject, String body,
                                   String slipNo, UUID editorId) {
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
                log.warn("[SlipCollab] 전표 수정완료 알림 발송 실패 — slipNo={} recipient={}",
                        slipNo, recipient, ex);
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
