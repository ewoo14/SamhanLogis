package com.samhanair.logis.partnerorder.collab;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.revision.repository.PartnerOrderRevisionRepository;
import com.samhanair.logis.partnerorder.service.PartnerOrderUpdateService;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
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
 * 주문 협업 포트.
 *
 * <p>collab-core 는 changeSet 구조만 전달하고 실제 mutation 은 본 포트가 PartnerOrder 도메인
 * 경로로 연결한다. 편집 범위는 주문 무결성에 영향이 없는 요청사항({@code memo}), 납기
 * ({@code dueDate}), 라인 비고({@code line.{lineKey}.remark})만 허용한다. 품목/수량/단가/금액/
 * 전환수량/주문번호/거래처코드는 핵심 필드이므로 400으로 거부한다.
 */
@Component
public class PartnerOrderDocumentCollaborationPort implements DocumentCollaborationPort {

    /** 주문 협업 쓰기 권한은 기존 주문 수정 page-code 를 재사용한다. */
    public static final String PARTNER_ORDER_COLLAB_WRITE_PAGE_CODE = "sales.partner-order.edit";

    /** 주문 협업 읽기 권한은 기존 주문 상세 조회 page-code 를 재사용한다. */
    public static final String PARTNER_ORDER_COLLAB_READ_PAGE_CODE = "sales.partner-order.list";

    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);
    private static final String SYSTEM_ACTOR_NAME = "협업 제안";
    private static final Pattern LINE_REMARK_PATH = Pattern.compile("^line\\.(\\d+)\\.remark$");
    private static final Set<String> CORE_HEADER_FIELDS = Set.of(
            "orderNo", "orderNumber", "partnerCode", "bizCode", "status", "slipNo",
            "slipPublishStatus", "totalAmount", "confirmedAt", "slipPublishedAt",
            "sourceEstimateId", "idempotencyKey", "lockVersion", "revisionCount");
    private static final Set<String> CORE_LINE_FIELDS = Set.of(
            "productId", "modelName", "modelCode", "productName", "categoryKey", "quantity",
            "priceVat", "deliveryPrice", "subtotal", "supplyAmount", "vatAmount", "lineTotal",
            "convertedQuantity", "lineId", "id");

    private final PartnerOrderRepository orderRepository;
    private final PartnerOrderUpdateService updateService;
    private final ObjectMapper objectMapper;
    private final PartnerOrderCollabSuggestionRepository suggestionRepository;
    private final PartnerOrderCollabCommentRepository commentRepository;
    private final PartnerOrderRevisionRepository revisionRepository;

    public PartnerOrderDocumentCollaborationPort(PartnerOrderRepository orderRepository,
                                                 PartnerOrderUpdateService updateService,
                                                 ObjectMapper objectMapper,
                                                 PartnerOrderCollabSuggestionRepository suggestionRepository,
                                                 PartnerOrderCollabCommentRepository commentRepository,
                                                 PartnerOrderRevisionRepository revisionRepository) {
        this.orderRepository = orderRepository;
        this.updateService = updateService;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
        this.suggestionRepository = suggestionRepository;
        this.commentRepository = commentRepository;
        this.revisionRepository = revisionRepository;
    }

    @Override
    public CollabDocumentType documentType() {
        return CollabDocumentType.PARTNER_ORDER;
    }

    /** 현재 주문 snapshot 을 JSON 문자열로 반환한다. */
    @Override
    @Transactional(readOnly = true)
    public String loadSnapshot(UUID documentId) {
        PartnerOrder order = loadOrder(documentId);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("orderNo", order.getOrderNo());
        snapshot.put("partnerCode", order.getPartnerCode());
        snapshot.put("bizCode", order.getBizCode());
        // dueDate 는 ISO 문자열(yyyy-MM-dd)로 직렬화 — ObjectMapper JavaTimeModule 유무와 무관하게
        // 일관(LocalDate 기본 직렬화는 [yyyy,M,d] 배열). enrich/restore 의 문자열 처리와 정합.
        snapshot.put("dueDate", order.getDueDate() == null ? null : order.getDueDate().toString());
        snapshot.put("memo", order.getMemo());
        snapshot.put("status", order.getStatus().name());
        snapshot.put("totalAmount", order.getTotalAmount());
        snapshot.put("lines", lineSnapshots(order));
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "주문 스냅샷 직렬화 실패");
        }
    }

    /**
     * path → {after} changeSet 을 주문 overlay patch 경로로 적용한다.
     */
    @Override
    @Transactional
    public void applyChangeSet(UUID documentId, String changeSetJson) {
        applyOverlayPatchBatch(documentId, changeSetJson, SYSTEM_ACTOR_ID, SYSTEM_ACTOR_NAME);
    }

    /**
     * 수정완료 actor 로 overlay batch 를 적용한다.
     *
     * @param documentId 주문 UUID
     * @param changeSetJson path → {before, after} JSON
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @return 변경 후 주문 상세
     */
    @Transactional
    public PartnerOrderDetailResponse applyOverlayPatchBatch(UUID documentId, String changeSetJson,
                                                             UUID actorId, String actorName) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        return updateService.applyOverlayPatchBatch(
                documentId, patches, actorId == null ? null : actorId.toString());
    }

    /**
     * changeSet JSON 의 구조와 주문 핵심 필드 불변 정책을 수정완료 저장 전 조기 검증한다.
     *
     * @param changeSetJson 검증 대상 changeSet JSON 문자열
     * @throws BusinessException(INVALID_INPUT) JSON 형식 오류 / 구조 불량 / 핵심 필드 포함 / 적용 필드 0건
     */
    public void validateChangeSet(String changeSetJson) {
        parseChangeSet(changeSetJson);
    }

    /**
     * changeSet 에 현재 주문의 before 값을 보강한다.
     *
     * @param documentId 주문 UUID
     * @param changeSetJson path → {after} JSON
     * @return path → {before, after} JSON
     */
    @Transactional(readOnly = true)
    public String enrichChangeSetWithBefore(UUID documentId, String changeSetJson) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        PartnerOrder order = loadOrder(documentId);
        com.fasterxml.jackson.databind.node.ObjectNode root = objectMapper.createObjectNode();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            com.fasterxml.jackson.databind.node.ObjectNode change = objectMapper.createObjectNode();
            String before = readOverlayField(order, patch.getKey());
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
                    "주문 수정 이력 changeSet 직렬화 실패");
        }
    }

    /**
     * snapshot JSON 으로 memo/dueDate/라인 remark 만 복원한다.
     *
     * <p>주문번호/거래처/품목/수량/금액/상태는 snapshot 에 있더라도 복원하지 않는다.
     */
    @Override
    @Transactional
    public void restoreSnapshot(UUID documentId, String snapshotJson) {
        JsonNode root = parseObject(snapshotJson, "snapshot");
        Map<String, Object> patches = new LinkedHashMap<>();
        if (root.has("memo")) {
            patches.put("memo", toNullableText(root.get("memo")));
        }
        if (root.has("dueDate")) {
            patches.put("dueDate", toNullableText(root.get("dueDate")));
        }
        JsonNode lines = root.get("lines");
        if (lines != null && lines.isArray()) {
            for (JsonNode line : lines) {
                JsonNode lineKey = line.get("lineKey");
                if (lineKey != null && lineKey.canConvertToInt() && line.has("remark")) {
                    patches.put("line." + lineKey.asInt() + ".remark", toNullableText(line.get("remark")));
                }
            }
        }
        if (patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "주문 스냅샷에 복원할 overlay 필드가 없습니다");
        }
        updateService.applyOverlayPatchBatch(documentId, patches, SYSTEM_ACTOR_ID.toString());
    }

    /**
     * 제안 가능 여부를 판정한다. 실제 권한은 컨트롤러 {@code @RequirePermission} 이 담당한다.
     */
    @Override
    public boolean canPropose(UUID userId, UUID documentId) {
        return userId != null && !SYSTEM_ACTOR_ID.equals(userId);
    }

    /**
     * 수락/거절 가능 여부를 판정한다. 실제 권한은 컨트롤러 {@code @RequirePermission} 이 담당한다.
     */
    @Override
    public boolean canDecide(UUID userId, UUID documentId) {
        return canPropose(userId, documentId);
    }

    /**
     * 주문 수정완료 알림 수신자를 해석한다.
     *
     * <p>결재자 개념이 없으므로 createdBy, 주문 버전 actor, 수정 이력 proposer/decider, 댓글 author 만
     * distinct 로 합산하고 현재 수정자는 제외한다.
     */
    @Override
    @Transactional(readOnly = true)
    public Set<String> resolveNotificationRecipients(UUID documentId, UUID excludeUserId) {
        PartnerOrder order = loadOrder(documentId);
        Set<String> recipients = new LinkedHashSet<>();
        addRecipient(recipients, order.getCreatedBy(), excludeUserId);
        if (revisionRepository != null) {
            revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(documentId)
                    .forEach(revision -> addRecipient(recipients,
                            revision.getActorId() == null ? null : revision.getActorId().toString(),
                            excludeUserId));
        }
        if (suggestionRepository != null) {
            suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType(), documentId)
                    .forEach(suggestion -> {
                        addRecipient(recipients, suggestion.getProposerId().toString(), excludeUserId);
                        addRecipient(recipients,
                                suggestion.getDecidedById() == null ? null : suggestion.getDecidedById().toString(),
                                excludeUserId);
                    });
        }
        if (commentRepository != null) {
            commentRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType(), documentId)
                    .forEach(comment -> addRecipient(recipients, comment.getAuthorId().toString(), excludeUserId));
        }
        return recipients;
    }

    private java.util.List<Map<String, Object>> lineSnapshots(PartnerOrder order) {
        java.util.List<Map<String, Object>> snapshots = new java.util.ArrayList<>();
        int lineKey = 1;
        for (PartnerOrderLine line : order.getLines()) {
            snapshots.add(lineSnapshot(line, lineKey));
            lineKey++;
        }
        return snapshots;
    }

    private Map<String, Object> lineSnapshot(PartnerOrderLine line, int lineKey) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("lineKey", lineKey);
        snapshot.put("productId", line.getProductId());
        snapshot.put("modelName", line.getModelName());
        snapshot.put("productName", line.getProductName());
        snapshot.put("categoryKey", line.getCategoryKey());
        snapshot.put("quantity", line.getQuantity());
        snapshot.put("priceVat", line.getPriceVat());
        snapshot.put("subtotal", line.getSubtotal());
        snapshot.put("supplyAmount", line.getSupplyAmount());
        snapshot.put("vatAmount", line.getVatAmount());
        snapshot.put("lineTotal", line.getLineTotal());
        snapshot.put("convertedQuantity", line.getConvertedQuantity());
        snapshot.put("remark", line.getRemark());
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
        if ("memo".equals(normalized) || "dueDate".equals(normalized)) {
            return normalized;
        }
        Matcher matcher = LINE_REMARK_PATH.matcher(normalized);
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
                "주문 협업은 memo, dueDate, line.{lineKey}.remark 만 수정할 수 있습니다: " + rawPath);
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
                "주문 핵심 필드는 협업 수정완료로 변경할 수 없습니다: " + path);
    }

    private String readOverlayField(PartnerOrder order, String fieldName) {
        if ("memo".equals(fieldName)) {
            return order.getMemo();
        }
        if ("dueDate".equals(fieldName)) {
            return order.getDueDate() == null ? null : order.getDueDate().toString();
        }
        Matcher matcher = LINE_REMARK_PATH.matcher(fieldName);
        if (matcher.matches()) {
            int lineKey = Integer.parseInt(matcher.group(1));
            return order.requireLineByLineKey(lineKey).getRemark();
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "지원하지 않는 주문 overlay 필드입니다: " + fieldName);
    }

    private PartnerOrder loadOrder(UUID documentId) {
        return orderRepository.findById(documentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
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
