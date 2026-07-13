package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.ProductLabelMatch;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * 일마감 단가변동 재검증 엔진.
 *
 * <p>legacy GAS 일마감 프로그램의 확인 판정 분기를 S2b 범위에서 read-time 으로 재현한다.
 * 원천 마감 금액은 변경하지 않고, 그룹별 유효단가와 product-service referent 를 대조해
 * 화면 노출용 판정 결과만 생성한다.
 *
 * <p>VAT parity: {@code effectiveUnitPrice = supplyAmount / quantity} 는 VAT 제외 순액이다.
 * {@code PriceHistorySeeder} 는 {@code Product.releasePrice/deliveryPrice} 를 그대로
 * {@code price_history} 로 복사하며, dev {@code HvacProductSeeder} fixture 는
 * {@code price_includes_vat=true} 로 생성된다. S2b {@code ApplicablePrice} 계약에는 VAT 포함 여부가
 * 없으므로 본 엔진은 스펙 §6.4 대로 raw release 를 사용한다. 실 시트 price_history 가 VAT 포함으로
 * 확정되면 분자/분모 기준 불일치로 할인율이 VAT 배율만큼 어긋날 수 있어 referent DTO 확장 또는
 * 정규화가 필요하다.
 */
@Component
public class DiscountRevalidator {

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");
    private static final Pattern FREIGHT_OR_CUTTING = Pattern.compile("(운임|절삭)");
    private static final Pattern OLD_FIFTY_PREFIX = Pattern.compile("^(AM|NJ|NS|AVX).*");
    private static final Pattern ACCESSORY_LABEL = Pattern.compile("(유연호스|발통세트|일자발|방진가대)");
    private static final Pattern MULTI_LABEL = Pattern.compile("(?i).*(멀티|MULTI).*");
    private static final Pattern SINGLE_SET_DEPENDENT_PREFIX =
            Pattern.compile("^(AC|AP|AR|AF|PC|AWR|ARR).*");

    /** 재검증 사유 status. */
    public enum Status {
        /** 판정 완료. verified 값이 true/false 로 채워진다. */
        VERIFIED,
        /** product-service 라벨 해소 404. */
        NOT_FOUND,
        /** product-service 라벨 해소 409. */
        AMBIGUOUS,
        /** 매칭됐지만 적용 정가가 없어 판정 불가. */
        MISSING_REFERENT,
        /** 세트/약정DC 의존 분기로 S2b 범위 밖. */
        OUT_OF_SCOPE
    }

    /**
     * 일마감 모델 그룹 1건을 재검증한다.
     *
     * @param itemName 회계 라벨
     * @param modelToken 라벨에서 추출한 모델 토큰
     * @param effectiveUnitPrice 그룹 공급가액/수량. qty=0 이면 null 허용
     * @param releasePrice 적용 출고가(순액)
     * @param deliveryPrice 적용 납품가(순액)
     * @param fixedDc 고정 DC율 percent 값(예: 45.00). null 은 미설정
     * @param matchStatus 라벨 매칭 상태
     * @return 재검증 결과
     */
    public Revalidation revalidate(String itemName,
                                   String modelToken,
                                   BigDecimal effectiveUnitPrice,
                                   BigDecimal releasePrice,
                                   BigDecimal deliveryPrice,
                                   BigDecimal fixedDc,
                                   ProductLabelMatch.Status matchStatus) {
        if (matchStatus == ProductLabelMatch.Status.NOT_FOUND) {
            return unresolved(Status.NOT_FOUND, releasePrice, deliveryPrice);
        }
        if (matchStatus == ProductLabelMatch.Status.AMBIGUOUS) {
            return unresolved(Status.AMBIGUOUS, releasePrice, deliveryPrice);
        }
        if (releasePrice == null || releasePrice.compareTo(BigDecimal.ZERO) == 0) {
            return new Revalidation(null, null, null, Status.MISSING_REFERENT,
                    releasePrice, deliveryPrice);
        }

        String safeItemName = itemName == null ? "" : itemName;
        String safeModelToken = modelToken == null ? "" : modelToken;
        Integer actualRate = actualRate(effectiveUnitPrice, releasePrice);

        if (FREIGHT_OR_CUTTING.matcher(safeItemName).find()) {
            return verified(true, null, actualRate, releasePrice, deliveryPrice);
        }
        if (OLD_FIFTY_PREFIX.matcher(safeModelToken).matches()) {
            return verified(integerEquals(actualRate, 50), 50, actualRate, releasePrice, deliveryPrice);
        }
        if (ACCESSORY_LABEL.matcher(safeItemName).find() || safeModelToken.startsWith("AXJ")) {
            return verified(integerWonEquals(effectiveUnitPrice, deliveryPrice), null, actualRate,
                    releasePrice, deliveryPrice);
        }
        if (isMulti(safeItemName, safeModelToken)) {
            Integer expectedRate = fixedDc == null ? 45 : roundPercent(fixedDc);
            return verified(integerEquals(actualRate, expectedRate), expectedRate, actualRate,
                    releasePrice, deliveryPrice);
        }
        if (isSingleSetDependent(safeModelToken)) {
            return new Revalidation(null, null, actualRate, Status.OUT_OF_SCOPE,
                    releasePrice, deliveryPrice);
        }
        return verified(true, null, actualRate, releasePrice, deliveryPrice);
    }

    /**
     * referent bulk 부분성공에서 productId key 자체가 누락된 경우의 공통 결과를 만든다.
     *
     * <p>{@code fixedDc == null} 은 고정DC 미설정이라는 유효 상태이므로, key 누락 여부는
     * service 배선 계층에서 구분한 뒤 이 메서드로 단락한다.
     */
    public Revalidation missingReferent(BigDecimal releasePrice, BigDecimal deliveryPrice) {
        return new Revalidation(null, null, null, Status.MISSING_REFERENT,
                releasePrice, deliveryPrice);
    }

    private static Revalidation unresolved(Status status,
                                           BigDecimal releasePrice,
                                           BigDecimal deliveryPrice) {
        return new Revalidation(null, null, null, status, releasePrice, deliveryPrice);
    }

    private static Revalidation verified(Boolean verified,
                                         Integer expectedRate,
                                         Integer actualRate,
                                         BigDecimal releasePrice,
                                         BigDecimal deliveryPrice) {
        return new Revalidation(verified, expectedRate, actualRate, Status.VERIFIED,
                releasePrice, deliveryPrice);
    }

    private static Integer actualRate(BigDecimal effectiveUnitPrice, BigDecimal releasePrice) {
        if (effectiveUnitPrice == null || releasePrice == null
                || releasePrice.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        BigDecimal unitRatio = effectiveUnitPrice.divide(releasePrice, 10, RoundingMode.HALF_UP);
        return BigDecimal.ONE.subtract(unitRatio)
                .multiply(ONE_HUNDRED)
                .setScale(0, RoundingMode.HALF_UP)
                .intValue();
    }

    private static Integer roundPercent(BigDecimal percent) {
        if (percent == null) {
            return null;
        }
        // product-service fixedDiscountRate 는 이미 percent 공간(45.00)이므로 재차 *100 하지 않는다.
        return percent.setScale(0, RoundingMode.HALF_UP).intValue();
    }

    private static boolean integerWonEquals(BigDecimal left, BigDecimal right) {
        if (left == null || right == null) {
            return false;
        }
        return left.setScale(0, RoundingMode.HALF_UP)
                .compareTo(right.setScale(0, RoundingMode.HALF_UP)) == 0;
    }

    private static boolean integerEquals(Integer actualRate, Integer expectedRate) {
        return actualRate != null && actualRate.equals(expectedRate);
    }

    private static boolean isMulti(String itemName, String modelToken) {
        return isLegacyMultiPrefix(modelToken) || MULTI_LABEL.matcher(itemName).matches();
    }

    private static boolean isLegacyMultiPrefix(String modelToken) {
        if (modelToken.length() < 7) {
            return false;
        }
        char zoneMarker = modelToken.charAt(6);
        return (modelToken.startsWith("AM") || modelToken.startsWith("AJ"))
                && (zoneMarker == 'X' || zoneMarker == 'N');
    }

    private static boolean isSingleSetDependent(String modelToken) {
        return SINGLE_SET_DEPENDENT_PREFIX.matcher(modelToken).matches();
    }

    /** 재검증 출력 DTO. */
    public record Revalidation(
            Boolean verified,
            Integer expectedRate,
            Integer actualRate,
            Status status,
            BigDecimal releasePrice,
            BigDecimal deliveryPrice) {
    }
}
