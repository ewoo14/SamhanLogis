package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceFromSalesSlipsRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceFromSalesSlipsResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class TaxInvoiceBatchFromSalesSlipsService {

    private final SalesAccountingSlipRepository salesSlipRepository;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final TaxInvoiceNumberService taxInvoiceNumberService;

    public TaxInvoiceFromSalesSlipsResponse createFromSalesSlips(
            CreateTaxInvoiceFromSalesSlipsRequest request, String actorUserId) {
        if (request == null || request.salesSlipIds() == null || request.salesSlipIds().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "매출전표 ID 목록은 필수입니다.");
        }

        LocalDate issuedDate = parseIssuedDate(request.issuedDate());
        List<SalesAccountingSlip> slips = salesSlipRepository.findAllById(request.salesSlipIds());
        if (slips.size() != request.salesSlipIds().size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "일부 매출전표를 찾을 수 없습니다.");
        }

        SalesAccountingSlip first = slips.get(0);
        UUID partnerId = first.getPartnerId();
        YearMonth slipMonth = YearMonth.from(first.getSlipDate());
        validateSlips(slips, partnerId, slipMonth);

        BigDecimal totalSupplyAmount = slips.stream()
                .map(SalesAccountingSlip::getTotalSupplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalVatAmount = slips.stream()
                .map(SalesAccountingSlip::getTotalVatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalAmount = slips.stream()
                .map(SalesAccountingSlip::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        String taxInvoiceNo = taxInvoiceNumberService.next(issuedDate);
        TaxInvoice taxInvoice = TaxInvoice.createDraftFromSalesSlips(
                taxInvoiceNo,
                issuedDate,
                partnerId,
                first.getPartnerCode(),
                first.getPartnerName(),
                totalSupplyAmount,
                totalVatAmount,
                totalAmount,
                actorUserId);
        TaxInvoice saved = taxInvoiceRepository.save(taxInvoice);

        UUID taxInvoiceId = saved.getId();
        for (SalesAccountingSlip slip : slips) {
            slip.linkTaxInvoice(taxInvoiceId);
        }

        return new TaxInvoiceFromSalesSlipsResponse(
                saved.getTaxInvoiceNo(),
                first.getPartnerCode(),
                first.getPartnerName(),
                totalSupplyAmount,
                totalVatAmount,
                totalAmount,
                slips.size(),
                slips.stream().map(SalesAccountingSlip::getSlipNo).toList());
    }

    private static void validateSlips(List<SalesAccountingSlip> slips, UUID partnerId,
                                      YearMonth slipMonth) {
        for (SalesAccountingSlip slip : slips) {
            if (!partnerId.equals(slip.getPartnerId())) {
                throw new BusinessException(ErrorCode.SAS_PARTNER_MONTH_MISMATCH,
                        "묶음 발행은 동일 거래처 매출전표만 허용됩니다: " + slip.getSlipNo());
            }
            if (!slipMonth.equals(YearMonth.from(slip.getSlipDate()))) {
                throw new BusinessException(ErrorCode.SAS_PARTNER_MONTH_MISMATCH,
                        "묶음 발행은 동일월 매출전표만 허용됩니다: " + slip.getSlipNo());
            }
            if (slip.getStatus() != SalesSlipStatus.POSTED) {
                throw new BusinessException(ErrorCode.SAS_SALES_SLIP_NOT_POSTED,
                        "POSTED 상태 매출전표만 묶음 발행할 수 있습니다: " + slip.getSlipNo());
            }
            if (slip.getTaxInvoiceId() != null) {
                throw new BusinessException(ErrorCode.SAS_TAX_INVOICE_ALREADY_LINKED,
                        "이미 세금계산서와 매핑된 매출전표입니다: " + slip.getSlipNo());
            }
        }
    }

    private static LocalDate parseIssuedDate(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "issuedDate 는 필수입니다.");
        }
        try {
            return LocalDate.parse(raw);
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "issuedDate 는 YYYY-MM-DD 형식이어야 합니다: " + raw);
        }
    }
}
