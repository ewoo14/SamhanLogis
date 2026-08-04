package com.samhanair.logis.slip.service.preclassify;

import java.util.List;
import java.util.Map;

/** 삼한이 제공하는 UUID 비공개 가배차 분류 응답. */
public record PreClassifyResponse(Map<String, List<Entry>> regionGroups, List<Entry> unclassified,
                                  int unknownWarehouseCount) {
    public record Entry(String slipNo, String partnerCode, String partnerName, String address,
                        String regionGroup, boolean dispatchPlanned) {}
}
