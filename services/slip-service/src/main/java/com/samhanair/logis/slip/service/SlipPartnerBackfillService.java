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
 * <p>실행 시점에 활성 9상태의 두 종류 legacy 위반을 재조회한다. partner_code가 있고
     * partner_id가 없는 행은 기존 방향으로, partner_id가 있고 partner_code가 없는 행은
     * 반대 방향으로 partner-service를 호출한다. lookup 실패는 미해소 리포트로 남기며 저장을
     * 막지 않는다. 두 방향 모두 이미 값이 있으면 조회 대상에서 제외되어 멱등이다.
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
        List<Slip> partnerIdMissing = slipRepository
                .findAllByStatusInAndPartnerIdIsNullAndIsDeletedFalse(REQUIRED_STATUSES);
        List<Slip> partnerCodeMissing = slipRepository
                .findAllByStatusInAndPartnerIdIsNotNullAndPartnerCodeMissingAndIsDeletedFalse(REQUIRED_STATUSES);
        List<Slip> updated = new ArrayList<>();
        List<UnresolvedSlip> unresolved = new ArrayList<>();
        long processedCount = 0;

        for (Slip slip : partnerIdMissing) {
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

        for (Slip slip : partnerCodeMissing) {
            String partnerCode = normalize(partnerInternalClient.resolvePartnerCode(slip.getPartnerId()).orElse(null));
            if (partnerCode != null) {
                processedCount++;
                if (!dryRun) {
                    slip.setPartnerCode(partnerCode);
                    updated.add(slip);
                }
                continue;
            }
            unresolved.add(unresolved(slip, null, "partnerCode resolve 실패"));
        }

        if (!dryRun && !updated.isEmpty()) {
            slipRepository.saveAllAndFlush(updated);
        }
        long remainingCount = slipRepository
                .countByStatusInAndEitherPartnerColumnMissing(REQUIRED_STATUSES);
        log.info("커밋 전표 거래처 보정 완료 — dryRun={}, candidate={}, processed={}, unresolved={}, remaining={}",
                dryRun, partnerIdMissing.size() + partnerCodeMissing.size(), processedCount,
                unresolved.size(), remainingCount);
        return new SlipPartnerBackfillResponse(
                partnerIdMissing.size() + partnerCodeMissing.size(), processedCount, unresolved.size(),
                remainingCount, dryRun,
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
