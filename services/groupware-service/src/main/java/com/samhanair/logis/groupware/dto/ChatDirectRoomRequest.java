package com.samhanair.logis.groupware.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record ChatDirectRoomRequest(@NotNull UUID participantId) {}
