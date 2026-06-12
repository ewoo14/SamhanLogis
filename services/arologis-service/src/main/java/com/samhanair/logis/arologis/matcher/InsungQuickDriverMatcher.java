package com.samhanair.logis.arologis.matcher;

import com.samhanair.logis.arologis.client.InsungQuickClient;
import com.samhanair.logis.arologis.client.dto.InsungDriverMatchResponse;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 인성데이타 퀵프로그램 DriverMatcher 실 구현 — Phase 10 W10-2.
 *
 * <p>W10-1 placeholder ({@link UnsupportedOperationException}) 를 대체하는 실 vendor API 호출 구현.
 *
 * <h2>처리 흐름</h2>
 * <ol>
 *   <li>{@code InsungQuickClient.requestOrder()} — 배차 등록 → vendorOrderId 반환</li>
 *   <li>{@code InsungQuickClient.requestMatch()} — 매칭 trigger → 즉시 결과 또는 pending</li>
 *   <li>매칭 성공 시 Driver upsert (driverCode = {@code INSUNG-<vendorDriverId>})</li>
 *   <li>{@code Vehicle.vendorOrderId} 갱신 + {@code DriverMatchResult.of()} 반환</li>
 * </ol>
 *
 * <h2>fail-soft 정책</h2>
 * <p>RPC 예외 (5xx / 네트워크 오류) 시 {@code DriverMatchResult.empty()} 반환 + WARN 로그.
 * {@link MatcherConfig} 의 fallback 구조 유지.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>응답 노출 식별자 = {@code driverCode} ({@code INSUNG-<vendorDriverId>}) 만.
 * 내부 {@link Driver#getId()} UUID 는 절대 외부 노출 금지.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InsungQuickDriverMatcher implements DriverMatcher {

    private final InsungQuickClient insungQuickClient;
    private final DriverRepository driverRepository;
    private final VehicleRepository vehicleRepository;

    /**
     * 인성데이타 vendor 기사 매칭 — vendor API 호출 + Driver upsert.
     *
     * @param vehicle 매칭 대상 차량
     * @param stops   정차 목록
     * @return 매칭 결과 ({@link DriverMatchResult#of} 또는 fail-soft 시 {@link DriverMatchResult#empty})
     */
    @Override
    @Transactional
    public DriverMatchResult match(Vehicle vehicle, List<VehicleStop> stops) {
        if (vehicle == null) {
            log.warn("[InsungQuick] match — vehicle null, empty 반환");
            return DriverMatchResult.empty(MatchSource.EXTERNAL_INSUNG_QUICK);
        }

        try {
            // 1. 배차 등록 → vendorOrderId
            String vendorOrderId = insungQuickClient.requestOrder(vehicle, stops);
            if (vendorOrderId == null) {
                log.warn("[InsungQuick] requestOrder null 응답 — vehicleSeq={}, empty 반환",
                        vehicle.getSequence());
                return DriverMatchResult.empty(MatchSource.EXTERNAL_INSUNG_QUICK);
            }
            vehicle.updateVendorOrderId(vendorOrderId);
            vehicleRepository.save(vehicle);

            // 2. 매칭 요청
            InsungDriverMatchResponse matchResp = insungQuickClient.requestMatch(vendorOrderId);
            if (matchResp == null || !matchResp.matched()) {
                log.info("[InsungQuick] 매칭 pending/실패 — vehicleSeq={} vendorOrderId={} reason={}",
                        vehicle.getSequence(), vendorOrderId,
                        matchResp == null ? "null" : matchResp.failReason());
                // vendorOrderId 는 이미 등록됨 — webhook callback 에서 나중에 처리 가능
                return DriverMatchResult.empty(MatchSource.EXTERNAL_INSUNG_QUICK);
            }
            String vendorDriverId = normalize(matchResp.vendorDriverId());
            if (vendorDriverId == null) {
                log.warn("[InsungQuick] 매칭 성공 응답의 vendorDriverId 결손 — vehicleSeq={} vendorOrderId={}, empty 반환",
                        vehicle.getSequence(), vendorOrderId);
                return DriverMatchResult.empty(MatchSource.EXTERNAL_INSUNG_QUICK);
            }

            // 3. Driver upsert — driverCode = INSUNG-<vendorDriverId>
            String driverCode = "INSUNG-" + vendorDriverId;
            String phoneNumber = normalize(matchResp.driverPhone());
            Driver driver = driverRepository.findByDriverCode(driverCode)
                    .map(existing -> {
                        existing.updateVendorProfile(matchResp.driverName(), phoneNumber,
                                matchResp.vehicleType(), matchResp.vehiclePlateNumber());
                        return existing;
                    })
                    .orElseGet(() -> driverRepository.save(
                            Driver.of(
                                    driverCode,
                                    matchResp.driverName(),
                                    phoneNumber,
                                    matchResp.vehicleType(),
                                    matchResp.vehiclePlateNumber(),
                                    DriverSource.EXTERNAL_INSUNG_QUICK,
                                    Boolean.FALSE,
                                    null
                            )
                    ));

            log.info("[InsungQuick] 매칭 성공 — vehicleSeq={} driverCode={} vendorOrderId={}",
                    vehicle.getSequence(), driverCode, vendorOrderId);

            return DriverMatchResult.of(driver, MatchSource.EXTERNAL_INSUNG_QUICK, vendorOrderId);

        } catch (Exception ex) {
            log.warn("[InsungQuick] match RPC 예외 — vehicleSeq={} error={}, fail-soft empty 반환",
                    vehicle.getSequence(), ex.getMessage());
            return DriverMatchResult.empty(MatchSource.EXTERNAL_INSUNG_QUICK);
        }
    }

    /**
     * 매칭 소스 반환 — {@link MatchSource#EXTERNAL_INSUNG_QUICK}.
     */
    @Override
    public MatchSource source() {
        return MatchSource.EXTERNAL_INSUNG_QUICK;
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
