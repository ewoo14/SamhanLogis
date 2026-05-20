package com.samhanair.logis.accounting.web.dto;

import java.time.LocalDateTime;

/** MIG-9 partner_aging_snapshot refresh 응답. */
public record AgingSnapshotRefreshResult(LocalDateTime refreshedAt, String status) {
}
