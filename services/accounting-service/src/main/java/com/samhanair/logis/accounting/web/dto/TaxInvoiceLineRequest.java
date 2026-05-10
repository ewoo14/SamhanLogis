package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

/**
 * 세금계산서 라인 1건 요청 (P0-4).
 *
 * <p>supplyAmount / vatAmount 는 BE 자동 계산 (수량 * 단가 / 공급가액 * 0.1) — DTO 수신값 무시.
 * FE 에서 전달하는 값은 검증 표시용이며, 실제 저장값은 BE 재계산 결과.
 *
 * <ul>
 *   <li>{@code itemName} — 품목명 (필수, ≤200자)</li>
 *   <li>{@code specification} — 규격 (선택, ≤100자)</li>
 *   <li>{@code quantity} — 수량 (필수, ≥0)</li>
 *   <li>{@code unit} — 단위: 건/kg/CBM/박스 등 (선택, ≤20자)</li>
 *   <li>{@code unitPrice} — 단가 (필수, ≥0)</li>
 *   <li>{@code supplyAmount} — 공급가액 (FE 참고용 — BE 재계산으로 덮어씀)</li>
 *   <li>{@code vatAmount} — 부가세 (FE 참고용 — BE 재계산으로 덮어씀)</li>
 * </ul>
 */
public record TaxInvoiceLineRequest(
        /** 품목명 (필수, ≤200자). */
        @NotBlank(message = "itemName 은 필수입니다")
        @Size(max = 200, message = "itemName 은 최대 200자입니다")
        String itemName,

        /** 규격 (선택, ≤100자). */
        @Size(max = 100, message = "specification 은 최대 100자입니다")
        String specification,

        /** 수량 (필수, ≥0). */
        @NotNull(message = "quantity 는 필수입니다")
        @DecimalMin(value = "0", message = "quantity 는 0 이상이어야 합니다")
        BigDecimal quantity,

        /** 단위 — 건/kg/CBM 등 (선택, ≤20자). */
        @Size(max = 20, message = "unit 은 최대 20자입니다")
        String unit,

        /** 단가 (필수, ≥0). */
        @NotNull(message = "unitPrice 는 필수입니다")
        @DecimalMin(value = "0", message = "unitPrice 는 0 이상이어야 합니다")
        BigDecimal unitPrice,

        /**
         * 공급가액 — FE 참고용 (quantity * unitPrice). BE 자동 계산으로 덮어씀.
         * null 허용.
         */
        BigDecimal supplyAmount,

        /**
         * 부가세 — FE 참고용 (supplyAmount * 0.1). BE 자동 계산으로 덮어씀.
         * null 허용.
         */
        BigDecimal vatAmount
) {}
