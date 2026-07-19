package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipPartnerBackfillResponse;
import com.samhanair.logis.slip.web.dto.SlipPartnerBackfillResponse.UnresolvedSlip;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 커밋 전표의 partner_id legacy 위반을 partner-service 경유로 동적으로 보정한다.
 *
 * <p>실행 시점에 활성 9상태 + partner_id null을 재조회한다. FOUND와 실제 partnerId가 모두 있는
 * 경우에만 변경하며, 그 밖의 partner-service 결과는 회계 무결성을 위해 fail-open하지 않고
 * 미해소 리포트로 남긴다. 보정 대상은 이미 값이 있으면 조회 대상에서 제외되어 멱등이다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SlipPartnerBackfillService {

    private static final Set<SlipStatus> REQUIRED_STATUSES = Slip.requiredPartnerStatuses();

    private final SlipRepository slipRepository;
    private final PartnerInternalClient partnerInternalClient;

    /**
     * 거래처 보정을 실행하거나 dry-run 리포트를 만든다.
     *
     * @param dryRun true면 partner-service 조회와 리포트만 수행하고 DB를 변경하지 않음
     * @return 실행 결과와 미해소 항목
     */
    @Transactional
    public SlipPartnerBackfillResponse backfill(boolean dryRun) {
        List<Slip> candidates = slipRepository
                .findAllByStatusInAndPartnerIdIsNullAndIsDeletedFalse(REQUIRED_STATUSES);
        List<Slip> updated = new ArrayList<>();
        List<UnresolvedSlip> unresolved = new ArrayList<>();
        long processedCount = 0;

        for (Slip slip : candidates) {
            String partnerCode = normalize(slip.getPartnerCode());
            if (partnerCode == null) {
                unresolved.add(unresolved(slip, null, "partnerCode 없음"));
                continue;
            }

            PartnerVerifyResult result = partnerInternalClient.verifyPartnerCode(partnerCode);
            if (result != null && result.status() == PartnerVerifyResult.Status.FOUND
                    && result.partnerId() != null && result.partnerId().isPresent()) {
                processedCount++;
                if (!dryRun) {
                    slip.backfillPartnerId(result.partnerId().get());
                    updated.add(slip);
                }
                continue;
            }
            unresolved.add(unresolved(slip, partnerCode, reason(result)));
        }

        if (!dryRun && !updated.isEmpty()) {
            slipRepository.saveAllAndFlush(updated);
        }
        long remainingCount = slipRepository
                .countByStatusInAndPartnerIdIsNullAndIsDeletedFalse(REQUIRED_STATUSES);
        log.info("커밋 전표 거래처 보정 완료 — dryRun={}, candidate={}, processed={}, unresolved={}, remaining={}",
                dryRun, candidates.size(), processedCount, unresolved.size(), remainingCount);
        return new SlipPartnerBackfillResponse(
                candidates.size(), processedCount, unresolved.size(), remainingCount, dryRun,
                List.copyOf(unresolved));
    }

    private static UnresolvedSlip unresolved(Slip slip, String partnerCode, String reason) {
        return new UnresolvedSlip(slip.getSlipNo(), slip.getStatus(), partnerCode, reason);
    }

    private static String reason(PartnerVerifyResult result) {
        if (result == null) {
            return "partner-service 응답 없음";
        }
        return switch (result.status()) {
            case NOT_FOUND -> "partnerCode 미존재";
            case SERVER_ERROR -> "partner-service 오류";
            case SKIPPED -> "partner 조회 생략";
            case FOUND -> "partnerId 없음";
        };
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
