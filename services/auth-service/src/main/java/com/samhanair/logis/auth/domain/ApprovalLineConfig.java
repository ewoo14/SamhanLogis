package com.samhanair.logis.auth.domain;

import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
 * 전표 종류별 결재 역할 1건(선언적 카탈로그). 결재라인 설정 메뉴가 역할에 결재자/필수여부를 지정한다.
 *
 * <p>enforcement(게이트/명시 결재)는 본 config 를 소비하는 슬라이스(A2-2 등)가 수행한다. 본 엔티티는
 * {@code group_page_permissions} 를 건드리지 않는 선언적 정의만 보관한다(권한그룹 관리와 진실원 분리).
 */
@Entity
@Getter
@Table(name = "approval_line_config")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ApprovalLineConfig extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 전표 종류 — CollabDocumentType name (SLIP_OUTBOUND 등). */
    @Column(name = "document_type", nullable = false, updatable = false, length = 40)
    private String documentType;

    /** 역할 순서(0-base). reorder 도메인 메서드로만 변경. */
    @Column(name = "sequence", nullable = false)
    private int sequence;

    /** 역할 표시 명칭(작성자/출고자/검수자). rename 도메인 메서드로만 변경. */
    @Column(name = "label", nullable = false, length = 50)
    private String label;

    /** 결재자 식별 방식(CREATOR=전표 작성자 자동 / GROUP=권한 그룹 / USER). */
    @Enumerated(EnumType.STRING)
    @Column(name = "step_type", nullable = false, updatable = false, length = 20)
    private StepType stepType;

    /** GROUP 역할의 지정 권한 그룹(nullable — A2-1c 이후 approval_line_approver 로 이관, 후속 제거 예정). */
    @Column(name = "approver_group_id")
    private UUID approverGroupId;

    /** enforcement 에서 사용하는 안정 액션 앵커. 라벨/순서 변경과 무관하다. */
    @Column(name = "action_key", updatable = false, length = 40)
    private String actionKey;

    /** 결재 필수여부(E11). */
    @Column(name = "required", nullable = false)
    private boolean required;

    /** 표시·서명용 동적 결재 역할 생성. action_key 는 null 로 유지하여 authorize 게이트에 연결하지 않는다. */
    public static ApprovalLineConfig createDisplayStep(String documentType, int sequence, String label) {
        if (documentType == null || documentType.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "전표 종류(documentType)를 입력해야 합니다");
        }
        if (label == null || label.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "라벨은 비어 있을 수 없습니다");
        }
        ApprovalLineConfig role = new ApprovalLineConfig();
        role.documentType = documentType.trim();
        role.sequence = sequence;
        role.label = label.trim();
        role.stepType = StepType.GROUP;
        role.actionKey = null;
        role.required = true;
        return role;
    }

    /** GROUP 역할에 권한 그룹 지정. CREATOR 역할은 거부. */
    @Deprecated
    public void assignGroup(UUID groupId) {
        if (this.stepType != StepType.GROUP) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "권한 그룹은 그룹 결재단계에만 지정할 수 있습니다: " + this.label);
        }
        this.approverGroupId = groupId;
    }

    /** 권한 그룹 해제. */
    @Deprecated
    public void clearGroup() {
        this.approverGroupId = null;
    }

    /** 필수여부 변경. */
    public void changeRequired(boolean required) {
        this.required = required;
    }

    /**
     * 역할 라벨(표시 명칭)을 변경한다.
     *
     * <p>빈 문자열 또는 공백만으로 이루어진 라벨은 거부한다. 전달값은 trim 후 저장한다.
     *
     * @param label 변경할 라벨(공백 포함 불가)
     * @throws com.samhanair.logis.common.exception.BusinessException 빈 라벨인 경우
     */
    public void rename(String label) {
        if (label == null || label.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "라벨은 비어 있을 수 없습니다");
        }
        this.label = label.trim();
    }

    /**
     * 역할 순서(sequence)를 변경한다.
     *
     * <p>2-phase swap 에서 음수 임시값과 최종 0-base 인덱스 양쪽에서 호출된다.
     *
     * @param seq 새 순서 값(음수 포함 허용 — 2-phase 중간 단계)
     */
    public void changeSequence(int seq) {
        this.sequence = seq;
    }
}
