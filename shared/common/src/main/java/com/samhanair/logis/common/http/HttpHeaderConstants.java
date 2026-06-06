package com.samhanair.logis.common.http;

/**
 * 서비스 간 공통 HTTP header 이름.
 */
public final class HttpHeaderConstants {

    /** 호출자 UUID header. */
    public static final String CALLER_ID_HEADER = "X-User-Id";

    /** 호출자 표시명 header. */
    public static final String CALLER_NAME_HEADER = "X-User-Name";

    /** 호출자 역할 header. */
    public static final String CALLER_ROLE_HEADER = "X-User-Role";

    /** 거래처 사용자 본인 주문 검증용 거래처 코드 header. */
    public static final String PARTNER_CODE_HEADER = "X-Partner-Code";

    /**
     * 호출자 소속 부서명 header — Phase 12 인사 카테고리 가드.
     *
     * <p>api-gateway 가 JWT {@code departmentName} claim 존재 시에만 UTF-8 URL-encode
     * 하여 전파(한글 부서명 ISO-8859-1 모지바케 방지). 수신 측(HrAuthorizationHelper)이
     * URL-decode 한다. claim 미존재 시 헤더 미전송 → 인사 가드는 부재로 판정.
     */
    public static final String USER_DEPARTMENT_HEADER = "X-User-Department";

    /**
     * 시스템 마스터 그룹 멤버십 여부 header — Phase C4 신규.
     *
     * <p>api-gateway 가 JWT {@code isSystemMaster} claim 을 파싱하여 {@code "true"} 또는
     * {@code "false"} 문자열로 전파. downstream {@link PermissionAspect} 에서
     * {@code role==MASTER} 폴백과 OR 조건으로 bypass 판정에 사용된다.
     */
    public static final String IS_SYSTEM_MASTER_HEADER = "X-Is-System-Master";

    /**
     * 계정의 활성 그룹 UUID 집합 header — Phase C5-1 신규.
     *
     * <p>api-gateway 가 JWT {@code groups} claim 을 파싱하여 comma-join UUID 문자열로 전파.
     * 본 슬라이스(C5-1)에서는 헤더를 주입만 하며 소비처(PermissionAspect 등)는 C5-2 에서 구현된다.
     * 그룹이 없으면 빈 문자열을 전파하여 헤더 부재와 구분한다.
     */
    public static final String USER_GROUPS_HEADER = "X-User-Groups";

    private HttpHeaderConstants() {
    }
}
