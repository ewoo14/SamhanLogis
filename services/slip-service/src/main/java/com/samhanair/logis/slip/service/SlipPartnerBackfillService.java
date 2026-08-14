package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipPartnerQuarantine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.SlipPartnerQuarantineRepository;
import com.samhanair.logis.slip.web.dto.SlipPartnerBackfillResponse;
import com.samhanair.logis.slip.web.dto.SlipPartnerBackfillResponse.UnresolvedSlip;
import com.samhanair.logis.slip.web.dto.SlipPartnerQuarantineResponse;
import com.samhanair.logis.slip.web.dto.SlipPartnerRestoreResponse;
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
    private final SlipPartnerQuarantineRepository quarantineRepository;

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
                    slip.backfillPartnerCode(partnerCode);
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

    /** 모든 활성 전표의 partnerId→partnerCode snapshot을 원본 조회 결과로만 보정한다. */
    @Transactional
    public SlipPartnerBackfillResponse backfillActivePartnerCodes(boolean dryRun) {
        List<Slip> candidates = slipRepository.findAllActiveWithPartnerIdAndPartnerCodeMissing();
        List<UnresolvedSlip> unresolved = new ArrayList<>();
        List<Slip> updated = new ArrayList<>();
        long processed = 0;
        for (Slip slip : candidates) {
            String code = normalize(partnerInternalClient.resolvePartnerCode(slip.getPartnerId()).orElse(null));
            if (code == null) {
                unresolved.add(unresolved(slip, null, "partnerId 원본에서 partnerCode resolve 실패"));
                continue;
            }
            processed++;
            if (!dryRun) {
                slip.backfillPartnerCode(code);
                updated.add(slip);
            }
        }
        if (!dryRun && !updated.isEmpty()) {
            slipRepository.saveAllAndFlush(updated);
        }
        long remaining = slipRepository.findAllActiveWithPartnerIdAndPartnerCodeMissing().size();
        return new SlipPartnerBackfillResponse(candidates.size(), processed, unresolved.size(),
                remaining, dryRun, List.copyOf(unresolved));
    }

    /** backfill 실패 목록의 지정 행만 감사 근거와 함께 soft-delete 격리한다. */
    @Transactional
    public SlipPartnerQuarantineResponse quarantineUnresolvedPartnerSlips(
            List<String> slipNos, String reason, String actor) {
        if (slipNos == null || slipNos.isEmpty()) {
            throw new IllegalArgumentException("격리할 전표번호가 필요합니다");
        }
        List<Slip> candidates = slipRepository.findAllActiveMissingPartnerCodeBySlipNoIn(slipNos);
        List<String> quarantined = new ArrayList<>();
        List<SlipPartnerQuarantine> evidence = new ArrayList<>();
        for (Slip slip : candidates) {
            evidence.add(SlipPartnerQuarantine.capture(slip, reason));
            slip.quarantineMissingPartnerSource(actor);
            quarantined.add(slip.getSlipNo());
        }
        if (!evidence.isEmpty()) {
            quarantineRepository.saveAll(evidence);
            slipRepository.saveAllAndFlush(candidates);
        }
        return new SlipPartnerQuarantineResponse(quarantined.size(), List.copyOf(quarantined));
    }

    /** partner 원본에서 코드를 재확인한 행만 코드 보완 후 soft-delete를 해제한다. */
    @Transactional
    public SlipPartnerRestoreResponse restoreQuarantinedPartnerSlips(List<String> slipNos, String actor) {
        if (slipNos == null || slipNos.isEmpty()) {
            throw new IllegalArgumentException("복원할 전표번호가 필요합니다");
        }
        List<SlipPartnerQuarantine> evidenceRows = quarantineRepository
                .findAllBySlipNoInAndRestoredAtIsNull(slipNos);
        List<String> restored = new ArrayList<>();
        for (SlipPartnerQuarantine evidence : evidenceRows) {
            Slip slip = slipRepository.findByIdIncludingDeleted(evidence.getSlipId()).orElseThrow();
            String code = normalize(partnerInternalClient.resolvePartnerCode(evidence.getPartnerId()).orElse(null));
            if (code == null) continue;
            slip.restoreFromPartnerQuarantine(code);
            evidence.markRestored(actor, code);
            restored.add(evidence.getSlipNo());
        }
        if (!evidenceRows.isEmpty()) quarantineRepository.saveAll(evidenceRows);
        return new SlipPartnerRestoreResponse(restored.size(), List.copyOf(restored));
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
