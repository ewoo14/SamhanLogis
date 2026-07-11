package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.dto.AvailableDriverResponse;
import com.samhanair.logis.arologis.dto.DispatchPageResponse;
import com.samhanair.logis.arologis.dto.DispatchPageResponse.DispatchSummary;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * P1-5 admin UI backing service — 배차 list (페이징) / 자동매칭 / 수동배차 / 기사변경 / 가용기사 조회.
 *
 * <p>기존 {@link DispatchService} 는 변경 없이 재사용. 본 service 는 admin UI 전용 신규 시나리오를
 * 담당한다. DispatchService.autoMatch / assignDriverManual 은 위임(delegate) 형태로 호출.
 *
 * <p>UUID 비공개 가드 — 모든 응답에서 UUID 는 노출하지 않으며, driverCode / dispatchId(admin routing) 만 허용.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DispatchAdminService {

    private final DispatchRepository dispatchRepository;
    private final VehicleRepository vehicleRepository;
    private final DriverRepository driverRepository;
    private final DispatchService dispatchService;

    /**
     * 배차 목록 조회 (페이징 + 상태 / 기간 필터).
     *
     * <p>status 파라미터는 현재 {@link DispatchType} 필터로 동작. fromDate / toDate 기간 필터 지원.
     * page / size 는 application-level 페이징 (JPA Pageable 대신 경량 slice).
     *
     * @param status    배차 유형 필터 (null = 전체)
     * @param fromDate  조회 시작일 (null = 오늘)
     * @param toDate    조회 종료일 (null = fromDate)
     * @param page      0-based 페이지 번호
     * @param size      페이지 크기 (기본 20)
     * @return 페이징 응답
     */
    @Transactional(readOnly = true)
    public DispatchPageResponse listDispatches(DispatchType status, LocalDate fromDate,
                                               LocalDate toDate, int page, int size) {
        LocalDate from = fromDate == null ? LocalDate.now() : fromDate;
        LocalDate to = toDate == null ? from : toDate;
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "toDate 는 fromDate 이후여야 합니다.");
        }

        List<Dispatch> all = dispatchRepository.findAllByDispatchDateBetweenOrderByDispatchDateAsc(from, to);
        if (status != null) {
            all = all.stream().filter(d -> d.getDispatchType() == status).toList();
        }

        long totalElements = all.size();
        int fromIdx = Math.min(page * size, (int) totalElements);
        int toIdx = Math.min(fromIdx + size, (int) totalElements);
        List<Dispatch> paged = all.subList(fromIdx, toIdx);

        List<DispatchSummary> summaries = paged.stream()
                .map(d -> {
                    int vehicleCount = vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(d.getId()).size();
                    return DispatchSummary.from(d, vehicleCount);
                })
                .toList();

        log.debug("배차 목록 조회 — from={} to={} status={} total={} page={} size={}",
                from, to, status, totalElements, page, size);
        return DispatchPageResponse.of(summaries, totalElements, page, size);
    }

    /**
     * 자동 매칭 트리거 — 카카오톡 배차 admin UI P1-5 §4-2.
     *
     * <p>기존 {@link DispatchService#autoMatch(UUID)} 위임. 결과 totalVehicles / matched 반환.
     *
     * @param dispatchId 배차 UUID
     * @return 자동 매칭 결과
     */
    @Transactional
    public DispatchService.AutoMatchResult triggerAutoMatch(UUID dispatchId) {
        log.info("자동 매칭 트리거 — dispatchId={}", dispatchId);
        return dispatchService.autoMatch(dispatchId);
    }

    /**
     * 수동 배차 — admin UI P1-5 §4-3 (수동 배차 폼).
     *
     * <p>driverCode 로 기사를 조회한 뒤, 해당 배차의 vehicleSeq 차량에 MANUAL 매칭 소스로 배정.
     *
     * @param dispatchId 배차 UUID
     * @param vehicleSeq 차량 순번 (1-based)
     * @param driverCode 기사 식별 코드
     */
    @Transactional
    public void manualAssign(UUID dispatchId, Integer vehicleSeq, String driverCode) {
        if (driverCode == null || driverCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "driverCode 필수");
        }
        if (vehicleSeq == null || vehicleSeq < 1) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "vehicleSeq 는 1 이상이어야 합니다.");
        }
        dispatchService.assignDriverManual(dispatchId, vehicleSeq, driverCode);
        log.info("수동 배차 완료 — dispatchId={} vehicleSeq={} driverCode={}", dispatchId, vehicleSeq, driverCode);
    }

    /**
     * 기사 변경 — admin UI P1-5 §4-4 (기사 배정 변경).
     *
     * <p>이미 ASSIGNED 상태인 차량도 기사 변경 가능. 기존 assignedDriverId 를 새 driverCode 로 교체.
     * MatchSource.MANUAL 로 재배정 기록.
     *
     * @param dispatchId   배차 UUID
     * @param vehicleSeq   차량 순번 (1-based)
     * @param newDriverCode 변경할 기사 식별 코드
     */
    @Transactional
    public void changeDriver(UUID dispatchId, Integer vehicleSeq, String newDriverCode) {
        if (newDriverCode == null || newDriverCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "newDriverCode 필수");
        }
        if (vehicleSeq == null || vehicleSeq < 1) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "vehicleSeq 는 1 이상이어야 합니다.");
        }
        Vehicle vehicle = vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, vehicleSeq)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "vehicle 미존재 — seq=" + vehicleSeq));
        Driver newDriver = driverRepository.findByDriverCode(newDriverCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "driver 미존재: " + newDriverCode));
        vehicle.assignDriver(newDriver.getId(), MatchSource.MANUAL, null);
        log.info("기사 변경 완료 — dispatchId={} vehicleSeq={} newDriverCode={}", dispatchId, vehicleSeq, newDriverCode);
    }

    /**
     * 가용 기사 조회 — admin UI P1-5 §4-5 (기사 배정 후보 목록).
     *
     * <p>date 기준 해당 날짜에 다른 배차가 ASSIGNED 상태로 배정된 기사는 제외. zoneId 는 vehicleType
     * prefix 기준 필터 (현재 단순 문자열 포함 검색). 두 필터가 없으면 전체 기사 반환.
     *
     * @param date   조회 기준 일자 (null = 오늘)
     * @param zoneId 권역 ID 필터 (null = 전체). vehicleType 에 포함되는 문자열 기준.
     * @return 가용 기사 응답 (UUID 비공개 가드 적용)
     */
    @Transactional(readOnly = true)
    public AvailableDriverResponse findAvailableDrivers(LocalDate date, String zoneId) {
        LocalDate queryDate = date == null ? LocalDate.now() : date;

        // 해당 날짜 배차에 ASSIGNED 상태로 배정된 기사 UUID 집합 추출
        List<Dispatch> dispatches = dispatchRepository.findAllByDispatchDateBetweenOrderByDispatchDateAsc(
                queryDate, queryDate);
        java.util.Set<UUID> busyDriverIds = new java.util.HashSet<>();
        for (Dispatch d : dispatches) {
            vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(d.getId()).stream()
                    .filter(v -> v.getStatus() == com.samhanair.logis.arologis.domain.VehicleStatus.ASSIGNED
                            || v.getStatus() == com.samhanair.logis.arologis.domain.VehicleStatus.DEPARTED)
                    .map(Vehicle::getAssignedDriverId)
                    .filter(id -> id != null)
                    .forEach(busyDriverIds::add);
        }

        // 전체 기사 중 바쁜 기사 제외 + zoneId 필터
        List<Driver> available = driverRepository.findAll().stream()
                .filter(driver -> !busyDriverIds.contains(driver.getId()))
                .filter(driver -> {
                    if (zoneId == null || zoneId.isBlank()) return true;
                    return driver.getVehicleType() != null
                            && driver.getVehicleType().contains(zoneId);
                })
                .toList();

        log.debug("가용 기사 조회 — date={} zoneId={} busyCount={} availableCount={}",
                queryDate, zoneId, busyDriverIds.size(), available.size());
        return AvailableDriverResponse.of(available, queryDate.toString(), zoneId);
    }
}
