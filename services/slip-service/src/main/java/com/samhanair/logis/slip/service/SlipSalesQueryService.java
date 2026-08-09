package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipSalesQueryResponse;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;

/**
 * accounting-service 세금계산서 일괄발행 배치용 OUTBOUND 판매조회 서비스.
 *
 * <p>audit Slice 2 P0 — accounting-service 의 {@code SlipQueryClient} 가
 * {@code GET /internal/slips/sales-query} 를 호출할 때 응답을 생성한다.
 *
 * <p>조회 조건:
 * <ul>
 *   <li>slipType = OUTBOUND (출고전표만)</li>
 *   <li>status = CONFIRMED (확정 완료 슬립만 — 매출 인식 기준)</li>
 *   <li>slipDate ∈ [from, to]</li>
 *   <li>partnerCode 필터 (null 이면 전체 거래처)</li>
 * </ul>
 *
 * <p>응답 형식: 페이지 단위 ({@link SlipSalesQueryResponse} 리스트 + last 여부).
 * accounting-service 는 {@code last=true} 가 될 때까지 page 를 순차 증가하며 호출한다.
 */
@Slf4j
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SlipSalesQueryService {

    private final SlipRepository slipRepository;
    private final PartnerInternalClient partnerInternalClient;

    /**
     * 기간 내 OUTBOUND CONFIRMED 슬립 페이지 조회.
     *
     * <p>accounting-service 의 {@code SlipQueryClient.fetchAllSalesRows} 가 page 0 부터
     * last=true 까지 반복 호출하는 계약에 따라, 응답 {@link Page} 의 {@code isLast()}
     * 를 그대로 내려보낸다.
     *
     * <p>partnerCode 필터: null/blank 이면 전체 거래처 대상. 비어있지 않으면 정확히 일치
     * (LIKE 아닌 EQ — 세금계산서 일괄발행은 거래처 단위 정확 필터 요구).
     *
     * @param from        조회 시작일 (inclusive, 필수)
     * @param to          조회 종료일 (inclusive, 필수)
     * @param partnerCode 거래처코드 필터 (null/blank 이면 전체)
     * @param pageable    페이지 정보 (accounting-service 기본 size=200)
     * @return 판매조회 응답 페이지
     * @throws BusinessException(INVALID_INPUT) from/to 가 null 이거나 to < from
     */
    public Page<SlipSalesQueryResponse> findSalesForPeriod(
            LocalDate from,
            LocalDate to,
            String partnerCode,
            Pageable pageable) {

        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from/to 날짜는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "to 날짜는 from 날짜 이후여야 합니다");
        }

        // blank partnerCode 는 null 로 정규화 (JPQL IS NULL 처리)
        String normalizedCode = (partnerCode == null || partnerCode.isBlank()) ? null : partnerCode;

        log.debug("SlipSalesQuery 판매조회 — from={}, to={}, partnerCode={}, page={}",
                from, to, normalizedCode, pageable.getPageNumber());

        return slipRepository
                .findConfirmedSalesForPeriod(from, to, normalizedCode, pageable)
                .map(slip -> SlipSalesQueryResponse.from(
                        slip,
                        Optional.ofNullable(partnerInternalClient.resolveEmailByPartnerCode(slip.getPartnerCode()))
                                .flatMap(value -> value)
                                .orElse("")));
    }
}
