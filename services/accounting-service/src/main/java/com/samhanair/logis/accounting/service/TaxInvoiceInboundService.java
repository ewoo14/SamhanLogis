package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.InboundTaxInvoiceResponse;
import com.samhanair.logis.accounting.web.dto.RegisterInboundTaxInvoiceRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceSummaryResponse;
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
public class TaxInvoiceInboundService {
    private static final LocalDate DEFAULT_FROM = LocalDate.of(1900, 1, 1);
    private static final LocalDate DEFAULT_TO = LocalDate.of(9999, 12, 31);

    private final PurchaseAccountingSlipRepository purchaseSlipRepository;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final TaxInvoiceNumberService taxInvoiceNumberService;
    private final PartnerLookupClient partnerLookupClient;

    @Transactional(readOnly = true)
    public List<TaxInvoiceSummaryResponse> listInbound(
            LocalDate from,
            LocalDate to,
            String partnerCode) {
        LocalDate resolvedFrom = from == null ? DEFAULT_FROM : from;
        LocalDate resolvedTo = to == null ? DEFAULT_TO : to;
        String normalizedPartnerCode = partnerCode == null || partnerCode.isBlank()
                ? null
                : escapeLikeLiteral(partnerCode.trim());
        return taxInvoiceRepository.findInboundByFilters(resolvedFrom, resolvedTo, normalizedPartnerCode)
                .stream()
                .map(TaxInvoiceSummaryResponse::of)
                .toList();
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    public InboundTaxInvoiceResponse registerInbound(
            RegisterInboundTaxInvoiceRequest request, String actorUserId) {
        if (request == null || request.purchaseSlipIds() == null
                || request.purchaseSlipIds().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "매입전표 ID 목록은 필수입니다.");
        }

        LocalDate issuedDate = parseIssuedDate(request.issuedDate());
        List<PurchaseAccountingSlip> slips =
                purchaseSlipRepository.findAllByIdsForBatch(request.purchaseSlipIds());
        if (slips.size() != request.purchaseSlipIds().size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "일부 매입전표를 찾을 수 없습니다.");
        }

        PurchaseAccountingSlip first = slips.get(0);
        UUID partnerId = first.getPartnerId();
        YearMonth slipMonth = YearMonth.from(first.getSlipDate());
        validateSlips(slips, partnerId, slipMonth);

        List<PurchaseAccountingSlipLine> sourceLines = slips.stream()
                .flatMap(slip -> slip.getLines().stream())
                .toList();
        String partnerBusinessNo = resolvePartnerBusinessNo(first.getPartnerCode());

        BigDecimal totalSupply = sumSupply(slips);
        BigDecimal totalVat = sumVat(slips);
        BigDecimal totalAmount = sumTotal(slips);
        String taxInvoiceNo = taxInvoiceNumberService.next(issuedDate);
        TaxInvoice taxInvoice = TaxInvoice.createInbound(
                taxInvoiceNo,
                issuedDate,
                partnerId,
                first.getPartnerCode(),
                first.getPartnerName(),
                partnerBusinessNo,
                totalSupply,
                totalVat,
                totalAmount,
                actorUserId);

        int lineNo = 1;
        for (PurchaseAccountingSlipLine sourceLine : sourceLines) {
            taxInvoice.addLine(TaxInvoiceLine.createFromPurchaseAccountingSlipLine(
                    taxInvoice, lineNo++, sourceLine));
        }
        TaxInvoice saved = taxInvoiceRepository.save(taxInvoice);
        saved.markReceived(actorUserId);

        UUID taxInvoiceId = saved.getId();
        for (PurchaseAccountingSlip slip : slips) {
            slip.linkTaxInvoice(taxInvoiceId);
        }

        return new InboundTaxInvoiceResponse(
                saved.getId().toString(),
                saved.getTaxInvoiceNo(),
                first.getPartnerCode(),
                first.getPartnerName(),
                saved.getSupplyAmount(),
                saved.getVatAmount(),
                saved.getTotalAmount(),
                slips.size(),
                slips.stream().map(PurchaseAccountingSlip::getSlipNo).toList(),
                saved.getStatus().name(),
                List.of());
    }

    private String resolvePartnerBusinessNo(String partnerCode) {
        PartnerSummary partner = PartnerLookupSupport.foundOrNull(
                PartnerLookupSupport.byCode(partnerLookupClient, partnerCode));
        return partner == null || partner.businessNo() == null || partner.businessNo().isBlank()
                ? null
                : partner.businessNo();
    }

    private static void validateSlips(List<PurchaseAccountingSlip> slips, UUID partnerId,
                                      YearMonth slipMonth) {
        for (PurchaseAccountingSlip slip : slips) {
            if (!partnerId.equals(slip.getPartnerId())) {
                throw new BusinessException(ErrorCode.SAS_PARTNER_MONTH_MISMATCH,
                        "수신 등록은 동일 거래처 매입전표만 허용됩니다: " + slip.getSlipNo());
            }
            if (!slipMonth.equals(YearMonth.from(slip.getSlipDate()))) {
                throw new BusinessException(ErrorCode.SAS_PARTNER_MONTH_MISMATCH,
                        "수신 등록은 동일월 매입전표만 허용됩니다: " + slip.getSlipNo());
            }
            if (slip.getStatus() != PurchaseSlipStatus.POSTED) {
                throw new BusinessException(ErrorCode.SAS_PURCHASE_SLIP_NOT_POSTED,
                        PurchaseSlipStatus.POSTED.getDisplayName()
                                + " 상태 매입전표만 수신 등록할 수 있습니다: " + slip.getSlipNo());
            }
            if (slip.getTaxInvoiceId() != null) {
                throw new BusinessException(ErrorCode.SAS_TAX_INVOICE_ALREADY_LINKED,
                        "이미 세금계산서와 매핑된 매입전표입니다: " + slip.getSlipNo());
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

    private static BigDecimal sumSupply(List<PurchaseAccountingSlip> slips) {
        return slips.stream()
                .map(PurchaseAccountingSlip::getTotalSupplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal sumVat(List<PurchaseAccountingSlip> slips) {
        return slips.stream()
                .map(PurchaseAccountingSlip::getTotalVatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal sumTotal(List<PurchaseAccountingSlip> slips) {
        return slips.stream()
                .map(PurchaseAccountingSlip::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
