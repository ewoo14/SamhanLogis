package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 사업자 프로필 — 사업자양식(홈택스 공급자 정보) 관리 도메인 엔티티.
 *
 * <p>GAS Code.js / Index.html 에 하드코딩 되어 있던 공급자 정보를
 * 데이터베이스 기반으로 전환한 도메인 모델이다. 회계 카테고리 "사업자 양식" 메뉴에서
 * 사용자가 수정 가능하며, 기존 하드코딩 값이 Flyway V14 시드로 적재된다.
 *
 * <p>상태/불변 필드는 도메인 메서드({@link #update}, {@link #markPrimary},
 * {@link #unmarkPrimary})만으로 변경한다 — 직접 setter 호출 금지.
 *
 * <p>isPrimary = true 인 row 는 항상 1개만 존재해야 한다.
 * DB 레벨 부분 유니크 인덱스({@code uq_supplier_primary_active})로 보장하며,
 * 서비스 레이어에서 PATCH /{id}/primary 호출 시 기존 primary 를 {@link #unmarkPrimary()}
 * 처리 후 신규 row 를 {@link #markPrimary()} 한다.
 *
 * <p>BaseEntity 7 audit 컬럼 + Soft Delete ({@link BaseEntity#markDeleted(String)}).
 * 낙관적 락({@link Version})으로 동시 수정 충돌 감지.
 */
@Entity
@Getter
@Table(name = "supplier_profiles")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SupplierProfile extends BaseEntity {

    /** PK — UUID v4 자동 생성. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 사업자등록번호 — 숫자 10자리 (예: {@code 2148720659}).
     * 사용자 노출 비즈니스 식별자 (UUID 비공개 원칙 준수).
     * active row 기준 unique (부분 유니크 인덱스).
     */
    @Column(name = "business_number", nullable = false, length = 10)
    private String businessNumber;

    /**
     * 종사업장번호 — 4자리, nullable.
     * 단일 사업장인 경우 NULL.
     */
    @Column(name = "sub_business_number", length = 4)
    private String subBusinessNumber;

    /**
     * 상호 — 예: {@code （주）삼한공조시스템}.
     * 홈택스 양식 "공급자 상호" 컬럼에 직접 매핑된다.
     */
    @Column(name = "company_name", nullable = false, length = 100)
    private String companyName;

    /**
     * 대표 성명 — 예: {@code 김미선}.
     * 홈택스 양식 "공급자 성명" 컬럼에 직접 매핑된다.
     */
    @Column(name = "representative_name", nullable = false, length = 50)
    private String representativeName;

    /**
     * 사업장 주소 — 최대 500자.
     * 홈택스 양식 "공급자 사업장주소" 컬럼에 직접 매핑된다.
     */
    @Column(name = "business_address", nullable = false, length = 500)
    private String businessAddress;

    /**
     * 업태 — 예: {@code 도소매}. nullable.
     * 홈택스 양식 "공급자 업태" 컬럼에 직접 매핑된다.
     */
    @Column(name = "business_type", length = 50)
    private String businessType;

    /**
     * 종목 — 예: {@code 가전제품}. nullable.
     * 홈택스 양식 "공급자 종목" 컬럼에 직접 매핑된다.
     */
    @Column(name = "business_item", length = 50)
    private String businessItem;

    /**
     * 사업자 이메일. nullable.
     * 홈택스 양식 "공급자 이메일" 컬럼에 직접 매핑된다.
     */
    @Column(name = "email", length = 100)
    private String email;

    /**
     * 기본 사업자 여부.
     * {@code true} 인 row 는 DB 전체에서 1개만 유지된다.
     * {@link TaxInvoiceBatchService} 가 공급자 정보 조회 시 이 flag 로 단건 fetch.
     */
    @Column(name = "is_primary", nullable = false)
    private boolean isPrimary;

    /** 낙관적 락 버전. */
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    // =========================================================================
    // 팩토리 메서드
    // =========================================================================

    /**
     * 신규 사업자 프로필 생성.
     *
     * @param businessNumber     사업자등록번호 (10자리 숫자)
     * @param subBusinessNumber  종사업장번호 (4자리, nullable)
     * @param companyName        상호
     * @param representativeName 대표 성명
     * @param businessAddress    사업장 주소
     * @param businessType       업태 (nullable)
     * @param businessItem       종목 (nullable)
     * @param email              이메일 (nullable)
     * @param isPrimary          기본 사업자 여부
     * @return 신규 {@link SupplierProfile}
     * @throws IllegalArgumentException 필수 인자 누락 또는 형식 오류
     */
    public static SupplierProfile create(
            String businessNumber,
            String subBusinessNumber,
            String companyName,
            String representativeName,
            String businessAddress,
            String businessType,
            String businessItem,
            String email,
            boolean isPrimary) {
        validateBusinessNumber(businessNumber);
        validateNotBlank(companyName, "companyName");
        validateNotBlank(representativeName, "representativeName");
        validateNotBlank(businessAddress, "businessAddress");
        if (businessAddress.length() > 500) {
            throw new IllegalArgumentException("businessAddress 는 최대 500자입니다");
        }
        SupplierProfile p = new SupplierProfile();
        p.businessNumber = businessNumber.trim();
        p.subBusinessNumber = (subBusinessNumber == null || subBusinessNumber.isBlank()) ? null : subBusinessNumber.trim();
        p.companyName = companyName.trim();
        p.representativeName = representativeName.trim();
        p.businessAddress = businessAddress.trim();
        p.businessType = businessType;
        p.businessItem = businessItem;
        p.email = email;
        p.isPrimary = isPrimary;
        p.version = 0L;
        return p;
    }

    // =========================================================================
    // 도메인 메서드
    // =========================================================================

    /**
     * 사업자 프로필 정보 갱신 (체이닝 가능).
     *
     * <p>모든 mutable 필드를 한 번에 수정한다. null 인자는 기존 값을 유지한다.
     *
     * @param businessNumber     새 사업자등록번호 (null 이면 기존 유지)
     * @param subBusinessNumber  새 종사업장번호 (null 이면 기존 유지)
     * @param companyName        새 상호 (null 이면 기존 유지)
     * @param representativeName 새 대표 성명 (null 이면 기존 유지)
     * @param businessAddress    새 사업장 주소 (null 이면 기존 유지)
     * @param businessType       새 업태 (null 허용)
     * @param businessItem       새 종목 (null 허용)
     * @param email              새 이메일 (null 허용)
     * @return {@code this} (체이닝용)
     * @throws IllegalArgumentException 형식 오류
     */
    public SupplierProfile update(
            String businessNumber,
            String subBusinessNumber,
            String companyName,
            String representativeName,
            String businessAddress,
            String businessType,
            String businessItem,
            String email) {
        if (businessNumber != null) {
            validateBusinessNumber(businessNumber);
            this.businessNumber = businessNumber.trim();
        }
        if (subBusinessNumber != null) {
            this.subBusinessNumber = subBusinessNumber.isBlank() ? null : subBusinessNumber.trim();
        }
        if (companyName != null) {
            validateNotBlank(companyName, "companyName");
            this.companyName = companyName.trim();
        }
        if (representativeName != null) {
            validateNotBlank(representativeName, "representativeName");
            this.representativeName = representativeName.trim();
        }
        if (businessAddress != null) {
            validateNotBlank(businessAddress, "businessAddress");
            if (businessAddress.length() > 500) {
                throw new IllegalArgumentException("businessAddress 는 최대 500자입니다");
            }
            this.businessAddress = businessAddress.trim();
        }
        // nullable 필드는 null 전달 시 명시적으로 null 로 설정 (기존값 덮어쓰기)
        this.businessType = businessType;
        this.businessItem = businessItem;
        this.email = email;
        return this;
    }

    /**
     * 기본 사업자 설정 (isPrimary = true).
     *
     * <p>서비스 레이어는 본 메서드 호출 전 기존 primary row 를 {@link #unmarkPrimary()} 처리해야 한다.
     *
     * @return {@code this}
     */
    public SupplierProfile markPrimary() {
        this.isPrimary = true;
        return this;
    }

    /**
     * 기본 사업자 해제 (isPrimary = false).
     *
     * <p>PATCH /{id}/primary 전환 시 기존 primary row 에 호출한다.
     *
     * @return {@code this}
     */
    public SupplierProfile unmarkPrimary() {
        this.isPrimary = false;
        return this;
    }

    /**
     * Soft Delete 검증 후 삭제 처리.
     *
     * <p>primary 사업자는 삭제 불가 — {@link BusinessException}(CONFLICT) 발생.
     *
     * @param actorUserId 삭제자 user-id
     * @throws BusinessException primary 사업자 삭제 시도 시
     */
    public void safeDelete(String actorUserId) {
        if (this.isPrimary) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "기본 사업자는 삭제할 수 없습니다. 다른 사업자를 기본으로 변경한 후 삭제하세요.");
        }
        markDeleted(actorUserId);
    }

    // =========================================================================
    // 내부 검증
    // =========================================================================

    private static void validateBusinessNumber(String businessNumber) {
        if (businessNumber == null || !businessNumber.matches("\\d{10}")) {
            throw new IllegalArgumentException("businessNumber 는 숫자 10자리여야 합니다: " + businessNumber);
        }
    }

    private static void validateNotBlank(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " 은(는) 필수입니다");
        }
    }
}
