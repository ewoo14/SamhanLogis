package com.samhanair.logis.common.http;

import java.util.List;

/**
 * 서비스 간 공통 HTTP header 이름.
 */
public final class HttpHeaderConstants {

    /** 호출자 UUID header. */
    public static final String CALLER_ID_HEADER = "X-User-Id";

    /** 호출자 표시명 header. */
    public static final String CALLER_NAME_HEADER = "X-User-Name";

    /**
     * Legacy role header.
     *
     * <p>Phase C5 이후 api-gateway 와 downstream HeaderAuthenticationFilter 는 본 헤더를
     * 사용자 인가 authority 로 사용하지 않는다. 잔존 테스트와 role-mode 호환 문맥에서만
     * 리터럴 중복 방지를 위해 보존한다.
     */
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
     * role 문자열 폴백 없이 시스템 마스터 bypass 판정에 사용된다.
     */
    public static final String IS_SYSTEM_MASTER_HEADER = "X-Is-System-Master";

    /**
     * 계정의 활성 그룹 UUID 집합 header — Phase C5-1 신규.
     *
     * <p>api-gateway 가 JWT {@code groups} claim 을 파싱하여 comma-join UUID 문자열로 전파한다.
     * downstream HeaderAuthenticationFilter 와 {@link PermissionAspect} 는 본 헤더를 기준으로
     * group authority 및 동적 권한 OR 판정을 수행한다. 그룹이 없으면 빈 문자열을 전파하여
     * 헤더 부재와 구분한다.
     */
    public static final String USER_GROUPS_HEADER = "X-User-Groups";

    /**
     * 파트너(거래처) 계정 식별 header — Phase C5-4 신규.
     *
     * <p>api-gateway 가 JWT {@code partnerCode} claim 존재 시 {@code "true"} 를 주입한다.
     * claim 부재 시 {@code "false"} 를 전송한다. downstream {@link PermissionAspect} 에서
     * PARTNER 거절 판정의 신뢰 근거로 사용된다.
     *
     * <p>신뢰 경계: 게이트웨이가 JWT 서명 검증 후 claim 유무로 판정하므로
     * FE/클라이언트가 임의로 헤더를 주입해도 게이트웨이가 덮어쓴다.
     * partner-auth JWT 에 {@code partnerCode} claim 이 있을 때만 신뢰한다.
     */
    public static final String IS_PARTNER_HEADER = "X-Is-Partner";

    /**
     * 서비스 간 내부 호출 인증 token header — A2-G1 이후 신규.
     *
     * <p>api-gateway 또는 내부 서비스가 {@code X-Internal-Token} 을 주입하여 내부 전용
     * endpoint({@code /internal/**}) 를 호출한다. 클라이언트(FE/외부)가 이 헤더를
     * 직접 주입하면 api-gateway 가 strip 하므로 클라이언트 spoofing 이 차단된다.
     *
     * <p>defense-in-depth: {@link #INBOUND_IDENTITY_HEADERS} 에 포함하여
     * 공개 라우트에서도 gateway strip 대상이 되도록 한다.
     */
    public static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    /** Gateway가 서명된 사용자 헤더와 함께 주입하는 별도 ingress attestation. */
    public static final String GATEWAY_ATTESTATION_HEADER = "X-Samhan-Gateway-Attestation";

    /**
     * 클라이언트가 직접 신뢰 경계 안으로 들여보내면 안 되는 identity header 집합.
     *
     * <p>api-gateway 는 보호 라우트에서 JWT claim 기반으로 이 값을 제거 후 재주입하고,
     * JWT 미적용 공개 라우트에서는 전부 제거만 수행한다. 새 identity header 추가 시
     * 이 목록을 먼저 갱신해야 공개 라우트 strip 누락을 막을 수 있다.
     */
    public static final List<String> INBOUND_IDENTITY_HEADERS = List.of(
            CALLER_ID_HEADER,
            IS_SYSTEM_MASTER_HEADER,
            USER_GROUPS_HEADER,
            IS_PARTNER_HEADER,
            PARTNER_CODE_HEADER,
            CALLER_NAME_HEADER,
            USER_DEPARTMENT_HEADER,
            CALLER_ROLE_HEADER,
            INTERNAL_TOKEN_HEADER,
            GATEWAY_ATTESTATION_HEADER
    );

    private HttpHeaderConstants() {
    }
}
