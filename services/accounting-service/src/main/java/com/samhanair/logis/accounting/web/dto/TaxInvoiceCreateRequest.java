package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 세금계산서 신규 발행 요청 (P0-4).
 *
 * <p>기존 {@link CreateTaxInvoiceRequest} 와 별도로 존재하여 FE TS interface 와 1:1 매핑.
 * 필드 명세:
 *
 * <ul>
 *   <li>{@code invoiceType} — "SALES" | "PURCHASE" (null 이면 SALES 기본)</li>
 *   <li>{@code partnerBusinessNumber} — 사업자등록번호 형식 XXX-XX-XXXXX 검증</li>
 *   <li>{@code issueDate} — 발행일자 (공급일자로 사용)</li>
 *   <li>{@code lines} — 라인 1개 이상 필수</li>
 * </ul>
 */
public record TaxInvoiceCreateRequest(
        /** 세금계산서 종류 — "SALES" | "PURCHASE". null 이면 SALES 기본. */
        String invoiceType,

        /** 거래처 UUID (partner-service 참조). */
        @NotNull(message = "partnerId 는 필수입니다")
        UUID partnerId,

        /**
         * 거래처 코드 (사용자 식별용 — UUID 비공개 원칙).
         * #825 재수렴 #1 — 상한 50→100자 (partners.partner_code VARCHAR(100) 정렬, V61 동기).
         */
        @Size(max = 100, message = "partnerCode 는 최대 100자입니다")
        String partnerCode,

        /** 거래처 상호 (스냅샷 — 발행 시점 보존). */
        @NotBlank(message = "partnerName 은 필수입니다")
        @Size(max = 200, message = "partnerName 은 최대 200자입니다")
        String partnerName,

        /**
         * 사업자등록번호 — 형식: XXX-XX-XXXXX (10자리 숫자 + 하이픈 2개).
         * 한국 부가가치세법 제32조 세금계산서 기재사항 의무.
         */
        @Pattern(
                regexp = "^\\d{3}-\\d{2}-\\d{5}$",
                message = "partnerBusinessNumber 형식이 잘못되었습니다 (예: 123-45-67890)"
        )
        String partnerBusinessNumber,

        /** 발행일자 (공급일자). */
        @NotNull(message = "issueDate 는 필수입니다")
        LocalDate issueDate,

        /** 비고 / 적요 (선택). */
        @Size(max = 500, message = "memo 는 최대 500자입니다")
        String memo,

        /** 라인 목록 (1개 이상 필수). */
        @NotNull(message = "lines 는 1개 이상 필수입니다")
        @NotEmpty(message = "lines 는 1개 이상 필수입니다")
        @Valid
        List<TaxInvoiceLineRequest> lines
) {}
