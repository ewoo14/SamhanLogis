package com.samhanair.logis.slip.mobile.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.mobile.dto.MobilePartnerOrderRequest;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.SlipNumberService;
import com.samhanair.logis.slip.service.BundleModePolicy;
import com.samhanair.logis.slip.service.WarehouseCodeSnapshotService;
import com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuard;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 모바일 거래처 주문 발행 서비스 — P1-4 Native 영업 앱.
 *
 * <p>출장 중 영업 직원이 거래처 현장에서 주문을 즉시 등록한다. 내부적으로
 * OUTBOUND 타입의 슬립(Slip)을 DRAFT 상태로 생성하며, 기존
 * {@link com.samhanair.logis.slip.service.SlipService#create} 와 동일한 채번/검증 흐름을
 * 따르되 모바일 간소형 요청({@link MobilePartnerOrderRequest}) 을 처리한다.
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>partnerCode → partner-service lookup (strict — 미존재 시 NOT_FOUND 예외)</li>
 *   <li>라인 productId 일괄 검증 (ProductClient)</li>
 *   <li>채번 (SlipNumberService)</li>
 *   <li>Slip OUTBOUND DRAFT 생성 + 라인 추가 + shippingAddress / receiverPhone 적용</li>
 * </ol>
 *
 * <p>partner-service 검증 불가(5xx 또는 404 외 4xx — 401/403/408/429 등) 시 INTERNAL_ERROR 응답
 * (fail-fast — 부정확한 거래처 저장 방지 우선).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class MobilePartnerOrderService {

    private static final Logger log = LoggerFactory.getLogger(MobilePartnerOrderService.class);
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HHmmss");

    private final SlipRepository slipRepository;
    private final SlipNumberService slipNumberService;
    private final ProductClient productClient;
    private final PartnerInternalClient partnerInternalClient;
    /** 신규 모바일 OUTBOUND 저장 후 inventory 원천 warehouse code 보강. */
    private final WarehouseCodeSnapshotService warehouseCodeSnapshotService;
    /** 출고전표 마감 게이트 — 모바일 주문 발행 생성 경로(게이트③). */
    private final OutboundCutoffGuard cutoffGuard;
    private final SlipClosedDateGuard closedDateGuard;
    /** KST 기준 오늘 — 컷오프 게이트와 동일 Clock. */
    private final Clock clock;

    /**
     * 모바일 거래처 주문 발행 — OUTBOUND DRAFT 슬립 생성.
     *
     * @param req         모바일 주문 요청 ({@link MobilePartnerOrderRequest})
     * @param requesterId 요청자 user-id (gateway X-User-Id)
     * @return 생성된 슬립 상세 응답 ({@link SlipDetailResponse})
     * @throws BusinessException(NOT_FOUND)      partnerCode 미등록
     * @throws BusinessException(INTERNAL_ERROR) partner-service 검증 불가(5xx 또는 404 외 4xx)
     * @throws BusinessException(INVALID_INPUT)  productId 미존재 또는 입력 불량
     */
    public SlipDetailResponse createOrder(MobilePartnerOrderRequest req, String requesterId) {
        // 1. partnerCode → partner-service lookup (strict)
        PartnerVerifyResult partnerResult =
                partnerInternalClient.verifyPartnerCode(req.partnerCode());
        UUID partnerId = null;

        switch (partnerResult.status()) {
            case FOUND -> {
                partnerId = partnerResult.partnerId().orElse(null);
                log.debug("MobilePartnerOrderService — partnerCode={} resolved, partnerId={}",
                        req.partnerCode(), partnerId);
            }
            case NOT_FOUND -> throw new BusinessException(ErrorCode.NOT_FOUND,
                    "거래처 코드 '" + req.partnerCode() + "' 가 partner-service 에 등록되지 않았습니다.");
            case SERVER_ERROR -> throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "거래처 정보 조회 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.");
            case SKIPPED -> log.warn("MobilePartnerOrderService — partnerCode blank 또는 internal token 미설정, " +
                    "파트너 검증 skip (requesterId={})", requesterId);
        }

        // 2. 라인 productId 일괄 검증 + snapshot 보강
        List<UUID> productIds = req.lines().stream()
                .map(MobilePartnerOrderRequest.MobileOrderLineRequest::productId)
                .distinct()
                .toList();
        List<ProductSummary> summaries = productClient.lookup(productIds);
        Map<UUID, ProductSummary> byId = new HashMap<>();
        for (ProductSummary s : summaries) {
            byId.put(s.id(), s);
        }
        if (summaries.stream().anyMatch(BundleModePolicy::shouldExpand)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "세트 품목은 모바일 판매전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요.");
        }

        // 3. 채번
        LocalDate slipDate = req.slipDate() != null ? req.slipDate() : LocalDate.now(clock);
        closedDateGuard.assertCreatable(com.samhanair.logis.slip.domain.SlipType.OUTBOUND, slipDate, requesterId);
        String slipNo = slipNumberService.next(slipDate, com.samhanair.logis.slip.domain.SlipType.OUTBOUND);
        int seqNo = slipNumberService.extractSeqNo(slipNo);

        // 4. OUTBOUND DRAFT 슬립 헤더 생성
        // partnerName snapshot 은 null — view 에서 partnerCode 로 partner-service 별도 조회
        Slip slip = Slip.createOutbound(
                slipNo, slipDate, seqNo,
                req.sourceWarehouseId(),
                null,           // destinationWarehouseId — 모바일 즉시 발행 시 미지정
                partnerId,
                null,           // partnerName — null (partnerCode snapshot 으로 식별)
                null,           // deliveryTag — 현장 발행 시 미지정
                req.memo(),
                requesterId);

        // [게이트③] 모바일 주문 출고전표 생성 마감 게이트 — createOutbound 직후.
        // deliveryTag null(현장 발행 시 미지정) 이므로 assertWithinCutoff 내부에서 즉시 통과.
        // 태그 확정(editHeader)은 SlipForm 저장 시 게이트⑦이 잡는다.
        cutoffGuard.assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate(),
                com.samhanair.logis.slip.domain.SlipType.OUTBOUND, requesterId);

        if (partnerId != null) {
            partnerInternalClient.resolveBusinessNumber(partnerId)
                    .ifPresent(slip::setBusinessNumber);
        }

        // 5. partnerCode snapshot 기록 (V15 컬럼)
        slip.setPartnerCode(req.partnerCode());

        // 6. 배송지 / 수령자 정보 적용 (V16 eCount schema)
        String timeDate = LocalTime.now().format(TIME_FMT);
        slip.applyEcountSchema(
                "10",                   // ioType = 출고
                timeDate,
                null,                   // customerTel
                null,                   // customerAddress
                null,                   // customerRepresentative
                req.shippingAddress(),
                null,                   // inspectionAddress
                req.receiverPhone(),
                null,                   // paymentDueLabel
                null,                   // discountInfo
                null,                   // collectTerm
                null);                  // agreeTerm

        // 7. 라인 추가
        for (MobilePartnerOrderRequest.MobileOrderLineRequest lineReq : req.lines()) {
            ProductSummary summary = byId.get(lineReq.productId());
            String productName = lineReq.productName() != null
                    ? lineReq.productName()
                    : (summary != null ? summary.name() : null);
            String modelName = lineReq.modelName() != null
                    ? lineReq.modelName()
                    : (summary != null ? summary.modelName() : null);
            slip.addLine(SlipLine.create(
                    slip, lineReq.productId(),
                    productName, modelName, lineReq.specification(),
                    lineReq.quantity(), lineReq.unitPrice(), lineReq.note()));
        }

        // [게이트③-배송일정] 모바일 주문 출고전표 생성 시 deliveryTag null → unloadDate null.
        // 태그 확정(editHeader)은 SlipForm 저장 시 게이트⑦ 에서 applyDeliverySchedule 가 수행.
        slip.applyDeliverySchedule(slip.getDeliveryTag(), null);

        slip.markSourceWarehouseCodePending();

        Slip saved = slipRepository.save(slip);
        warehouseCodeSnapshotService.scheduleAfterCommit(
                saved.getId(), saved.getSourceWarehouseId());
        return SlipDetailResponse.from(saved);
    }
}
