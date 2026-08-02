package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.ProductLabelMatch;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * 일마감 단가변동 재검증 엔진.
 *
 * <p>legacy GAS 일마감 프로그램(Code.js:668-735)의 확인 판정 단품 분기를 S2b 범위에서 read-time 으로
 * 재현한다. 원천 마감 금액은 변경하지 않고, 그룹별 유효단가와 product-service referent 를 대조해
 * 화면 노출용 판정 결과만 생성한다.
 *
 * <p><b>VAT 파리티</b>: 레거시(Code.js:553,559)는 {@code rate = 1 - 단가(VAT포함) / price} 로,
 * <b>VAT 포함 단가</b>를 정가시트 출고가({@code price})로 나눈다. 본 엔진의 {@code effectiveUnitPrice}
 * 는 호출측(MonthEndCloseService)이 {@code (공급가액 + 세액) / 수량} 으로 산출해 넘기는 <b>VAT 포함
 * 유효단가</b>이며, {@code releasePrice} 는 price_history 의 출고가(= 레거시 정가시트 출고가와 동일
 * 원천)이다. 따라서 {@code actualRate = 1 - VAT포함단가/출고가} 는 분자·분모 모두 레거시와 동일 입력을
 * 사용해, 출고가가 순액이든 VAT 포함이든 관계없이 레거시 산식과 파리티가 성립한다. (면세/영세율 라인은
 * 세액 0 이라 VAT 포함 = 순액으로 자연 수렴한다.)
 *
 * <p><b>감사 단위</b>: 판정은 {@code MonthEndCloseService.getTaxInvoiceDailyDetail} 의 byModel(일자+
 * itemName) 집계 기준이며, 같은 모델의 하루치 라인을 합산한 평균 유효단가로 1회 판정한다(개별 전표
 * 라인 단위가 아님). 같은 모델이 하루에 서로 다른 단가로 팔리면 평균이 개별 오류를 상쇄/희석할 수 있어,
 * 본 확인은 "모델·일 합계 기준 새니티 체크"로 해석해야 한다(레거시 라인 단위 확인과의 트레이드오프).
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
        /** 매칭됐지만 적용 정가(출고가)가 없어 판정 불가. */
        MISSING_REFERENT,
        /** 거래처 전역DC 조회 실패로 기대율을 결정할 수 없음. */
        MISSING_GLOBAL_DISCOUNT,
        /** 그룹 수량 합계 0 등으로 실 유효단가를 산출할 수 없어 판정 불가(판정 실패와 구분). */
        NOT_MEASURABLE,
        /** 싱글중대형 기준값을 확인할 수 없어 범위 밖으로 남겨야 하는 분기. */
        OUT_OF_SCOPE
    }

    /**
     * 일마감 모델 그룹 1건을 재검증한다.
     *
     * @param itemName 회계 라벨
     * @param modelToken 라벨에서 추출한 모델 토큰
     * @param effectiveUnitPrice 그룹 (공급가액 + 세액)/수량 = <b>VAT 포함 유효단가</b>. 수량 0 이면 null 허용
     * @param releasePrice 적용 출고가(price_history)
     * @param deliveryPrice 적용 납품가(price_history)
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
        return revalidate(itemName, modelToken, effectiveUnitPrice, releasePrice, deliveryPrice,
                fixedDc, GlobalDiscount.notRequired(), matchStatus);
    }

    /**
     * 거래처 전역DC를 포함해 일마감 모델 그룹을 재검증한다.
     *
     * @param globalDiscount 거래처 전역DC 조회 결과. 고정DC가 없을 때만 기대율 결정에 사용
     */
    public Revalidation revalidate(String itemName,
                                   String modelToken,
                                   BigDecimal effectiveUnitPrice,
                                   BigDecimal releasePrice,
                                   BigDecimal deliveryPrice,
                                   BigDecimal fixedDc,
                                   GlobalDiscount globalDiscount,
                                   ProductLabelMatch.Status matchStatus) {
        String safeItemName = itemName == null ? "" : itemName;
        String safeModelToken = modelToken == null ? "" : modelToken;
        BigDecimal effectiveDeliveryPrice = effectiveDeliveryPrice(releasePrice, deliveryPrice);
        Integer actualRate = actualRate(effectiveUnitPrice, releasePrice);

        // 운임/절삭: 레거시(Code.js:668-670) 최상단 분기와 동일하게 referent/라벨매칭 무관 true.
        // release 가 없으면 actualRate 는 null 로 남기되 판정 자체는 막지 않는다.
        if (FREIGHT_OR_CUTTING.matcher(safeItemName).find()) {
            return verified(true, null, actualRate, releasePrice, effectiveDeliveryPrice);
        }

        if (matchStatus == ProductLabelMatch.Status.NOT_FOUND) {
            return unresolved(Status.NOT_FOUND, releasePrice, effectiveDeliveryPrice);
        }
        if (matchStatus == ProductLabelMatch.Status.AMBIGUOUS) {
            return unresolved(Status.AMBIGUOUS, releasePrice, effectiveDeliveryPrice);
        }
        if (releasePrice == null || releasePrice.compareTo(BigDecimal.ZERO) == 0) {
            return new Revalidation(null, null, null, null, Status.MISSING_REFERENT,
                    releasePrice, effectiveDeliveryPrice);
        }

        // 구형 50%: 진짜 구형 접두(NJ/NS/AVX) + 비-멀티 AM 만. 상업/홈멀티(AM/AJ+zone marker)는
        // 아래 멀티 분기가 처리하도록 제외(레거시 _isOld 는 OLD 시트 의존=S1d, 현대는 토큰 근사).
        if (OLD_FIFTY_PREFIX.matcher(safeModelToken).matches()
                && !isLegacyMultiPrefix(safeModelToken)) {
            if (actualRate == null) {
                return notMeasurable(50, releasePrice, effectiveDeliveryPrice);
            }
            return verified(integerEquals(actualRate, 50), 50, actualRate, releasePrice, effectiveDeliveryPrice);
        }
        // 액세서리: 유효단가 === 납품가(정수원 완전일치). actualRate 는 참고값.
        if (ACCESSORY_LABEL.matcher(safeItemName).find() || safeModelToken.startsWith("AXJ")) {
            if (effectiveUnitPrice == null) {
                return notMeasurable(null, releasePrice, effectiveDeliveryPrice);
            }
            return verified(integerWonEquals(effectiveUnitPrice, effectiveDeliveryPrice), null, actualRate,
                    releasePrice, effectiveDeliveryPrice);
        }
        // 멀티(상업 AM / 홈 AJ zone marker 또는 라벨 "멀티/MULTI"): 고정dc(percent) 또는 45 폴백.
        if (isMulti(safeItemName, safeModelToken)) {
            Integer expectedRate = expectedRate(fixedDc, globalDiscount, safeModelToken);
            if (expectedRate == null) {
                return new Revalidation(null, null, actualRate, null,
                        Status.MISSING_GLOBAL_DISCOUNT, releasePrice, effectiveDeliveryPrice);
            }
            if (actualRate == null) {
                return notMeasurable(expectedRate, releasePrice, effectiveDeliveryPrice);
            }
            return verified(integerEquals(actualRate, expectedRate), expectedRate, actualRate,
                    releasePrice, effectiveDeliveryPrice);
        }
        // 싱글중대형 본체/부속: 출고가와 기준 납품가의 차액을 DC액으로 검증한다.
        if (isSingleSetDependent(safeModelToken)) {
            if (effectiveUnitPrice == null) {
                return notMeasurable(null, releasePrice, effectiveDeliveryPrice);
            }
            BigDecimal optionDiscount = globalDiscount == null
                    ? null : globalDiscount.optionDiscountFor(safeModelToken);
            if (optionDiscount != null) {
                effectiveDeliveryPrice = effectiveDeliveryPrice.subtract(optionDiscount.abs());
            }
            BigDecimal actualDiscountAmount = discountAmount(releasePrice, effectiveUnitPrice);
            BigDecimal expectedDiscountAmount = discountAmount(releasePrice, effectiveDeliveryPrice);
            return verified(moneyEquals(actualDiscountAmount, expectedDiscountAmount),
                    null, actualRate, actualDiscountAmount, releasePrice, effectiveDeliveryPrice);
        }
        // 기타 default: 레거시와 동일 무조건 true. actualRate 는 참고값.
        return verified(true, null, actualRate, releasePrice, effectiveDeliveryPrice);
    }

    private static Integer expectedRate(BigDecimal fixedDc, GlobalDiscount globalDiscount, String modelToken) {
        if (fixedDc != null) {
            return roundPercent(fixedDc);
        }
        if (globalDiscount == null || !globalDiscount.available()) {
            return null;
        }
        if (!isLegacyMultiPrefix(modelToken)) {
            return 45;
        }
        BigDecimal rate = isHomeMulti(modelToken) ? globalDiscount.homeRate() : globalDiscount.commercialRate();
        return rate == null ? 45 : roundPercent(rate.multiply(ONE_HUNDRED));
    }

    private static Revalidation unresolved(Status status,
                                           BigDecimal releasePrice,
                                           BigDecimal deliveryPrice) {
        return new Revalidation(null, null, null, null, status, releasePrice, deliveryPrice);
    }

    /** 유효단가 산출 불가(수량 0 등) → 판정 실패가 아닌 판정 불가로 단락. expectedRate 는 알면 보존. */
    private static Revalidation notMeasurable(Integer expectedRate,
                                              BigDecimal releasePrice,
                                              BigDecimal deliveryPrice) {
        return new Revalidation(null, expectedRate, null, null, Status.NOT_MEASURABLE,
                releasePrice, deliveryPrice);
    }

    private static Revalidation verified(Boolean verified,
                                         Integer expectedRate,
                                         Integer actualRate,
                                         BigDecimal releasePrice,
                                         BigDecimal deliveryPrice) {
        return new Revalidation(verified, expectedRate, actualRate, null, Status.VERIFIED,
                releasePrice, deliveryPrice);
    }

    private static Revalidation verified(Boolean verified,
                                         Integer expectedRate,
                                         Integer actualRate,
                                         BigDecimal discountAmount,
                                         BigDecimal releasePrice,
                                         BigDecimal deliveryPrice) {
        return new Revalidation(verified, expectedRate, actualRate, discountAmount, Status.VERIFIED,
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

    /** 출고가 대비 실제 VAT 포함 단가의 차이 — 싱글중대형 DC액 표시·검증용. */
    private static BigDecimal discountAmount(BigDecimal releasePrice, BigDecimal effectiveUnitPrice) {
        if (releasePrice == null || effectiveUnitPrice == null) {
            return null;
        }
        return releasePrice.subtract(effectiveUnitPrice).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal effectiveDeliveryPrice(BigDecimal releasePrice, BigDecimal deliveryPrice) {
        if (deliveryPrice == null || deliveryPrice.compareTo(BigDecimal.ZERO) == 0) {
            return releasePrice;
        }
        return deliveryPrice;
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

    private static boolean moneyEquals(BigDecimal left, BigDecimal right) {
        return left != null && right != null
                && left.setScale(0, RoundingMode.HALF_UP)
                .compareTo(right.setScale(0, RoundingMode.HALF_UP)) == 0;
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

    private static boolean isHomeMulti(String modelToken) {
        return modelToken.startsWith("AJ") && isLegacyMultiPrefix(modelToken);
    }

    /** 전역DC 원천 조회 결과. 기존 단위 테스트/호출부의 미적용 상태와 조회 실패를 구분한다. */
    public record GlobalDiscount(boolean available, BigDecimal homeRate, BigDecimal commercialRate,
                                 BigDecimal discount360Amount, BigDecimal discount4WayAmount,
                                 BigDecimal discount1WayAmount, BigDecimal discountStandAmount,
                                 BigDecimal discountDeluxeAmount, BigDecimal discountFirstGradeAmount) {
        public static GlobalDiscount notRequired() {
            return found(new BigDecimal("0.45"), new BigDecimal("0.45"));
        }

        public static GlobalDiscount found(BigDecimal homeRate, BigDecimal commercialRate) {
            return found(homeRate, commercialRate, null, null, null, null, null, null);
        }

        public static GlobalDiscount found(BigDecimal homeRate, BigDecimal commercialRate,
                                           BigDecimal discount360Amount, BigDecimal discount4WayAmount,
                                           BigDecimal discount1WayAmount, BigDecimal discountStandAmount,
                                           BigDecimal discountDeluxeAmount, BigDecimal discountFirstGradeAmount) {
            return new GlobalDiscount(true, homeRate, commercialRate, discount360Amount, discount4WayAmount,
                    discount1WayAmount, discountStandAmount, discountDeluxeAmount, discountFirstGradeAmount);
        }

        public static GlobalDiscount unavailable() {
            return new GlobalDiscount(false, null, null, null, null, null, null, null, null);
        }

        /** 레거시 세트코드 규칙으로 싱글 세트에 적용할 옵션 정액을 고른다. */
        private BigDecimal optionDiscountFor(String modelToken) {
            String code = modelToken == null ? "" : modelToken.toUpperCase(java.util.Locale.ROOT);
            if (code.startsWith("AR") && code.endsWith("S") || code.startsWith("AF") && code.endsWith("S")) {
                return null;
            }
            if (code.startsWith("AC") && code.length() >= 9) {
                if (code.charAt(7) == '6' && code.charAt(8) == 'P') return discount360Amount;
                if (code.charAt(7) == '4' && (code.charAt(8) == 'P' || code.charAt(8) == 'D')) {
                    return discount4WayAmount;
                }
                if (code.charAt(7) == '1' && (code.charAt(8) == 'P' || code.charAt(8) == 'D')) {
                    return discount1WayAmount;
                }
                if (code.charAt(8) == 'F') return discountFirstGradeAmount;
            }
            if (code.startsWith("AP")) {
                if (code.startsWith("AP230") || code.startsWith("AP290")
                        || code.length() >= 9 && code.charAt(8) == 'P'
                        || code.length() >= 11 && code.charAt(8) == 'D' && code.charAt(10) == 'C') {
                    return discountStandAmount;
                }
                if (code.length() >= 11 && code.charAt(8) == 'D' && code.charAt(10) == 'H') {
                    return discountDeluxeAmount;
                }
                if (code.length() >= 9 && code.charAt(8) == 'F') return discountFirstGradeAmount;
            }
            return null;
        }
    }

    private static boolean isSingleSetDependent(String modelToken) {
        return SINGLE_SET_DEPENDENT_PREFIX.matcher(modelToken).matches();
    }

    /**
     * 재검증 출력 DTO.
     *
     * @param verified 확인 판정. true=정합·false=불일치·null=판정 불가(status 로 사유 구분)
     * @param expectedRate 기대 할인율(정수 percent). 해당 없는 분기(운임/액세서리/default)는 null.
     *                     <b>0 은 유효한 기대율(무할인)이며 null(해당 없음/비교 불가)과 구분</b>된다
     * @param actualRate 출고가 대비 유효 할인율(정수 percent). <b>운임/절삭/액세서리/default 분기에서는
     *                   판정 근거가 아닌 참고값</b>이다(각각 무조건 true 또는 납품가 완전일치로 판정)
     * @param discountAmount 싱글중대형의 실제 DC액(출고가 - VAT 포함 유효단가). 다른 분기는 null
     * @param status 판정 사유
     * @param releasePrice 적용 출고가
     * @param deliveryPrice 적용 납품가
     */
    public record Revalidation(
            Boolean verified,
            Integer expectedRate,
            Integer actualRate,
            BigDecimal discountAmount,
            Status status,
            BigDecimal releasePrice,
            BigDecimal deliveryPrice) {
    }
}
