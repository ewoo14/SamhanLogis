package com.samhanair.logis.user.web.dto;

import com.samhanair.logis.user.presence.PresenceStatus;
import java.time.LocalDate;

public record MessengerEmployeeResponse(String employeeCode, String name, String jobTitle,
                                        String departmentName, int departmentOrder,
                                        LocalDate hireDate, PresenceStatus presenceStatus) {}
