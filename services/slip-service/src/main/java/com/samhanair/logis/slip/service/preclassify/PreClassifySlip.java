package com.samhanair.logis.slip.service.preclassify;

/** 가배차 계산에 필요한 출고전표 projection. */
public record PreClassifySlip(String slipNo, String partnerCode, String partnerName, String address,
                              String deliveryTag, String warehouseBusinessType) {}
