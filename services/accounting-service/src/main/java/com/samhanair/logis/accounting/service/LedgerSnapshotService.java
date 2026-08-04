package com.samhanair.logis.accounting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.web.dto.LedgerHistoryResponse;
import com.samhanair.logis.accounting.web.dto.LedgerImageResponse;
import com.samhanair.logis.accounting.web.dto.LedgerSnapshotResponse;
import com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 거래처별 원장 화면 read model에 홈택스 RDB snapshot 계약을 적용하는 application service. */
@Service
public class LedgerSnapshotService {

    static final String DOCUMENT_TYPE = "PARTNER_LEDGER";

    private final PartnerLedgerReadService partnerLedgerReadService;
    private final TaxInvoiceBatchRepository batchRepository;
    private final ObjectMapper objectMapper;
    private final LedgerSnapshotBatchNoGenerator batchNoGenerator;
    private static final DateTimeFormatter BATCH_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    @Autowired
    public LedgerSnapshotService(PartnerLedgerReadService partnerLedgerReadService,
                                 TaxInvoiceBatchRepository batchRepository,
                                 ObjectMapper objectMapper,
                                 LedgerSnapshotBatchNoGenerator batchNoGenerator) {
        this.partnerLedgerReadService = partnerLedgerReadService;
        this.batchRepository = batchRepository;
        this.objectMapper = objectMapper;
        this.batchNoGenerator = batchNoGenerator;
    }

    /** 기존 단위 테스트/legacy wiring 호환 생성자. 운영 Spring wiring은 generator를 주입한다. */
    public LedgerSnapshotService(PartnerLedgerReadService partnerLedgerReadService,
                                 TaxInvoiceBatchRepository batchRepository,
                                 ObjectMapper objectMapper) {
        this(partnerLedgerReadService, batchRepository, objectMapper, null);
    }

    /** 사용자가 명시적으로 저장을 요청한 시점의 화면 read model을 snapshot으로 저장한다. */
    @Transactional
    public PartnerLedgerResponse capture(String partnerCode, LocalDate from, LocalDate to, UUID actor) {
        PartnerLedgerResponse result = partnerLedgerReadService.read(partnerCode, from, to);
        TaxInvoiceBatch batch = TaxInvoiceBatch.createDocumentSnapshot(
                DOCUMENT_TYPE, partnerCode,
                nextBatchNo(),
                from, to, actor);
        batch.complete(LedgerSnapshotResponse.lineCount(result), 1, null, null,
                SnapshotCompression.compress(objectMapper, result));
        batchRepository.save(batch);
        return result;
    }

    /** 날짜별 원장 저장 이력 목록. */
    @Transactional(readOnly = true)
    public Page<LedgerHistoryResponse> history(String partnerCode, LocalDate from, LocalDate to,
                                               Pageable pageable) {
        return batchRepository.findDocumentHistory(DOCUMENT_TYPE, partnerCode, from, to, pageable)
                .map(batch -> LedgerHistoryResponse.summary(batch.getBatchNo(), batch.getDocumentKey(),
                        batch.getSourceFromDate(), batch.getSourceToDate(), batch.getTotalRowCount(),
                        batch.getProcessedAt(), batch.getSourceBatchNo()));
    }

    /** 사용자 노출 배치번호로 이력을 복원한다. */
    @Transactional(readOnly = true)
    public LedgerHistoryResponse restore(String batchNo) {
        TaxInvoiceBatch batch = batchRepository.findByBatchNoAndDocumentType(batchNo, DOCUMENT_TYPE)
                .orElseThrow(() -> new IllegalArgumentException("원장 이력을 찾을 수 없습니다: " + batchNo));
        LedgerSnapshotResponse ledger = restorePayload(batch.getDataSnapshotJson());
        return new LedgerHistoryResponse(batch.getBatchNo(), batch.getDocumentKey(),
                batch.getSourceFromDate(), batch.getSourceToDate(), batch.getTotalRowCount(),
                batch.getProcessedAt(), batch.getSourceBatchNo(), ledger);
    }

    /** 복원 중인 snapshot payload를 다시 읽지 않고 원문 그대로 새 저장한다. */
    @Transactional
    public LedgerHistoryResponse copy(String sourceBatchNo, UUID actor) {
        TaxInvoiceBatch source = batchRepository.findByBatchNoAndDocumentType(sourceBatchNo, DOCUMENT_TYPE)
                .orElseThrow(() -> new IllegalArgumentException("원장 이력을 찾을 수 없습니다: " + sourceBatchNo));
        TaxInvoiceBatch copy = TaxInvoiceBatch.createDocumentSnapshot(
                DOCUMENT_TYPE, source.getDocumentKey(), nextBatchNo(), source.getSourceFromDate(),
                source.getSourceToDate(), actor, source.getBatchNo());
        copy.complete(source.getTotalRowCount(), source.getSplitFileCount(), source.getExcludedSlipNos(),
                source.getExcludedPartnerCodes(), source.getDataSnapshotJson());
        batchRepository.save(copy);
        return new LedgerHistoryResponse(copy.getBatchNo(), copy.getDocumentKey(),
                copy.getSourceFromDate(), copy.getSourceToDate(), copy.getTotalRowCount(),
                copy.getProcessedAt(), copy.getSourceBatchNo(), null);
    }

    private String nextBatchNo() {
        return batchNoGenerator == null
                ? "LED" + LocalDateTime.now().format(BATCH_TIME)
                : batchNoGenerator.next(LocalDate.now());
    }

    /** 신규 read model payload와 기존 분개 line payload를 모두 복원한다. */
    private LedgerSnapshotResponse restorePayload(String payload) {
        JsonNode root = SnapshotCompression.decompress(objectMapper, payload, JsonNode.class);
        try {
            if (root.has("documents")) {
                return LedgerSnapshotResponse.fromPartnerLedger(
                        objectMapper.treeToValue(root, PartnerLedgerResponse.class));
            }
            return LedgerSnapshotResponse.fromLegacy(
                    objectMapper.treeToValue(root, LedgerImageResponse.class));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("원장 snapshot payload 형식이 올바르지 않습니다", e);
        }
    }
}
