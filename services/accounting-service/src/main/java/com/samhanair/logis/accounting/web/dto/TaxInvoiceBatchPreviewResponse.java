package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import java.util.List;
import java.util.UUID;

/**
 * 세금계산서 일괄발행 미리보기 응답 DTO.
 *
 * <p>판매조회 데이터를 홈택스 양식으로 변환한 결과 + 저장된 배치 메타정보.
 */
public record TaxInvoiceBatchPreviewResponse(
        /** 저장된 배치 UUID (다운로드 endpoint 에서 사용). 내부 용도 — 사용자 노출 금지. */
        UUID batchId,
        /** 사용자 노출 배치 번호 (예: TIB-202605-001). */
        String batchNo,
        /** 변환된 총 행 수. */
        int totalRowCount,
        /** 100건 단위 분할 파일 수. */
        int splitFileCount,
        /** 변환된 홈택스 양식 행 목록. */
        List<HomtaxRow> rows,
        /** 적용된 제외 거래처 코드 목록 (DB 마스터 + 요청 임시 합산). */
        List<String> appliedExclusionCodes
) {
    /**
     * 저장된 배치 entity 와 변환 결과로 응답 생성.
     *
     * @param batch              저장된 배치 entity
     * @param rows               홈택스 양식 행 목록
     * @param exclusionCodes     적용된 제외 거래처 코드 목록
     * @return 미리보기 응답
     */
    public static TaxInvoiceBatchPreviewResponse of(TaxInvoiceBatch batch,
                                                     List<HomtaxRow> rows,
                                                     List<String> exclusionCodes) {
        return new TaxInvoiceBatchPreviewResponse(
                batch.getId(),
                batch.getBatchNo(),
                batch.getTotalRowCount(),
                batch.getSplitFileCount(),
                rows,
                exclusionCodes
        );
    }
}
