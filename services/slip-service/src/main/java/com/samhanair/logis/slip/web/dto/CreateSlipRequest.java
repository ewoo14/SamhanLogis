package com.samhanair.logis.slip.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SlipType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 전표 생성 요청 — slipType 분기로 OUTBOUND/INBOUND 처리. slipDate 가 null 이면 서비스 레이어에서
 * {@code LocalDate.now()} 사용.
 *
 * <p>Slice B (notification-slice-B): {@code driverName}, {@code driverPhone} 2 필드 신규 추가 —
 * 출고 슬립 생성 시 배송 기사 정보를 함께 입력 가능 (선택). 입력되지 않으면 추후 editHeader 로 갱신.
 *
 * <p>PR-G1 backlog #2 — V16 e-Count schema 12 컬럼 신규 (모두 nullable):
 * <ul>
 *   <li>{@code customerTel} / {@code customerAddress} / {@code customerRepresentative}
 *       — 거래처 자동 채움 후 사용자 수정 가능 (snapshot).</li>
 *   <li>{@code shippingAddress} / {@code inspectionAddress} / {@code receiverPhone}
 *       — 배송지/검수지/수령자 별도 입력.</li>
 *   <li>{@code paymentDueLabel} (MM-DD picker label) / {@code discountInfo} (textarea).</li>
 *   <li>{@code collectTerm} / {@code agreeTerm} — 대금 회수 조건 / 거래 약정 조건.</li>
 *   <li>{@code ioType} ({@code "10"}=출고 / {@code "11"}=입고. null 시 slipType 분기 자동).</li>
 *   <li>{@code timeDate} (HHmmss. null 시 서버 시각 자동).</li>
 * </ul>
 *
 * <p>본 12 필드는 publish 흐름 ({@code from-estimate} / {@code from-partner-order}) 과 동일하게
 * {@code Slip.applyEcountSchema} 로 직접 컬럼 저장.
 *
 * <p>V20 신규 5 필드 (판매/구매조회 화면 매칭용, 모두 nullable):
 * <ul>
 *   <li>{@code deliveryAddress} — 배송주소 (실제 인수 현장, max 500).</li>
 *   <li>{@code supervisionAddress} — 감리주소 (실제 설치 현장, max 500).</li>
 *   <li>{@code projectName} — 프로젝트명 (max 200).</li>
 *   <li>{@code recipientPhone} — 인수자 번호 (max 20, 숫자·하이픈만 허용 패턴).</li>
 *   <li>{@code paymentDueDate} — 입금예정일 (LocalDate).</li>
 * </ul>
 * {@code businessNumber} 는 partnerId 로 partner-service Feign 자동 resolve (사용자 입력 X).
 */
public record CreateSlipRequest(
        @NotNull SlipType slipType,
        LocalDate slipDate,
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        UUID sourceWarehouseId,
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        UUID destinationWarehouseId,
        UUID partnerId,
        @Size(max = 100) String partnerName,
        DeliveryTag deliveryTag,
        @Size(max = 1000) String memo,
        @Size(max = 50) String driverName,
        @Size(max = 20) String driverPhone,
        // PR-G1 backlog #2 — V16 e-Count 12 컬럼 (모두 nullable)
        @Size(max = 10) String ioType,
        @Size(max = 10) String timeDate,
        @Size(max = 100) String customerTel,
        @Size(max = 200) String customerAddress,
        @Size(max = 100) String customerRepresentative,
        @Size(max = 500) String shippingAddress,
        @Size(max = 500) String inspectionAddress,
        @Size(max = 100) String receiverPhone,
        @Size(max = 200) String paymentDueLabel,
        @Size(max = 200) String discountInfo,
        @Size(max = 100) String collectTerm,
        @Size(max = 100) String agreeTerm,
        // V20 신규 5 필드 — 판매/구매조회 화면 매칭 (사용자 직접 입력, 모두 nullable)
        /** 배송주소 — 실제 인수 현장 주소 (shippingAddress 와 별도 의미). */
        @Size(max = 500) String deliveryAddress,
        /** 감리주소 — 실제 설치 및 감리가 이루어지는 현장 주소. */
        @Size(max = 500) String supervisionAddress,
        /** 프로젝트명 — 복수 전표를 동일 프로젝트로 묶기 위한 분류 키. */
        @Size(max = 200) String projectName,
        /** 인수자 번호 — 현장 담당자 직접 연락처 (숫자 및 하이픈만 허용). */
        @Size(max = 20) @Pattern(regexp = "^[0-9-]*$", message = "인수자 번호는 숫자와 하이픈만 허용합니다") String recipientPhone,
        /** 입금예정일 — 정형 DATE. 회계 기간 매칭 / 미수금 관리에 활용. */
        LocalDate paymentDueDate,
        /**
         * 하차일 N override (nullable) — null 이면 서비스 레이어에서 DeliverySchedule 규칙 자동 계산.
         * 당착(지방 당일 하차) = slipDate 와 동일 값 전달. 지방/야적 태그에만 유효.
         */
        LocalDate unloadDate,
        @NotEmpty @Size(max = 100, message = "전표 라인은 최대 100건까지 저장할 수 있습니다")
        @Valid List<SlipLineRequest> lines) {

    /**
     * 전표 라인 — productId / 수량 / 단가 / 메모 + 표시용 snapshot 명칭.
     * Slice A (sales-polish-2): {@code specification} 필드 신규 추가 (사용자 피드백 #4).
     */
    public record SlipLineRequest(
            @NotNull UUID productId,
            @Size(max = 200) String productName,
            @Size(max = 100) String modelName,
            @Size(max = 50) String specification,
            @NotNull @Positive Integer quantity,
            @NotNull @DecimalMin("0.00") BigDecimal unitPrice,
            @Size(max = 200) String note,
            com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions,
            @Size(max = 100) String parentSetModel,
            Boolean setHead,
            UUID bundleParentProductId,
            BigDecimal bundleParentUnitPrice,
            /**
             * 단가 부가세포함 여부 — true 면 {@code unitPrice} 가 VAT 포함 단가(사용자 입력)이며
             * BE 가 라인 단위로 공급가액/부가세를 분리(eCount 방식, {@link com.samhanair.logis.slip.domain.SlipLine#createFromVatInclusive}).
             * null/false 면 기존 VAT 미포함(공급) 단가로 처리. (2026-06-09 단가 부가세포함 전환)
             */
            Boolean priceVatInclusive,
            /** 권위 공급가액 S — 부가세·합계와 함께 보낼 때만 적용한다. */
            BigDecimal supplyAmount,
            /** 권위 부가세 V — 공급가액·합계와 함께 보낼 때만 적용한다. */
            BigDecimal vatAmount,
            /** 권위 VAT 포함 합계 T — 전표 lineTotal 컬럼과 의미가 다르다. */
            BigDecimal lineTotalWithVat) {

        /** 호환 생성자 — priceVatInclusive 미제공(8-arg 호출자). */
        public SlipLineRequest(UUID productId, String productName, String modelName,
                               String specification, Integer quantity, BigDecimal unitPrice, String note,
                               com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note, setOptions,
                    null, null, null, null, null, null, null, null);
        }

        /** 호환 생성자 — setOptions/priceVatInclusive 미제공(기존 7-arg 호출자/테스트). */
        public SlipLineRequest(UUID productId, String productName, String modelName,
                               String specification, Integer quantity, BigDecimal unitPrice, String note) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note, null,
                    null, null, null, null, null, null, null, null);
        }

        /** 호환 생성자 — 기존 priceVatInclusive 호출자. 권위 금액 필드는 모두 생략한다. */
        public SlipLineRequest(UUID productId, String productName, String modelName,
                               String specification, Integer quantity, BigDecimal unitPrice, String note,
                               com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions,
                               Boolean priceVatInclusive) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note, setOptions,
                    null, null, null, null, priceVatInclusive, null, null, null);
        }

        /** 호환 생성자 — 기존 권위 금액 12-arg 호출자. */
        public SlipLineRequest(UUID productId, String productName, String modelName,
                               String specification, Integer quantity, BigDecimal unitPrice, String note,
                               com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions,
                               Boolean priceVatInclusive, BigDecimal supplyAmount, BigDecimal vatAmount,
                               BigDecimal lineTotalWithVat) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note, setOptions,
                    null, null, null, null, priceVatInclusive, supplyAmount, vatAmount, lineTotalWithVat);
        }

        /** 권위 금액을 포함한 명시적 생성자. */
        public SlipLineRequest(UUID productId, String productName, String modelName,
                               String specification, Integer quantity, BigDecimal unitPrice, String note,
                               com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions,
                               String parentSetModel, Boolean setHead, UUID bundleParentProductId,
                               BigDecimal bundleParentUnitPrice,
                               Boolean priceVatInclusive, BigDecimal supplyAmount, BigDecimal vatAmount,
                               BigDecimal lineTotalWithVat) {
            this.productId = productId;
            this.productName = productName;
            this.modelName = modelName;
            this.specification = specification;
            this.quantity = quantity;
            this.unitPrice = unitPrice;
            this.note = note;
            this.setOptions = setOptions;
            this.parentSetModel = parentSetModel;
            this.setHead = setHead;
            this.bundleParentProductId = bundleParentProductId;
            this.bundleParentUnitPrice = bundleParentUnitPrice;
            this.priceVatInclusive = priceVatInclusive;
            this.supplyAmount = supplyAmount;
            this.vatAmount = vatAmount;
            this.lineTotalWithVat = lineTotalWithVat;
        }
    }
}
