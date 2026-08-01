package com.samhanair.logis.accounting.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.web.dto.LedgerHistoryResponse;
import com.samhanair.logis.accounting.web.dto.LedgerImageResponse;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 거래처별 원장에 홈택스 RDB 스냅샷 계약을 적용하는 얇은 application service. */
@Service
@RequiredArgsConstructor
public class LedgerSnapshotService {

    static final String DOCUMENT_TYPE = "PARTNER_LEDGER";

    private final LedgerImageService ledgerImageService;
    private final TaxInvoiceBatchRepository batchRepository;
    private final ObjectMapper objectMapper;

    /** 기존 조회를 먼저 수행한 뒤 결과를 자동 저장하여 조회·인쇄 호환성을 유지한다. */
    @Transactional
    public LedgerImageResponse capture(String partnerCode, LocalDate from, LocalDate to, UUID actor) {
        return ledgerImageService.getLedger(partnerCode, from, to, actor);
    }

    /** 날짜별 자동 저장 이력 목록. */
    @Transactional(readOnly = true)
    public Page<LedgerHistoryResponse> history(String partnerCode, LocalDate from, LocalDate to,
                                               Pageable pageable) {
        return batchRepository.findDocumentHistory(DOCUMENT_TYPE, partnerCode, from, to, pageable)
                .map(batch -> LedgerHistoryResponse.summary(batch.getBatchNo(), batch.getDocumentKey(),
                        batch.getSourceFromDate(), batch.getSourceToDate(), batch.getTotalRowCount(),
                        batch.getProcessedAt()));
    }

    /** 사용자 노출 배치번호로 이력을 복원한다. */
    @Transactional(readOnly = true)
    public LedgerHistoryResponse restore(String batchNo) {
        TaxInvoiceBatch batch = batchRepository.findByBatchNoAndDocumentType(batchNo, DOCUMENT_TYPE)
                .orElseThrow(() -> new IllegalArgumentException("원장 이력을 찾을 수 없습니다: " + batchNo));
        LedgerImageResponse ledger = SnapshotCompression.decompress(
                objectMapper, batch.getDataSnapshotJson(), LedgerImageResponse.class);
        return new LedgerHistoryResponse(batch.getBatchNo(), batch.getDocumentKey(),
                batch.getSourceFromDate(), batch.getSourceToDate(), batch.getTotalRowCount(),
                batch.getProcessedAt(), ledger);
    }
}
