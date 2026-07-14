package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.config.ArologisMatcherProperties;
import com.samhanair.logis.arologis.domain.DriverLocation;
import com.samhanair.logis.arologis.domain.DriverLocationSource;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.dto.GpsSource;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 배차 상세 GPS source 조립기.
 *
 * <p>인성 LBS 는 실시간 추적이 아니라 배송/서명 시점에 남은 좌표 스냅샷이다. 따라서 응답에는
 * {@link DriverLocationSource#EXTERNAL_INSUNG_LBS} source 로 노출하되, stale threshold 를 넘으면
 * 활성 source 로 선택하지 않는다. 이 정책으로 배달 시점 좌표는 패널 히스토리에 남기고,
 * 60초 이내 본 어플 GPS 또는 관리자 수동 입력이 있으면 그 source 가 실시간 위치로 승격된다.
 *
 * <p>driver_locations 와 signatures 는 source-family 별 1회씩만 조회한다. 차량/정차 단위 N+1 조회는
 * 금지한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GpsSourceAssembler {

    private static final List<DriverLocationSource> LOCATION_SOURCES = List.of(
            DriverLocationSource.APP_GPS_ACTIVE,
            DriverLocationSource.APP_GPS_BACKGROUND,
            DriverLocationSource.MANUAL);
    /**
     * {@link #LOCATION_SOURCES} 의 native query 바인딩용 문자열 표현.
     *
     * <p>{@code driver_locations.source} 컬럼은 VARCHAR(30) 매핑이므로,
     * {@link DriverLocationRepository#findLatestPerDriverAndSource} native query 파라미터는
     * enum 객체가 아닌 {@code Enum#name()} 문자열로 전달해야 안정적으로 바인딩된다.
     */
    private static final List<String> LOCATION_SOURCE_NAMES =
            LOCATION_SOURCES.stream().map(Enum::name).toList();
    private static final String DEFAULT_PRIORITY = "insung-lbs,app-gps,manual";

    private final DriverLocationRepository locationRepository;
    private final SignatureRepository signatureRepository;
    private final ArologisMatcherProperties matcherProperties;
    private final Clock clock;

    /**
     * 차량별 GPS source 목록을 우선순위 순서로 조립한다.
     *
     * @param vehicles 배차 차량 목록
     * @param stops 배차 정차 목록
     * @return vehicleId → GPS source 목록. source 가 없는 차량은 키를 생략한다.
     */
    public Map<UUID, List<GpsSource>> assemble(List<Vehicle> vehicles, List<VehicleStop> stops) {
        List<Vehicle> safeVehicles = vehicles == null ? List.of() : vehicles;
        List<VehicleStop> safeStops = stops == null ? List.of() : stops;
        if (safeVehicles.isEmpty()) {
            return Map.of();
        }

        Map<UUID, Map<DriverLocationSource, DriverLocation>> latestLocationsByDriver =
                latestLocationsByDriver(safeVehicles);
        Map<UUID, Signature> latestInsungByVehicle = latestInsungByVehicle(safeStops);
        List<DriverLocationSource> priority = expandPriority();
        Map<DriverLocationSource, Integer> priorityIndex = priorityIndex(priority);
        LocalDateTime now = LocalDateTime.now(clock);
        long staleThresholdMs = staleThresholdMs();

        Map<UUID, List<GpsSource>> result = new LinkedHashMap<>();
        for (Vehicle vehicle : safeVehicles) {
            List<GpsSource> candidates = new ArrayList<>();
            Signature insung = latestInsungByVehicle.get(vehicle.getId());
            if (insung != null) {
                candidates.add(GpsSource.inactive(
                        DriverLocationSource.EXTERNAL_INSUNG_LBS,
                        insung.getCapturedLatitude(),
                        insung.getCapturedLongitude(),
                        insung.getCapturedAt()));
            }

            if (vehicle.getAssignedDriverId() != null) {
                Map<DriverLocationSource, DriverLocation> bySource =
                        latestLocationsByDriver.getOrDefault(vehicle.getAssignedDriverId(), Map.of());
                for (DriverLocationSource source : LOCATION_SOURCES) {
                    DriverLocation location = bySource.get(source);
                    if (location != null) {
                        candidates.add(GpsSource.inactive(
                                source,
                                location.getLatitude(),
                                location.getLongitude(),
                                location.getCapturedAt()));
                    }
                }
            }

            if (candidates.isEmpty()) {
                continue;
            }
            candidates.sort(Comparator.comparingInt(source ->
                    priorityIndex.getOrDefault(source.source(), Integer.MAX_VALUE)));
            result.put(vehicle.getId(), activateFirstFresh(candidates, now, staleThresholdMs));
        }
        return result;
    }

    private Map<UUID, Map<DriverLocationSource, DriverLocation>> latestLocationsByDriver(List<Vehicle> vehicles) {
        List<UUID> driverIds = vehicles.stream()
                .map(Vehicle::getAssignedDriverId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (driverIds.isEmpty()) {
            return Map.of();
        }

        Map<UUID, Map<DriverLocationSource, DriverLocation>> result = new HashMap<>();
        // FIX 1 (PR #818 리뷰) — driverIds 의 전체 GPS 이력 fetch 후 애플리케이션에서 최신만
        // 골라내던 방식(over-fetch) 대신, DB 단 DISTINCT ON 조회로 driverId×source 당 최신 1건만
        // 반환받는다. putIfAbsent 리듀스는 그대로 유지 — 이제는 조합당 1행이므로 실질 no-op 가드.
        List<DriverLocation> locations = locationRepository
                .findLatestPerDriverAndSource(driverIds, LOCATION_SOURCE_NAMES);
        for (DriverLocation location : locations) {
            result.computeIfAbsent(location.getDriverId(), ignored -> new EnumMap<>(DriverLocationSource.class))
                    .putIfAbsent(location.getSource(), location);
        }
        return result;
    }

    private Map<UUID, Signature> latestInsungByVehicle(List<VehicleStop> stops) {
        List<UUID> stopIds = stops.stream()
                .map(VehicleStop::getId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (stopIds.isEmpty()) {
            return Map.of();
        }

        Map<UUID, UUID> stopIdToVehicleId = new HashMap<>();
        for (VehicleStop stop : stops) {
            if (stop.getId() != null && stop.getVehicleId() != null) {
                stopIdToVehicleId.put(stop.getId(), stop.getVehicleId());
            }
        }

        Map<UUID, Signature> result = new HashMap<>();
        List<Signature> signatures = signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                stopIds, SignatureSource.EXTERNAL_INSUNG_LBS);
        for (Signature signature : signatures) {
            if (signature.getCapturedLatitude() == null || signature.getCapturedLongitude() == null) {
                continue;
            }
            UUID vehicleId = stopIdToVehicleId.get(signature.getStopId());
            if (vehicleId != null) {
                result.putIfAbsent(vehicleId, signature);
            }
        }
        return result;
    }

    private List<GpsSource> activateFirstFresh(List<GpsSource> candidates, LocalDateTime now,
                                               long staleThresholdMs) {
        boolean activeAssigned = false;
        List<GpsSource> result = new ArrayList<>(candidates.size());
        for (GpsSource candidate : candidates) {
            boolean active = !activeAssigned && !isStale(candidate.lastReceivedAt(), now, staleThresholdMs);
            result.add(candidate.withActive(active));
            activeAssigned = activeAssigned || active;
        }
        return result;
    }

    /**
     * source 최신 수신 시각이 stale threshold 를 넘었는지 판정한다.
     *
     * <p>FIX 2 (PR #818 리뷰) — {@code lastReceivedAt} 이 미래 시각인 경우 (기사 앱 clock skew)
     * {@code Duration.between} 결과가 음수가 되어 항상 threshold 이하로 평가되는 버그가 있었다.
     * 이 경우 해당 source 가 영구적으로 "활성"으로 남는 문제를 방지하기 위해, 미래 시각도 stale
     * 로 간주한다.
     */
    private boolean isStale(LocalDateTime lastReceivedAt, LocalDateTime now, long staleThresholdMs) {
        if (lastReceivedAt == null) {
            return true;
        }
        long deltaMs = Duration.between(lastReceivedAt, now).toMillis();
        return deltaMs < 0 || deltaMs > staleThresholdMs;
    }

    private List<DriverLocationSource> expandPriority() {
        String raw = matcherProperties.getGps() == null ? DEFAULT_PRIORITY : matcherProperties.getGps().getPriority();
        String priority = raw == null || raw.isBlank() ? DEFAULT_PRIORITY : raw;
        List<DriverLocationSource> result = new ArrayList<>();
        for (String token : priority.split(",")) {
            switch (token.trim()) {
                case "insung-lbs" -> result.add(DriverLocationSource.EXTERNAL_INSUNG_LBS);
                case "app-gps" -> {
                    result.add(DriverLocationSource.APP_GPS_ACTIVE);
                    result.add(DriverLocationSource.APP_GPS_BACKGROUND);
                }
                case "manual" -> result.add(DriverLocationSource.MANUAL);
                case "" -> {
                    // skip blank token
                }
                default -> log.warn("알 수 없는 GPS 우선순위 token 무시 — token={}", token.trim());
            }
        }
        return result.isEmpty() ? expandDefaultPriority() : result;
    }

    private List<DriverLocationSource> expandDefaultPriority() {
        return List.of(
                DriverLocationSource.EXTERNAL_INSUNG_LBS,
                DriverLocationSource.APP_GPS_ACTIVE,
                DriverLocationSource.APP_GPS_BACKGROUND,
                DriverLocationSource.MANUAL);
    }

    private Map<DriverLocationSource, Integer> priorityIndex(List<DriverLocationSource> priority) {
        Map<DriverLocationSource, Integer> result = new EnumMap<>(DriverLocationSource.class);
        for (int i = 0; i < priority.size(); i++) {
            result.putIfAbsent(priority.get(i), i);
        }
        return result;
    }

    private long staleThresholdMs() {
        if (matcherProperties.getGps() == null) {
            return 60_000;
        }
        long configured = matcherProperties.getGps().getStaleThresholdMs();
        return configured <= 0 ? 60_000 : configured;
    }
}
