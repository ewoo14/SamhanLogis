package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.dto.ManualDispatchPreviewResponse;
import com.samhanair.logis.arologis.dto.ManualDispatchRequest;
import com.samhanair.logis.arologis.matcher.DriverMatchResult;
import com.samhanair.logis.arologis.matcher.DriverMatcher;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 수동 배차 service — Phase 10 P1-5.
 *
 * <p>매뉴얼 출처: {@code docs/manual/05-arologis/02-수동-배차.md} §2 (정식 admin 폼).
 *
 * <p>카톡 텍스트 우회 ({@link DispatchService#create}) 와 동일한 entity 구조 (Dispatch + Vehicle +
 * VehicleStop) 로 저장하되, 입력 source 가 admin UI 직접 입력. raw_kakao_text 컬럼에는 식별 표지
 * {@code "(수동입력)\n"} + 입력 요약을 영속화 (audit / 카톡 우회 구분).
 *
 * <p>driverCode 미지정 시 매뉴얼 §6-2 (자동 매칭) 에 따라 {@link DriverMatcher} (현재 MockDriverMatcher
 * = MOCK-001) 호출 — 매칭 성공 시 차량 ASSIGNED 전이.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DispatchManualService {

    private final DispatchRepository dispatchRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleStopRepository stopRepository;
    private final DriverRepository driverRepository;
    private final DriverMatcher driverMatcher;
    /** PR-D 2-1 — 수동 입력 정차도 RegionClassifier 매칭하여 classified_region_group 채움. */
    private final RegionClassifier regionClassifier;

    /**
     * 수동 입력 → Dispatch + Vehicle + VehicleStop 일괄 저장.
     *
     * <p>저장 후 {@code req.driverCode()} 가 있으면 모든 차량에 해당 driver 매뉴얼 배정,
     * 없으면 활성 {@link DriverMatcher} 호출 (MockDriverMatcher = MOCK-001 단일 driver).
     *
     * @param req 수동 배차 요청 (Bean Validation 통과 가정)
     * @return 저장된 dispatchId
     * @throws BusinessException(NOT_FOUND) driverCode 지정했으나 미존재
     * @throws BusinessException(INVALID_INPUT) 차량/정차 sequence 중복
     */
    @Transactional
    public UUID manualCreate(ManualDispatchRequest req) {
        validateSequenceUniqueness(req);

        Driver manualDriver = null;
        if (req.driverCode() != null && !req.driverCode().isBlank()) {
            manualDriver = driverRepository.findByDriverCode(req.driverCode())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "driver 미존재: " + req.driverCode()));
        }

        // raw_kakao_text 는 audit 표지 — 카톡 우회와 구분.
        String rawAudit = buildRawAuditSummary(req);
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(req.dispatchDate(), req.dispatchType(), rawAudit));

        for (ManualDispatchRequest.ManualVehicle mv : req.vehicles()) {
            Vehicle vehicle = vehicleRepository.save(
                    Vehicle.of(dispatch.getId(), mv.sequence(), mv.tonnage(), mv.label()));
            for (ManualDispatchRequest.ManualStop ms : mv.stops()) {
                String regionGroup = safeClassify(ms.address());
                stopRepository.save(VehicleStop.of(
                        vehicle.getId(),
                        ms.sequence(),
                        rawStopText(ms),
                        ms.address(),
                        ms.partnerName(),
                        ms.kakaoSeq(),
                        ms.notes(),
                        StopStatus.PENDING,
                        regionGroup,
                        ms.partnerCode()));
            }

            // driver 배정 (수동 또는 자동).
            if (manualDriver != null) {
                vehicle.assignDriver(manualDriver.getId(), MatchSource.MANUAL, null);
            } else {
                tryAutoMatch(vehicle);
            }
        }
        log.info("수동 배차 저장 완료 — dispatchId={} date={} type={} vehicles={} driverCode={}",
                dispatch.getId(), req.dispatchDate(), req.dispatchType(),
                req.vehicles().size(), req.driverCode());
        return dispatch.getId();
    }

    /**
     * 미리보기 — 입력 검증만 + echo. 저장 X.
     *
     * <p>frontend confirm 단계 (사용자 입력 폼 → 미리보기 → [저장] 클릭) 에서 호출.
     */
    public ManualDispatchPreviewResponse manualPreview(ManualDispatchRequest req) {
        validateSequenceUniqueness(req);

        // driverCode 가 있으면 검증만 (실제 매칭은 manualCreate 에서).
        if (req.driverCode() != null && !req.driverCode().isBlank()) {
            driverRepository.findByDriverCode(req.driverCode())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "driver 미존재: " + req.driverCode()));
        }

        int totalStops = req.vehicles().stream()
                .mapToInt(v -> v.stops().size()).sum();

        List<ManualDispatchPreviewResponse.PreviewVehicle> previewVehicles = req.vehicles().stream()
                .map(mv -> new ManualDispatchPreviewResponse.PreviewVehicle(
                        mv.sequence(), mv.tonnage(), mv.label(),
                        mv.stops().stream()
                                .map(ms -> new ManualDispatchPreviewResponse.PreviewStop(
                                        ms.sequence(), ms.partnerName(), ms.address(),
                                        ms.kakaoSeq(), ms.partnerCode(), ms.notes()))
                                .toList()))
                .toList();

        return new ManualDispatchPreviewResponse(
                req.dispatchDate(),
                req.dispatchType(),
                previewVehicles,
                req.vehicles().size(),
                totalStops,
                req.driverCode());
    }

    /** Vehicle / Stop sequence 중복 입력 가드. */
    private void validateSequenceUniqueness(ManualDispatchRequest req) {
        Set<Integer> vehicleSeqs = new HashSet<>();
        for (ManualDispatchRequest.ManualVehicle mv : req.vehicles()) {
            if (!vehicleSeqs.add(mv.sequence())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "vehicle sequence 중복: " + mv.sequence());
            }
            Set<Integer> stopSeqs = new HashSet<>();
            for (ManualDispatchRequest.ManualStop ms : mv.stops()) {
                if (!stopSeqs.add(ms.sequence())) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "stop sequence 중복: vehicle=" + mv.sequence() + " stop=" + ms.sequence());
                }
            }
        }
    }

    /** raw_kakao_text 우회 audit 요약 — 카톡 우회와 구분. */
    private String buildRawAuditSummary(ManualDispatchRequest req) {
        StringBuilder sb = new StringBuilder("(수동입력)\n");
        sb.append(req.dispatchDate()).append(" ").append(req.dispatchType()).append("\n");
        for (ManualDispatchRequest.ManualVehicle mv : req.vehicles()) {
            sb.append(mv.sequence()).append(". ").append(mv.label() == null ? "" : mv.label())
                    .append(" [").append(mv.tonnage()).append("]\n");
            for (ManualDispatchRequest.ManualStop ms : mv.stops()) {
                sb.append("  - ").append(ms.address()).append(
                        ms.partnerName() == null ? "" : "(" + ms.partnerName() + ")").append("\n");
            }
        }
        return sb.toString();
    }

    /** 정차 raw_text — partnerName + address 결합 (카톡 우회와 구분, 매뉴얼 §2-2 매핑). */
    private String rawStopText(ManualDispatchRequest.ManualStop ms) {
        StringBuilder sb = new StringBuilder();
        sb.append(ms.address());
        if (ms.partnerName() != null && !ms.partnerName().isBlank()) {
            sb.append("(").append(ms.partnerName());
            if (ms.kakaoSeq() != null) {
                sb.append("-").append(ms.kakaoSeq());
            }
            sb.append(")");
        }
        if (ms.notes() != null && !ms.notes().isBlank()) {
            sb.append(" ").append(ms.notes());
        }
        return sb.toString();
    }

    /** RegionClassifier null-safe wrapper — 미주입 또는 매칭 실패 시 null. */
    private String safeClassify(String address) {
        if (regionClassifier == null || address == null || address.isBlank()) {
            return null;
        }
        try {
            return regionClassifier.classify(address);
        } catch (Exception ex) {
            log.warn("RegionClassifier 호출 실패 (fail-soft) — address={}, msg={}", address, ex.getMessage());
            return null;
        }
    }

    /** 자동 매칭 시도 — 매칭 실패 시 PENDING 그대로 (fail-soft). */
    private void tryAutoMatch(Vehicle vehicle) {
        try {
            List<VehicleStop> stops = stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicle.getId());
            DriverMatchResult result = driverMatcher.match(vehicle, stops);
            if (result.driver().isPresent()) {
                Driver driver = result.driver().get();
                vehicle.assignDriver(driver.getId(), result.source(), result.externalRefId());
                log.debug("수동 배차 자동 매칭 성공 — vehicleSeq={}, driverCode={}",
                        vehicle.getSequence(), driver.getDriverCode());
            }
        } catch (UnsupportedOperationException ex) {
            log.warn("Matcher placeholder — vehicleSeq={}, msg={}",
                    vehicle.getSequence(), ex.getMessage());
        } catch (Exception ex) {
            log.warn("Matcher 호출 실패 (fail-soft) — vehicleSeq={}, msg={}",
                    vehicle.getSequence(), ex.getMessage());
        }
    }
}
