package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.accounting.util.CodefRefNormalizer;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 사용자별 입출금내역 계좌/카드 label 필터.
 *
 * <p>선택값은 화면에 노출 가능한 비즈니스 label 이며 내부 UUID 가 아니다. 빈 배열은 전체 선택을 의미한다.
 */
@Entity
@Getter
@Table(name = "user_bank_txn_filter")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class UserBankTxnFilter extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 인증 사용자 UUID. API 응답에는 노출하지 않는다. */
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "account_labels", nullable = false, columnDefinition = "TEXT")
    private List<String> accountLabels = List.of();

    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "card_labels", nullable = false, columnDefinition = "TEXT")
    private List<String> cardLabels = List.of();

    /**
     * 사용자별 필터 row 를 생성한다.
     *
     * @param userId 인증 사용자 UUID
     * @return 신규 필터 row
     */
    public static UserBankTxnFilter create(UUID userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId 는 필수입니다");
        }
        UserBankTxnFilter filter = new UserBankTxnFilter();
        filter.userId = userId;
        return filter;
    }

    /**
     * 계좌/카드 label 선택을 갱신한다.
     *
     * @return {@code this}
     */
    public UserBankTxnFilter updateLabels(List<String> accountLabels, List<String> cardLabels) {
        this.accountLabels = CodefRefNormalizer.normalizeRefs(accountLabels);
        this.cardLabels = CodefRefNormalizer.normalizeRefs(cardLabels);
        return this;
    }
}
