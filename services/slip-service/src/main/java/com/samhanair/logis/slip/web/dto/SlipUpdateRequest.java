package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 매입 전표 direct PUT 수정 요청.
 *
 * <p>{@code updatedAt} 은 상세 조회 시점의 {@code modifiedAt} 값이며, 기존 row 에 수정일이
 * 없으면 {@code createdAt} 값으로 비교한다.
 *
 * <p>{@code partnerId} 는 D-R8-7 신규 — 종전 계약은 {@code partnerName} 만 받아 거래처를 바꿔
 * 저장해도 {@code partner_id} 가 불변이었고, 그 결과 (거래처+품목) 가격기억이 <b>원 거래처</b>에
 * 각인됐다 (R8-BE-3/R8-QA-3 라이브 실증). null 이면 기존 거래처를 보존한다.
 *
 * <p>{@code lineIdContract} 는 D-R8-9 신규 — 요청 레벨 계약 마커. 상세는
 * {@link com.samhanair.logis.slip.service.LineIdContractGate}.
 */
public record SlipUpdateRequest(
        @NotNull LocalDateTime updatedAt,
        /** 거래처 UUID. null 이면 기존 거래처 보존. payload 전용 — 화면에는 거래처명만 표시한다. */
        UUID partnerId,
        @Size(max = 100) String partnerName,
        @Size(max = 50) String partnerCode,
        @Size(max = 1000) String memo,
        @Size(max = 50) String businessNumber,
        @Size(max = 500) String deliveryAddress,
        @Size(max = 500) String supervisionAddress,
        @Size(max = 200) String projectName,
        @Size(max = 20) @Pattern(regexp = "^[0-9-]*$", message = "인수자 번호는 숫자와 하이픈만 허용합니다")
        String recipientPhone,
        LocalDate paymentDueDate,
        @Valid @NotEmpty
        @Size(max = 100, message = "전표 라인은 최대 100건까지 저장할 수 있습니다")
        List<LineRequest> lines,
        /**
         * [D-R8-9] lineId 계약 마커 — {@code true} 만 계약 선언으로 인정한다.
         *
         * <p>구 클라이언트는 이 필드의 존재를 모르므로 <b>절대 보내지 않는다</b>. 그 부재가 곧
         * "이 클라이언트는 lineId 왕복을 하지 않는다" 는 신호이며,
         * {@link com.samhanair.logis.slip.service.LineIdContractGate} 가 400 으로 거부한다.
         *
         * <p>Bean Validation {@code @NotNull} 을 <b>의도적으로 쓰지 않는다</b> — 검증 계층은
         * "must not be null" 류의 일반 메시지를 내므로 사용자에게 <i>앱을 업데이트하라</i>는
         * 조치를 전달하지 못한다. 거부는 서비스 게이트가 한국어 사유와 함께 낸다.
         */
        Boolean lineIdContract
) {

    /**
     * 교체할 매입 라인. 기존 라인은 soft-delete 되고 본 요청 라인으로 전체 교체된다.
     *
     * <p>{@code quantity} 는 1 이상, {@code unitPrice} 는 0 이상 필수.
     *
     * <p><b>D-R8-6 — 7필드 호환 생성자 폐지</b>: 종전에는 lineId 를 생략할 수 있는 호환 생성자를
     * 두어 호출자가 계보 승계 포기를 <i>침묵으로</i> 선택할 수 있었다. 그 침묵이 곧 데이터 손실
     * 경로였으므로(무수정 왕복 PUT 이 200 을 받고 계보를 전량 파괴) 생성자를 단일 canonical 로
     * 좁혀 <b>모든 호출자가 lineId 의도를 명시</b>하게 한다. 신규 라인은 {@code null} 을 명시한다.
     */
    public record LineRequest(
            UUID productId,
            /**
             * 수정 시점의 품목명 snapshot.
             *
             * <p>생성 경로는 카탈로그 조회 결과로 이름을 보강할 수 있지만, 매입·매출 direct PUT은
             * 카탈로그를 다시 조회하지 않고 요청 snapshot을 그대로 저장한다. 누락값을 DB NOT NULL
             * 예외까지 내려 409로 오인시키지 않도록 wire 경계에서 명확한 400으로 거부한다.
             */
            @NotBlank(message = "품목명은 필수입니다.") @Size(max = 200) String productName,
            @Size(max = 100) String modelName,
            @Size(max = 50) String specification,
            Integer quantity,
            BigDecimal unitPrice,
            @Size(max = 200) String note,
            /**
             * 기존 상세 응답 라인의 영속 UUID 왕복값. payload 전용이며 화면에 표시하지 않는다.
             * null 이면 신규 라인으로 처리하고 세트 계보를 승계하지 않는다 — 기존 라인을 수정하는
             * 요청이라면 상세 응답에서 받은 lineId 를 반드시 되돌려 보내야 한다.
             */
            UUID lineId,
            /** 권위 공급가액 S — 부가세·합계와 함께 보낼 때만 적용한다. */
            BigDecimal supplyAmount,
            /** 권위 부가세 V — 공급가액·합계와 함께 보낼 때만 적용한다. */
            BigDecimal vatAmount,
            /** 권위 VAT 포함 합계 T — 전표 lineTotal 컬럼과 의미가 다르다. */
            BigDecimal lineTotalWithVat,
            /** 신규 BUNDLE 구성품의 부모 세트 옵션. 서버 전개 재검증에만 사용한다. */
            BundleSetOptions setOptions,
            /** 신규 BUNDLE 구성품의 부모 세트 modelCode. */
            @Size(max = 100) String parentSetModel,
            /** 서버 전개 결과의 첫 구성품 여부. */
            Boolean setHead,
            /** 신규 BUNDLE 구성품의 부모 제품 UUID. */
            UUID bundleParentProductId,
            /** 부모 BUNDLE에 입력한 세트 단가. 서버 전개 재검증에 사용한다. */
            BigDecimal bundleParentUnitPrice
    ) {
        /** 계보 필드를 생략하는 기존 호출자용 canonical 호환 생성자. */
        public LineRequest(UUID productId, String productName, String modelName,
                           String specification, Integer quantity, BigDecimal unitPrice,
                           String note, UUID lineId, BigDecimal supplyAmount,
                           BigDecimal vatAmount, BigDecimal lineTotalWithVat) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note,
                    lineId, supplyAmount, vatAmount, lineTotalWithVat,
                    null, null, null, null, null);
        }

        /** 기존 lineId 계약을 사용하는 호출자용 — VAT 권위 필드는 모두 생략한다. */
        public LineRequest(UUID productId, String productName, String modelName,
                           String specification, Integer quantity, BigDecimal unitPrice,
                           String note, UUID lineId) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note,
                    lineId, null, null, null);
        }
    }
}
