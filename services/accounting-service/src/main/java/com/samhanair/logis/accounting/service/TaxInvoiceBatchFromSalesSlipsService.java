package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceFromSalesSlipsRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchCandidateResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceFromSalesSlipsResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class TaxInvoiceBatchFromSalesSlipsService {
    private static final LocalDate DEFAULT_FROM = LocalDate.of(1900, 1, 1);
    private static final LocalDate DEFAULT_TO = LocalDate.of(9999, 12, 31);

    private final SalesAccountingSlipRepository salesSlipRepository;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final TaxInvoiceNumberService taxInvoiceNumberService;
    private final PartnerLookupClient partnerLookupClient;

    @Transactional(readOnly = true)
    public List<TaxInvoiceBatchCandidateResponse> listCandidates(
            LocalDate from,
            LocalDate to,
            String partnerCode) {
        LocalDate resolvedFrom = from == null ? DEFAULT_FROM : from;
        LocalDate resolvedTo = to == null ? DEFAULT_TO : to;
        String normalizedPartnerCode = partnerCode == null || partnerCode.isBlank()
                ? null
                : escapeLikeLiteral(partnerCode.trim());
        List<SalesAccountingSlip> slips = salesSlipRepository
                .findPostedUnlinkedForBatchCandidates(resolvedFrom, resolvedTo, normalizedPartnerCode);
        Map<CandidateKey, List<SalesAccountingSlip>> grouped = new LinkedHashMap<>();
        for (SalesAccountingSlip slip : slips) {
            CandidateKey key = new CandidateKey(
                    slip.getPartnerCode(),
                    slip.getPartnerName(),
                    YearMonth.from(slip.getSlipDate()));
            grouped.computeIfAbsent(key, ignored -> new ArrayList<>()).add(slip);
        }
        return grouped.entrySet().stream()
                .map(entry -> TaxInvoiceBatchCandidateResponse.of(
                        entry.getKey().partnerCode(),
                        entry.getKey().partnerName(),
                        entry.getKey().month(),
                        entry.getValue()))
                .toList();
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    public TaxInvoiceFromSalesSlipsResponse createFromSalesSlips(
            CreateTaxInvoiceFromSalesSlipsRequest request, String actorUserId) {
        if (request == null || request.salesSlipIds() == null || request.salesSlipIds().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "매출전표 ID 목록은 필수입니다.");
        }

        LocalDate issuedDate = parseIssuedDate(request.issuedDate());
        List<SalesAccountingSlip> slips =
                salesSlipRepository.findAllByIdsForBatch(request.salesSlipIds());
        if (slips.size() != request.salesSlipIds().size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "일부 매출전표를 찾을 수 없습니다.");
        }

        SalesAccountingSlip first = slips.get(0);
        UUID partnerId = first.getPartnerId();
        YearMonth slipMonth = YearMonth.from(first.getSlipDate());
        validateSlips(slips, partnerId, slipMonth);

        List<SalesAccountingSlipLine> sourceLines = slips.stream()
                .flatMap(slip -> slip.getLines().stream())
                .toList();
        String partnerBusinessNo = resolvePartnerBusinessNo(first.getPartnerCode());

        String taxInvoiceNo = taxInvoiceNumberService.next(issuedDate);
        TaxInvoice taxInvoice = TaxInvoice.createDraftFromSalesSlips(
                taxInvoiceNo,
                issuedDate,
                partnerId,
                first.getPartnerCode(),
                first.getPartnerName(),
                partnerBusinessNo,
                sourceLines,
                actorUserId);
        TaxInvoice saved = taxInvoiceRepository.save(taxInvoice);

        UUID taxInvoiceId = saved.getId();
        for (SalesAccountingSlip slip : slips) {
            slip.linkTaxInvoice(taxInvoiceId);
        }
        saved.issue(saved.getTaxInvoiceNo(), actorUserId);

        return new TaxInvoiceFromSalesSlipsResponse(
                saved.getTaxInvoiceNo(),
                first.getPartnerCode(),
                first.getPartnerName(),
                saved.getSupplyAmount(),
                saved.getVatAmount(),
                saved.getTotalAmount(),
                slips.size(),
                slips.stream().map(SalesAccountingSlip::getSlipNo).toList(),
                saved.getStatus().name());
    }

    private String resolvePartnerBusinessNo(String partnerCode) {
        PartnerSummary partner = PartnerLookupSupport.foundOrNull(
                PartnerLookupSupport.byCode(partnerLookupClient, partnerCode));
        return partner == null || partner.businessNo() == null || partner.businessNo().isBlank()
                ? null
                : partner.businessNo();
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
                        SalesSlipStatus.POSTED.getDisplayName()
                                + " 상태 매출전표만 묶음 발행할 수 있습니다: " + slip.getSlipNo());
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

    private record CandidateKey(String partnerCode, String partnerName, YearMonth month) {}
}
