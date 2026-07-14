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
        List<DriverLocation> locations = locationRepository
                .findAllByDriverIdInAndSourceInOrderByCapturedAtDesc(driverIds, LOCATION_SOURCES);
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

    private boolean isStale(LocalDateTime lastReceivedAt, LocalDateTime now, long staleThresholdMs) {
        if (lastReceivedAt == null) {
            return true;
        }
        return Duration.between(lastReceivedAt, now).toMillis() > staleThresholdMs;
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
