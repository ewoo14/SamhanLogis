package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.client.SlipServiceClient.OutboundSlipSummary;
import com.samhanair.logis.arologis.dto.RegionalDispatchResponse;
import com.samhanair.logis.arologis.dto.RegionalDispatchResponse.Entry;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 지방 가배차 서비스 — Phase 10 PR-E1 BE-A4 (legacy GAS 15번 이식).
 *
 * <p>출고전표의 {@code deliveryTag=REGION} 선별 → 거래처 주소의 광역 prefix 추출 → 시도별 그룹핑.
 *
 * <h2>BE-A2 ({@link PreClassifyService}) 와의 차이</h2>
 * <ul>
 *   <li>BE-A2 — REGION 마스터 (region_dispatch_classifications 테이블, sort_order/keywords) 기반.
 *       사용자가 노션에서 직접 maintain 한 가배차 권역 (서울/경기동부/경기남부 등 19+ 그룹).</li>
 *   <li>BE-A4 (본 서비스) — REGION 태그로 지방 전표를 선별한 뒤 시도별로 묶는다. 주소는
 *       판정 기준이 아니라 표시 그룹을 만드는 보조 정보로만 사용한다.</li>
 * </ul>
 *
 * <h2>광역 prefix 매칭 알고리즘</h2>
 * <ol>
 *   <li>주소 정규화 (공백 제거)</li>
 *   <li>{@link #SIDO_PREFIXES} 17 개 prefix 순서대로 substring 매칭</li>
 *   <li>첫 매칭된 prefix → 시도명. 매칭 0 시 unmatched 영역.</li>
 * </ol>
 *
 * <p>graceful empty — slip-service skeleton-mode 시 sidoGroups=빈 map, unmatched=[].
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RegionalService {

    private final SlipServiceClient slipServiceClient;

    /**
     * 광역 시도 17 개 prefix 상수 — 사용자가 화면에서 노출 받는 시도명 그대로.
     *
     * <p>매칭 우선순위 — Array 순서. 서울/부산/... 같은 광역시도가 도(경기/충북/...) 보다 앞에 위치하여
     * "서울 강남구" 가 "경기" 와 충돌하지 않도록 한다.
     *
     * <p>"경상" / "전라" 약식 prefix 미포함 — 경북/경남, 전북/전남 4 분리 보존 (legacy GAS 호환).
     */
    static final List<String> SIDO_PREFIXES = Arrays.asList(
            "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
            "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주");

    /**
     * 지방 가배차 시도별 분류 조회.
     *
     * @param date 조회 일자 (필수)
     * @return 시도별 그룹핑된 출고전표 응답
     * @throws BusinessException(INVALID_INPUT) date null
     */
    @Transactional(readOnly = true)
    public RegionalDispatchResponse classifyBySido(LocalDate date) {
        if (date == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "date 는 필수입니다");
        }
        List<OutboundSlipSummary> slips = slipServiceClient.getOutboundSlips(date, date);
        log.info("RegionalService — date={}, slipsFetched={}", date, slips.size());

        Map<String, List<Entry>> sidoGroups = new LinkedHashMap<>();
        List<Entry> unmatched = new ArrayList<>();

        for (OutboundSlipSummary slip : slips) {
            // 지방은 주소 표식이 아니라 출고전표 배송 태그 계약으로 판정한다.
            if (!"REGION".equals(slip.deliveryTag())) {
                continue;
            }
            String sido = extractSido(slip.address());
            Entry entry = new Entry(
                    slip.slipNo(),
                    slip.partnerCode(),
                    slip.partnerName(),
                    slip.address(),
                    sido);
            if (sido == null) {
                unmatched.add(entry);
            } else {
                sidoGroups.computeIfAbsent(sido, k -> new ArrayList<>()).add(entry);
            }
        }
        return new RegionalDispatchResponse(date.toString(), sidoGroups, unmatched);
    }

    /**
     * 주소 → 광역 prefix 추출.
     *
     * @param address 주소 문자열 (null/blank 가능)
     * @return 매칭된 시도명 (예: "서울" / "부산"). 매칭 실패 시 null.
     */
    String extractSido(String address) {
        if (address == null || address.isBlank()) {
            return null;
        }
        String normalized = address.replace(" ", "");
        for (String prefix : SIDO_PREFIXES) {
            if (normalized.contains(prefix)) {
                return prefix;
            }
        }
        return null;
    }
}
