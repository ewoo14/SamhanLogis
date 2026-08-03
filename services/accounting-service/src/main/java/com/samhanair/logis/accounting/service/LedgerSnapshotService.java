package com.samhanair.logis.accounting.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.web.dto.LedgerHistoryResponse;
import com.samhanair.logis.accounting.web.dto.LedgerImageResponse;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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
    private static final DateTimeFormatter BATCH_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    /** 사용자가 명시적으로 저장을 요청한 시점에만 원장을 조회하고 snapshot을 저장한다. */
    @Transactional
    public LedgerImageResponse capture(String partnerCode, LocalDate from, LocalDate to, UUID actor) {
        LedgerImageResponse result = ledgerImageService.getLedger(partnerCode, from, to, actor);
        TaxInvoiceBatch batch = TaxInvoiceBatch.createDocumentSnapshot(
                DOCUMENT_TYPE, partnerCode,
                "LED" + LocalDateTime.now().format(BATCH_TIME),
                from, to, actor);
        batch.complete(result.lines().size(), 1, null, null,
                SnapshotCompression.compress(objectMapper, result));
        batchRepository.save(batch);
        return result;
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
