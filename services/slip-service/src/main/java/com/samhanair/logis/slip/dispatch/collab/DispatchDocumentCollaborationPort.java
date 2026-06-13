package com.samhanair.logis.slip.dispatch.collab;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskDetailResponse;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskHistoryQueryService;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차 협업 포트.
 *
 * <p>collab-core 는 changeSet 구조만 전달하고 실제 mutation 은 본 포트가 DispatchTask 도메인
 * 경로로 연결한다. 편집 범위는 배차 무결성에 영향이 없는 비고({@code memo}) 단일 필드만
 * 허용한다. taskCode/status/기사/차량/전표 구성 등 핵심 필드는 400 으로 거부한다.
 */
@Component
public class DispatchDocumentCollaborationPort implements DocumentCollaborationPort {

    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);
    private static final String SYSTEM_ACTOR_NAME = "협업 제안";

    private final DispatchTaskRepository taskRepository;
    private final DispatchTaskHistoryQueryService historyQueryService;
    private final ObjectMapper objectMapper;
    private final DispatchCollabSuggestionRepository suggestionRepository;
    private final DispatchCollabCommentRepository commentRepository;

    public DispatchDocumentCollaborationPort(DispatchTaskRepository taskRepository,
                                             DispatchTaskHistoryQueryService historyQueryService,
                                             ObjectMapper objectMapper,
                                             DispatchCollabSuggestionRepository suggestionRepository,
                                             DispatchCollabCommentRepository commentRepository) {
        this.taskRepository = taskRepository;
        this.historyQueryService = historyQueryService;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
        this.suggestionRepository = suggestionRepository;
        this.commentRepository = commentRepository;
    }

    @Override
    public CollabDocumentType documentType() {
        return CollabDocumentType.DISPATCH_TASK;
    }

    /** 현재 배차 task snapshot 을 JSON 문자열로 반환한다. */
    @Override
    @Transactional(readOnly = true)
    public String loadSnapshot(UUID documentId) {
        DispatchTask task = loadTask(documentId);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("taskCode", task.getTaskCode());
        snapshot.put("status", task.getStatus().name());
        snapshot.put("dispatchDate", task.getDispatchDate().toString());
        snapshot.put("memo", task.getMemo());
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "배차 스냅샷 직렬화 실패");
        }
    }

    /** path -> {after} changeSet 을 배차 overlay patch 경로로 적용한다. */
    @Override
    @Transactional
    public void applyChangeSet(UUID documentId, String changeSetJson) {
        applyOverlayPatchBatch(documentId, changeSetJson, SYSTEM_ACTOR_ID, SYSTEM_ACTOR_NAME);
    }

    /**
     * 수정완료 actor 로 overlay batch 를 적용한다.
     *
     * @param documentId DispatchTask UUID
     * @param changeSetJson path -> {before, after} JSON
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @return 변경 후 배차 상세
     */
    @Transactional
    public DispatchTaskDetailResponse applyOverlayPatchBatch(UUID documentId, String changeSetJson,
                                                             UUID actorId, String actorName) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        DispatchTask task = loadTask(documentId);
        task.guardCollabModifiable();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            applyOverlayField(task, patch.getKey(), patch.getValue());
        }
        taskRepository.save(task);
        return historyQueryService.detail(documentId);
    }

    /**
     * changeSet JSON 의 구조와 배차 핵심 필드 불변 정책을 수정완료 저장 전 조기 검증한다.
     *
     * @param changeSetJson 검증 대상 changeSet JSON 문자열
     */
    public void validateChangeSet(String changeSetJson) {
        parseChangeSet(changeSetJson);
    }

    /**
     * changeSet 에 현재 배차 task 의 before 값을 보강한다.
     *
     * @param documentId DispatchTask UUID
     * @param changeSetJson path -> {after} JSON
     * @return path -> {before, after} JSON
     */
    @Transactional(readOnly = true)
    public String enrichChangeSetWithBefore(UUID documentId, String changeSetJson) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        DispatchTask task = loadTask(documentId);
        com.fasterxml.jackson.databind.node.ObjectNode root = objectMapper.createObjectNode();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            com.fasterxml.jackson.databind.node.ObjectNode change = objectMapper.createObjectNode();
            String before = readOverlayField(task, patch.getKey());
            if (before == null) {
                change.putNull("before");
            } else {
                change.put("before", before);
            }
            Object after = patch.getValue();
            if (after == null) {
                change.putNull("after");
            } else {
                change.put("after", String.valueOf(after));
            }
            root.set(patch.getKey(), change);
        }
        try {
            return objectMapper.writeValueAsString(root);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "배차 수정 이력 changeSet 직렬화 실패");
        }
    }

    /**
     * snapshot JSON 으로 memo 만 복원한다.
     *
     * <p>배차번호/상태/일자/차량/전표/기사 필드는 snapshot 에 있더라도 복원하지 않는다.
     */
    @Override
    @Transactional
    public void restoreSnapshot(UUID documentId, String snapshotJson) {
        JsonNode root = parseObject(snapshotJson, "snapshot");
        if (!root.has("memo")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "배차 스냅샷에 복원할 memo 필드가 없습니다");
        }
        DispatchTask task = loadTask(documentId);
        task.overlayMemo(toNullableText(root.get("memo")));
        taskRepository.save(task);
    }

    /** 제안 가능 여부를 판정한다. 실제 권한은 컨트롤러 guard 가 담당한다. */
    @Override
    public boolean canPropose(UUID userId, UUID documentId) {
        return userId != null && !SYSTEM_ACTOR_ID.equals(userId);
    }

    /** 수락/거절 가능 여부를 판정한다. 실제 권한은 컨트롤러 guard 가 담당한다. */
    @Override
    public boolean canDecide(UUID userId, UUID documentId) {
        return canPropose(userId, documentId);
    }

    /**
     * 배차 수정완료 알림 수신자를 해석한다.
     *
     * <p>배차 결재자는 없으므로 DispatchTask createdBy, 수정 이력 proposer/decider, 댓글 author 만
     * distinct 로 합산하고 현재 수정자는 제외한다.
     */
    @Override
    @Transactional(readOnly = true)
    public Set<String> resolveNotificationRecipients(UUID documentId, UUID excludeUserId) {
        DispatchTask task = loadTask(documentId);
        Set<String> recipients = new LinkedHashSet<>();
        addRecipient(recipients, task.getCreatedBy(), excludeUserId);
        suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType(), documentId)
                .forEach(suggestion -> {
                    addRecipient(recipients, suggestion.getProposerId().toString(), excludeUserId);
                    addRecipient(recipients,
                            suggestion.getDecidedById() == null ? null : suggestion.getDecidedById().toString(),
                            excludeUserId);
                });
        commentRepository.findRecent(documentType(), documentId,
                        org.springframework.data.domain.Pageable.unpaged())
                .forEach(comment -> addRecipient(recipients, comment.getAuthorId().toString(), excludeUserId));
        return recipients;
    }

    private void applyOverlayField(DispatchTask task, String fieldName, Object value) {
        if ("memo".equals(fieldName)) {
            task.overlayMemo(value == null ? null : String.valueOf(value));
            return;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "배차 협업은 memo 만 수정할 수 있습니다: " + fieldName);
    }

    private String readOverlayField(DispatchTask task, String fieldName) {
        if ("memo".equals(fieldName)) {
            return task.getMemo();
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "지원하지 않는 배차 overlay 필드입니다: " + fieldName);
    }

    private Map<String, Object> parseChangeSet(String changeSetJson) {
        JsonNode root = parseObject(changeSetJson, "changeSet");
        Map<String, Object> patches = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> fields = root.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String fieldName = normalizeAndValidatePath(entry.getKey());
            JsonNode change = entry.getValue();
            if (change == null || !change.isObject() || !change.has("after")) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "changeSet entry 는 after 필드를 가진 JSON object 여야 합니다: " + entry.getKey());
            }
            patches.put(fieldName, toNullableText(change.get("after")));
        }
        if (patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet 에 적용할 필드가 없습니다");
        }
        return patches;
    }

    private String normalizeAndValidatePath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet path 는 필수입니다");
        }
        String normalized = rawPath.trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        normalized = normalized.replace("/", ".");
        if ("memo".equals(normalized)) {
            return normalized;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "배차 협업은 memo 만 수정할 수 있습니다: " + rawPath);
    }

    private DispatchTask loadTask(UUID documentId) {
        return taskRepository.findByIdAndIsDeletedFalse(documentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "배차 작업을 찾을 수 없습니다: " + documentId));
    }

    private void addRecipient(Set<String> recipients, String rawUserId, UUID excludeUserId) {
        if (rawUserId == null || rawUserId.isBlank()) {
            return;
        }
        String normalized = rawUserId.trim();
        if (excludeUserId != null && excludeUserId.toString().equals(normalized)) {
            return;
        }
        recipients.add(normalized);
    }

    private JsonNode parseObject(String json, String label) {
        if (json == null || json.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, label + " 은 필수입니다");
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        label + " 은 JSON object 여야 합니다");
            }
            return node;
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + " JSON 형식이 올바르지 않습니다");
        }
    }

    private String toNullableText(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isTextual() || node.isNumber() || node.isBoolean()) {
            return node.asText();
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "changeSet after 값을 문자열로 변환할 수 없습니다");
        }
    }
}
