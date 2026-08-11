package com.samhanair.logis.slip.dto.dispatch;

import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * DispatchTask 상세 조회 DTO — desktop DispatchTaskResponse TS 계약과 1:1.
 */
public record DispatchTaskDetailResponse(
        UUID id,
        String taskCode,
        LocalDate dispatchDate,
        String status,
        UUID arologisDispatchId,
        String failureReason,
        String memo,
        String modificationReason,
        String rejectionReason,
        LocalDateTime modificationRequestedAt,
        LocalDateTime modificationDecidedAt,
        List<VehicleGroup> vehicleGroups,
        List<MatchedDriverDto> matchedDrivers,
        List<UUID> duplicateSlipIds
) {

    public static DispatchTaskDetailResponse of(
            DispatchTask task,
            List<VehicleGroup> vehicleGroups,
            List<MatchedDriverDto> matchedDrivers,
            List<UUID> duplicateSlipIds
    ) {
        return new DispatchTaskDetailResponse(
                task.getId(),
                task.getTaskCode(),
                task.getDispatchDate(),
                task.getStatus().name(),
                task.getArologisDispatchId(),
                task.getFailureReason(),
                task.getMemo(),
                task.getModificationReason(),
                task.getRejectionReason(),
                task.getModificationRequestedAt(),
                task.getModificationDecidedAt(),
                vehicleGroups,
                matchedDrivers,
                duplicateSlipIds
        );
    }

    public record VehicleGroup(
            UUID id,
            String vehicleType,
            String vehicleTypeDisplay,
            String vehicleBodyType,
            String vehicleBodyTypeDisplay,
            String tonnage,
            String tonnageDisplay,
            String dispatchStatus,
            int sequence,
            boolean isDeleted,
            LocalDateTime deletedAt,
            String deletedByName,
            List<VehicleGroupSlip> slips
    ) {
        public static VehicleGroup of(DispatchVehicleGroup group, List<VehicleGroupSlip> slips) {
            return new VehicleGroup(
                    group.getId(),
                    group.getVehicleType().name(),
                    group.getVehicleType().getDisplayName(),
                    group.getVehicleBodyType().name(),
                    group.getVehicleBodyType().getDisplayName(),
                    group.getTonnage() != null ? group.getTonnage().name() : null,
                    group.getTonnage() != null ? group.getTonnage().getDisplayName() : null,
                    group.getDispatchStatus().name(),
                    group.getSequence(),
                    Boolean.TRUE.equals(group.getIsDeleted()),
                    group.getDeletedAt(),
                    ActorDisplayName.resolveNullable(null, group.getDeletedByName()),
                    slips
            );
        }
    }

    public record VehicleGroupSlip(
            UUID id,
            UUID slipId,
            int sequence,
            boolean isDeleted,
            LocalDateTime deletedAt,
            String deletedByName,
            SlipHeader slip
    ) {
        public static VehicleGroupSlip of(DispatchVehicleGroupSlip mapping, Slip slip) {
            return new VehicleGroupSlip(
                    mapping.getId(),
                    mapping.getSlipId(),
                    mapping.getSequence(),
                    Boolean.TRUE.equals(mapping.getIsDeleted()),
                    mapping.getDeletedAt(),
                    ActorDisplayName.resolveNullable(null, mapping.getDeletedByName()),
                    SlipHeader.from(slip)
            );
        }
    }

    public record SlipHeader(
            String slipNo,
            String partnerCode,
            String partnerName,
            String deliveryAddress,
            String recipientPhone,
            String dispatchStatus
    ) {
        public static SlipHeader from(Slip slip) {
            return new SlipHeader(
                    slip.getSlipNo(),
                    // partnerCode/partnerName 은 Slip 에서 nullable(partnerCode resolve 후속 슬라이스) —
                    // FE DispatchTaskResponse 의 non-null string 계약과 정합 위해 "" coalesce([[fe_option_type_matches_be_dto]]).
                    slip.getPartnerCode() != null ? slip.getPartnerCode() : "",
                    slip.getPartnerName() != null ? slip.getPartnerName() : "",
                    slip.getDeliveryAddress(),
                    slip.getRecipientPhone(),
                    slip.getDispatchStatus() != null ? slip.getDispatchStatus().name() : null
            );
        }
    }

    public record MatchedDriverDto(
            int vehicleGroupSequence,
            String driverCode,
            String driverName,
            String driverPhoneNumber,
            String driverSource,
            String vehiclePlateNumber
    ) {
        public static MatchedDriverDto of(MatchedDriver driver, DispatchVehicleGroup group) {
            return new MatchedDriverDto(
                    group.getSequence(),
                    driver.getDriverCode(),
                    driver.getDriverName(),
                    driver.getDriverPhoneNumber(),
                    driver.getDriverSource().name(),
                    driver.getVehiclePlateNumber()
            );
        }
    }
}
