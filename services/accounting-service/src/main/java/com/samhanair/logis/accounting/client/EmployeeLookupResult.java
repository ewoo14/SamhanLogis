package com.samhanair.logis.accounting.client;

import java.util.UUID;

/** user-service Employee by-name lookup 결과. 사용자 화면에는 UUID를 노출하지 않는다. */
public record EmployeeLookupResult(UUID employeeId, String fullName) {
}
