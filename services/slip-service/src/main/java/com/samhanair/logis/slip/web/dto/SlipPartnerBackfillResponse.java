package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.SlipStatus;
import java.util.List;

/**
 * 활성 전표 거래처 snapshot 보정 실행 결과.
 *
 * <p>사용자 화면에 UUID를 노출하지 않도록 미해소 항목은 전표번호·상태·거래처 코드만 반환한다.
 *
 * @param candidateCount 실행 시점에 재조회한 보정 후보 수
 * @param processedCount partner-service에서 UUID를 해소한 수 (dry-run은 보정 예정 수)
 * @param unresolvedCount 해소하지 않고 건너뛴 수
 * @param remainingCount 실행 후 남은 활성 보정 대상 수
 * @param dryRun 실제 DB 변경 없이 조회만 했는지 여부
 * @param unresolved 미해소 리포트
 */
public record SlipPartnerBackfillResponse(
        long candidateCount,
        long processedCount,
        long unresolvedCount,
        long remainingCount,
        boolean dryRun,
        List<UnresolvedSlip> unresolved) {

    /** 미해소 전표 리포트. */
    public record UnresolvedSlip(
            String slipNo,
            SlipStatus status,
            String partnerCode,
            String reason) {
    }
}
