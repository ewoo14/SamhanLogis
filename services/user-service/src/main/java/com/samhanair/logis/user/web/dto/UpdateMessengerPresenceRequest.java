package com.samhanair.logis.user.web.dto;

import com.samhanair.logis.user.presence.PresenceStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateMessengerPresenceRequest(@NotNull PresenceStatus presenceStatus) {}
