package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import com.samhanair.logis.slip.price.domain.PartnerProductPriceMemory;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import jakarta.persistence.OptimisticLockException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매출 전표 direct PUT 수정 서비스 (SP-08-6-2).
 *
 * <p>SALES/MANAGER/MASTER 가 기존 SlipEditRequest 승인 흐름을 거치지 않고 OUTBOUND 전표를
 * 즉시 수정한다. stale {@code updatedAt} 은 409 로, 라인 검증 실패는 422 로 반환한다.
 *
 * <p>SP-08-5-2 {@link SlipUpdateService} (매입) 와 대칭 패턴을 사용하되 도메인 메서드만
 * {@code updateSalesHeader} / {@code replaceSalesLines} 로 교체한다.
 */
@Service
@RequiredArgsConstructor
public class SalesSlipUpdateService {

    private final SlipRepository slipRepository;
    private final SlipAuditLogService auditLogService;
    private final SlipRevisionService slipRevisionService;
    private final PartnerProductPriceMemoryService priceMemoryService;
    private final ProductClient productClient;
    private final SlipClosedDateGuard closedDateGuard;

    /**
     * 매출 전표 헤더와 라인을 전체 교체한다.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>전표 조회 및 OUTBOUND 타입 검증 (도메인 메서드에 위임)</li>
     *   <li>라인 유효성 검증 — try 외부에서 즉시 처리</li>
     *   <li>수정 전 스냅샷 {@code before} 캡처 (도메인 변경 전)</li>
     *   <li>도메인 메서드 호출 후 {@code saveAndFlush}</li>
     *   <li>flush 결과 기준 {@code after} 캡처 → 변경 있을 때만 audit 기록</li>
     * </ol>
     *
     * @param id 전표 ID
     * @param request 수정 요청 (SlipUpdateRequest 재사용)
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @return 수정 후 상세 응답
     * @throws BusinessException(SLIP_UPDATE_NON_SALES) slipType 이 OUTBOUND 가 아닐 때
     * @throws BusinessException(SLIP_OPTIMISTIC_LOCK_CONFLICT) stale updatedAt 일 때
     * @throws BusinessException(SLIP_UPDATE_INVALID_LINE) 라인 유효성 실패 시
     */
    @Transactional
    public SlipDetailResponse update(UUID id, SlipUpdateRequest request,
                                     UUID actorId, String actorName) {
        // [D-R8-9] 매입(SlipUpdateService) 미러 — 계약 마커 검증은 어떤 상태를 읽기도 전에.
        requireLineIdContract(request);
        Slip slip = load(id);
        closedDateGuard.assertAllowed(slip.getSlipType(), slip.getSlipDate(), actorId == null ? null : actorId.toString());
        verifyVersion(slip, request.updatedAt());
        // validateLines 는 BusinessException(SLIP_UPDATE_INVALID_LINE) 을 던지므로 try 외부에서 처리
        validateLines(request.lines());
        List<ProductSummary> products = productClient.lookup(request.lines().stream()
                .map(SlipUpdateRequest.LineRequest::productId).distinct().toList());
        if (products.stream().anyMatch(BundleModePolicy::shouldExpand)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "세트 품목은 구성품으로 전개해 저장해 주세요.");
        }
        validateLineIds(slip.getLines(), request.lines());

        String before = summarize(slip);
        BundleLineageResolver bundleLineage = BundleLineageResolver.fromSlipLines(slip.getLines());
        // [R9] 기존 계보 구성품 ID를 요청과 per-line 대조한다. 누락 구성품 + 익명 라인은
        // 부분 재생성으로 계보를 잃을 수 있어 거부하고, 익명 라인 없는 누락은 명시 삭제로 허용한다.
        LineIdContractGate.requireLineIdsForLineage(
                bundleLineage.bundleComponentLineIds(),
                request.lines().stream()
                        .map(SlipUpdateRequest.LineRequest::lineId)
                        .toList());
        List<SlipLine> replacementLines = request.lines().stream()
                .map(line -> toLine(slip, line))
                .toList();
        bundleLineage.restoreSlipLines(replacementLines, request.lines().stream()
                .map(SlipUpdateRequest.LineRequest::lineId)
                .toList());
        validateAndAssignNewBundleLineage(replacementLines, request.lines());
        rejectAuthoritativeBundleComponents(replacementLines, request.lines());
        try {
            slip.updateSalesHeader(
                    request.partnerId(),
                    request.partnerName(),
                    request.partnerCode(),
                    request.memo(),
                    request.businessNumber(),
                    request.deliveryAddress(),
                    request.supervisionAddress(),
                    request.projectName(),
                    request.recipientPhone(),
                    request.paymentDueDate());
            // [D-R8-7] 가격기억 수집은 반드시 헤더 갱신 <b>이후</b>다 — 이전에 수집하면 거래처를
            // 바꾼 저장의 단가가 갱신 전 partnerId(원 거래처)에 각인된다 (R8-QA-3 라이브 실증).
            List<PartnerProductPriceMemoryCommand> priceMemoryCommands = collectPriceMemory(
                    slip, replacementLines, actorId == null ? null : actorId.toString());
            slip.replaceSalesLines(replacementLines, actorId == null ? null : actorId.toString());
            Slip saved = slipRepository.saveAndFlush(slip);
            // after 는 saveAndFlush 결과 기준으로 캡처하여 ordering 명확화
            String after = summarize(saved);
            if (!Objects.equals(before, after)) {
                // 버전 스냅샷은 audit revisionCount 증가와 독립 기록해 기존 PUT 응답 version 계약을 보존한다.
                slipRevisionService.capture(saved, SlipRevisionType.EDIT, null, actorId, actorName, null);
                auditLogService.recordBatch(saved.getId(), actorId, actorName, null,
                        List.of(new SlipAuditLogService.ChangeEntry("SLIP_EDIT", before, after)));
            }
            priceMemoryService.rememberBatchAfterCommit(priceMemoryCommands, "slip.salesUpdate");
            return SlipDetailResponse.from(saved);
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw optimisticLockConflict();
        }
    }

    private Slip load(UUID id) {
        Slip slip = slipRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));
        if (Boolean.TRUE.equals(slip.getIsDeleted())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다");
        }
        return slip;
    }

    /**
     * {@code updatedAt} 낙관적 잠금 검증.
     *
     * <p>PostgreSQL {@code timestamp(6)} 은 마이크로초 단위. Java {@code LocalDateTime} 도
     * 나노초를 지원하므로 양쪽을 {@link ChronoUnit#MICROS} 로 truncate 후 비교하여
     * 정밀도 불일치로 인한 오탐을 방지한다.
     *
     * @param slip 현재 전표
     * @param requestUpdatedAt 클라이언트 전송 타임스탬프
     */
    private void verifyVersion(Slip slip, LocalDateTime requestUpdatedAt) {
        LocalDateTime current = slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt();
        if (current == null || requestUpdatedAt == null) {
            throw optimisticLockConflict();
        }
        LocalDateTime currentMicros = current.truncatedTo(ChronoUnit.MICROS);
        LocalDateTime requestMicros = requestUpdatedAt.truncatedTo(ChronoUnit.MICROS);
        if (!currentMicros.isEqual(requestMicros)) {
            throw optimisticLockConflict();
        }
    }

    private void validateLines(List<SlipUpdateRequest.LineRequest> lines) {
        if (lines == null || lines.isEmpty()) {
            throw invalidLine("매출 라인은 1건 이상이어야 합니다.");
        }
        for (SlipUpdateRequest.LineRequest line : lines) {
            if (line.productId() == null) {
                throw invalidLine("제품 식별자는 필수입니다.");
            }
            if (line.quantity() == null || line.quantity() <= 0) {
                throw invalidLine("수량은 1 이상이어야 합니다.");
            }
            if (line.unitPrice() == null || line.unitPrice().signum() < 0) {
                throw invalidLine("단가는 0 이상이어야 합니다.");
            }
        }
    }

    /**
     * 요청 lineId 가 현재 매출 전표의 활성 라인인지 검증한다.
     *
     * <p>타 문서 UUID 주입은 400 INVALID_INPUT 으로 통일해 다른 문서 존재 여부를
     * 노출하지 않는다. 개별 라인의 {@code lineId == null} 은 편집 중 추가된 신규 라인을 뜻하는
     * 정상 값이다. 다만 기존 계보 구성품 ID가 누락된 요청에 신규 익명 라인이 함께 있으면 부분
     * 재생성으로 계보가 파괴될 수 있어 {@link LineIdContractGate}가 별도로 거부한다. 평면 문서의
     * 전 라인 교체는 정상이며 fingerprint 휴리스틱으로는 되돌아가지 않는다.
     */
    private void validateLineIds(List<SlipLine> existingLines,
                                 List<SlipUpdateRequest.LineRequest> requestedLines) {
        Set<UUID> ownedLineIds = existingLines.stream()
                .map(SlipLine::getId)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        Set<UUID> requestedLineIds = new HashSet<>();
        for (SlipUpdateRequest.LineRequest line : requestedLines) {
            UUID lineId = line.lineId();
            if (lineId == null) {
                continue;
            }
            if (!ownedLineIds.contains(lineId) || !requestedLineIds.add(lineId)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "lineId 는 현재 전표의 활성 라인에서 중복 없이 지정해야 합니다");
            }
        }
    }

    /**
     * [D-R8-6 · D-R8-9] 매출 전표 PUT 은 lineId 계약 선언을 의무화한다 —
     * {@link SlipUpdateService#requireLineIdContract} 미러 (매입/매출 비대칭 재발 차단).
     * 판정은 공용 {@link LineIdContractGate} 단일 구현에 위임하므로 두 미러는 드리프트할 수 없다.
     *
     * <p>R8-QA-1 라이브 실측: 세트 전표를 무수정 왕복 PUT(lineId 없음) → 200 → 계보 전량 소실 +
     * 구성품 배분가 LINE_SAVE 각인. "구 클라이언트 호환" 은 호환이 아니라 조용한 파괴다.
     * 그 경로의 주체인 구 클라이언트는 마커를 보내지 않으므로 여기서 차단된다.
     */
    private void requireLineIdContract(SlipUpdateRequest request) {
        LineIdContractGate.require(request.lineIdContract());
    }

    private SlipLine toLine(Slip slip, SlipUpdateRequest.LineRequest line) {
        boolean authoritative = AuthoritativeAmountValidator.isComplete(
                line.supplyAmount(), line.vatAmount(), line.lineTotalWithVat());
        if (authoritative) {
            return SlipLine.createFromAuthoritativeAmounts(
                    slip,
                    line.productId(),
                    line.productName(),
                    line.modelName(),
                    line.specification(),
                    line.quantity(),
                    line.unitPrice(),
                    line.supplyAmount(),
                    line.vatAmount(),
                    line.lineTotalWithVat(),
                    line.note(),
                    null);
        }
        return SlipLine.create(
                slip,
                line.productId(),
                line.productName(),
                line.modelName(),
                line.specification(),
                line.quantity(),
                line.unitPrice(),
                line.note());
    }

    /**
     * 신규 익명 라인의 BUNDLE 계보를 product-service 전개 결과와 대조한 뒤 영속한다.
     *
     * <p>기존 {@code lineId} 라인은 {@link BundleLineageResolver}가 구 규약의 계보를 복원한다.
     * 반면 신규 구성품은 영속 ID가 없으므로 요청의 계보를 무검증으로 신뢰하면 임의 SINGLE을
     * 세트 구성품으로 위조할 수 있다. 신규 계보 그룹이 있을 때만 부모를 조회하고, 전개 결과의
     * 품목·수량·단가·head 순서를 모두 일치시킨 뒤 도메인 메서드를 호출한다.
     */
    private void validateAndAssignNewBundleLineage(
            List<SlipLine> lines, List<SlipUpdateRequest.LineRequest> requests) {
        Map<BundleRequestKey, List<Integer>> groups = new LinkedHashMap<>();
        for (int i = 0; i < requests.size(); i++) {
            SlipUpdateRequest.LineRequest request = requests.get(i);
            if (!hasBundleMetadata(request)) {
                continue;
            }
            if (!hasCompleteBundleMetadata(request)) {
                if (request.lineId() == null) {
                    rejectBundleLineage("신규 세트 구성품의 부모 계보가 불완전합니다");
                }
                // 기존 구 세트 행은 응답에 부모 UUID/가격이 없을 수 있으므로 resolver 결과를 보존한다.
                continue;
            }
            BundleRequestKey key = BundleRequestKey.from(request);
            groups.computeIfAbsent(key, ignored -> new ArrayList<>()).add(i);
        }
        if (groups.isEmpty()) {
            return;
        }

        List<UUID> parentIds = groups.keySet().stream()
                .map(BundleRequestKey::parentProductId)
                .distinct()
                .toList();
        Map<UUID, ProductSummary> parentsById = productClient.lookup(parentIds).stream()
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toMap(ProductSummary::id, value -> value,
                        (left, right) -> left));

        for (Map.Entry<BundleRequestKey, List<Integer>> entry : groups.entrySet()) {
            BundleRequestKey key = entry.getKey();
            List<Integer> indexes = entry.getValue();
            if (indexes.stream().noneMatch(index -> requests.get(index).lineId() == null)) {
                continue;
            }
            ProductSummary parent = parentsById.get(key.parentProductId());
            if (parent == null || !"BUNDLE".equals(parent.productType())
                    || !Objects.equals(key.parentSetModel(), parent.modelCode())) {
                rejectBundleLineage("부모 BUNDLE 품목과 세트 modelCode가 일치하지 않습니다");
            }
            BigDecimal parentUnitPrice = requests.get(indexes.get(0)).bundleParentUnitPrice();
            if (parentUnitPrice.signum() < 0 || indexes.stream().anyMatch(index ->
                    requests.get(index).bundleParentUnitPrice() == null
                            || requests.get(index).bundleParentUnitPrice().compareTo(parentUnitPrice) != 0)) {
                rejectBundleLineage("세트 부모 단가가 구성품 행마다 일치하지 않습니다");
            }

            BundleSetOptions setOptions = key.setOptions();
            ExpandedLineDto.Options expandOptions = toExpandOptions(setOptions);
            List<ExpandedLineDto> expandedForOne = componentLines(productClient.expand(
                    key.parentSetModel(), BigDecimal.ONE, expandOptions, parentUnitPrice));
            BigDecimal setQuantity = inferSetQuantity(expandedForOne, indexes, requests);
            List<ExpandedLineDto> expanded = setQuantity.compareTo(BigDecimal.ONE) == 0
                    ? expandedForOne
                    : componentLines(productClient.expand(
                            key.parentSetModel(), setQuantity, expandOptions, parentUnitPrice));
            validateExpandedLines(expanded, indexes, requests);
            for (int i = 0; i < indexes.size(); i++) {
                int index = indexes.get(i);
                ExpandedLineDto expected = expanded.get(i);
                lines.get(index).assignBundleComponent(
                        key.parentSetModel(), expected.setHead(), setOptions);
            }
        }
    }

    private boolean hasBundleMetadata(SlipUpdateRequest.LineRequest request) {
        return (request.parentSetModel() != null && !request.parentSetModel().isBlank())
                || request.setHead() != null
                || request.bundleParentProductId() != null
                || request.bundleParentUnitPrice() != null
                || request.setOptions() != null;
    }

    private boolean hasCompleteBundleMetadata(SlipUpdateRequest.LineRequest request) {
        return request.parentSetModel() != null && !request.parentSetModel().isBlank()
                && request.setHead() != null
                && request.bundleParentProductId() != null
                && request.bundleParentUnitPrice() != null;
    }

    private ExpandedLineDto.Options toExpandOptions(BundleSetOptions options) {
        if (options == null) {
            return null;
        }
        return new ExpandedLineDto.Options(
                options.remoteOption(), Boolean.TRUE.equals(options.remoteExcluded()),
                options.panelOption(), options.panelShape360(),
                Boolean.TRUE.equals(options.materialIncluded()));
    }

    private List<ExpandedLineDto> componentLines(List<ExpandedLineDto> expanded) {
        if (expanded == null) {
            return List.of();
        }
        return expanded.stream()
                .filter(line -> line != null && line.productId() != null && line.componentKind() != null)
                .toList();
    }

    private BigDecimal inferSetQuantity(List<ExpandedLineDto> expandedForOne, List<Integer> indexes,
                                        List<SlipUpdateRequest.LineRequest> requests) {
        if (expandedForOne.isEmpty() || expandedForOne.size() != indexes.size()) {
            rejectBundleLineage("서버 전개 구성품 수가 요청과 다릅니다");
        }
        BigDecimal setQuantity = null;
        for (int i = 0; i < indexes.size(); i++) {
            ExpandedLineDto expected = expandedForOne.get(i);
            SlipUpdateRequest.LineRequest request = requests.get(indexes.get(i));
            if (!Objects.equals(expected.productId(), request.productId())
                    || expected.quantity() == null || expected.quantity().signum() <= 0) {
                rejectBundleLineage("요청 구성품이 서버 전개 결과와 일치하지 않습니다");
            }
            BigDecimal candidate = BigDecimal.valueOf(request.quantity())
                    .divide(expected.quantity(), 12, RoundingMode.HALF_UP);
            if (expected.quantity().multiply(candidate).compareTo(BigDecimal.valueOf(request.quantity())) != 0
                    || candidate.signum() <= 0
                    || candidate.stripTrailingZeros().scale() > 0) {
                rejectBundleLineage("구성품 수량으로 세트 수량을 검증할 수 없습니다");
            }
            if (setQuantity == null) {
                setQuantity = candidate;
            } else if (setQuantity.compareTo(candidate) != 0) {
                rejectBundleLineage("구성품 수량의 세트 배수가 일치하지 않습니다");
            }
        }
        return setQuantity;
    }

    private void validateExpandedLines(List<ExpandedLineDto> expanded,
                                       List<Integer> indexes,
                                       List<SlipUpdateRequest.LineRequest> requests) {
        if (expanded.size() != indexes.size()
                || expanded.stream().filter(ExpandedLineDto::setHead).count() != 1) {
            rejectBundleLineage("서버 전개 결과의 구성품 수 또는 setHead가 올바르지 않습니다");
        }
        for (int i = 0; i < expanded.size(); i++) {
            ExpandedLineDto expected = expanded.get(i);
            SlipUpdateRequest.LineRequest request = requests.get(indexes.get(i));
            if (!Objects.equals(expected.productId(), request.productId())
                    || expected.quantity() == null
                    || expected.quantity().compareTo(BigDecimal.valueOf(request.quantity())) != 0
                    || expected.unitPrice() == null
                    || expected.unitPrice().compareTo(request.unitPrice()) != 0
                    || expected.setHead() != Boolean.TRUE.equals(request.setHead())) {
                rejectBundleLineage("요청 구성품 수량·단가·setHead가 서버 전개 결과와 다릅니다");
            }
        }
    }

    private void rejectBundleLineage(String message) {
        throw new BusinessException(ErrorCode.INVALID_INPUT, "세트 계보 검증 실패: " + message);
    }

    private record BundleRequestKey(String parentSetModel, UUID parentProductId,
                                    BundleSetOptions setOptions) {
        private static BundleRequestKey from(SlipUpdateRequest.LineRequest request) {
            return new BundleRequestKey(request.parentSetModel().trim(),
                    request.bundleParentProductId(), request.setOptions());
        }
    }

    private void rejectAuthoritativeBundleComponents(List<SlipLine> lines,
                                                     List<SlipUpdateRequest.LineRequest> requests) {
        for (int i = 0; i < lines.size(); i++) {
            if (BundleLineageResolver.isBundleComponent(lines.get(i))
                    && AuthoritativeAmountValidator.isComplete(
                            requests.get(i).supplyAmount(), requests.get(i).vatAmount(),
                            requests.get(i).lineTotalWithVat())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "세트 구성품의 공급가액·부가세는 개별 편집할 수 없습니다");
            }
        }
    }

    /**
     * 매출 수정 라인의 VAT 포함 단가를 가격기억에 저장한다.
     * 권위 금액 라인은 입력 단가가 이미 VAT 포함이므로 그대로 사용하고, unitPriceWithVat가
     * 없는 legacy 라인만 공급단가를 1.1배 한다. 서버가 복원한 세트 구성품 계보는 parent
     * 기억을 오염시키지 않도록 후보에서 제외한다.
     */
    private List<PartnerProductPriceMemoryCommand> collectPriceMemory(
            Slip slip, List<SlipLine> lines, String actor) {
        List<PartnerProductPriceMemoryCommand> commands = new ArrayList<>();
        if (slip.getPartnerId() == null || lines == null) {
            return commands;
        }
        for (SlipLine line : lines) {
            if (BundleLineageResolver.isBundleComponent(line)
                    || line.getProductId() == null || line.getUnitPrice() == null) {
                continue;
            }
            BigDecimal vatInclusive = line.getUnitPriceWithVat() != null
                    ? line.getUnitPriceWithVat()
                    : line.getUnitPrice()
                            .multiply(new BigDecimal("1.1"))
                            .setScale(2, RoundingMode.HALF_UP);
            commands.add(new PartnerProductPriceMemoryCommand(
                    slip.getPartnerId(), line.getProductId(), vatInclusive,
                    PartnerProductPriceMemory.SOURCE_LINE_SAVE, actor));
        }
        return commands;
    }

    private String summarize(Slip slip) {
        return "partnerName=%s|partnerCode=%s|memo=%s|businessNumber=%s|deliveryAddress=%s|supervisionAddress=%s|projectName=%s|recipientPhone=%s|paymentDueDate=%s|lines=%s"
                .formatted(
                        nullToEmpty(slip.getPartnerName()),
                        nullToEmpty(slip.getPartnerCode()),
                        nullToEmpty(slip.getMemo()),
                        nullToEmpty(slip.getBusinessNumber()),
                        nullToEmpty(slip.getDeliveryAddress()),
                        nullToEmpty(slip.getSupervisionAddress()),
                        nullToEmpty(slip.getProjectName()),
                        nullToEmpty(slip.getRecipientPhone()),
                        toText(slip.getPaymentDueDate()),
                        summarizeLines(slip.getLines()));
    }

    private String summarizeLines(List<SlipLine> lines) {
        return String.join(",", lines.stream()
                .map(line -> "%s/%s/%s/%s/%d/%s/%s/%s/%s/%s".formatted(
                        line.getProductId() == null ? "" : line.getProductId().toString(),
                        nullToEmpty(line.getModelName()),
                        nullToEmpty(line.getProductName()),
                        nullToEmpty(line.getSpecification()),
                        line.getQuantity(),
                        normalize(line.getUnitPrice()),
                        normalize(line.getSupplyAmount()),
                        normalize(line.getVatAmount()),
                        normalize(line.getLineTotal()),
                        nullToEmpty(line.getNote())))
                .toList());
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private String toText(LocalDate value) {
        return value == null ? "" : value.toString();
    }

    private String normalize(BigDecimal value) {
        return value == null ? "" : value.stripTrailingZeros().toPlainString();
    }

    private BusinessException optimisticLockConflict() {
        return new BusinessException(
                ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT,
                ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT.getDefaultMessage());
    }

    private BusinessException invalidLine(String message) {
        return new BusinessException(ErrorCode.SLIP_UPDATE_INVALID_LINE, message);
    }
}
