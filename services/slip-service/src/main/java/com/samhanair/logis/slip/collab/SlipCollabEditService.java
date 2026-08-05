package com.samhanair.logis.slip.collab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.CollabSuggestionService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import java.util.Iterator;
import java.util.List;
import java.util.StringJoiner;
import java.util.UUID;
import java.util.concurrent.Executor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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
    private final SlipCollabNotificationOutboxService notificationOutboxService;
    private final ObjectMapper objectMapper;
    private final Executor notificationExecutor;

    public SlipCollabEditService(SlipCollabSuggestionRepository suggestionRepository,
                                 CollabRealtimePublisher publisher,
                                 SlipCollabNotificationOutboxService notificationOutboxService,
                                 ObjectMapper objectMapper,
                                 @Qualifier("applicationTaskExecutor") Executor notificationExecutor) {
        this.suggestionRepository = suggestionRepository;
        this.publisher = publisher;
        this.notificationOutboxService = notificationOutboxService;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
        this.notificationExecutor = notificationExecutor;
    }

    /**
     * changeSet 검증, overlay batch 적용, ACCEPTED 이력 저장을 하나의 트랜잭션으로 수행한다.
     *
     * <p>권한 검사는 changeSet baseline 정규화 이전에 수행하여 무효 actor 가 수정 경로에
     * 진입하지 못하도록 차단한다.
     *
     * <p>알림 수신자 스냅샷만 트랜잭션 안에서 확정하고, 실제 auth 조회·푸시는 커밋 후 비동기로 실행한다.
     * 따라서 외부 호출 지연이 행 잠금과 요청 응답을 막지 않으며, 롤백된 변경의 알림도 발송하지 않는다.
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

        // 수신자 식별자와 본문은 커밋 전 스냅샷으로 고정한다. 실제 auth/notification 외부 호출은
        // afterCommit 이후 비동기로 넘겨, 이미 성공한 저장과 이력만 알림 대상으로 삼는다.
        String subject = "[전표 수정] " + updated.slipNo();
        String body = limitBody(String.format("%s 님이 전표 %s 를 수정완료했습니다.%n변경: %s",
                displayActor(editorName), updated.slipNo(), summarizeChangeSet(validatedChangeSet)));
        notificationOutboxService.enqueue(
                List.copyOf(port.resolveNotificationRecipients(slipId, editorId)),
                slipId, editorId, subject, body);
        scheduleNotifications();

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
     * 저장 transaction 이 성공한 뒤에만 알림 작업을 executor 로 넘긴다.
     *
     * <p>커밋 전에 executor 를 호출하면 외부 호출이 커밋보다 먼저 시작될 수 있어 phantom 알림이 생긴다.
     * 반대로 afterCommit 안에서 동기 발송하면 행 잠금은 풀려도 수정완료 응답이 외부 timeout 만큼 멈춘다.
     * 두 경계를 모두 지키기 위해 afterCommit 에서는 작업 제출만 수행한다.
     */
    private void scheduleNotifications() {
        Runnable notificationTask = notificationOutboxService::drainPending;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatchNotifications(notificationTask);
                }
            });
            return;
        }
        // 트랜잭션 없는 단위 호출은 기존 best-effort 의미를 유지하되, 외부 호출은 여전히 비동기다.
        dispatchNotifications(notificationTask);
    }

    private void dispatchNotifications(Runnable notificationTask) {
        try {
            notificationExecutor.execute(notificationTask);
        } catch (java.util.concurrent.RejectedExecutionException ex) {
            // row는 이미 커밋된 durable outbox에 있으므로 scheduler가 다음 기회에 회수한다.
            log.warn("[SlipCollab] durable 알림 worker 제출 거부 — scheduler 재회수 대기", ex);
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
