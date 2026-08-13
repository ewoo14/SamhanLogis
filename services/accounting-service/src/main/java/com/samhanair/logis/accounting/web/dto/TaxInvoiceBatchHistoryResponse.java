package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatchStatus;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 세금계산서 일괄발행 저장 이력 응답 DTO.
 *
 * <p>목록 조회 시 {@code dataSnapshotJson} 는 미포함. 단건 조회 시 포함.
 */
public record TaxInvoiceBatchHistoryResponse(
        /** 배치 UUID (내부 식별자). */
        UUID batchId,
        /** 사용자 노출 배치 번호 (TIB-yyyyMM-NNN). */
        String batchNo,
        /** 판매조회 시작일. */
        LocalDate sourceFromDate,
        /** 판매조회 종료일. */
        LocalDate sourceToDate,
        /** 변환 행 수. */
        int totalRowCount,
        /** 분할 파일 수. */
        int splitFileCount,
        /** 배치 상태 (DRAFT/COMPLETED/DOWNLOADED). */
        TaxInvoiceBatchStatus status,
        /** 작업자 표시명. 내부 작업자 UUID는 {@link TaxInvoiceBatch} entity에 보존한다. */
        String processedBy,
        /** 작업 완료 시각. */
        LocalDateTime processedAt,
        /**
         * gzip+base64 압축 데이터 스냅샷 — 단건 조회 시만 포함.
         * 목록 조회 시 null.
         */
        String dataSnapshotJson
) {
    /**
     * 목록 조회용 — dataSnapshotJson 미포함.
     *
     * @param batch 배치 entity
     * @return 이력 응답 DTO
     */
    public static TaxInvoiceBatchHistoryResponse ofSummary(TaxInvoiceBatch batch) {
        return new TaxInvoiceBatchHistoryResponse(
                batch.getId(),
                batch.getBatchNo(),
                batch.getSourceFromDate(),
                batch.getSourceToDate(),
                batch.getTotalRowCount(),
                batch.getSplitFileCount(),
                batch.getStatus(),
                ActorDisplayName.resolve(
                        batch.getProcessedBy() == null ? null : batch.getProcessedBy().toString(), null),
                batch.getProcessedAt(),
                null
        );
    }

    /**
     * 단건 조회용 — dataSnapshotJson 포함.
     *
     * @param batch 배치 entity
     * @return 이력 응답 DTO (스냅샷 포함)
     */
    public static TaxInvoiceBatchHistoryResponse ofDetail(TaxInvoiceBatch batch) {
        return new TaxInvoiceBatchHistoryResponse(
                batch.getId(),
                batch.getBatchNo(),
                batch.getSourceFromDate(),
                batch.getSourceToDate(),
                batch.getTotalRowCount(),
                batch.getSplitFileCount(),
                batch.getStatus(),
                ActorDisplayName.resolve(
                        batch.getProcessedBy() == null ? null : batch.getProcessedBy().toString(), null),
                batch.getProcessedAt(),
                batch.getDataSnapshotJson()
        );
    }
}
