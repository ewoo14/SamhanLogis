package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.web.dto.DailyClosingRowResponse;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 출고일 기준 일마감 원본행 조회 — S1. */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class DailyClosingQueryService {

    private static final EnumSet<SlipStatus> INCLUDED_STATUSES = EnumSet.of(
            SlipStatus.CONFIRMED, SlipStatus.DELIVERED, SlipStatus.COMPLETED);

    private final SlipRepository slipRepository;
    private final DailyClosingSourceResolver sourceResolver;
    private final SlipClosedDateGuard closedDateGuard;
    private final ProductClient productClient;

    public List<DailyClosingRowResponse> findRows(LocalDate slipDate) {
        return findRows(slipDate, SlipType.OUTBOUND);
    }

    public List<DailyClosingRowResponse> findRows(LocalDate slipDate, SlipType slipType) {
        if (slipDate == null) {
            throw new IllegalArgumentException("slipDate는 필수입니다.");
        }
        if (slipType == null) {
            throw new IllegalArgumentException("slipType는 필수입니다.");
        }
        var sourceSlips = slipType == SlipType.OUTBOUND
                ? slipRepository.findDailyClosingOutboundSlips(slipDate, INCLUDED_STATUSES)
                : slipRepository.findDailyClosingSlips(slipDate, slipType, INCLUDED_STATUSES);
        Map<String, ProductSummary> productsByModelName = resolveProducts(sourceSlips);
        return sourceSlips.stream()
                .filter(slip -> INCLUDED_STATUSES.contains(slip.getStatus()))
                .flatMap(slip -> java.util.stream.IntStream.range(0, slip.getLines().size())
                        .mapToObj(index -> {
                            var line = slip.getLines().get(index);
                            DailyClosingRowResponse row = DailyClosingRowResponse.from(
                                    slip, line, sourceResolver.resolve(slip, line), index + 1,
                                    line.getModelName() == null ? null : productsByModelName.get(line.getModelName()));
                            boolean dateOpen = closedDateGuard == null
                                    || closedDateGuard.isAmountEditAllowed(slip.getSlipType(), slip.getSlipDate());
                            return row.withAmountEditability(dateOpen,
                                    "회계 마감으로 잠긴 날짜입니다.");
                        }))
                .toList();
    }

    /** 일마감 한 화면의 품목 원본을 product-service에 최대 100건 단위로 한 번에 해소한다. */
    private Map<String, ProductSummary> resolveProducts(List<Slip> slips) {
        if (productClient == null) {
            return Map.of();
        }
        List<String> modelNames = slips.stream()
                .flatMap(slip -> slip.getLines().stream())
                .map(line -> line.getModelName())
                .filter(modelName -> modelName != null && !modelName.isBlank())
                .distinct()
                .toList();
        if (modelNames.isEmpty()) {
            return Map.of();
        }
        List<ProductSummary> resolvedProducts = productClient.lookupByModelNames(modelNames);
        if (resolvedProducts == null) {
            return Map.of();
        }
        return resolvedProducts.stream()
                .filter(summary -> summary != null && summary.modelName() != null)
                .collect(Collectors.toMap(ProductSummary::modelName, Function.identity(), (first, ignored) -> first));
    }
}
