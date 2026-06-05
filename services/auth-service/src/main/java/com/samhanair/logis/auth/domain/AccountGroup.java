package com.samhanair.logis.auth.domain;

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
 * 계정과 권한그룹의 M:N 배속 행.
 *
 * <p>활성 행 기준 {@code account_id + group_id} unique 로 중복 배속을 방지한다.
 */
@Entity
@Getter
@Table(name = "account_groups")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class AccountGroup extends BaseEntity {

    /** PK — UUID auto-generated. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 배속 대상 계정 UUID. */
    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    /** 배속할 권한그룹 UUID. */
    @Column(name = "group_id", nullable = false)
    private UUID groupId;

    public static AccountGroup assign(UUID accountId, UUID groupId) {
        AccountGroup accountGroup = new AccountGroup();
        accountGroup.accountId = accountId;
        accountGroup.groupId = groupId;
        return accountGroup;
    }
}
