package com.samhanair.logis.auth.web.dto.internal;

import java.util.UUID;

/** 내부 계정 조회 응답 — loginId 로 push 수신자 accountId 를 해석할 때 사용한다. */
public record InternalAccountLookupResponse(UUID accountId) {
}
