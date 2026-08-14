package com.samhanair.logis.user.web.dto;

import com.samhanair.logis.user.presence.PresenceStatus;

public record MessengerPresenceResponse(String employeeCode, PresenceStatus presenceStatus, String label) {}
