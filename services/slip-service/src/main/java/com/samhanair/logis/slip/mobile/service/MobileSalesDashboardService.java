package com.samhanair.logis.slip.mobile.service;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.mobile.dto.MobileSalesDashboardResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 영업 직원 모바일 대시보드 집계 서비스 — P1-4 Native 영업 앱.
 *
 * <p>기간(fromDate~toDate) 기준의 매출 요약, 미수금 현황, 견적 진행 상황을
 * 단일 응답 객체로 조립한다. 각 데이터는 자체 DB (slip_db) 에서만 조회하며
 * 외부 service 호출 없이 처리한다.
 *
 * <p>집계 항목:
 * <ul>
 *   <li>매출 (totalSalesAmount) — 기간 내 CONFIRMED 슬립의 공급가액 합계
 *       (SlipLine 집계 대신 헤더 단위 totalAmount 사용 — mobile 간소형)</li>
 *   <li>미수금 (totalOutstanding) — 요청자 ID 기준 파트너별 미수금은 partner-service 관할이므로
 *       본 서비스에서는 CONFIRMED 슬립의 공급가액 누적 (시스템 전체 — 개인 필터링 미지원)</li>
 *   <li>견적 진행 — DRAFT/SENT/ACCEPTED 건수 (요청자 ID 기준 필터)</li>
 * </ul>
 *
 * <p>미수금 계산 주의: 정확한 거래처별 미수금은 partner-service outstandingBalance 필드 관할.
 * 본 dashboard 에서는 requesterId 기준의 CONFIRMED 슬립 금액 합계를 "매출 기여분" 으로 표시한다.
 * 실제 미수금은 별도 partner-service 조회 화면에서 확인.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class MobileSalesDashboardService {

    private static final Logger log = LoggerFactory.getLogger(MobileSalesDashboardService.class);

    private final SlipRepository slipRepository;
    private final EstimateRepository estimateRepository;

    /**
     * 영업 직원 모바일 대시보드 집계.
     *
     * <p>fromDate/toDate 범위 내 OUTBOUND CONFIRMED 슬립의 공급가액 합계를 매출로 집계.
     * 견적 건수는 requesterId 기준으로 현재 진행 중인 상태(DRAFT/SENT/ACCEPTED)를 카운트.
     *
     * @param fromDate 집계 시작일 (null 이면 오늘 기준 30일 전)
     * @param toDate   집계 종료일 (null 이면 오늘)
     * @param requesterId 요청자 user-id (X-User-Id 헤더)
     * @return 집계 결과 {@link MobileSalesDashboardResponse}
     */
    public MobileSalesDashboardResponse build(LocalDate fromDate, LocalDate toDate,
                                               String requesterId) {
        LocalDate effectiveFrom = fromDate != null ? fromDate : LocalDate.now().minusDays(30);
        LocalDate effectiveTo = toDate != null ? toDate : LocalDate.now();

        // 1. 기간 내 활성 슬립 조회 후 CONFIRMED OUTBOUND 필터링
        List<Slip> periodSlips = slipRepository.findAllBySlipDateBetweenAndIsDeletedFalse(
                effectiveFrom, effectiveTo);

        BigDecimal totalSalesAmount = periodSlips.stream()
                .filter(s -> s.getSlipType() == SlipType.OUTBOUND
                        && s.getStatus() == SlipStatus.CONFIRMED)
                .map(this::sumSlipAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 2. 미수금: CONFIRMED OUTBOUND 슬립의 전체 금액 (requesterId 필터 무관 — 시스템 전체)
        // 실 미수금은 partner-service 관할 — dashboard 에서는 기여 매출액 표시
        BigDecimal totalOutstanding = periodSlips.stream()
                .filter(s -> s.getSlipType() == SlipType.OUTBOUND
                        && (s.getStatus() == SlipStatus.SENT
                        || s.getStatus() == SlipStatus.ACCEPTED
                        || s.getStatus() == SlipStatus.PROCESSING
                        || s.getStatus() == SlipStatus.INSPECTING
                        || s.getStatus() == SlipStatus.COMPLETED
                        || s.getStatus() == SlipStatus.SHIPPING
                        || s.getStatus() == SlipStatus.DELIVERED))
                .map(this::sumSlipAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 3. 견적 건수 (requesterId 기준 — Specification 없이 findAll 후 필터)
        // 규모가 크면 repository 에 JPQL 추가 필요 — 현재 슬라이스는 메모리 필터 (< 1000건 가정)
        long estimateDraftCount = estimateRepository.findAllByIsDeletedFalse(
                        PageRequest.of(0, Integer.MAX_VALUE)).stream()
                .filter(e -> e.getRequesterId().equals(requesterId)
                        && e.getStatus() == EstimateStatus.QUOTE_DRAFT)
                .count();

        long estimateSentCount = estimateRepository.findAllByIsDeletedFalse(
                        PageRequest.of(0, Integer.MAX_VALUE)).stream()
                .filter(e -> e.getRequesterId().equals(requesterId)
                        && e.getStatus() == EstimateStatus.QUOTE_SENT)
                .count();

        long estimateAcceptedCount = estimateRepository.findAllByIsDeletedFalse(
                        PageRequest.of(0, Integer.MAX_VALUE)).stream()
                .filter(e -> e.getRequesterId().equals(requesterId)
                        && e.getStatus() == EstimateStatus.QUOTE_ACCEPTED)
                .count();

        log.debug("MobileSalesDashboard 집계 완료 — requesterId={}, from={}, to={}, sales={}, outstanding={}",
                requesterId, effectiveFrom, effectiveTo, totalSalesAmount, totalOutstanding);

        return new MobileSalesDashboardResponse(
                effectiveFrom,
                effectiveTo,
                totalSalesAmount,
                totalOutstanding,
                estimateDraftCount,
                estimateSentCount,
                estimateAcceptedCount,
                requesterId);
    }

    /**
     * 슬립의 라인 합계 금액 계산 — Slip 헤더에 totalAmount 필드가 없으므로 라인 합산.
     * 라인이 없으면 0 반환.
     */
    private BigDecimal sumSlipAmount(Slip slip) {
        if (slip.getLines() == null || slip.getLines().isEmpty()) {
            return BigDecimal.ZERO;
        }
        return slip.getLines().stream()
                .map(line -> {
                    BigDecimal supply = line.getSupplyAmount();
                    BigDecimal vat = line.getVatAmount();
                    BigDecimal s = supply != null ? supply : BigDecimal.ZERO;
                    BigDecimal v = vat != null ? vat : BigDecimal.ZERO;
                    return s.add(v);
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
