package com.samhanair.logis.accounting.it;

/**
 * EcountMig IT 군 공통 — C5 후속 부분-identity 계약 헬퍼.
 *
 * <p>(사이클1 BE Nit-3) Mig6~11 IT 클래스에 중복돼 있던 missingUserId 케이스 판정/상수를
 * 단일 출처로 추출한다. C5 이후 부분-identity 신호 = X-User-Groups / X-Is-System-Master
 * (X-User-Role 은 무시 대상) — userId 부재 + 부분-identity 존재 = 401 강화 분기 계약.
 */
final class EcountMigPartialIdentitySupport {

    /** missingUserId 케이스가 보내는 부분-identity X-User-Groups 값 (유효 UUID 1개면 충분). */
    static final String PARTIAL_IDENTITY_GROUPS = "11111111-1111-1111-1111-111111111111";

    private EcountMigPartialIdentitySupport() {
    }

    /** 케이스 라벨이 missingUserId(401 강화 분기) 계약 케이스인지 판정한다. */
    static boolean isMissingUserIdCase(String label) {
        return label.contains("missingUserId") || label.contains("MissingUserId");
    }
}
