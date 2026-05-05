package com.samhanair.logis.dcconfig.service;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PriceCalculationLog;
import com.samhanair.logis.dcconfig.domain.UnitRoundMode;
import com.samhanair.logis.dcconfig.dto.PriceCalculationRequest;
import com.samhanair.logis.dcconfig.dto.PriceCalculationResponse;
import com.samhanair.logis.dcconfig.repository.PriceCalculationLogRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * DC 적용 가격 계산 (legacy `applyConfigFromServer` 1:1 포팅).
 *
 * <p>알고리즘:
 * <ol>
 *   <li>카테고리별 DC율 적용: {@code listPrice * (1 - rate)}</li>
 *   <li>옵션별 정액 DC 차감 (360 / 4way / 1way / stand / deluxe / firstGrade)</li>
 *   <li>단가 반올림 (unitRoundTo + unitRoundMode) — 0 또는 NULL 이면 1원 단위 round</li>
 * </ol>
 *
 * <p>모든 호출은 {@link PriceCalculationLog} 1 row 를 남긴다 (감사용).
 *
 * <p>frontend 의 {@code calcDcPrice.ts} 와 1:1 동기화 — 분쟁 방지를 위해 양쪽 동일 결과.
 */
@Service
@RequiredArgsConstructor
public class PriceCalculationService {

    private static final String CAT_HOMEMULTI = "HOMEMULTI";
    private static final String CAT_COMMERCIAL = "COMMERCIAL_MULTI";

    private final PartnerService partnerService;
    private final DcConfigService dcConfigService;
    private final PriceCalculationLogRepository logRepository;

    /**
     * 가격 계산 + 감사 로그 1 row insert.
     *
     * @param request 정상가 + 카테고리 + 옵션 리스트
     * @return 라인별 적용 단가 + 합계
     */
    @Transactional
    public PriceCalculationResponse calculate(PriceCalculationRequest request) {
        Partner partner = partnerService.getByPartnerCode(request.partnerCode());
        DcConfig config = dcConfigService.findByPartnerCode(request.partnerCode()).orElse(null);

        List<PriceCalculationResponse.Line> lines = new ArrayList<>();
        BigDecimal totalList = BigDecimal.ZERO;
        BigDecimal totalFinal = BigDecimal.ZERO;

        for (PriceCalculationRequest.Line line : request.lines()) {
            BigDecimal listPrice = line.listPrice();
            BigDecimal appliedRate = pickCategoryRate(config, line.category());
            BigDecimal afterRate = listPrice.multiply(BigDecimal.ONE.subtract(appliedRate));
            BigDecimal optionDc = sumOptionDc(config, line);
            BigDecimal afterOption = afterRate.subtract(optionDc).max(BigDecimal.ZERO);
            BigDecimal finalPrice = roundToUnit(afterOption, config);

            int qty = line.quantity() == null ? 0 : line.quantity();
            BigDecimal qtyBd = BigDecimal.valueOf(qty);
            BigDecimal lineFinal = finalPrice.multiply(qtyBd);
            BigDecimal lineList = listPrice.multiply(qtyBd);

            totalList = totalList.add(lineList);
            totalFinal = totalFinal.add(lineFinal);

            lines.add(new PriceCalculationResponse.Line(
                    line.lineId(), listPrice, finalPrice, lineFinal,
                    qty, appliedRate, optionDc));
        }

        BigDecimal totalDiscount = totalList.subtract(totalFinal);
        PriceCalculationResponse response = new PriceCalculationResponse(
                request.partnerCode(), lines, totalList, totalFinal, totalDiscount);

        // 감사 로그 — request/response/applied snapshot 모두 보존
        Map<String, Object> requestPayload = serializeRequest(request);
        Map<String, Object> responsePayload = serializeResponse(response);
        Map<String, Object> snapshot = serializeSnapshot(config);
        logRepository.save(PriceCalculationLog.create(
                partner.getId(), request.callerService(),
                requestPayload, responsePayload, snapshot,
                totalList, totalFinal, totalDiscount));

        return response;
    }

    private BigDecimal pickCategoryRate(DcConfig config, String category) {
        if (config == null || category == null) {
            return BigDecimal.ZERO;
        }
        return switch (category) {
            case CAT_HOMEMULTI -> nz(config.getHomeDiscountRate());
            case CAT_COMMERCIAL -> nz(config.getCommercialDiscountRate());
            default -> BigDecimal.ZERO;
        };
    }

    private BigDecimal sumOptionDc(DcConfig config, PriceCalculationRequest.Line line) {
        if (config == null) return BigDecimal.ZERO;
        BigDecimal sum = BigDecimal.ZERO;
        if (line.is360()) sum = sum.add(nz(config.getDiscount360Amount()));
        if (line.is4Way()) sum = sum.add(nz(config.getDiscount4WayAmount()));
        if (line.is1Way()) sum = sum.add(nz(config.getDiscount1WayAmount()));
        if (line.isStand()) sum = sum.add(nz(config.getDiscountStandAmount()));
        if (line.isDeluxe()) sum = sum.add(nz(config.getDiscountDeluxeAmount()));
        if (line.isFirstGrade()) sum = sum.add(nz(config.getDiscountFirstGradeAmount()));
        return sum;
    }

    /**
     * 단가 반올림 — frontend `roundToUnit` 와 1:1.
     */
    private BigDecimal roundToUnit(BigDecimal price, DcConfig config) {
        if (config == null || config.getUnitRoundTo() == null || config.getUnitRoundTo() <= 0) {
            return price.setScale(0, RoundingMode.HALF_UP);
        }
        BigDecimal unit = BigDecimal.valueOf(config.getUnitRoundTo());
        UnitRoundMode mode = config.getUnitRoundMode() == null ? UnitRoundMode.ROUND : config.getUnitRoundMode();
        RoundingMode rm = switch (mode) {
            case FLOOR -> RoundingMode.FLOOR;
            case CEIL -> RoundingMode.CEILING;
            case ROUND -> RoundingMode.HALF_UP;
        };
        return price.divide(unit, 0, rm).multiply(unit);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private Map<String, Object> serializeRequest(PriceCalculationRequest req) {
        Map<String, Object> m = new HashMap<>();
        m.put("partnerCode", req.partnerCode());
        m.put("callerService", req.callerService());
        m.put("lineCount", req.lines() == null ? 0 : req.lines().size());
        return m;
    }

    private Map<String, Object> serializeResponse(PriceCalculationResponse res) {
        Map<String, Object> m = new HashMap<>();
        m.put("totalListAmount", res.totalListAmount());
        m.put("totalFinalAmount", res.totalFinalAmount());
        m.put("totalDiscountAmount", res.totalDiscountAmount());
        m.put("lineCount", res.lines() == null ? 0 : res.lines().size());
        return m;
    }

    private Map<String, Object> serializeSnapshot(DcConfig config) {
        Map<String, Object> m = new HashMap<>();
        if (config == null) {
            m.put("source", "NONE");
            return m;
        }
        m.put("homeDiscountRate", config.getHomeDiscountRate());
        m.put("commercialDiscountRate", config.getCommercialDiscountRate());
        m.put("unitRoundTo", config.getUnitRoundTo());
        m.put("unitRoundMode", config.getUnitRoundMode());
        m.put("source", config.getSource());
        return m;
    }
}
