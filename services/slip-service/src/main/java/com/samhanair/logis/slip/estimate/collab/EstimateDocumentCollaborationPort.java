package com.samhanair.logis.slip.estimate.collab;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType;
import com.samhanair.logis.slip.estimate.revision.repository.EstimateRevisionRepository;
import com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService;
import com.samhanair.logis.slip.estimate.web.dto.EstimateDetailResponse;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 견적 협업 포트.
 *
 * <p>collab-core 는 changeSet 구조만 전달하고 실제 mutation 은 본 포트가 Estimate 도메인 경로로
 * 연결한다. 편집 범위는 견적 무결성에 영향이 없는 비고({@code memo}), 유효기간
 * ({@code validUntil}), 라인 메모({@code line.{lineKey}.note})만 허용한다. 견적번호/상태/
 * 거래처 snapshot/금액/품목/수량/단가는 핵심 필드이므로 400으로 거부한다.
 */
@Component
public class EstimateDocumentCollaborationPort implements DocumentCollaborationPort {

    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);
    private static final String SYSTEM_ACTOR_NAME = "협업 제안";
    private static final Pattern LINE_NOTE_PATH = Pattern.compile("^line\\.(\\d+)\\.note$");
    private static final Set<String> CORE_HEADER_FIELDS = Set.of(
            "estimateNo", "estimateDate", "seqNo", "status", "partnerId", "partnerName",
            "partnerBusinessNo", "partnerAddress", "totalSupply", "totalVat", "totalAmount",
            "convertedSlipId");
    private static final Set<String> CORE_LINE_FIELDS = Set.of(
            "productId", "productName", "modelName", "specification", "quantity", "unitPrice",
            "unitPriceWithVat", "supplyAmount", "vatAmount", "lineTotal", "setHead",
            "parentSetModel", "specificationSource");

    private final EstimateRepository estimateRepository;
    private final EstimateRevisionService revisionService;
    private final ObjectMapper objectMapper;
    private final EstimateRevisionRepository revisionRepository;
    private final EstimateCollabSuggestionRepository suggestionRepository;
    private final EstimateCollabCommentRepository commentRepository;

    public EstimateDocumentCollaborationPort(EstimateRepository estimateRepository,
                                             EstimateRevisionService revisionService,
                                             ObjectMapper objectMapper,
                                             EstimateRevisionRepository revisionRepository,
                                             EstimateCollabSuggestionRepository suggestionRepository,
                                             EstimateCollabCommentRepository commentRepository) {
        this.estimateRepository = estimateRepository;
        this.revisionService = revisionService;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
        this.revisionRepository = revisionRepository;
        this.suggestionRepository = suggestionRepository;
        this.commentRepository = commentRepository;
    }

    @Override
    public CollabDocumentType documentType() {
        return CollabDocumentType.ESTIMATE;
    }

    /** 현재 견적 snapshot 을 JSON 문자열로 반환한다. */
    @Override
    @Transactional(readOnly = true)
    public String loadSnapshot(UUID documentId) {
        Estimate estimate = loadEstimate(documentId);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("estimateNo", estimate.getEstimateNo());
        snapshot.put("status", estimate.getStatus().name());
        snapshot.put("partnerName", estimate.getPartnerName());
        snapshot.put("validUntil", estimate.getValidUntil() == null ? null : estimate.getValidUntil().toString());
        snapshot.put("memo", estimate.getMemo());
        snapshot.put("totalAmount", estimate.getTotalAmount());
        snapshot.put("lines", lineSnapshots(estimate));
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "견적 스냅샷 직렬화 실패");
        }
    }

    /** path -> {after} changeSet 을 견적 overlay patch 경로로 적용한다. */
    @Override
    @Transactional
    public void applyChangeSet(UUID documentId, String changeSetJson) {
        applyOverlayPatchBatch(documentId, changeSetJson, SYSTEM_ACTOR_ID, SYSTEM_ACTOR_NAME);
    }

    /**
     * 수정완료 actor 로 overlay batch 를 적용한다.
     *
     * @param documentId 견적 UUID
     * @param changeSetJson path -> {before, after} JSON
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @return 변경 후 견적 상세
     */
    @Transactional
    public EstimateDetailResponse applyOverlayPatchBatch(UUID documentId, String changeSetJson,
                                                         UUID actorId, String actorName) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        Estimate estimate = loadEstimateForCollabOverlay(documentId);
        estimate.guardCollabModifiable();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            applyOverlayField(estimate, patch.getKey(), patch.getValue());
        }
        estimateRepository.save(estimate);
        revisionService.capture(estimate, EstimateRevisionType.EDIT, null,
                actorId, actorName, null);
        return EstimateDetailResponse.from(estimate);
    }

    /**
     * changeSet JSON 의 구조와 견적 핵심 필드 불변 정책을 수정완료 저장 전 조기 검증한다.
     *
     * @param changeSetJson 검증 대상 changeSet JSON 문자열
     * @throws BusinessException(INVALID_INPUT) JSON 형식 오류 / 구조 불량 / 핵심 필드 포함 / 적용 필드 0건
     */
    public void validateChangeSet(String changeSetJson) {
        parseChangeSet(changeSetJson);
    }

    /**
     * changeSet 에 현재 견적의 before 값을 보강한다.
     *
     * @param documentId 견적 UUID
     * @param changeSetJson path -> {after} JSON
     * @return path -> {before, after} JSON
     */
    @Transactional(readOnly = true)
    public String enrichChangeSetWithBefore(UUID documentId, String changeSetJson) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        Estimate estimate = loadEstimate(documentId);
        com.fasterxml.jackson.databind.node.ObjectNode root = objectMapper.createObjectNode();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            com.fasterxml.jackson.databind.node.ObjectNode change = objectMapper.createObjectNode();
            String before = readOverlayField(estimate, patch.getKey());
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
                    "견적 수정 이력 changeSet 직렬화 실패");
        }
    }

    /**
     * snapshot JSON 으로 memo/validUntil/라인 note 만 복원한다.
     *
     * <p>견적번호/거래처/품목/수량/금액/상태는 snapshot 에 있더라도 복원하지 않는다.
     */
    @Override
    @Transactional
    public void restoreSnapshot(UUID documentId, String snapshotJson) {
        JsonNode root = parseObject(snapshotJson, "snapshot");
        Map<String, Object> patches = new LinkedHashMap<>();
        if (root.has("memo")) {
            patches.put("memo", toNullableText(root.get("memo")));
        }
        if (root.has("validUntil")) {
            patches.put("validUntil", toNullableText(root.get("validUntil")));
        }
        JsonNode lines = root.get("lines");
        if (lines != null && lines.isArray()) {
            for (JsonNode line : lines) {
                JsonNode lineKey = line.get("lineKey");
                if (lineKey != null && lineKey.canConvertToInt() && line.has("note")) {
                    patches.put("line." + lineKey.asInt() + ".note", toNullableText(line.get("note")));
                }
            }
        }
        if (patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "견적 스냅샷에 복원할 overlay 필드가 없습니다");
        }
        applyParsedPatches(documentId, patches, SYSTEM_ACTOR_ID, "협업 복원");
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
     * 견적 수정완료 알림 수신자를 해석한다.
     *
     * <p>결재자/배차 담당자 개념이 없으므로 requesterId, createdBy, 견적 버전 actor, 수정 이력
     * proposer/decider, 댓글 author 만 distinct 로 합산하고 현재 수정자는 제외한다.
     */
    @Override
    @Transactional(readOnly = true)
    public Set<String> resolveNotificationRecipients(UUID documentId, UUID excludeUserId) {
        Estimate estimate = loadEstimate(documentId);
        Set<String> recipients = new LinkedHashSet<>();
        addRecipient(recipients, estimate.getRequesterId(), excludeUserId);
        addRecipient(recipients, estimate.getCreatedBy(), excludeUserId);
        revisionRepository.findByEstimateIdOrderByRevisionNoDesc(documentId)
                .forEach(revision -> addRecipient(
                        recipients,
                        revision.getActorId() == null ? null : revision.getActorId().toString(),
                        excludeUserId));
        suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType(), documentId)
                .forEach(suggestion -> {
                    addRecipient(recipients, suggestion.getProposerId().toString(), excludeUserId);
                    addRecipient(recipients,
                            suggestion.getDecidedById() == null ? null : suggestion.getDecidedById().toString(),
                            excludeUserId);
                });
        commentRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType(), documentId)
                .forEach(comment -> addRecipient(recipients, comment.getAuthorId().toString(), excludeUserId));
        return recipients;
    }

    private EstimateDetailResponse applyParsedPatches(UUID documentId, Map<String, Object> patches,
                                                      UUID actorId, String actorName) {
        Estimate estimate = loadEstimateForCollabOverlay(documentId);
        estimate.guardCollabModifiable();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            applyOverlayField(estimate, patch.getKey(), patch.getValue());
        }
        estimateRepository.save(estimate);
        revisionService.capture(estimate, EstimateRevisionType.EDIT, null, actorId, actorName, null);
        return EstimateDetailResponse.from(estimate);
    }

    private void applyOverlayField(Estimate estimate, String fieldName, Object value) {
        if ("memo".equals(fieldName)) {
            estimate.overlayMemo(value == null ? null : String.valueOf(value));
            return;
        }
        if ("validUntil".equals(fieldName)) {
            estimate.overlayValidUntil(parseDate(value));
            return;
        }
        Matcher matcher = LINE_NOTE_PATH.matcher(fieldName);
        if (matcher.matches()) {
            estimate.overlayLineNote(Integer.parseInt(matcher.group(1)),
                    value == null ? null : String.valueOf(value));
            return;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "지원하지 않는 견적 overlay 필드입니다: " + fieldName);
    }

    private LocalDate parseDate(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(String.valueOf(value));
        } catch (DateTimeParseException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "validUntil 은 yyyy-MM-dd 형식이어야 합니다");
        }
    }

    private java.util.List<Map<String, Object>> lineSnapshots(Estimate estimate) {
        java.util.List<Map<String, Object>> snapshots = new java.util.ArrayList<>();
        int lineKey = 1;
        for (EstimateLine line : estimate.getLines()) {
            snapshots.add(lineSnapshot(line, lineKey));
            lineKey++;
        }
        return snapshots;
    }

    private Map<String, Object> lineSnapshot(EstimateLine line, int lineKey) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("lineKey", lineKey);
        snapshot.put("productName", line.getProductName());
        snapshot.put("modelName", line.getModelName());
        snapshot.put("specification", line.getSpecification());
        snapshot.put("specificationSource", line.getSpecificationSource());
        snapshot.put("quantity", line.getQuantity());
        snapshot.put("unitPrice", line.getUnitPrice());
        snapshot.put("note", line.getNote());
        return snapshot;
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
        if ("memo".equals(normalized) || "validUntil".equals(normalized)) {
            return normalized;
        }
        Matcher matcher = LINE_NOTE_PATH.matcher(normalized);
        if (matcher.matches()) {
            int lineKey = Integer.parseInt(matcher.group(1));
            if (lineKey < 1) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "lineKey 는 1 이상이어야 합니다: " + rawPath);
            }
            return normalized;
        }
        rejectCorePath(normalized);
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "견적 협업은 memo, validUntil, line.{lineKey}.note 만 수정할 수 있습니다: " + rawPath);
    }

    private void rejectCorePath(String normalized) {
        if (CORE_HEADER_FIELDS.contains(normalized)) {
            throw coreFieldException(normalized);
        }
        if (normalized.startsWith("line.")) {
            String[] parts = normalized.split("\\.");
            String field = parts.length >= 3 ? parts[2] : normalized;
            if (CORE_LINE_FIELDS.contains(field)) {
                throw coreFieldException(normalized);
            }
        }
    }

    private BusinessException coreFieldException(String path) {
        return new BusinessException(ErrorCode.INVALID_INPUT,
                "견적 핵심 필드는 협업 수정완료로 변경할 수 없습니다: " + path);
    }

    private String readOverlayField(Estimate estimate, String fieldName) {
        if ("memo".equals(fieldName)) {
            return estimate.getMemo();
        }
        if ("validUntil".equals(fieldName)) {
            return estimate.getValidUntil() == null ? null : estimate.getValidUntil().toString();
        }
        Matcher matcher = LINE_NOTE_PATH.matcher(fieldName);
        if (matcher.matches()) {
            int lineKey = Integer.parseInt(matcher.group(1));
            return estimate.requireLineByLineKey(lineKey).getNote();
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "지원하지 않는 견적 overlay 필드입니다: " + fieldName);
    }

    private Estimate loadEstimate(UUID documentId) {
        return estimateRepository.findById(documentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "견적서를 찾을 수 없습니다: " + documentId));
    }

    private Estimate loadEstimateForCollabOverlay(UUID documentId) {
        return estimateRepository.findByIdForCollabOverlay(documentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "견적서를 찾을 수 없습니다: " + documentId));
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
