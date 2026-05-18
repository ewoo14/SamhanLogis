package com.samhanair.logis.partner.client;

/**
 * 동적 RBAC 권한 조회 클라이언트 인터페이스 — partner-service.
 *
 * <p>SP-D5 cycle 2 fix (P0-1): shared 공통 interface extends 로 AOP bean 발견 보장.
 *
 * @deprecated SP-D5 에서 {@link com.samhanair.logis.security.permission.DynamicPermissionClient}
 *             로 일원화되었습니다. SP-D6+ 시점에 본 인터페이스는 완전 제거 예정.
 */
@Deprecated(since = "SP-D5", forRemoval = true)
public interface DynamicPermissionClient
        extends com.samhanair.logis.security.permission.DynamicPermissionClient {
}
