package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Samhan Public 배차 메뉴 — 미배차 출고전표 페이지네이션 조회 (BE Task B7).
 *
 * <p>default: slipDate ∈ Asia/Seoul today ±1일 + dispatchStatus = UNDISPATCHED + 50/회.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DispatchTaskBoardQueryService {

    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    static final int DEFAULT_PAGE_SIZE = 50;

    private final SlipRepository slipRepo;

    /**
     * 미배차 출고전표 페이지 조회 — 배차 메뉴 좌측 패널 source.
     *
     * @param from null 이면 Asia/Seoul today - 1일
     * @param to null 이면 Asia/Seoul today + 1일
     * @param statuses null/empty 이면 UNDISPATCHED 단일 (default)
     * @param page 0-based
     * @param size 1 ~ 200 (가드)
     */
    public Page<Slip> findUnDispatchedSlips(
            LocalDate from, LocalDate to, Set<SlipDispatchStatus> statuses, int page, int size) {

        LocalDate today = LocalDate.now(KST);
        LocalDate effectiveFrom = (from != null) ? from : today.minusDays(1);
        LocalDate effectiveTo = (to != null) ? to : today.plusDays(1);
        if (effectiveFrom.isAfter(effectiveTo)) {
            throw new IllegalArgumentException("from 이 to 보다 늦을 수 없습니다.");
        }

        Set<SlipDispatchStatus> effectiveStatuses = (statuses == null || statuses.isEmpty())
                ? EnumSet.of(SlipDispatchStatus.UNDISPATCHED)
                : statuses;

        int safePage = Math.max(0, page);
        int safeSize = (size <= 0 || size > 200) ? DEFAULT_PAGE_SIZE : size;
        Pageable pageable = PageRequest.of(safePage, safeSize,
                Sort.by(Sort.Direction.DESC, "slipDate").and(Sort.by(Sort.Direction.DESC, "seqNo")));

        return slipRepo.findAllBySlipTypeAndSlipDateBetweenAndDispatchStatusInAndIsDeletedFalse(
                SlipType.OUTBOUND, effectiveFrom, effectiveTo, effectiveStatuses, pageable);
    }
}
