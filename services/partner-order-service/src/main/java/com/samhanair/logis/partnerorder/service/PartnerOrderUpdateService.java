package com.samhanair.logis.partnerorder.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderUpdateRequest;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import jakarta.persistence.OptimisticLockException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 주문 direct PUT 수정 서비스.
 *
 * <p>정책: 본사 SALES/MANAGER/MASTER 는 즉시 수정하고, PARTNER 는 기존 EditRequest 승인 흐름을
 * 사용한다. 수정 성공 시 audit overlay 를 1개 revision 으로 기록한다.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderUpdateService {

    private static final Pattern LINE_REMARK_PATH = Pattern.compile("^line\\.(\\d+)\\.remark$");
    private static final Set<PartnerOrderStatus> COLLAB_LOCKED = Set.of(
            PartnerOrderStatus.CANCELED,
            PartnerOrderStatus.CONVERTED,
            PartnerOrderStatus.CONFIRMING);
    private static final Set<String> CORE_HEADER_FIELDS = Set.of(
            "orderNo", "orderNumber", "partnerId", "partnerCode", "bizCode", "status", "slipNo",
            "slipPublishStatus", "totalAmount", "confirmedAt", "slipPublishedAt",
            "sourceEstimateId", "idempotencyKey", "lockVersion", "revisionCount", "deliveryAddress");
    private static final Set<String> CORE_LINE_FIELDS = Set.of(
            "productId", "modelName", "modelCode", "productName", "categoryKey", "quantity",
            "priceVat", "deliveryPrice", "subtotal", "supplyAmount", "vatAmount", "lineTotal",
            "authority", "convertedQuantity", "lineId", "id");

    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerOrderAuditLogService auditLogService;
    private final PartnerOrderRevisionService revisionService;
    private final PartnerOrderBoardChangePublisher boardChangePublisher;
    private final PartnerOrderPartnerIdentityResolver partnerIdentityResolver;
    private final ProductClient productClient;

    /**
     * 주문 헤더와 라인을 즉시 수정한다.
     *
     * <p>변경 저장 성공 후 {@link PartnerOrderRevisionService#capture} 로 EDIT 유형 revision 을
     * 트랜잭션 내에서 캡처한다 (Phase 2.4 버전이력 훅). 변경이 없는 경우에는 캡처하지 않는다.
     *
     * @param id 주문번호 또는 내부 식별자 문자열
     * @param request 수정 요청
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명 (UUID 비공개 가드 적용 전 원본)
     * @return 수정 후 상세 응답
     */
    @Transactional
    public PartnerOrderDetailResponse update(String id, PartnerOrderUpdateRequest request,
                                             UUID actorId, String actorName) {
        PartnerOrder order = load(id);
        verifyVersion(order, request.updatedAt());
        validateLines(request.lines());

        List<ChangeEntry> changes = diff(order, request);
        if (changes.isEmpty()) {
            return PartnerOrderDetailResponse.from(order);
        }
        try {
            UUID nextPartnerId = order.getPartnerId();
            boolean partnerIdentityChanged = !Objects.equals(order.getPartnerCode(), request.partnerCode())
                    || !Objects.equals(order.getBizCode(), request.bizCode());
            if (partnerIdentityChanged && nextPartnerId != null) {
                nextPartnerId = partnerIdentityResolver.requirePartnerId(
                        request.partnerCode(), request.bizCode());
            }
            order.updateHeader(nextPartnerId, request.partnerCode(), request.bizCode(),
                    request.dueDate(), request.memo(),
                    request.deliveryAddress() == null
                            ? order.getDeliveryAddress() : request.deliveryAddress());
            order.replaceLines(toLines(order, request.lines()));
            PartnerOrder saved = partnerOrderRepository.saveAndFlush(order);

            auditLogService.recordBatch(saved, actorId, actorName, null, changes);

            // Phase 2.4 버전이력 훅 — 본사 직결 수정 후 스냅샷 캡처 (EDIT)
            revisionService.capture(saved, PartnerOrderRevisionType.EDIT, null,
                    actorId, actorName, null);
            publishListChanged();

            return PartnerOrderDetailResponse.from(saved);
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw optimisticLockConflict();
        }
    }

    /**
     * 협업 수정완료 overlay batch 적용.
     *
     * <p>허용 필드는 {@code memo}, {@code dueDate}, {@code line.{lineKey}.remark} 뿐이다.
     * 품목/수량/단가/금액/전환수량/주문번호/거래처코드 등 주문 핵심 필드는 400으로 거부한다.
     * CANCELED/CONVERTED/CONFIRMING 주문은 물리 종결 또는 전이중 상태이므로 409로 차단한다.
     *
     * @param orderId 주문 UUID
     * @param beforeAfterPatches path → after 또는 path → {before, after}
     * @param actorUserId 수정자 user-id 문자열
     * @return 변경 후 주문 상세
     */
    @Transactional
    public PartnerOrderDetailResponse applyOverlayPatchBatch(UUID orderId,
                                                             Map<String, Object> beforeAfterPatches,
                                                             String actorUserId) {
        if (beforeAfterPatches == null || beforeAfterPatches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "적용할 주문 변경 내역이 없습니다");
        }
        PartnerOrder order = partnerOrderRepository.findById(orderId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        guardCollabModifiable(order);

        List<ChangeEntry> changes = new ArrayList<>();
        for (Map.Entry<String, Object> entry : beforeAfterPatches.entrySet()) {
            String path = normalizeOverlayPath(entry.getKey());
            Object after = extractAfter(entry.getValue());
            applyOverlayPath(order, path, after, changes);
        }

        try {
            PartnerOrder saved = partnerOrderRepository.saveAndFlush(order);
            if (!changes.isEmpty()) {
                UUID actorId = parseActorId(actorUserId);
                String actorName = "협업 수정완료";
                auditLogService.recordBatch(saved, actorId, actorName, null, changes);
                revisionService.capture(saved, PartnerOrderRevisionType.EDIT, null,
                        actorId, actorName, null);
                publishListChanged();
            }
            return PartnerOrderDetailResponse.from(saved);
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            // 동시 수정(PUT update / 다른 수정완료)과 충돌 시 update() 경로와 동일하게 409 로 변환.
            throw optimisticLockConflict();
        }
    }

    private PartnerOrder load(String id) {
        return PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
    }

    private void publishListChanged() {
        if (boardChangePublisher != null) {
            boardChangePublisher.publishListChanged("UPDATED");
        }
    }

    private void verifyVersion(PartnerOrder order, LocalDateTime requestUpdatedAt) {
        LocalDateTime current = order.getModifiedAt() == null ? order.getCreatedAt() : order.getModifiedAt();
        if (current == null || requestUpdatedAt == null || !current.isEqual(requestUpdatedAt)) {
            throw optimisticLockConflict();
        }
    }

    private BusinessException optimisticLockConflict() {
        return new BusinessException(
                ErrorCode.PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT,
                ErrorCode.PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT.getDefaultMessage());
    }

    private void guardCollabModifiable(PartnerOrder order) {
        if (COLLAB_LOCKED.contains(order.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "해당 상태의 주문은 협업 수정완료를 적용할 수 없습니다: "
                            + order.getStatus().getDisplayName());
        }
    }

    private void applyOverlayPath(PartnerOrder order, String path, Object after, List<ChangeEntry> changes) {
        if ("memo".equals(path)) {
            String before = order.getMemo();
            String next = toNullableString(after);
            if (!Objects.equals(before, normalizeNullableText(next))) {
                order.updateOverlayMemo(next);
                changes.add(new ChangeEntry("요청사항", before, order.getMemo()));
            }
            return;
        }
        if ("dueDate".equals(path)) {
            LocalDate before = order.getDueDate();
            LocalDate next = toNullableDate(after);
            if (!Objects.equals(before, next)) {
                order.updateOverlayDueDate(next);
                changes.add(new ChangeEntry("납기", toText(before), toText(next)));
            }
            return;
        }
        Matcher matcher = LINE_REMARK_PATH.matcher(path);
        if (matcher.matches()) {
            int lineKey = Integer.parseInt(matcher.group(1));
            PartnerOrderLine line = order.requireLineByLineKey(lineKey);
            String before = line.getRemark();
            String next = toNullableString(after);
            if (!Objects.equals(before, normalizeNullableText(next))) {
                line.updateRemark(next);
                changes.add(new ChangeEntry("라인 " + lineKey + " 비고", before, line.getRemark()));
            }
            return;
        }
        throw unsupportedOverlayPath(path);
    }

    private Object extractAfter(Object rawValue) {
        if (rawValue instanceof Map<?, ?> map && map.containsKey("after")) {
            return map.get("after");
        }
        if (rawValue instanceof JsonNode node && node.isObject() && node.has("after")) {
            JsonNode after = node.get("after");
            if (after == null || after.isNull()) {
                return null;
            }
            return after.isValueNode() ? after.asText() : after.toString();
        }
        return rawValue;
    }

    private String normalizeOverlayPath(String rawPath) {
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
        Matcher lineRemarkMatcher = LINE_REMARK_PATH.matcher(normalized);
        if (lineRemarkMatcher.matches()) {
            int lineKey = Integer.parseInt(lineRemarkMatcher.group(1));
            if (lineKey < 1) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "lineKey 는 1 이상이어야 합니다: " + rawPath);
            }
            return normalized;
        }
        rejectCorePath(normalized);
        throw unsupportedOverlayPath(normalized);
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

    private BusinessException unsupportedOverlayPath(String path) {
        return new BusinessException(ErrorCode.INVALID_INPUT,
                "주문 협업은 memo, dueDate, line.{lineKey}.remark 만 수정할 수 있습니다: " + path);
    }

    private BusinessException coreFieldException(String path) {
        return new BusinessException(ErrorCode.INVALID_INPUT,
                "주문 핵심 필드는 협업 수정완료로 변경할 수 없습니다: " + path);
    }

    private LocalDate toNullableDate(Object value) {
        String text = toNullableString(value);
        if (text == null) {
            return null;
        }
        try {
            return LocalDate.parse(text);
        } catch (DateTimeParseException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "dueDate 는 ISO 날짜(yyyy-MM-dd) 형식이어야 합니다: " + text);
        }
    }

    private String toNullableString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String normalizeNullableText(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private UUID parseActorId(String actorUserId) {
        if (actorUserId == null || actorUserId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(actorUserId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    private void validateLines(List<PartnerOrderUpdateRequest.LineRequest> lines) {
        if (lines == null || lines.isEmpty()) {
            throw invalidLine("주문 라인은 1건 이상이어야 합니다.");
        }
        for (PartnerOrderUpdateRequest.LineRequest line : lines) {
            if (line.quantity() <= 0) {
                throw invalidLine("수량은 1 이상이어야 합니다.");
            }
            if (line.deliveryPrice() == null || line.deliveryPrice().signum() < 0) {
                throw invalidLine("납품가는 0 이상이어야 합니다.");
            }
            if (line.authority() != null && !line.authority().isBlank()) {
                parseAuthority(line.authority());
            } else if (line.supplyAmount() != null || line.vatAmount() != null) {
                throw invalidLine("공급가액·부가세·합계를 사용할 때 authority는 필수입니다.");
            }
        }
    }

    private BusinessException invalidLine(String message) {
        return new BusinessException(ErrorCode.PARTNER_ORDER_UPDATE_INVALID_LINE, message);
    }

    private List<PartnerOrderLine> toLines(PartnerOrder order,
                                           List<PartnerOrderUpdateRequest.LineRequest> requestedLines) {
        Map<String, List<PartnerOrderLine>> existingByKey = new HashMap<>();
        for (PartnerOrderLine existing : order.getLines()) {
            existingByKey.computeIfAbsent(lineKey(existing.getModelName(), existing.getProductName(),
                    existing.getCategoryKey()), ignored -> new ArrayList<>()).add(existing);
        }

        Map<String, UUID> resolvedProductIds = new LinkedHashMap<>();
        List<PartnerOrderUpdateRequest.LineRequest> catalogLines = new ArrayList<>();
        Set<String> modelCodes = new LinkedHashSet<>();
        for (PartnerOrderUpdateRequest.LineRequest requested : requestedLines) {
            modelCodes.add(requested.modelCode());
        }
        Map<String, UUID> catalogProductIds = lookupCatalogProductIds(modelCodes);
        for (PartnerOrderUpdateRequest.LineRequest requested : requestedLines) {
            List<PartnerOrderLine> candidates = existingByKey.get(lineKey(
                    requested.modelCode(), requested.productName(), requested.categoryKey()));
            if (candidates != null && !candidates.isEmpty()) {
                UUID catalogProductId = catalogProductIds.get(requested.modelCode());
                UUID existingProductId = candidates.remove(0).getProductId();
                resolvedProductIds.put(requestKey(requested), catalogProductId != null
                        ? catalogProductId : existingProductId);
            } else {
                catalogLines.add(requested);
            }
        }

        if (!catalogLines.isEmpty()) {
            if (modelCodes.size() > 100) {
                throw invalidLine("한 번에 조회할 수 있는 품목 수는 100건 이하입니다.");
            }
            for (PartnerOrderUpdateRequest.LineRequest line : catalogLines) {
                UUID productId = catalogProductIds.get(line.modelCode());
                if (productId == null) {
                    throw invalidLine("카탈로그에서 품목을 찾을 수 없습니다: " + line.modelCode());
                }
                resolvedProductIds.put(requestKey(line), productId);
            }
        }

        return requestedLines.stream()
                .map(line -> toLine(line, resolvedProductIds.get(requestKey(line))))
                .toList();
    }

    private Map<String, UUID> lookupCatalogProductIds(Set<String> modelCodes) {
        if (modelCodes.isEmpty()) {
            return Map.of();
        }
        if (modelCodes.size() > 100) {
            throw invalidLine("한 번에 조회할 수 있는 품목 수는 100건 이하입니다.");
        }
        Map<String, UUID> catalogProductIds = new HashMap<>();
        for (ProductSummary product : productClient.lookupByModelCodes(new ArrayList<>(modelCodes))) {
            if (product != null && product.id() != null && product.modelCode() != null) {
                catalogProductIds.put(product.modelCode(), product.id());
            }
        }
        return catalogProductIds;
    }

    private PartnerOrderLine toLine(PartnerOrderUpdateRequest.LineRequest line, UUID productId) {
        PartnerOrderLine.AmountAuthority authority = line.authority() == null
                || line.authority().isBlank()
                ? PartnerOrderLine.AmountAuthority.PRICE
                : parseAuthority(line.authority());
        return PartnerOrderLine.createFromAuthoritativeAmounts(
                productId,
                line.modelCode(), line.productName(), line.categoryKey(), line.quantity(),
                line.deliveryPrice(), line.supplyAmount(), line.vatAmount(), line.lineTotal(),
                authority, line.remark());
    }

    private String requestKey(PartnerOrderUpdateRequest.LineRequest line) {
        return lineKey(line.modelCode(), line.productName(), line.categoryKey());
    }

    private String lineKey(String modelCode, String productName, String categoryKey) {
        return modelCode + "\u0000" + productName + "\u0000" + categoryKey;
    }

    private PartnerOrderLine.AmountAuthority parseAuthority(String raw) {
        try {
            return PartnerOrderLine.AmountAuthority.valueOf(raw.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw invalidLine("authority는 PRICE/SUPPLY/VAT/TOTAL 중 하나여야 합니다.");
        }
    }

    private List<ChangeEntry> diff(PartnerOrder order, PartnerOrderUpdateRequest request) {
        List<ChangeEntry> changes = new ArrayList<>();
        addIfChanged(changes, "거래처 코드", order.getPartnerCode(), request.partnerCode());
        addIfChanged(changes, "사업자번호", order.getBizCode(), request.bizCode());
        addIfChanged(changes, "납기", toText(order.getDueDate()), toText(request.dueDate()));
        addIfChanged(changes, "요청사항", order.getMemo(), trimToNull(request.memo()));
        if (request.deliveryAddress() != null) {
            addIfChanged(changes, "배송주소", order.getDeliveryAddress(),
                    trimToNull(request.deliveryAddress()));
        }
        String oldLines = summarizeLines(order.getLines());
        String newLines = summarizeRequestLines(request.lines());
        addIfChanged(changes, "주문 라인", oldLines, newLines);
        return changes;
    }

    private void addIfChanged(List<ChangeEntry> changes, String fieldName, String oldValue, String newValue) {
        String oldText = oldValue == null ? "" : oldValue;
        String newText = newValue == null ? "" : newValue;
        if (!Objects.equals(oldText, newText)) {
            changes.add(new ChangeEntry(fieldName, oldValue, newValue));
        }
    }

    private String summarizeLines(List<PartnerOrderLine> lines) {
        return lines.stream()
                .map(line -> line.getModelName() + "/" + line.getProductName() + "/" + line.getQuantity()
                        + "/" + normalize(line.getPriceVat())
                        + "/" + normalize(line.getSupplyAmount())
                        + "/" + normalize(line.getVatAmount())
                        + "/" + normalize(line.getLineTotal()))
                .toList()
                .toString();
    }

    private String summarizeRequestLines(List<PartnerOrderUpdateRequest.LineRequest> lines) {
        return lines.stream()
                .map(line -> line.modelCode() + "/" + line.productName() + "/" + line.quantity()
                        + "/" + normalize(line.deliveryPrice())
                        + "/" + normalize(line.supplyAmount())
                        + "/" + normalize(line.vatAmount())
                        + "/" + normalize(line.lineTotal()))
                .toList()
                .toString();
    }

    private String toText(LocalDate value) {
        return value == null ? null : value.toString();
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String normalize(BigDecimal value) {
        return value == null ? null : value.stripTrailingZeros().toPlainString();
    }

}
