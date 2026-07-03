# E3 S1 CashReceipt Verification

Date: 2026-07-03

## Codex Review Fix Verification

Command:

```powershell
.\gradlew.bat --rerun-tasks :services:accounting-service:test --tests "com.samhanair.logis.accounting.it.CashReceiptControllerIT" --tests "com.samhanair.logis.accounting.editrequest.lock.AccountingLockPoliciesTest" --tests "com.samhanair.logis.accounting.service.Mig9CashJournalServiceTest" :services:auth-service:test --tests "com.samhanair.logis.auth.it.AuthFlywayV80SeedIT"
```

Result:

```text
BUILD SUCCESSFUL in 49s
28 actionable tasks: 28 executed
```

Coverage notes:
- CashReceipt CRUD and lifecycle IT now uses `partnerCode` input, `slipNo` query identity, and asserts response `id`/`partnerId` absence.
- Status guard cases cover DRAFT cancel, confirm re-call, re-cancel, confirm after cancel, and CONFIRMED/CANCELLED delete rejection.
- Mig9 cash journal regression keeps receipt generation limited to `DEPOSIT_REPORT`.
- Auth V80 seed IT was rerun without Gradle cache in the same command.
