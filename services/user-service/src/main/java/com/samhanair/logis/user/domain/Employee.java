package com.samhanair.logis.user.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.security.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;

/**
 * Employee aggregate. The {@code id} is the canonical user UUID — assigned (not generated)
 * so it matches {@code auth-service.accounts.id} 1:1 when an auth account exists.
 * Ecount migration employees may keep {@code accountId} null until a login account is created.
 * Soft-deleted via {@link SQLRestriction}.
 *
 * <p>post-W5 backlog cleanup (DevOps user-service backlog 채택, D-P9-21) — 시간 의존 회귀 회피
 * 학습 (W4 slip-service 회고). 입사일 ({@link #hireDate}) 미입력 시 fixture 용 default 가
 * 필요한 호출자 (예: seed migration / dev fixture / 화면 default 표시) 는 아래 상수를 직접
 * 인용한다. 본 entity 자체는 {@code hireDate} 필수 (NotNull DB column) — 본 상수는 호출자가
 * "값을 모르는데 entity 부터 생성하는" 경우의 의도된 placeholder.
 *
 * <p>2026-01-01 = 회사 운영 시작 fictitious epoch. <strong>fixture 회귀 패턴 부재 보장</strong> —
 * 본 상수를 인용하는 호출자는 비교 단계 ({@code hireDate.isBefore(now)} 등) 자체가 없으므로 시간 진행에
 * 따른 테스트 회귀 발생 X. (참고: slip-service 의 도메인 의도 비교 {@code LocalDateTime.now().isAfter(tokenExpiresAt)}
 * 는 {@code Slip.java:713} + {@code DeliveryBatch.java:195} 2건 정상 — production 만료 검증 로직,
 * 테스트는 동적 fixture {@code LocalDateTime.now().minusHours(1)} + {@code ReflectionTestUtils.setField}
 * 적용 패턴.) production 진입 시점에는 입사일 입력 의무 또는 사용자 입력 화면 추가 (Phase 10
 * user-service 화면 슬라이스 시점 정식 처리).
 */
@Entity
@Getter
@Table(name = "employees")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Employee extends BaseEntity {

    /**
     * post-W5 backlog cleanup (DevOps, D-P9-21) — 시간 의존 회귀 회피용 fixture default.
     *
     * <p>입사일 미입력 시 의도된 placeholder. <strong>fixture 회귀 패턴 부재</strong> — 본 상수
     * 인용 호출자에 비교 패턴 자체가 없음. 실 production 진입 시 입사일 입력 의무 (또는 사용자 입력
     * 화면 추가). 본 상수는 seed / dev fixture / 화면 default 표시 용도이며, entity 의 {@code hireDate}
     * 자체는 NotNull DB column 으로 입력 의무 보존.
     */
    public static final LocalDate DEFAULT_HIRE_DATE = LocalDate.of(2026, 1, 1);

    @Id
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "account_id")
    private UUID accountId;

    @Column(name = "login_id", nullable = false, length = 50)
    private String loginId;

    @Column(name = "full_name", nullable = false, length = 50)
    private String fullName;

    @Column(name = "job_title", nullable = false, length = 30)
    private String position;

    @Enumerated(EnumType.STRING)
    @Column(name = "role_snapshot", nullable = false, length = 20)
    private Role roleSnapshot;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id", nullable = false)
    private Department department;

    @Column(name = "is_team_lead", nullable = false)
    private boolean teamLead;

    @Column(name = "hire_date", nullable = false)
    private LocalDate hireDate;

    @Column(name = "termination_date")
    private LocalDate terminationDate;

    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "phone", length = 20)
    private String phone;

    @Column(name = "ecount_code", length = 50)
    private String ecountCode;

    private Employee(UUID id, String loginId, String fullName, String position, Role roleSnapshot,
                     Department department, boolean teamLead, LocalDate hireDate, String email, String phone) {
        this.id = id;
        this.accountId = id;
        this.loginId = loginId;
        this.fullName = fullName;
        this.position = position;
        this.roleSnapshot = roleSnapshot;
        this.department = department;
        this.teamLead = teamLead;
        this.hireDate = hireDate;
        this.email = email;
        this.phone = phone;
    }

    public static Employee create(UUID id, String loginId, String fullName, String position, Role roleSnapshot,
                                  Department department, boolean teamLead, LocalDate hireDate,
                                  String email, String phone) {
        return new Employee(id, loginId, fullName, position, roleSnapshot,
                department, teamLead, hireDate, email, phone);
    }

    public void changeFullName(String fullName) {
        this.fullName = fullName;
    }

    public void changePosition(String position) {
        this.position = position;
    }

    public void changeDepartment(Department department) {
        this.department = department;
    }

    public void setTeamLead(boolean teamLead) {
        this.teamLead = teamLead;
    }

    public void changeEmail(String email) {
        this.email = email;
    }

    public void changePhone(String phone) {
        this.phone = phone;
    }

    public void updateRoleSnapshot(Role roleSnapshot) {
        this.roleSnapshot = roleSnapshot;
    }

    public void linkToAccount(UUID accountId) {
        this.accountId = accountId;
    }

    public void terminate(LocalDate date) {
        this.terminationDate = date;
    }
}
