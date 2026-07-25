package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.accounting.util.CodefRefNormalizer;
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
import jakarta.persistence.Version;
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
     * 저장 당시 명시적 선택 범위("ALL"/"SELECTED"). #825 슬5 R1(개발책임자 결정 1) —
     * ref 목록만으로는 '전체 저장'(refs=[])과 '아직 미저장'을 구별할 수 없어 도입.
     * V64 마이그레이션으로 추가. 기존(본 슬라이스 이전) 행은 backfill 정책상 "SELECTED"로
     * 채워졌다(소급으로 ALL 단정 금지 — V64 마이그 주석 참조).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "scope_mode", nullable = false, length = 20)
    private CodefScopeMode scopeMode = CodefScopeMode.SELECTED;

    /** 같은 사용자·연결의 낡은 저장 요청을 구별하는 행 버전. API에는 잠금값으로만 노출한다. */
    @Version
    @Column(name = "version", nullable = false)
    private long version;

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
     * 선택 ref, 기본 가져오기 구분, 선택 범위 모드를 갱신한다.
     *
     * @return {@code this}
     */
    public UserCodefImportScope updateSelections(List<String> accountRefs, List<String> cardRefs,
                                                 List<String> loanRefs, CodefImportType defaultImportType,
                                                 CodefScopeMode scopeMode) {
        if (scopeMode == null) {
            throw new IllegalArgumentException("scopeMode 는 필수입니다");
        }
        this.accountRefSelections = CodefRefNormalizer.normalizeRefs(accountRefs);
        this.cardRefSelections = CodefRefNormalizer.normalizeRefs(cardRefs);
        this.loanRefSelections = CodefRefNormalizer.normalizeRefs(loanRefs);
        this.defaultImportType = defaultImportType == null ? CodefImportType.ALL : defaultImportType;
        this.scopeMode = scopeMode;
        return this;
    }

    private static void validateConnectedId(String connectedId) {
        if (connectedId == null || connectedId.isBlank()) {
            throw new IllegalArgumentException("연결 식별자는 필수입니다");
        }
        if (connectedId.trim().length() > 128) {
            throw new IllegalArgumentException("연결 식별자는 최대 128자입니다");
        }
    }
}
