package com.samhanair.logis.arologis.client;

/**
 * 동적 RBAC 권한 조회 클라이언트 인터페이스 — arologis-service.
 *
 * <p>SP-D5 cycle 2 fix (P0-1): shared 공통 interface 를 {@code extends} 하여
 * {@link com.samhanair.logis.security.permission.PermissionAspect} 가
 * {@code ObjectProvider<shared>} 로 본 service 의 Impl bean 을 발견 가능하도록 한다.
 *
 * @deprecated SP-D5 에서 {@link com.samhanair.logis.security.permission.DynamicPermissionClient}
 *             로 일원화되었습니다. SP-D6+ 시점에 본 인터페이스는 완전 제거 예정.
 */
@Deprecated(since = "SP-D5", forRemoval = true)
public interface DynamicPermissionClient
        extends com.samhanair.logis.security.permission.DynamicPermissionClient {
}
