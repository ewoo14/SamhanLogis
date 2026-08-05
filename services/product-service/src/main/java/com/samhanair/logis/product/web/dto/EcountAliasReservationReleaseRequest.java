package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record EcountAliasReservationReleaseRequest(@NotNull UUID reservationToken) {
}
