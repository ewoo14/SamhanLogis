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
    private final NotificationClient notificationClient;
    private final UserIdResolver userIdResolver;
    private final ObjectMapper objectMapper;
    private final Executor notificationExecutor;

    public SlipCollabEditService(SlipCollabSuggestionRepository suggestionRepository,
                                 CollabRealtimePublisher publisher,
                                 NotificationClient notificationClient,
                                 UserIdResolver userIdResolver,
                                 ObjectMapper objectMapper,
                                 @Qualifier("applicationTaskExecutor") Executor notificationExecutor) {
        this.suggestionRepository = suggestionRepository;
        this.publisher = publisher;
        this.notificationClient = notificationClient;
        this.userIdResolver = userIdResolver;
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
        scheduleNotifications(
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
     * 저장 transaction 이 성공한 뒤에만 알림 작업을 executor 로 넘긴다.
     *
     * <p>커밋 전에 executor 를 호출하면 외부 호출이 커밋보다 먼저 시작될 수 있어 phantom 알림이 생긴다.
     * 반대로 afterCommit 안에서 동기 발송하면 행 잠금은 풀려도 수정완료 응답이 외부 timeout 만큼 멈춘다.
     * 두 경계를 모두 지키기 위해 afterCommit 에서는 작업 제출만 수행한다.
     */
    private void scheduleNotifications(List<String> rawRecipients, String subject, String body,
                                       String slipNo, UUID editorId) {
        Runnable notificationTask = () -> sendNotifications(rawRecipients, subject, body, slipNo, editorId);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatchNotifications(notificationTask, slipNo);
                }
            });
            return;
        }
        // 트랜잭션 없는 단위 호출은 기존 best-effort 의미를 유지하되, 외부 호출은 여전히 비동기다.
        dispatchNotifications(notificationTask, slipNo);
    }

    private void dispatchNotifications(Runnable notificationTask, String slipNo) {
        try {
            notificationExecutor.execute(notificationTask);
        } catch (java.util.concurrent.RejectedExecutionException ex) {
            // 알림은 보조 신호이지만 큐 포화로 조용히 누락시키지 않는다. 커밋 후 현재 스레드에서
            // 마지막 best-effort 로 실행하여 저장 성공과 알림 실패를 분리한다.
            log.warn("[SlipCollab] 전표 수정완료 알림 비동기 제출 거부 — slipNo={}", slipNo, ex);
            try {
                notificationTask.run();
            } catch (RuntimeException taskFailure) {
                log.warn("[SlipCollab] 전표 수정완료 알림 fallback 실패 — slipNo={}", slipNo, taskFailure);
            }
        }
    }

    /**
     * 커밋 후 수신자 목록에 푸시 알림을 발송한다(best-effort).
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
