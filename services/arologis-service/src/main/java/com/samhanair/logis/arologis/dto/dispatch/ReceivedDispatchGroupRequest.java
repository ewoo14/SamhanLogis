package com.samhanair.logis.arologis.dto.dispatch;
import java.time.LocalDate; import java.util.List;
public record ReceivedDispatchGroupRequest(String groupNo,LocalDate dispatchDate,String vehicleLabel,String carrierCode,String carrierName,List<Slip> slips){public record Slip(String slipNo,String inclusionType,int sequence,String partnerCode,String partnerName,String deliveryAddress){}}
