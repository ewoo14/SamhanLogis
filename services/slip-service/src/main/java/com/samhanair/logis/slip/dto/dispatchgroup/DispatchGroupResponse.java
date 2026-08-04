package com.samhanair.logis.slip.dto.dispatchgroup;

import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroup;
import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroupSlip;
import java.time.LocalDate;
import java.util.List;

public record DispatchGroupResponse(String groupNo, LocalDate dispatchDate, String vehicleLabel,
                                    String carrierCode, String carrierName, Boolean carrierArologis,
                                    String transferStatus, List<SlipEntry> slips) {
    public record SlipEntry(String slipNo, String inclusionType, int sequence) {}
    public static DispatchGroupResponse from(DispatchGroup group, String carrierCode, String carrierName,
                                              Boolean carrierArologis, List<DispatchGroupSlip> mappings,
                                              java.util.Map<java.util.UUID, String> slipNos) {
        return new DispatchGroupResponse(group.getGroupNo(), group.getDispatchDate(), group.getVehicleLabel(),
                carrierCode, carrierName, carrierArologis, group.getTransferStatus().name(), mappings.stream()
                .map(m -> new SlipEntry(slipNos.get(m.getSlipId()), m.getInclusionType().name(), m.getSequence())).toList());
    }
}
