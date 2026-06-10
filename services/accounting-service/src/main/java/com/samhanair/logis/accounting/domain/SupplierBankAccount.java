package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 공급자 은행계좌 — 사업자 프로필에 연결된 입금계좌 목록 도메인 엔티티.
 *
 * <p>한 사업자 프로필에 여러 계좌를 등록할 수 있으며, {@code displayOrder} 순으로 정렬하여
 * 세금계산서·거래명세서 인쇄 시 "입금계좌 안내" 영역에 출력된다.
 *
 * <p>계좌 변경은 항상 <b>replace-all</b> 시맨틱:
 * 기존 활성 rows 를 {@link BaseEntity#markDeleted(String)} 처리 후 새 rows 를 insert 한다.
 * (부분 업데이트 패턴 사용 금지 — 순서 정합성 보장)
 *
 * <p>BaseEntity 7 audit 컬럼 + Soft Delete ({@link BaseEntity#markDeleted(String)}).
 * 직접 setter 호출 금지 — 도메인 메서드 {@link #create} 만 사용.
 */
@Entity
@Getter
@Table(name = "supplier_bank_accounts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SupplierBankAccount extends BaseEntity {

    /** PK — UUID v4 자동 생성. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 연결된 사업자 프로필 UUID.
     * FK {@code supplier_profiles(id)}.
     */
    @Column(name = "supplier_profile_id", nullable = false, updatable = false)
    private UUID supplierProfileId;

    /**
     * 예금주 — 예: {@code （주）삼한공조시스템}.
     * 최대 50자.
     */
    @Column(name = "account_holder", nullable = false, length = 50)
    private String accountHolder;

    /**
     * 은행명 — 예: {@code 국민은행}.
     * 최대 50자.
     */
    @Column(name = "bank_name", nullable = false, length = 50)
    private String bankName;

    /**
     * 계좌번호 — 예: {@code 123456-78-901234}.
     * 최대 50자.
     */
    @Column(name = "account_number", nullable = false, length = 50)
    private String accountNumber;

    /**
     * 인쇄 표시 순서 — 오름차순 정렬.
     * replace-all 시 요청 배열 index 가 그대로 displayOrder 로 저장된다.
     */
    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    // =========================================================================
    // 팩토리 메서드
    // =========================================================================

    /**
     * 신규 은행계좌 생성.
     *
     * @param supplierProfileId 연결 사업자 프로필 UUID
     * @param accountHolder     예금주
     * @param bankName          은행명
     * @param accountNumber     계좌번호
     * @param displayOrder      표시 순서
     * @return 신규 {@link SupplierBankAccount}
     * @throws IllegalArgumentException 필수 인자 누락 시
     */
    public static SupplierBankAccount create(
            UUID supplierProfileId,
            String accountHolder,
            String bankName,
            String accountNumber,
            int displayOrder) {
        if (supplierProfileId == null) {
            throw new IllegalArgumentException("supplierProfileId 는 필수입니다");
        }
        validateNotBlank(accountHolder, "accountHolder");
        validateNotBlank(bankName, "bankName");
        validateNotBlank(accountNumber, "accountNumber");

        SupplierBankAccount account = new SupplierBankAccount();
        account.supplierProfileId = supplierProfileId;
        account.accountHolder = accountHolder.trim();
        account.bankName = bankName.trim();
        account.accountNumber = accountNumber.trim();
        account.displayOrder = displayOrder;
        return account;
    }

    // =========================================================================
    // 내부 검증
    // =========================================================================

    private static void validateNotBlank(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " 은(는) 필수입니다");
        }
    }
}
