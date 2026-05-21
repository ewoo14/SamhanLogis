package com.samhanair.logis.partner.dto;

import java.util.List;
import java.util.UUID;

/** partnerId 목록 기반 internal 거래처명 batch lookup 요청. */
public record PartnerLookupByIdsRequest(List<UUID> ids) {
}
