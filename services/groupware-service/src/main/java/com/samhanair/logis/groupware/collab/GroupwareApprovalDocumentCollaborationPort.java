package com.samhanair.logis.groupware.collab;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.dto.ApprovalLineAdminResponse;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 그룹웨어 결재 협업 포트.
 *
 * <p>collab-core 는 changeSet 구조만 전달하고 실제 mutation 은 본 포트가 ApprovalLine 도메인
 * 경로로 연결한다. 편집 범위는 {@code title}, {@code content} 만 허용한다. approvalNo/status/
 * requesterId/steps 같은 핵심 필드는 400 으로 거부한다.
 */
@Component
public class GroupwareApprovalDocumentCollaborationPort implements DocumentCollaborationPort {

    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);
    private static final Set<String> OVERLAY_FIELDS = Set.of("title", "content");

    private final ApprovalLineRepository approvalLineRepository;
    private final ObjectMapper objectMapper;
    private final ApprovalCollabCommentRepository commentRepository;

    public GroupwareApprovalDocumentCollaborationPort(ApprovalLineRepository approvalLineRepository,
                                                      ObjectMapper objectMapper,
                                                      ApprovalCollabCommentRepository commentRepository) {
        this.approvalLineRepository = approvalLineRepository;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
        this.commentRepository = commentRepository;
    }

    @Override
    public CollabDocumentType documentType() {
        return CollabDocumentType.APPROVAL_LINE;
    }

    /** 현재 결재 문서 snapshot 을 JSON 문자열로 반환한다. */
    @Override
    @Transactional(readOnly = true)
    public String loadSnapshot(UUID documentId) {
        ApprovalLine approval = loadApprovalFlat(documentId);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("title", approval.getTitle());
        snapshot.put("content", approval.getContent());
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "결재 스냅샷 직렬화 실패");
        }
    }

    /** path -> {after} changeSet 을 결재 overlay patch 경로로 적용한다. */
    @Override
    @Transactional
    public void applyChangeSet(UUID documentId, String changeSetJson) {
        applyOverlayPatchBatch(documentId, changeSetJson, SYSTEM_ACTOR_ID, "협업 제안");
    }

    /**
     * 수정완료 actor 로 overlay batch 를 적용한다.
     *
     * @param documentId 결재 UUID
     * @param changeSetJson path -> {before, after} JSON
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @return 변경 후 결재 상세
     */
    @Transactional
    public ApprovalLineAdminResponse applyOverlayPatchBatch(UUID documentId, String changeSetJson,
                                                            UUID actorId, String actorName) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        ApprovalLine approval = loadApprovalFlat(documentId);
        approval.guardCollabModifiable();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            applyOverlayField(approval, patch.getKey(), patch.getValue());
        }
        approvalLineRepository.save(approval);
        return ApprovalLineAdminResponse.from(approval);
    }

    /** changeSet 구조와 title/content whitelist 를 수정완료 저장 전 조기 검증한다. */
    public void validateChangeSet(String changeSetJson) {
        parseChangeSet(changeSetJson);
    }

    /**
     * changeSet 에 현재 결재의 before 값을 보강한다.
     *
     * @param documentId 결재 UUID
     * @param changeSetJson path -> {after} JSON
     * @return path -> {before, after} JSON
     */
    @Transactional(readOnly = true)
    public String enrichChangeSetWithBefore(UUID documentId, String changeSetJson) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        ApprovalLine approval = loadApprovalFlat(documentId);
        com.fasterxml.jackson.databind.node.ObjectNode root = objectMapper.createObjectNode();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            com.fasterxml.jackson.databind.node.ObjectNode change = objectMapper.createObjectNode();
            String before = readOverlayField(approval, patch.getKey());
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
                    "결재 수정 이력 changeSet 직렬화 실패");
        }
    }

    /** snapshot JSON 으로 title/content 만 복원한다. */
    @Override
    @Transactional
    public void restoreSnapshot(UUID documentId, String snapshotJson) {
        JsonNode root = parseObject(snapshotJson, "snapshot");
        Map<String, Object> patches = new LinkedHashMap<>();
        if (root.has("title")) {
            patches.put("title", toNullableText(root.get("title")));
        }
        if (root.has("content")) {
            patches.put("content", toNullableText(root.get("content")));
        }
        if (patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "결재 스냅샷에 복원할 overlay 필드가 없습니다");
        }
        applyParsedPatches(documentId, patches);
    }

    @Override
    public boolean canPropose(UUID userId, UUID documentId) {
        return userId != null && !SYSTEM_ACTOR_ID.equals(userId);
    }

    @Override
    public boolean canDecide(UUID userId, UUID documentId) {
        return canPropose(userId, documentId);
    }

    /**
     * 결재 수정완료 알림 수신자를 해석한다.
     *
     * <p>수신자 = 요청자 + 결재 step approver + 댓글 작성자. 현재 수정자는 제외한다.
     */
    @Override
    @Transactional(readOnly = true)
    public Set<String> resolveNotificationRecipients(UUID documentId, UUID excludeUserId) {
        ApprovalLine approval = loadApprovalWithSteps(documentId);
        Set<String> recipients = new LinkedHashSet<>();
        addRecipient(recipients, approval.getRequesterId(), excludeUserId);
        approval.getStepsView().forEach(step -> addRecipient(recipients, step.getApproverId(), excludeUserId));
        commentRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType(), documentId)
                .forEach(comment -> addRecipient(recipients, comment.getAuthorId(), excludeUserId));
        return recipients;
    }

    private ApprovalLineAdminResponse applyParsedPatches(UUID documentId, Map<String, Object> patches) {
        ApprovalLine approval = loadApprovalFlat(documentId);
        approval.guardCollabModifiable();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            applyOverlayField(approval, patch.getKey(), patch.getValue());
        }
        approvalLineRepository.save(approval);
        return ApprovalLineAdminResponse.from(approval);
    }

    private void applyOverlayField(ApprovalLine approval, String fieldName, Object value) {
        if ("title".equals(fieldName)) {
            approval.overlayTitle(value == null ? null : String.valueOf(value));
            return;
        }
        if ("content".equals(fieldName)) {
            approval.overlayContent(value == null ? null : String.valueOf(value));
            return;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "결재 협업은 title, content 만 수정할 수 있습니다: " + fieldName);
    }

    private String readOverlayField(ApprovalLine approval, String fieldName) {
        if ("title".equals(fieldName)) {
            return approval.getTitle();
        }
        if ("content".equals(fieldName)) {
            return approval.getContent();
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "지원하지 않는 결재 overlay 필드입니다: " + fieldName);
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
        if (OVERLAY_FIELDS.contains(normalized)) {
            return normalized;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "결재 협업은 title, content 만 수정할 수 있습니다: " + rawPath);
    }

    private ApprovalLine loadApprovalFlat(UUID documentId) {
        return approvalLineRepository.findFlatById(documentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재 문서를 찾을 수 없습니다: " + documentId));
    }

    private ApprovalLine loadApprovalWithSteps(UUID documentId) {
        return approvalLineRepository.findById(documentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재 문서를 찾을 수 없습니다: " + documentId));
    }

    private void addRecipient(Set<String> recipients, UUID userId, UUID excludeUserId) {
        if (userId == null || userId.equals(SYSTEM_ACTOR_ID) || userId.equals(excludeUserId)) {
            return;
        }
        recipients.add(userId.toString());
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
