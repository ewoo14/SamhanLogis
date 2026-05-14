package com.samhanair.logis.arologis.seed;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import jakarta.annotation.PostConstruct;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * DispatchSeeder — Phase 10 W10-1 Stage 3 local-test seed.
 *
 * <p>배차 20건 + Vehicle ~50대 + VehicleStop ~150건 결정적 생성. 카톡 dispatch 메시지의 라이프사이클
 * (PARSING / PARSED / DISPATCHED / COMPLETED) 분포를 시뮬레이션하며, Stage 1 partner 50개와의 cross-ref
 * (parsedPartnerName 으로 매칭) 를 보존한다.
 *
 * <p>이중 가드 — {@code @Profile("dev")} + {@code @ConditionalOnProperty
 * (value = "app.arologis.seed-test-data", havingValue = "true")} 양쪽 모두 활성일 때만 동작.
 *
 * <p>idempotent — (dispatchDate, dispatchType, sequence-in-day) 결정적 매핑으로 V2 partial unique index
 * (`ux_vehicles_dispatch_seq_active`) 를 회피한다. {@link DriverSeeder} 보다 나중에 동작
 * ({@link Order @Order(20)}) — Vehicle.assignDriver 가 driverCode 로 lookup 후 driver UUID 를 세팅.
 *
 * <p>분포 정합:
 * <ul>
 *   <li>dispatchType — DAY 14 / NIGHT 4 / EXPRESS 2</li>
 *   <li>Vehicle.status — PENDING ~10 / ASSIGNED ~20 / DEPARTED ~15 / DELIVERED ~5 (총 ~50)</li>
 *   <li>VehicleStop.status — PENDING / ARRIVED / DELIVERED 분포</li>
 * </ul>
 *
 * <p>Dispatch entity 는 status 필드를 보유하지 않는다 (상태는 Vehicle / VehicleStop 의 집계로 관찰).
 * 시드 분포 표 (PARSING 2 / PARSED 5 / DISPATCHED 10 / COMPLETED 3) 는 Vehicle.status 분포로 매핑된다.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.arologis.seed-test-data", havingValue = "true")
@Order(20) // Driver(@Order 10) → Dispatch
public class DispatchSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DispatchSeeder.class);

    /** 배차 20건의 결정적 분포 — DAY 14 / NIGHT 4 / EXPRESS 2. */
    private static final List<DispatchType> DISPATCH_TYPE_DISTRIBUTION = List.of(
            DispatchType.DAY,     DispatchType.DAY,     DispatchType.DAY,     DispatchType.DAY,
            DispatchType.DAY,     DispatchType.DAY,     DispatchType.DAY,     DispatchType.NIGHT,
            DispatchType.DAY,     DispatchType.DAY,     DispatchType.DAY,     DispatchType.DAY,
            DispatchType.NIGHT,   DispatchType.DAY,     DispatchType.DAY,     DispatchType.NIGHT,
            DispatchType.DAY,     DispatchType.EXPRESS, DispatchType.NIGHT,   DispatchType.EXPRESS
    );

    /** Stop 매칭용 partner 30개 표본 (PartnerOrderSeeder.PARTNER_POOL 동일 레퍼런스 — cross-service consistency). */
    private static final List<StopPartnerSeed> STOP_PARTNER_POOL = List.of(
            new StopPartnerSeed("에스엠하나공조",   "서울 강남구 역삼동 123-1", 214L),
            new StopPartnerSeed("한국공조시스템",   "서울 강남구 역삼동 456-2", 215L),
            new StopPartnerSeed("(주)서울에어컨",   "서울 송파구 잠실동 789-3", 216L),
            new StopPartnerSeed("(주)대한냉동",     "서울 강동구 천호동 12-4",  217L),
            new StopPartnerSeed("송파공조",         "서울 송파구 방이동 34-5",  218L),
            new StopPartnerSeed("강남에어시스템",   "서울 강남구 삼성동 56-6",  219L),
            new StopPartnerSeed("동작냉난방",       "서울 동작구 사당동 78-7",  220L),
            new StopPartnerSeed("마포에어컨",       "서울 마포구 합정동 90-8",  221L),
            new StopPartnerSeed("용산공조",         "서울 용산구 한강로 11-9",  222L),
            new StopPartnerSeed("성북냉동",         "서울 성북구 정릉동 22-10", 223L),
            new StopPartnerSeed("광진에어시스템",   "서울 광진구 자양동 33-11", 224L),
            new StopPartnerSeed("노원냉난방",       "서울 노원구 상계동 44-12", 225L),
            new StopPartnerSeed("은평공조",         "서울 은평구 응암동 55-13", 226L),
            new StopPartnerSeed("양천냉동",         "서울 양천구 목동 66-14",   227L),
            new StopPartnerSeed("구로에어컨",       "서울 구로구 신도림 77-15", 228L)
    );

    /** 도착 시간 표본 — 카톡 라인 끝 "9시하차" 형식. */
    private static final List<String> ARRIVAL_HOURS = List.of(
            "9시", "10시", "11시", "오후 1시", "오후 2시", "오후 3시", "오후 4시"
    );

    private final DispatchRepository dispatchRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleStopRepository vehicleStopRepository;
    private final DriverRepository driverRepository;

    public DispatchSeeder(DispatchRepository dispatchRepository,
                          VehicleRepository vehicleRepository,
                          VehicleStopRepository vehicleStopRepository,
                          DriverRepository driverRepository) {
        this.dispatchRepository = dispatchRepository;
        this.vehicleRepository = vehicleRepository;
        this.vehicleStopRepository = vehicleStopRepository;
        this.driverRepository = driverRepository;
    }

    @PostConstruct
    void announce() {
        log.warn("[seed] DispatchSeeder 활성 — dev profile + app.arologis.seed-test-data=true");
    }

    @Override
    @Transactional
    public void run(String... args) {
        // Driver pool 활성 driverCode → UUID lookup (Vehicle.assignDriver 매핑용)
        List<UUID> activeDriverIds = collectActiveDriverIds();
        if (activeDriverIds.isEmpty()) {
            log.warn("[seed] DispatchSeeder skip — 활성 Driver 가 0명 (DriverSeeder 미실행 또는 모두 INACTIVE)");
            return;
        }

        int dispatchCreated = 0;
        int dispatchSkipped = 0;
        int vehicleCount = 0;
        int stopCount = 0;

        for (int seq = 0; seq < 20; seq++) {
            // dispatchDate 분포 — 2026-04-01 ~ 2026-05-09 (39일에 20건 ≈ 2일에 1건)
            LocalDate dispatchDate = LocalDate.of(2026, 4, 1).plusDays(seq * 2L);
            DispatchType dispatchType = DISPATCH_TYPE_DISTRIBUTION.get(seq);

            // idempotent — (date, type) 동일 + 같은 raw text 가 이미 있으면 skip
            // (V2 미보유 — Dispatch 자체는 unique 제약 없음, raw text 비교로 중복 회피)
            String rawKakaoText = buildRawKakaoText(dispatchDate, dispatchType, seq);
            boolean exists = dispatchRepository
                    .findAllByDispatchDateAndDispatchTypeOrderByCreatedAtDesc(dispatchDate, dispatchType)
                    .stream()
                    .anyMatch(d -> rawKakaoText.equals(d.getRawKakaoText()));
            if (exists) {
                dispatchSkipped++;
                continue;
            }

            Dispatch dispatch = Dispatch.of(dispatchDate, dispatchType, rawKakaoText);
            Dispatch savedDispatch = dispatchRepository.save(dispatch);

            // Vehicle 2~3대 결정적 — seq 짝수=2, 홀수=3 → 평균 2.5 → 20건 dispatch * 2.5 = ~50 vehicle
            int vehicleN = (seq % 2 == 0) ? 2 : 3;
            for (int v = 1; v <= vehicleN; v++) {
                VehicleTonnage tonnage = pickTonnage(seq, v);
                Vehicle vehicle = Vehicle.of(savedDispatch.getId(), v, tonnage,
                        v + "번차 (" + STOP_PARTNER_POOL.get((seq + v) % STOP_PARTNER_POOL.size()).partnerName() + ")");

                VehicleStatus targetStatus = pickVehicleStatus(seq, v);
                applyVehicleStatusTransition(vehicle, targetStatus, seq, v, activeDriverIds);
                Vehicle savedVehicle = vehicleRepository.save(vehicle);
                vehicleCount++;

                // VehicleStop 2~4개 결정적 — (seq + v) % 3 + 2 → 2~4 → 평균 3 → 50 vehicle * 3 = ~150 stop
                int stopN = ((seq + v) % 3) + 2;
                for (int s = 1; s <= stopN; s++) {
                    StopPartnerSeed partner = STOP_PARTNER_POOL.get((seq * 3 + v * 2 + s) % STOP_PARTNER_POOL.size());
                    String arrival = ARRIVAL_HOURS.get((seq + s) % ARRIVAL_HOURS.size());
                    String rawText = " - " + partner.partnerName() + " / " + partner.slipNo() + " / " + arrival + "하차";
                    StopStatus stopStatus = pickStopStatus(targetStatus, s, stopN);
                    VehicleStop stop = VehicleStop.of(
                            savedVehicle.getId(),
                            s,
                            rawText,
                            partner.address(),
                            partner.partnerName(),
                            partner.slipNo(),
                            "Seed sample stop #" + s + " — " + arrival,
                            stopStatus);
                    vehicleStopRepository.save(stop);
                    stopCount++;
                }
            }
            dispatchCreated++;
        }

        log.info("[seed] DispatchSeeder 완료 — dispatch created={} skipped={} vehicle={} stop={}",
                dispatchCreated, dispatchSkipped, vehicleCount, stopCount);
    }

    /** 활성 Driver UUID 모음 (assignedDriverId 순환 매핑용). */
    private List<UUID> collectActiveDriverIds() {
        List<UUID> ids = new ArrayList<>();
        for (Driver d : driverRepository.findAll()) {
            ids.add(d.getId());
        }
        return ids;
    }

    /** 카톡 원본 메시지 결정적 생성 — KakaoDispatchParser 재현 가능 (audit 용). */
    private String buildRawKakaoText(LocalDate date, DispatchType type, int seq) {
        StringBuilder sb = new StringBuilder();
        sb.append(date.getMonthValue()).append("월 ").append(date.getDayOfMonth()).append("일 ");
        sb.append(switch (type) {
            case DAY -> "주간";
            case NIGHT -> "야상";
            case EXPRESS -> "특급";
        });
        sb.append("입니다\n");
        int vehicleN = (seq % 2 == 0) ? 2 : 3;
        for (int v = 1; v <= vehicleN; v++) {
            StopPartnerSeed seedRow = STOP_PARTNER_POOL.get((seq + v) % STOP_PARTNER_POOL.size());
            sb.append(v).append(". ");
            VehicleTonnage tonnage = pickTonnage(seq, v);
            sb.append(switch (tonnage) {
                case MOTORCYCLE -> "오토바이";
                case DAMAS -> "다마스";
                case TONNAGE_1 -> "1톤";
                case TONNAGE_1_4 -> "1.4톤";
                case TONNAGE_1_5 -> "1.5톤";
                case TONNAGE_2_5 -> "2.5톤";
                case TONNAGE_3 -> "3톤";
                case TONNAGE_5 -> "5톤";
                case TONNAGE_10 -> "10톤";
                case TONNAGE_20 -> "20톤";
                case TONNAGE_BIG -> "11톤";
            });
            sb.append(" ").append(seedRow.address()).append("\n");
            int stopN = ((seq + v) % 3) + 2;
            for (int s = 1; s <= stopN; s++) {
                StopPartnerSeed partner = STOP_PARTNER_POOL.get((seq * 3 + v * 2 + s) % STOP_PARTNER_POOL.size());
                String arrival = ARRIVAL_HOURS.get((seq + s) % ARRIVAL_HOURS.size());
                sb.append(" - ").append(partner.partnerName()).append(" / ")
                        .append(partner.slipNo()).append(" / ").append(arrival).append("하차\n");
            }
        }
        return sb.toString();
    }

    private VehicleTonnage pickTonnage(int seq, int v) {
        return switch ((seq + v) % 3) {
            case 0 -> VehicleTonnage.TONNAGE_1;
            case 1 -> VehicleTonnage.TONNAGE_2_5;
            default -> VehicleTonnage.TONNAGE_5;
        };
    }

    /**
     * 차량 상태 분포 — 50 차량 중 PENDING 10 / ASSIGNED 20 / DEPARTED 15 / DELIVERED 5.
     * 글로벌 인덱스 = (seq * vehicleN-prefix) + v 기반의 결정적 buckets.
     */
    private VehicleStatus pickVehicleStatus(int seq, int v) {
        int globalIdx = vehicleGlobalIndex(seq, v);
        if (globalIdx < 10) return VehicleStatus.PENDING;
        if (globalIdx < 30) return VehicleStatus.ASSIGNED;
        if (globalIdx < 45) return VehicleStatus.DEPARTED;
        return VehicleStatus.DELIVERED;
    }

    /** seq, v → 0..49 globally 결정적 idx (vehicleN 분포 = 짝수=2 / 홀수=3 → 누적합). */
    private int vehicleGlobalIndex(int seq, int v) {
        int idx = 0;
        for (int s = 0; s < seq; s++) {
            idx += (s % 2 == 0) ? 2 : 3;
        }
        return idx + (v - 1);
    }

    /** Vehicle 상태에 맞는 transition + driver 배정 (시드 fixture 한정). */
    private void applyVehicleStatusTransition(Vehicle vehicle, VehicleStatus target, int seq, int v,
                                              List<UUID> driverIds) {
        UUID driverId = driverIds.get(vehicleGlobalIndex(seq, v) % driverIds.size());
        MatchSource matchSource = switch (vehicleGlobalIndex(seq, v) % 3) {
            case 0 -> MatchSource.INTERNAL_APP;
            case 1 -> MatchSource.EXTERNAL_INSUNG_QUICK;
            default -> MatchSource.EXTERNAL_KAKAO;
        };
        String externalRefId = matchSource == MatchSource.INTERNAL_APP ? null
                : "INSUNG-REF-" + zfill(vehicleGlobalIndex(seq, v) + 1, 5);

        switch (target) {
            case PENDING -> { /* factory default */ }
            case MATCHING -> vehicle.markMatching();
            case ASSIGNED -> vehicle.assignDriver(driverId, matchSource, externalRefId);
            case DEPARTED -> {
                vehicle.assignDriver(driverId, matchSource, externalRefId);
                vehicle.markDeparted();
            }
            case DELIVERED -> {
                vehicle.assignDriver(driverId, matchSource, externalRefId);
                vehicle.markDeparted();
                vehicle.markDelivered();
            }
            case CANCELLED -> vehicle.cancel();
        }
    }

    /**
     * 정차 상태 — 차량 상태에 종속.
     * <ul>
     *   <li>PENDING / ASSIGNED Vehicle → 모든 stop = PENDING</li>
     *   <li>DEPARTED Vehicle → 첫 stop = ARRIVED, 나머지 PENDING</li>
     *   <li>DELIVERED Vehicle → 마지막 stop 외 = DELIVERED, 마지막 = DELIVERED (모두 완료)</li>
     * </ul>
     */
    private StopStatus pickStopStatus(VehicleStatus vehicleStatus, int s, int stopN) {
        return switch (vehicleStatus) {
            case PENDING, MATCHING, ASSIGNED -> StopStatus.PENDING;
            case DEPARTED -> (s == 1) ? StopStatus.ARRIVED : StopStatus.PENDING;
            case DELIVERED -> StopStatus.DELIVERED;
            case CANCELLED -> StopStatus.FAILED;
        };
    }

    private static String zfill(int v, int width) {
        return String.format("%0" + width + "d", v);
    }

    /** 단일 stop 의 partner 매핑 — Stage 1 partner 30개와 cross-service consistent. */
    private record StopPartnerSeed(String partnerName, String address, Long slipNo) {}
}
