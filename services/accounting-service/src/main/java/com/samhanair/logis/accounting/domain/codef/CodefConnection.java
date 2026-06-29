package com.samhanair.logis.accounting.domain.codef;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 회사 단위 CODEF connectedId 연결.
 *
 * <p>실 로그인 자격은 저장하지 않고, CODEF가 발급한 연결 식별자와 상태만 보관한다.
 */
@Entity
@Getter
@Table(name = "codef_connection")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class CodefConnection extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "connected_id", length = 128)
    private String connectedId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private CodefConnectionStatus status;

    /**
     * CODEF 연결 row를 생성한다.
     *
     * @param connectedId CODEF 연결 식별자
     * @param status      연결 상태
     * @return 신규 연결
     */
    public static CodefConnection create(String connectedId, CodefConnectionStatus status) {
        CodefConnection connection = new CodefConnection();
        connection.update(connectedId, status);
        return connection;
    }

    /**
     * CODEF 연결 상태를 갱신한다.
     *
     * @param connectedId CODEF 연결 식별자
     * @param status      연결 상태
     */
    public void update(String connectedId, CodefConnectionStatus status) {
        this.connectedId = normalizeNullable(connectedId);
        this.status = status == null ? CodefConnectionStatus.ERROR : status;
    }

    private static String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
