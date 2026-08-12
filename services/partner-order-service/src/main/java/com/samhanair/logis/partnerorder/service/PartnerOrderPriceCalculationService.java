package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.discount.LegacyModelFlags;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.web.dto.ConfirmLineRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 주문 가격의 단일 진입점.
 *
 * <p>사용자용 미리보기와 주문 확정이 모두 이 서비스를 호출하고, 이 서비스만
 * {@link DcConfigClient}의 서버 계산 결과를 소비한다. 미리보기 실패는 호출자가
 * 자체 할인율로 대체하지 않도록 {@code available=false}로 전달한다.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderPriceCalculationService {

    private static final Set<String> RESOLVED_FIXED_DISCOUNT_SOURCES =
            Set.of("NONE", "PRODUCT", "S", "M", "L");

    private final ProductClient productClient;
    private final DcConfigClient dcConfigClient;

    /** 서버 계산 결과와 화면/주문에 필요한 제품 스냅샷. */
    public record Calculation(List<Line> lines, boolean available,
                              BigDecimal totalListAmount, BigDecimal totalFinalAmount) {}

    /** 한 주문 라인의 서버 계산 결과. */
    public record Line(int index, ConfirmLineRequest request, ProductSummary product,
                       BigDecimal listPrice, BigDecimal finalPrice, BigDecimal appliedRate) {}

    /**
     * 확인 요청과 동일한 입력으로 가격을 계산한다.
     *
     * @param partnerCode 거래처 코드
     * @param request 주문/미리보기 라인
     * @return 서버 계산 결과. dc-config 장애/부분 응답 시 available=false
     */
    public Calculation calculate(String partnerCode, ConfirmRequest request) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "partnerCode 필수");
        }
        if (request == null || request.lines() == null || request.lines().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "가격 계산 라인이 필요합니다");
        }

        List<UUID> productIds = request.lines().stream()
                .map(ConfirmLineRequest::productId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        List<String> modelCodes = request.lines().stream()
                .filter(line -> line.productId() == null)
                .map(ConfirmLineRequest::modelCode)
                .filter(code -> code != null && !code.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        if (productIds.isEmpty() && modelCodes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "확정 라인에 productId 또는 modelCode가 필요합니다");
        }

        List<ProductSummary> productsById = productIds.isEmpty()
                ? List.of() : productClient.lookup(productIds);
        List<ProductSummary> productsByModelCode = modelCodes.isEmpty()
                ? List.of() : productClient.lookupByModelCodes(modelCodes);
        Map<UUID, ProductSummary> productMap = new HashMap<>();
        Map<String, ProductSummary> modelCodeMap = new HashMap<>();
        for (ProductSummary product : productsById) {
            productMap.put(product.id(), product);
        }
        for (ProductSummary product : productsByModelCode) {
            productMap.put(product.id(), product);
            if (product.modelCode() != null && !product.modelCode().isBlank()) {
                modelCodeMap.put(product.modelCode().trim(), product);
            }
        }

        List<ConfirmLineRequest> requestLines = request.lines();
        List<ProductSummary> lineProducts = new ArrayList<>();
        for (ConfirmLineRequest line : requestLines) {
            ProductSummary product = resolveProduct(line, productMap, modelCodeMap);
            if (product == null) {
                String identity = line.productId() != null
                        ? line.productId().toString() : line.modelCode();
                throw new BusinessException(ErrorCode.NOT_FOUND, "제품 카탈로그 없음: " + identity);
            }
            lineProducts.add(product);
        }

        List<UUID> legacyFixedDiscountProductIds = lineProducts.stream()
                .filter(product -> !hasResolvedFixedDiscountSource(product))
                .map(ProductSummary::id)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, BigDecimal> fixedDiscountRates = legacyFixedDiscountProductIds.isEmpty()
                ? Map.of()
                : productClient.lookupFixedDiscountRates(legacyFixedDiscountProductIds);
        if (fixedDiscountRates == null) {
            fixedDiscountRates = Map.of();
        }

        List<DcConfigClient.PriceLine> priceLines = new ArrayList<>();
        List<BigDecimal> listPrices = new ArrayList<>();
        for (int i = 0; i < requestLines.size(); i++) {
            ConfirmLineRequest line = requestLines.get(i);
            ProductSummary product = lineProducts.get(i);
            String discountFlags = optionFlags(product);
            BigDecimal fixedDiscountRate = product.fixedDiscountRate() != null
                    ? product.fixedDiscountRate() : fixedDiscountRates.get(product.id());
            BigDecimal listPrice = resolveListPrice(product, line.categoryKey(), fixedDiscountRate);
            if (listPrice == null || listPrice.signum() <= 0) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "확정 가격 기준가 없음: " + modelCodeSnapshot(product));
            }
            listPrices.add(listPrice);
            priceLines.add(new DcConfigClient.PriceLine(
                    String.valueOf(i), modelCodeSnapshot(product), listPrice,
                    mapCategory(line.categoryKey()), line.quantity(),
                    discountFlag(discountFlags, 0), discountFlag(discountFlags, 1),
                    discountFlag(discountFlags, 2), discountFlag(discountFlags, 3),
                    discountFlag(discountFlags, 4), discountFlag(discountFlags, 5),
                    fixedDiscountRate, variableDiscountEnabled(product),
                    product.physicalCategoryCode()));
        }

        DcConfigClient.CalculationResult serverResult =
                dcConfigClient.calculateDetailed(partnerCode, priceLines);
        if (serverResult == null) {
            // 구형 테스트 대역/호출자와의 호환 경로. 실제 Spring bean에서는 detailed 결과가
            // 항상 반환되며, 미리보기 실패를 이 경로에서 자체 계산으로 대체하지 않는다.
            Map<String, BigDecimal> legacyPrices = dcConfigClient.calculatePrices(partnerCode, priceLines);
            Map<String, DcConfigClient.CalculatedLine> legacyLines = new HashMap<>();
            if (legacyPrices != null) {
                legacyPrices.forEach((lineId, price) ->
                        legacyLines.put(lineId, new DcConfigClient.CalculatedLine(price, null)));
            }
            serverResult = new DcConfigClient.CalculationResult(
                    legacyLines, legacyPrices != null && !legacyPrices.isEmpty());
        }
        Map<String, DcConfigClient.CalculatedLine> calculated = serverResult.lines();
        if (calculated == null) {
            calculated = Map.of();
        }
        List<Line> resultLines = new ArrayList<>();
        BigDecimal totalList = BigDecimal.ZERO;
        BigDecimal totalFinal = BigDecimal.ZERO;
        for (int i = 0; i < requestLines.size(); i++) {
            DcConfigClient.CalculatedLine calculatedLine = calculated.get(String.valueOf(i));
            BigDecimal finalPrice = calculatedLine == null || calculatedLine.finalPrice() == null
                    ? listPrices.get(i) : calculatedLine.finalPrice();
            resultLines.add(new Line(i, requestLines.get(i), lineProducts.get(i), listPrices.get(i),
                    finalPrice, calculatedLine == null ? null : calculatedLine.appliedRate()));
            BigDecimal quantity = BigDecimal.valueOf(requestLines.get(i).quantity());
            totalList = totalList.add(listPrices.get(i).multiply(quantity));
            totalFinal = totalFinal.add(finalPrice.multiply(quantity));
        }
        boolean allLineIdsPresent = calculated.size() == requestLines.size();
        for (int i = 0; allLineIdsPresent && i < requestLines.size(); i++) {
            allLineIdsPresent = calculated.containsKey(String.valueOf(i));
        }
        boolean complete = serverResult.available()
                && allLineIdsPresent
                && resultLines.size() == requestLines.size()
                && resultLines.stream().allMatch(line -> line.finalPrice() != null
                        && line.finalPrice().signum() > 0);
        return new Calculation(resultLines, complete, totalList, totalFinal);
    }

    private ProductSummary resolveProduct(ConfirmLineRequest line,
                                          Map<UUID, ProductSummary> productMap,
                                          Map<String, ProductSummary> modelCodeMap) {
        if (line.productId() != null) {
            return productMap.get(line.productId());
        }
        if (line.modelCode() == null || line.modelCode().isBlank()) {
            return null;
        }
        return modelCodeMap.get(line.modelCode().trim());
    }

    private String mapCategory(String categoryKey) {
        if (categoryKey == null) {
            return "OTHER";
        }
        return switch (categoryKey) {
            case "homemulti", "homeDefaults" -> "HOMEMULTI";
            case "commercialMulti" -> "COMMERCIAL_MULTI";
            default -> "OTHER";
        };
    }

    private String modelCodeSnapshot(ProductSummary product) {
        if (product.modelCode() != null && !product.modelCode().isBlank()) {
            return product.modelCode().trim();
        }
        return product.modelName();
    }

    private boolean discountFlag(String flags, int index) {
        return flags != null && flags.length() > index && flags.charAt(index) == '1';
    }

    /**
     * #1090 전환 전 데이터 호환 규칙. 분류가 없는 품목에만 레거시 모델코드 옵션을
     * 임시로 유지하며, discountOption 정본이 채워지는 순간 분류 정본만 사용한다.
     */
    private String optionFlags(ProductSummary product) {
        if (product.discountOption() == null) {
            if (product.discountFlags() != null && product.discountFlags().matches("[01]{6}")
                    && !"000000".equals(product.discountFlags())) {
                return product.discountFlags();
            }
            LegacyModelFlags flags = LegacyModelFlags.from(
                    product.modelCode() != null ? product.modelCode() : product.modelName());
            if (flags.is360()) return "100000";
            if (flags.is4Way()) return "010000";
            if (flags.is1Way()) return "001000";
            if (flags.isStand()) return "000100";
            if (flags.isDeluxe()) return "000010";
            if (flags.isFirstGrade()) return "000001";
        }
        return optionFlags(product.discountOption());
    }

    private String optionFlags(String option) {
        return switch (option == null ? "" : option) {
            case "THREE_SIXTY" -> "100000";
            case "FOUR_WAY" -> "010000";
            case "ONE_WAY" -> "001000";
            case "STAND" -> "000100";
            case "DELUXE" -> "000010";
            case "FIRST_GRADE" -> "000001";
            default -> "000000";
        };
    }

    private BigDecimal resolveListPrice(ProductSummary product, String categoryKey,
                                        BigDecimal fixedDiscountRate) {
        boolean multi = "homemulti".equals(categoryKey) || "homeDefaults".equals(categoryKey)
                || "commercialMulti".equals(categoryKey);
        BigDecimal primary;
        if (multi) {
            primary = fixedDiscountRate != null || variableDiscountEnabled(product)
                    ? product.releasePrice() : product.deliveryPrice();
        } else if ("oldProducts".equals(categoryKey)) {
            primary = product.releasePrice();
        } else {
            primary = product.deliveryPrice();
        }
        if (primary != null && primary.signum() > 0) {
            return primary;
        }
        return product.sellingPrice();
    }

    private boolean variableDiscountEnabled(ProductSummary product) {
        return product.hasVariableDiscount() == null || product.hasVariableDiscount();
    }

    /**
     * 현재 product-service lookup이 고정DC 해석 결과를 명시했는지 판정한다.
     * {@code NONE}은 고정DC 미설정이라는 유효한 정상 결과이며, marker가 없거나 알 수 없으면
     * 구형 product-service 호환 보조 조회가 필요하다.
     */
    private boolean hasResolvedFixedDiscountSource(ProductSummary product) {
        String source = product.fixedDiscountSource();
        return source != null
                && RESOLVED_FIXED_DISCOUNT_SOURCES.contains(source.trim().toUpperCase(java.util.Locale.ROOT));
    }
}
