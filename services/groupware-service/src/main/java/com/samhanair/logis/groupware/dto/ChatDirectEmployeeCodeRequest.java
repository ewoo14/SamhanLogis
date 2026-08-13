package com.samhanair.logis.groupware.dto;

import jakarta.validation.constraints.NotBlank;

public record ChatDirectEmployeeCodeRequest(@NotBlank String employeeCode) {}
