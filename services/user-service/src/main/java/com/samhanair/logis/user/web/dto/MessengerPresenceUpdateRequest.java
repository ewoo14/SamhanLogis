package com.samhanair.logis.user.web.dto;

import jakarta.validation.constraints.NotBlank;

public record MessengerPresenceUpdateRequest(@NotBlank String status) {}
