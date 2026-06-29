package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.domain.codef.CodefBusinessType;
import com.samhanair.logis.accounting.domain.codef.CodefConnection;
import com.samhanair.logis.accounting.domain.codef.CodefConnectionStatus;
import com.samhanair.logis.accounting.domain.codef.CodefInstitutionStatus;
import com.samhanair.logis.accounting.domain.codef.CodefRegisteredInstitution;
import com.samhanair.logis.accounting.repository.CodefConnectionRepository;
import com.samhanair.logis.accounting.repository.CodefRegisteredInstitutionRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/** CODEF 연결 엔티티와 V47 제약 통합 테스트. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CodefConnectionRepositoryIT extends AbstractPostgresIT {

    @Autowired private CodefConnectionRepository connectionRepository;
    @Autowired private CodefRegisteredInstitutionRepository institutionRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void clean() {
        jdbcTemplate.update("DELETE FROM codef_registered_institution");
        jdbcTemplate.update("DELETE FROM codef_connection");
    }

    @Test
    @DisplayName("CODEF 연결과 등록 기관은 저장·조회되고 soft-delete row는 제외된다")
    void saveAndSoftDelete() {
        CodefConnection connection = connectionRepository.save(
                CodefConnection.create("conn-repo", CodefConnectionStatus.ACTIVE));
        CodefRegisteredInstitution institution = institutionRepository.save(CodefRegisteredInstitution.create(
                connection,
                CodefBusinessType.BANK,
                "0004",
                "****1234",
                "주거래",
                CodefInstitutionStatus.ACTIVE));

        assertThat(connectionRepository.findFirstByIsDeletedFalseOrderByCreatedAtAsc())
                .hasValueSatisfying(found -> assertThat(found.getConnectedId()).isEqualTo("conn-repo"));
        assertThat(institutionRepository.findByConnectionAndIsDeletedFalseOrderByRegisteredAtDesc(connection))
                .extracting(CodefRegisteredInstitution::getOrganizationCode)
                .containsExactly("0004");

        institution.markDeleted("repo-test");
        institutionRepository.saveAndFlush(institution);

        assertThat(institutionRepository.findByConnectionAndIsDeletedFalseOrderByRegisteredAtDesc(connection)).isEmpty();
    }

    @Test
    @DisplayName("V47 CHECK 제약은 잘못된 status와 business_type을 거부한다")
    void checkConstraintsRejectInvalidEnumValues() {
        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO codef_connection
                    (connected_id, status, created_at, created_by, is_deleted)
                VALUES
                    ('conn-invalid', 'PENDING', ?, 'test', false)
                """, Timestamp.from(Instant.now())))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO codef_connection
                    (connected_id, status, created_at, created_by, is_deleted)
                VALUES
                    (NULL, 'ACTIVE', ?, 'test', false)
                """, Timestamp.from(Instant.now())))
                .isInstanceOf(DataIntegrityViolationException.class);

        CodefConnection connection = connectionRepository.saveAndFlush(
                CodefConnection.create("conn-valid", CodefConnectionStatus.ACTIVE));

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO codef_registered_institution
                    (connection_id, business_type, organization_code, status, registered_at,
                     created_at, created_by, is_deleted)
                VALUES
                    (?, 'INSURANCE', '0004', 'ACTIVE', ?, ?, 'test', false)
                """, connection.getId(), Timestamp.from(Instant.now()), Timestamp.from(Instant.now())))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
