package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.client.SlipServiceClient.OutboundSlipSummary;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.dto.PreClassifyResponse;
import com.samhanair.logis.arologis.dto.PreClassifyResponse.Entry;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 가배차 분류 서비스 — Phase 10 PR-E1 BE-A2 (legacy GAS 2번 이식).
 *
 * <p>출고전표 → 거래처 주소 → {@link RegionClassifier} 매칭 → 권역 그룹별 그룹핑.
 *
 * <h2>처리 흐름</h2>
 * <ol>
 *   <li>{@link SlipServiceClient#getOutboundSlips(LocalDate, LocalDate)} 호출 — 기간 OUTBOUND 슬립 조회</li>
 *   <li>각 슬립의 거래처 주소 → {@link RegionClassifier#classify(String)} 매칭</li>
 *   <li>매칭된 권역 그룹별 그룹핑 + 미매칭 슬립 별도 unclassified 영역</li>
 *   <li>각 entry 의 {@code dispatchPlanned} 플래그는 vehicle_stops 의 parsed_partner_code (PR-D
 *       parsed_kakao_seq R2 후 partner_code) / slipNo 매칭 결과로 설정</li>
 * </ol>
 *
 * <p>Samhan Public 이식 강조 — 출고전표 자동 조회 + REGION (PR-D) 활용. 이카운트 의존 0.
 *
 * <p>정상 0건과 조회 장애를 구분한다. slip-service 호출 실패는 예외로 전파하고, 정상 빈 목록은
 * regionGroups/unclassified가 빈 컨테이너인 성공 응답으로 반환한다. warehouse code provenance가
 * 없는 행은 {@code unknownWarehouseCount}로 별도 표시한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PreClassifyService {

    private static final Pattern LEGACY_CARRIER_MARKER =
            Pattern.compile("(?:경동|로젠)[^/|:]*[/|:]");

    private final SlipServiceClient slipServiceClient;
    private final RegionClassifier regionClassifier;
    private final VehicleStopRepository vehicleStopRepository;

    /**
     * 가배차 권역 분류 조회.
     *
     * @param from 조회 시작일 (inclusive, 필수)
     * @param to 조회 종료일 (inclusive, 필수, from 이후)
     * @return 권역 그룹별 분류된 출고전표 응답
     * @throws BusinessException(INVALID_INPUT) from/to null 또는 to&lt;from
     */
    @Transactional(readOnly = true)
    public PreClassifyResponse classify(LocalDate from, LocalDate to) {
        return classify(from, to, null);
    }

    /**
     * 레거시 가배차 실행 모드로 기간 전표를 제한한 뒤 기존 권역 분류를 수행한다.
     *
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param mode 레거시 8개 모드. null이면 전체 가배차 조회
     * @return 모드가 적용된 권역 분류 결과
     */
    @Transactional(readOnly = true)
    public PreClassifyResponse classify(LocalDate from, LocalDate to, DispatchExecutionMode mode) {
        validateRange(from, to);
        List<OutboundSlipSummary> slips = slipServiceClient.getOutboundSlips(from, to);
        int unknownWarehouseCount = (int) slips.stream()
                .filter(slip -> !"SANGIL".equals(slip.warehouseBusinessType())
                        && !"CHOWOL".equals(slip.warehouseBusinessType()))
                .count();
        if (mode != null) {
            slips = slips.stream().filter(slip -> matchesMode(slip, mode)).toList();
        }
        log.info("PreClassifyService — from={}, to={}, slipsFetched={}", from, to, slips.size());

        // 본 PR 시점 dispatchPlanned 매칭 = vehicle_stops 의 parsed_partner_code 컬럼이 슬립의
        // partnerCode 와 일치하면 true. 본 컬럼은 PR-E1 lookup 활성 후에 채워지므로, 빈 set 일 때는
        // 모든 entry 의 dispatchPlanned=false (정상 fail-soft).
        Set<String> plannedPartnerCodes = collectPlannedPartnerCodes(slips);

        Map<String, List<Entry>> regionGroups = new LinkedHashMap<>();
        List<Entry> unclassified = new ArrayList<>();

        for (OutboundSlipSummary slip : slips) {
            String regionGroup = regionClassifier.classify(slip.address());
            boolean planned = slip.partnerCode() != null && plannedPartnerCodes.contains(slip.partnerCode());
            Entry entry = new Entry(
                    slip.slipNo(),
                    slip.partnerCode(),
                    slip.partnerName(),
                    slip.address(),
                    regionGroup,
                    planned);
            if (regionGroup == null) {
                unclassified.add(entry);
            } else {
                regionGroups.computeIfAbsent(regionGroup, k -> new ArrayList<>()).add(entry);
            }
        }
        return new PreClassifyResponse(regionGroups, unclassified, unknownWarehouseCount);
    }

    /** 레거시 공통 제외·태그·창고 규칙을 적용한다. */
    private boolean matchesMode(OutboundSlipSummary slip, DispatchExecutionMode mode) {
        String address = value(slip.address());
        String prefix = address.substring(0, Math.min(10, address.length()));
        boolean commonExcluded = containsAny(prefix, "회수", "회차", "차용", "대여", "반납", "자가")
                || LEGACY_CARRIER_MARKER.matcher(address).find();
        boolean stack = "STACK".equals(slip.deliveryTag());
        boolean region = "REGION".equals(slip.deliveryTag());

        // 레거시 공통 제외가 모든 모드보다 먼저 적용된다.
        if (commonExcluded) return false;

        // 야적/지방 전용도 업무 구분이 확정된 창고만 대상으로 한다.
        if (mode == DispatchExecutionMode.STACK_ONLY) {
            return stack && warehouseAllowed(slip, mode);
        }
        if (mode == DispatchExecutionMode.REGION_ONLY) {
            return region && warehouseAllowed(slip, mode);
        }
        if (stack) {
            // 레거시 1~3/6~8은 창고 판정 전에 야적을 보존한다.
            return true;
        }
        if (mode.number() <= 3 && region) {
            return false;
        }
        return warehouseAllowed(slip, mode);
    }

    /** 레거시 출고창고 표시값 기반 모드 필터. 창고명이 없으면 해당 모드에 포함하지 않는다. */
    private boolean warehouseAllowed(OutboundSlipSummary slip, DispatchExecutionMode mode) {
        return switch (mode) {
            case CHOWOL_REGION_EXCLUDED, CHOWOL_REGION_INCLUDED ->
                    "CHOWOL".equals(slip.warehouseBusinessType());
            case SANGIL_REGION_EXCLUDED, SANGIL_REGION_INCLUDED ->
                    "SANGIL".equals(slip.warehouseBusinessType());
            case SANGIL_AND_CHOWOL_REGION_EXCLUDED, SANGIL_AND_CHOWOL_REGION_INCLUDED,
                    STACK_ONLY, REGION_ONLY -> "SANGIL".equals(slip.warehouseBusinessType())
                            || "CHOWOL".equals(slip.warehouseBusinessType());
        };
    }

    private boolean containsAny(String value, String... needles) {
        for (String needle : needles) {
            if (value.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private String value(String value) {
        return value == null ? "" : value.trim();
    }

    /** 본 기간 슬립의 partnerCode 집합 → vehicle_stops.parsed_partner_code 매칭 → 이미 배차된 코드만 set 반환. */
    private Set<String> collectPlannedPartnerCodes(List<OutboundSlipSummary> slips) {
        List<String> codes = slips.stream()
                .map(OutboundSlipSummary::partnerCode)
                .filter(c -> c != null && !c.isBlank())
                .distinct()
                .toList();
        if (codes.isEmpty()) {
            return Set.of();
        }
        // VehicleStopRepository 의 partner_code 기반 활성 행 조회 — 인덱스
        // ix_vehicle_stops_partner_code_active 활용 (V4 migration 신규).
        return vehicleStopRepository.findAllByParsedPartnerCodeIn(codes).stream()
                .map(VehicleStop::getParsedPartnerCode)
                .filter(c -> c != null && !c.isBlank())
                .collect(Collectors.toSet());
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from/to 는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "to 는 from 이후여야 합니다");
        }
    }
}
