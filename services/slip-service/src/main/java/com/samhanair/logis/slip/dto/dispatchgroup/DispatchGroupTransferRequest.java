package com.samhanair.logis.slip.dto.dispatchgroup;
import java.time.LocalDate;
import java.util.List;
public record DispatchGroupTransferRequest(String groupNo, LocalDate dispatchDate, String vehicleLabel, String carrierCode, String carrierName, List<Slip> slips) {
    public record Slip(String slipNo, String inclusionType, int sequence, String partnerCode, String partnerName, String deliveryAddress) {}
}
