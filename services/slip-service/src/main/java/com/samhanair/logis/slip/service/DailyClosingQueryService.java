package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.DailyClosingRowResponse;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 출고일 기준 일마감 원본행 조회 — S1. */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class DailyClosingQueryService {

    private static final EnumSet<SlipStatus> INCLUDED_STATUSES = EnumSet.of(
            SlipStatus.CONFIRMED, SlipStatus.DELIVERED, SlipStatus.COMPLETED);

    private final SlipRepository slipRepository;
    private final DailyClosingSourceResolver sourceResolver;

    public List<DailyClosingRowResponse> findRows(LocalDate slipDate) {
        if (slipDate == null) {
            throw new IllegalArgumentException("slipDate는 필수입니다.");
        }
        return slipRepository.findDailyClosingOutboundSlips(slipDate, INCLUDED_STATUSES).stream()
                .filter(slip -> INCLUDED_STATUSES.contains(slip.getStatus()))
                .flatMap(slip -> slip.getLines().stream()
                        .map(line -> DailyClosingRowResponse.from(slip, line, sourceResolver.resolve(slip, line))))
                .toList();
    }
}
