package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 세금계산서 신규 생성 / 수정 요청 — POST /accounting/tax-invoices, PUT /{id}.
 * 거래처(공급받는자) snapshot 정보는 partner-service 로부터 호출자(controller / FE)가 미리 채워서 전달.
 *
 * <p>#825 CM-a — {@code partnerCode}(거래처 코드, 비즈니스 식별자) 추가. 선택 필드(nullable)로
 * 미전송 시 null 허용(하위호환). 거래처 교체 편집 시 FE 가 새 거래처의 실 코드를 함께 전송해야
 * partnerId/name/bizNo 와 partnerCode 간 무결성이 유지된다.
 *
 * <p>#825 재수렴 #1 — partnerCode 상한 50→100자 (partners.partner_code VARCHAR(100) ·
 * 이카운트 실측 max=86자 정렬, V61 마이그레이션과 동기).
 */
public record CreateTaxInvoiceRequest(
        @NotNull(message = "partnerId 는 필수입니다")
        UUID partnerId,

        @Size(max = 100, message = "partnerCode 는 최대 100자입니다")
        String partnerCode,

        @Size(max = 20, message = "partnerBusinessNo 는 최대 20자입니다")
        String partnerBusinessNo,

        @NotNull(message = "partnerName 은 필수입니다")
        @Size(max = 200, message = "partnerName 은 최대 200자입니다")
        String partnerName,

        @Size(max = 500, message = "partnerAddress 는 최대 500자입니다")
        String partnerAddress,

        @NotNull(message = "supplyDate 는 필수입니다")
        LocalDate supplyDate,

        @Size(max = 500, message = "description 은 최대 500자입니다")
        String description,

        @NotNull(message = "lines 는 1개 이상 필수입니다")
        @NotEmpty(message = "lines 는 1개 이상 필수입니다")
        @Valid
        List<CreateTaxInvoiceLineRequest> lines
) {}
