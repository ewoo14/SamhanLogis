package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.web.dto.SlipDisplayAmount;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipCleanupResponse;
import com.samhanair.logis.slip.web.dto.SlipCleanupResponse.CleanupEntry;
import com.samhanair.logis.slip.web.dto.SlipCleanupResponse.PartnerCount;
import com.samhanair.logis.slip.web.dto.SlipCleanupResponse.StatusCount;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * PR-E1 BE-A6 — 전표 정리 리스트 service (legacy GAS 13번 "전표정리리스트" 자동 조회 이식).
 *
 * <p>기간 내 활성 슬립 전체 + 정합성 검증 flag (4종) + status/partner 그룹핑 카운트.
 *
 * <p>정합성 flag 4종 (각 슬립별 boolean):
 * <ul>
 *   <li>{@code partnerCodeMissing} — partner_code NULL (V15 신규 컬럼 미채움)</li>
 *   <li>{@code amountZero} — 라인 합계 금액 = 0 (사실상 무료 슬립, 검증 필요)</li>
 *   <li>{@code linesMissing} — 라인 0건 (DRAFT 외 단계는 비정상)</li>
 *   <li>{@code regionMissing} — classified_region_group NULL (다음날자 이미지 그룹핑 누락)</li>
 * </ul>
 *
 * <p>그룹핑:
 * <ul>
 *   <li>{@code byStatus} — SlipStatus enum 별 카운트 (0인 status 는 응답에서 제외)</li>
 *   <li>{@code byPartner} — partner_code 별 카운트 (partner_code NULL 슬립은 partnerCode="(미매핑)")</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — entry.id 는 admin 화면 한정 (path variable 후속 작업용). 사용자 노출
 * 식별자는 slipNo / partnerCode / partnerName.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SlipCleanupService {

    /** partner_code NULL 슬립의 fallback group key (byPartner 그룹핑). */
    private static final String UNMAPPED_PARTNER_KEY = "(미매핑)";

    private final SlipRepository slipRepository;

    /**
     * 기간 내 활성 슬립 정리 리스트.
     *
     * @param from 기간 시작일 (포함)
     * @param to 기간 종료일 (포함)
     * @return 카운트 그룹 + 정합성 flag entries
     * @throws BusinessException(INVALID_INPUT) from / to null 또는 to < from
     */
    public SlipCleanupResponse buildCleanupReport(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "from/to 는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "to 는 from 보다 빠를 수 없습니다");
        }

        List<Slip> slips = slipRepository.findAllBySlipDateBetweenAndIsDeletedFalse(from, to);

        Map<SlipStatus, Integer> statusCounts = new EnumMap<>(SlipStatus.class);
        Map<String, PartnerAccumulator> partnerCounts = new LinkedHashMap<>();
        List<CleanupEntry> entries = new ArrayList<>(slips.size());

        for (Slip slip : slips) {
            // status 카운트
            statusCounts.merge(slip.getStatus(), 1, Integer::sum);

            // partner 카운트 (partner_code null → "(미매핑)" key)
            String partnerKey = (slip.getPartnerCode() == null || slip.getPartnerCode().isBlank())
                    ? UNMAPPED_PARTNER_KEY
                    : slip.getPartnerCode();
            PartnerAccumulator acc = partnerCounts.computeIfAbsent(partnerKey,
                    k -> new PartnerAccumulator(slip.getPartnerName()));
            acc.count++;

            // entry 정합성 flag 계산
            entries.add(buildEntry(slip));
        }

        List<StatusCount> byStatus = new ArrayList<>();
        for (Map.Entry<SlipStatus, Integer> e : statusCounts.entrySet()) {
            byStatus.add(new StatusCount(e.getKey(), e.getValue()));
        }
        List<PartnerCount> byPartner = new ArrayList<>();
        for (Map.Entry<String, PartnerAccumulator> e : partnerCounts.entrySet()) {
            byPartner.add(new PartnerCount(e.getKey(), e.getValue().partnerName, e.getValue().count));
        }

        return new SlipCleanupResponse(from, to, slips.size(), byStatus, byPartner, entries);
    }

    /**
     * 슬립 1건의 정리 entry 빌드 — 정합성 flag 4종 계산.
     */
    private CleanupEntry buildEntry(Slip slip) {
        List<SlipLine> lines = slip.getLines();
        int lineCount = lines == null ? 0 : lines.size();
        BigDecimal totalAmount = lines == null
                ? BigDecimal.ZERO : SlipDisplayAmount.vatInclusiveTotal(lines);

        boolean partnerCodeMissing = slip.getPartnerCode() == null || slip.getPartnerCode().isBlank();
        boolean amountZero = totalAmount.compareTo(BigDecimal.ZERO) == 0;
        boolean linesMissing = lineCount == 0;
        boolean regionMissing = slip.getClassifiedRegionGroup() == null
                || slip.getClassifiedRegionGroup().isBlank();

        return new CleanupEntry(
                slip.getId(),
                slip.getSlipNo(),
                slip.getSlipDate(),
                slip.getStatus(),
                slip.getPartnerCode(),
                slip.getPartnerName(),
                slip.getClassifiedRegionGroup(),
                lineCount,
                totalAmount,
                partnerCodeMissing,
                amountZero,
                linesMissing,
                regionMissing);
    }

    /** partner 그룹핑 누적기 — partner_code 별 count + 첫 등장 partner_name snapshot. */
    private static class PartnerAccumulator {
        final String partnerName;
        int count;

        PartnerAccumulator(String partnerName) {
            this.partnerName = partnerName;
            this.count = 0;
        }
    }
}
