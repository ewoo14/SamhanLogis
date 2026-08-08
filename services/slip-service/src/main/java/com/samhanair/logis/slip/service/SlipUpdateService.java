package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매입 전표 direct PUT 수정 서비스.
 *
 * <p>WAREHOUSE/MANAGER/MASTER 가 기존 SlipEditRequest 승인 흐름을 거치지 않고 INBOUND 전표를
 * 즉시 수정한다. stale {@code updatedAt} 은 409 로, 라인 검증 실패는 422 로 반환한다.
 */
@Service
@RequiredArgsConstructor
public class SlipUpdateService {

    private final SlipRepository slipRepository;
    private final SlipAuditLogService auditLogService;
    private final SlipRevisionService slipRevisionService;
    private final PartnerProductPriceMemoryService priceMemoryService;
    private final ProductClient productClient;
    private final SlipClosedDateGuard closedDateGuard;

    /**
     * 매입 전표 헤더와 라인을 전체 교체한다.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>전표 조회 및 INBOUND 타입 검증 (도메인 메서드에 위임)</li>
     *   <li>라인 유효성 검증 — try 외부에서 즉시 처리</li>
     *   <li>수정 전 스냅샷 {@code before} 캡처 (도메인 변경 전)</li>
     *   <li>도메인 메서드 호출 후 {@code saveAndFlush}</li>
     *   <li>flush 결과 기준 {@code after} 캡처 → 변경 있을 때만 audit 기록</li>
     * </ol>
     *
     * @param id 전표 ID
     * @param request 수정 요청
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @return 수정 후 상세 응답
     */
    @Transactional
    public SlipDetailResponse update(UUID id, SlipUpdateRequest request,
                                     UUID actorId, String actorName) {
        // [D-R8-9] 계약 마커 검증은 조회보다 먼저다 — 구 클라이언트에게는 전표의 존재 여부(404)나
        // 낙관적 잠금(409)보다 "앱을 업데이트하라"가 유일하게 조치 가능한 정보이며, 어떤 상태도
        // 읽기 전에 거부하는 편이 게이트의 의도(쓰기 차단)를 가장 좁게 표현한다.
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
        rejectAuthoritativeBundleComponents(replacementLines, request.lines());
        try {
            slip.updateHeader(
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
            // 바꾼 저장의 단가가 갱신 전 partnerId(원 거래처)에 각인된다. 견적(EstimateService)이
            // 이미 editHeader 이후 estimate.getPartnerId() 를 읽으므로 그 순서와 정렬한다.
            List<PartnerProductPriceMemoryCommand> priceMemoryCommands = collectPriceMemory(
                    slip, replacementLines, actorId == null ? null : actorId.toString());
            slip.replaceLines(replacementLines, actorId == null ? null : actorId.toString());
            Slip saved = slipRepository.saveAndFlush(slip);
            // after 는 saveAndFlush 결과 기준으로 캡처하여 ordering 명확화
            String after = summarize(saved);
            if (!Objects.equals(before, after)) {
                // 버전 스냅샷은 audit revisionCount 증가와 독립 기록해 기존 PUT 응답 version 계약을 보존한다.
                slipRevisionService.capture(saved, SlipRevisionType.EDIT, null, actorId, actorName, null);
                auditLogService.recordBatch(saved.getId(), actorId, actorName, null,
                        List.of(new SlipAuditLogService.ChangeEntry("SLIP_EDIT", before, after)));
            }
            priceMemoryService.rememberBatchAfterCommit(priceMemoryCommands, "slip.purchaseUpdate");
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
            throw invalidLine("매입 라인은 1건 이상이어야 합니다.");
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
     * 요청 lineId 가 현재 전표의 활성 라인인지 검증한다.
     *
     * <p>다른 전표의 라인 UUID 주입은 lineId 기반 계보 승계의 IDOR 경로가 될 수 있으므로
     * 400 INVALID_INPUT 으로 거부한다. 403 대신 400을 사용해 타 문서의 존재 여부를
     * 구분해 노출하지 않는다.
     *
     * <p>개별 라인의 {@code lineId == null} 은 <b>정상</b>이다 — 편집 중 추가된 신규 라인을 뜻하며
     * 계보를 승계하지 않는 평면 라인으로 남는다. 다만 기존 계보 구성품 ID가 누락된 요청에 신규
     * 익명 라인이 함께 있으면 부분 재생성으로 계보가 파괴될 수 있어 {@link LineIdContractGate}가
     * 별도로 거부한다. 평면 문서의 전 라인 교체는 정상이다.
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
     * [D-R8-6 · D-R8-9] 매입 전표 PUT 은 lineId 계약 선언을 의무화한다 — 판정은 공용
     * {@link LineIdContractGate} 단일 구현에 위임한다 (매입/매출/견적 비대칭 재발 차단).
     *
     * <p>D-R8-6 이 세운 계약(lineId 미전송 PUT = 400)은 그대로 유지되며, D-R8-9 는 그 400 의
     * <b>판정 기준만</b> "lineId 개수" 에서 "요청 레벨 마커 유무" 로 옮겼다. 파괴 경로(R8-QA-1 —
     * 무수정 왕복 PUT 이 계보 전량 파괴)는 여전히 차단된다: 구 클라이언트는 마커를 보내지
     * 않으므로 라인을 한 줄도 건드리기 전에 여기서 거부된다.
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
     * 매입 수정 라인의 VAT 포함 단가를 가격기억에 저장한다.
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
        // String.join 으로 "a,b,c" 형식 — "[a, b, c]" toString() 혼용 방지
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
