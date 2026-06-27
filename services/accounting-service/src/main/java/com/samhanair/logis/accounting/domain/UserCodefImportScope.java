package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.accounting.web.dto.CodefImportType;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 사용자별 외부계정 가져오기 선택 scope.
 *
 * <p>한 사용자와 하나의 연결 식별자에는 활성 row 하나만 존재한다. 선택값은 화면에 노출 가능한
 * 은행계좌·카드·대출 비즈니스 ref 이며, 내부 UUID 가 아니다.
 */
@Entity
@Getter
@Table(name = "user_codef_import_scope")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class UserCodefImportScope extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 인증 사용자 UUID. API 응답에는 노출하지 않는다. */
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    /** 외부계정 연결 식별자. 평문 자격이 아닌 연결 참조값이다. */
    @Column(name = "connected_id", nullable = false, length = 128, updatable = false)
    private String connectedId;

    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "account_ref_selections", nullable = false, columnDefinition = "TEXT")
    private List<String> accountRefSelections = List.of();

    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "card_ref_selections", nullable = false, columnDefinition = "TEXT")
    private List<String> cardRefSelections = List.of();

    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "loan_ref_selections", nullable = false, columnDefinition = "TEXT")
    private List<String> loanRefSelections = List.of();

    @Enumerated(EnumType.STRING)
    @Column(name = "default_import_type", nullable = false, length = 20)
    private CodefImportType defaultImportType = CodefImportType.ALL;

    /**
     * 신규 사용자별 선택 scope 를 생성한다.
     *
     * @param userId      인증 사용자 UUID
     * @param connectedId 외부계정 연결 식별자
     * @return 신규 scope
     */
    public static UserCodefImportScope create(UUID userId, String connectedId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId 는 필수입니다");
        }
        validateConnectedId(connectedId);
        UserCodefImportScope scope = new UserCodefImportScope();
        scope.userId = userId;
        scope.connectedId = connectedId.trim();
        return scope;
    }

    /**
     * 선택 ref 와 기본 가져오기 구분을 갱신한다.
     *
     * @return {@code this}
     */
    public UserCodefImportScope updateSelections(List<String> accountRefs, List<String> cardRefs,
                                                 List<String> loanRefs, CodefImportType defaultImportType) {
        this.accountRefSelections = normalizeRefs(accountRefs);
        this.cardRefSelections = normalizeRefs(cardRefs);
        this.loanRefSelections = normalizeRefs(loanRefs);
        this.defaultImportType = defaultImportType == null ? CodefImportType.ALL : defaultImportType;
        return this;
    }

    private static List<String> normalizeRefs(List<String> refs) {
        if (refs == null || refs.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String ref : refs) {
            if (ref != null && !ref.isBlank()) {
                normalized.add(ref.trim());
            }
        }
        return List.copyOf(normalized);
    }

    private static void validateConnectedId(String connectedId) {
        if (connectedId == null || connectedId.isBlank()) {
            throw new IllegalArgumentException("connectedId 는 필수입니다");
        }
        if (connectedId.trim().length() > 128) {
            throw new IllegalArgumentException("connectedId 는 최대 128자입니다");
        }
    }
}
