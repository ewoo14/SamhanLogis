package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.domain.ArologisNotifyChannel;
import com.samhanair.logis.arologis.domain.DispatchNotification;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.dto.NotifyResult;
import com.samhanair.logis.arologis.repository.DispatchNotificationRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 배차 상세 알림 발송 결과 조립기.
 *
 * <p>FE 는 채널별 1행을 렌더링하므로, 같은 차량·채널에 여러 발송이력이 있으면
 * {@code sentAt} 기준 최신 행만 노출한다. 조회는 dispatch 단위 1회만 수행하여 차량별 N+1 을
 * 피한다.
 */
@Service
@RequiredArgsConstructor
public class DispatchNotificationAssembler {

    private final DispatchNotificationRepository repository;

    /**
     * 차량별 알림 발송 결과를 조립한다.
     *
     * @param dispatchId 배차 UUID
     * @param vehicles 배차 차량 목록
     * @return vehicleId → 알림 발송 결과 목록. 결과가 없는 차량은 키를 생략한다.
     */
    public Map<UUID, List<NotifyResult>> assemble(UUID dispatchId, List<Vehicle> vehicles) {
        List<Vehicle> safeVehicles = vehicles == null ? List.of() : vehicles;
        if (dispatchId == null || safeVehicles.isEmpty()) {
            return Map.of();
        }

        Set<UUID> vehicleIds = safeVehicles.stream()
                .map(Vehicle::getId)
                .collect(Collectors.toSet());
        Map<UUID, Map<ArologisNotifyChannel, DispatchNotification>> latestByVehicle = new LinkedHashMap<>();
        for (DispatchNotification notification : repository.findAllByDispatchIdOrderBySentAtAsc(dispatchId)) {
            if (!vehicleIds.contains(notification.getVehicleId())) {
                continue;
            }
            latestByVehicle
                    .computeIfAbsent(notification.getVehicleId(), ignored -> new EnumMap<>(ArologisNotifyChannel.class))
                    .put(notification.getChannel(), notification);
        }

        Map<UUID, List<NotifyResult>> result = new LinkedHashMap<>();
        for (Vehicle vehicle : safeVehicles) {
            Map<ArologisNotifyChannel, DispatchNotification> byChannel = latestByVehicle.get(vehicle.getId());
            if (byChannel == null || byChannel.isEmpty()) {
                continue;
            }
            List<NotifyResult> notifyResults = new ArrayList<>(byChannel.values().stream()
                    .map(NotifyResult::from)
                    .toList());
            notifyResults.sort(Comparator.comparing(NotifyResult::channel));
            result.put(vehicle.getId(), notifyResults);
        }
        return result;
    }
}
