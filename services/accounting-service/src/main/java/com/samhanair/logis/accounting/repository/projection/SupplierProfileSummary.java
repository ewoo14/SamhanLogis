package com.samhanair.logis.accounting.repository.projection;

import java.util.UUID;

/**
 * 사업자 프로필 목록 조회용 인터페이스 프로젝션 — stamp_png BYTEA 제외.
 *
 * <p>P3-1: 목록 응답에서 stamp_png(최대 200KB) BYTEA 컬럼을 Hibernate 가
 * hydrate 하지 않도록 stamp 관련 컬럼을 제외한 프로젝션.
 * {@link com.samhanair.logis.accounting.repository.SupplierProfileRepository#findAllSummary()}
 * 에서 사용된다.
 *
 * <p>stamp 상세 데이터는 {@code GET /{id}} 상세 조회 경로에서만 로드된다.
 */
public interface SupplierProfileSummary {

    /** 내부 UUID — PUT/PATCH/DELETE 경로용. */
    UUID getId();

    /** 사업자등록번호 (10자리). */
    String getBusinessNumber();

    /** 종사업장번호 (4자리, nullable). */
    String getSubBusinessNumber();

    /** 상호. */
    String getCompanyName();

    /** 대표 성명. */
    String getRepresentativeName();

    /** 사업장 주소. */
    String getBusinessAddress();

    /** 업태 (nullable). */
    String getBusinessType();

    /** 종목 (nullable). */
    String getBusinessItem();

    /** 사업자 이메일 (nullable). */
    String getEmail();

    /** 전화번호 (nullable). */
    String getTel();

    /** FAX 번호 (nullable). */
    String getFax();

    /** 기본 사업자 여부. */
    Boolean getIsPrimary();

    /** 낙관적 락 버전. */
    Long getVersion();

    /**
     * 인감 PNG SHA-256 해시 (nullable).
     * hasStamp 판단용 — null 이면 인감 미등록.
     */
    String getStampHash();

    /**
     * 로고 PNG SHA-256 해시 (nullable).
     * hasLogo 판단용 — null 이면 로고 미등록.
     */
    String getLogoHash();
}
