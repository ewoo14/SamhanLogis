package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.AccountingJournalSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingLedgerPartnerSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingStatementSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingTaxInvoiceSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingSalesCommissionSettlementSearchResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 그룹웨어 결재 첨부에서 사용할 회계 문서 참조 검색 서비스. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AccountingDocumentSearchService {

    private static final int DEFAULT_LIMIT = 10;
    private static final int MAX_LIMIT = 20;

    private final JournalRepository journalRepository;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final SalesCommissionSettlementRepository salesCommissionSettlementRepository;

    /** 분개번호 또는 적요로 분개장 참조 후보를 검색한다. */
    public List<AccountingJournalSearchResponse> searchJournals(String q, int limit) {
        return journalRepository.searchApprovalReferences(normalize(q), pageable(limit));
    }

    /** 세금계산서 번호 또는 거래처명으로 세금계산서 참조 후보를 검색한다. */
    public List<AccountingTaxInvoiceSearchResponse> searchTaxInvoices(String q, int limit) {
        return taxInvoiceRepository.searchTaxInvoiceReferences(normalize(q), pageable(limit));
    }

    /**
     * 거래명세서 참조 후보를 검색한다.
     *
     * <p>독립 거래명세서 엔티티가 없어 세금계산서 라인 스냅샷 기반 결과를 반환한다.
     */
    public List<AccountingStatementSearchResponse> searchStatements(String q, int limit) {
        return taxInvoiceRepository.searchStatementReferences(normalize(q), pageable(limit));
    }

    /** 거래처코드 또는 거래처명으로 거래처원장 참조 후보를 검색한다. */
    public List<AccountingLedgerPartnerSearchResponse> searchLedgerPartners(String q, int limit) {
        return taxInvoiceRepository.searchLedgerPartnerReferences(normalize(q), pageable(limit));
    }

    /** 확정 영업수수료 정산서의 문서번호로 결재 첨부 후보를 검색한다. */
    public List<AccountingSalesCommissionSettlementSearchResponse> searchSalesCommissionSettlements(
            String q, int limit) {
        return salesCommissionSettlementRepository
                .searchApprovalReferences(normalize(q), SalesCommissionSettlementStatus.CONFIRMED, pageable(limit))
                .stream()
                .map(settlement -> new AccountingSalesCommissionSettlementSearchResponse(
                        settlement.getDocumentNo(),
                        settlement.getSettlementDate(),
                        settlement.getStatus().name(),
                        settlement.getPayoutAmount()))
                .toList();
    }

    private Pageable pageable(int requestedLimit) {
        int size = requestedLimit <= 0 ? DEFAULT_LIMIT : Math.min(requestedLimit, MAX_LIMIT);
        return PageRequest.of(0, size);
    }

    private String normalize(String q) {
        String value = q == null ? "" : q.trim();
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
