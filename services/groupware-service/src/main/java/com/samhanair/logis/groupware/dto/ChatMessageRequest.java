package com.samhanair.logis.groupware.dto;

import jakarta.validation.constraints.NotBlank;

public record ChatMessageRequest(@NotBlank String body) {}
