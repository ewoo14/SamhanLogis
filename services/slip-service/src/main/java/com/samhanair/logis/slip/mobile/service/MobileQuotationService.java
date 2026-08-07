package com.samhanair.logis.slip.mobile.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.estimate.service.EstimateNumberService;
import com.samhanair.logis.slip.estimate.web.dto.EstimateDetailResponse;
import com.samhanair.logis.slip.mobile.dto.MobileQuotationRequest;
import com.samhanair.logis.slip.price.domain.PartnerProductPriceMemory;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.service.BundleModePolicy;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
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
 * 모바일 견적 발행 서비스 — P1-4 Native 영업 앱.
 *
 * <p>기존 {@link com.samhanair.logis.slip.estimate.service.EstimateService} 를 재사용하되
 * 모바일 간소형 요청({@link MobileQuotationRequest}) 을 처리한다.
 * 거래처 식별은 partnerCode 로만 받아 {@link PartnerInternalClient} 로 UUID 와
 * snapshot 정보를 자동 resolve 한다.
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>partnerCode → partner-service lookup (strict — 미존재 시 NOT_FOUND 예외)</li>
 *   <li>라인 productId 일괄 검증 (ProductClient)</li>
 *   <li>채번 (EstimateNumberService)</li>
 *   <li>Estimate 헤더 + 라인 생성 후 저장</li>
 * </ol>
 *
 * <p>partner-service 검증 불가(5xx 또는 404 외 4xx — 401/403/408/429 등) 시 NOT_FOUND 대신
 * INTERNAL_ERROR 로 응답 (fail-fast — 모바일 견적 발행은 부정확한 거래처 정보 저장 방지가 우선).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class MobileQuotationService {

    private static final Logger log = LoggerFactory.getLogger(MobileQuotationService.class);

    private final EstimateRepository estimateRepository;
    private final EstimateNumberService estimateNumberService;
    private final ProductClient productClient;
    private final PartnerInternalClient partnerInternalClient;
    private final PartnerProductPriceMemoryService priceMemoryService;

    /**
     * 모바일 간소형 견적 발행 — DRAFT 상태로 생성.
     *
     * @param req          모바일 견적 요청 ({@link MobileQuotationRequest})
     * @param requesterId  요청자 user-id (gateway X-User-Id)
     * @return 생성된 견적 상세 응답 ({@link EstimateDetailResponse})
     * @throws BusinessException(NOT_FOUND) partnerCode 미등록
     * @throws BusinessException(INTERNAL_ERROR) partner-service 검증 불가(5xx 또는 404 외 4xx)
     * @throws BusinessException(INVALID_INPUT) productId 미존재 또는 입력 불량
     */
    public EstimateDetailResponse createQuotation(MobileQuotationRequest req, String requesterId) {
        // 1. partnerCode → partner-service lookup (strict)
        PartnerVerifyResult partnerResult =
                partnerInternalClient.verifyPartnerCode(req.partnerCode());
        UUID partnerId = null;
        String partnerName = null;
        String partnerBusinessNo = null;
        String partnerAddress = null;

        switch (partnerResult.status()) {
            case FOUND -> {
                partnerId = partnerResult.partnerId().orElse(null);
                // partner 상세 정보(name/bizNo/address)는 partnerCode 조회 결과에서 온다
                // PartnerInternalClient 는 현재 partnerId 만 추출 — name 은 별도 조회 또는 미채움
                // 모바일 견적은 partnerCode 로 식별하고 name 은 view 에서 별도 조회
                log.debug("MobileQuotationService — partnerCode={} resolved, partnerId={}",
                        req.partnerCode(), partnerId);
            }
            case NOT_FOUND -> throw new BusinessException(ErrorCode.NOT_FOUND,
                    "거래처 코드 '" + req.partnerCode() + "' 가 partner-service 에 등록되지 않았습니다.");
            case SERVER_ERROR -> throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "거래처 정보 조회 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.");
            case SKIPPED -> log.warn("MobileQuotationService — partnerCode blank 또는 internal token 미설정, " +
                    "파트너 검증 skip (requesterId={})", requesterId);
        }

        // 2. 라인 productId 일괄 검증 + snapshot 보강
        List<UUID> productIds = req.lines().stream()
                .map(MobileQuotationRequest.MobileQuotationLineRequest::productId)
                .distinct()
                .toList();
        List<ProductSummary> summaries = productClient.lookup(productIds);
        Map<UUID, ProductSummary> byId = new HashMap<>();
        for (ProductSummary s : summaries) {
            byId.put(s.id(), s);
        }

        // 3. 채번
        LocalDate estimateDate = req.estimateDate() != null ? req.estimateDate() : LocalDate.now();
        String estimateNo = estimateNumberService.next(estimateDate);
        int seqNo = estimateNumberService.extractSeqNo(estimateNo);

        // 4. 유효기간 설정 (null 이면 30일 기본)
        LocalDate validUntil = req.validUntil() != null
                ? req.validUntil()
                : estimateDate.plusDays(30);

        // 5. Estimate 헤더 생성
        Estimate estimate = Estimate.create(
                estimateNo, estimateDate, seqNo,
                partnerId,
                partnerName,          // null — view 에서 partnerCode 로 표시
                partnerBusinessNo,    // null
                partnerAddress,       // null
                validUntil,
                req.memo(),
                requesterId);

        // 6. 라인 추가
        int lineNo = 1;
        List<PartnerProductPriceMemoryCommand> priceMemoryCommands = new ArrayList<>();
        for (MobileQuotationRequest.MobileQuotationLineRequest lineReq : req.lines()) {
            ProductSummary summary = byId.get(lineReq.productId());
            String productName2 = lineReq.productName() != null
                    ? lineReq.productName()
                    : (summary != null ? summary.name() : null);
            String modelName = lineReq.modelName() != null
                    ? lineReq.modelName()
                    : (summary != null ? summary.modelName() : null);
            boolean bundle = BundleModePolicy.shouldExpand(summary);
            if (bundle) {
                if (summary.modelCode() == null || summary.modelCode().isBlank()) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "세트 품목의 구성품 전개 정보가 없어 견적을 저장할 수 없습니다");
                }
                if (partnerId != null) {
                    priceMemoryCommands.add(new PartnerProductPriceMemoryCommand(
                            partnerId, lineReq.productId(), lineReq.unitPrice()
                                    .multiply(new BigDecimal("1.1"))
                                    .setScale(2, RoundingMode.HALF_UP),
                            PartnerProductPriceMemory.SOURCE_BUNDLE_SET, requesterId));
                }
                List<ExpandedLineDto> expanded = productClient.expand(
                        summary.modelCode(), BigDecimal.valueOf(lineReq.quantity()), null,
                        lineReq.unitPrice());
                int added = 0;
                for (ExpandedLineDto component : expanded) {
                    if (component.productId() == null) {
                        continue;
                    }
                    int quantity = component.quantity() == null
                            ? lineReq.quantity()
                            : component.quantity().setScale(0, RoundingMode.HALF_UP).intValue();
                    if (quantity <= 0) {
                        quantity = 1;
                    }
                    String specification = component.specification() != null
                            && !component.specification().isBlank()
                            ? component.specification() : lineReq.specification();
                    EstimateLine componentLine = EstimateLine.create(
                            estimate, lineNo++, component.productId(), component.name(),
                            component.modelName(), specification, quantity,
                            component.unitPrice() == null ? BigDecimal.ZERO : component.unitPrice(),
                            lineReq.note());
                    componentLine.assignBundleComponent(summary.modelCode(), component.setHead());
                    estimate.addLine(componentLine);
                    added++;
                }
                if (added == 0 || added < expanded.size()) {
                    throw new BusinessException(ErrorCode.NOT_FOUND,
                            "세트 구성품 일부를 찾을 수 없습니다(미등록/단종): " + summary.modelCode());
                }
            } else {
                estimate.addLine(EstimateLine.create(
                        estimate, lineNo++, lineReq.productId(),
                        productName2, modelName, lineReq.specification(),
                        lineReq.quantity(), lineReq.unitPrice(), lineReq.note()));
                if (partnerId != null) {
                    BigDecimal vatInclusive = lineReq.unitPrice()
                            .multiply(new BigDecimal("1.1"))
                            .setScale(2, RoundingMode.HALF_UP);
                    priceMemoryCommands.add(new PartnerProductPriceMemoryCommand(
                            partnerId, lineReq.productId(), vatInclusive,
                            PartnerProductPriceMemory.SOURCE_LINE_SAVE, requesterId));
                }
            }
        }

        Estimate saved = estimateRepository.save(estimate);
        priceMemoryService.rememberBatchAfterCommit(priceMemoryCommands, "mobileQuotation.create");
        return EstimateDetailResponse.from(saved);
    }
}
