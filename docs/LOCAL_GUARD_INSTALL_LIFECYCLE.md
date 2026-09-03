# Local Guard native-host installation lifecycle

## Status

The Windows lifecycle is **source ready as a non-mutating plan**, not installed,
signed, or approved for ordinary users. The planner emits a closed sequence for
install, update, exact rollback, and removal. It deliberately has no operating-
system executor, so running the test suite cannot write files, alter the
registry, start a host, or remove data.

## Fixed authority

Every plan binds all of the following before an executor may mutate the system:

- one exact 32-character Chrome Web Store extension ID;
- one bounded semantic native-host version;
- one expected executable SHA-256 digest;
- one expected Authenticode signing-certificate SHA-256 fingerprint;
- one fixed HKCU native-messaging host key;
- version-derived executable and manifest paths under one install root; and
- a separately rooted retained-receipt directory that removal cannot target.

The release metadata supplying the expected digest, certificate fingerprint,
and extension ID must itself come from an independently trusted release
channel. Values inside an untrusted candidate are not a trust root.

## Closed operations

| Action   | Required sequence                                                                                                    | Failure behavior                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Install  | Verify empty registration → digest → Authenticode identity → stage → manifest → register → probe → commit state      | Remove the new binding and staged release; no retry   |
| Update   | Verify current registration → candidate digest/signature → stage → switch manifest → probe → commit → prune oldest  | Restore the prior binding and state; no retry         |
| Rollback | Verify current registration → reverify exact retained previous executable → switch manifest → probe → commit        | Restore the pre-rollback binding and state; no retry  |
| Remove   | Verify current registration → unregister → revoke sessions → stop host → remove release files and lifecycle state   | Remain unregistered and resume removal; never restore |

All operations are structured enum values, not shell commands or caller-
supplied scripts. The plan refuses drive roots, overlapping install/receipt
trees, in-place candidate sources, wildcard extension identities, malformed
hashes, ambiguous current/previous versions, non-newer updates, and rollback
without an exact retained previous release.

## Receipt preservation

The retained-receipt root must be a separate directory tree. It never appears
in a `remove-file` operation. Uninstall closes browser authority first but does
not silently destroy the learner's evidence. A future user-facing uninstaller
must offer a separate, explicit evidence-deletion choice with its own scope and
confirmation.

## What remains

`products/native-host/lifecycle-plan.ts` and its tests close the planning and
rollback semantics only. Product release still requires:

1. a reviewed Windows executor that rechecks the expected registry state,
   digest, and Authenticode chain immediately before each mutation;
2. a signed native-host executable and independently published trust metadata;
3. the final Chrome Web Store extension ID and signed extension candidate;
4. crash-safe journaling and power-loss recovery tests for the executor;
5. clean-machine install, update, rollback, disable, repair, and uninstall
   acceptance on every supported Windows/Chrome combination; and
6. human authorization at action time for each mutating lifecycle operation.

Until those controls are complete, `install_update_rollback_removal` remains
`source_ready`, never `verified`.

## Verification

```powershell
npm test -- tests/native-host-lifecycle-plan.test.ts
```

The test vectors cover verification ordering, exact registry binding, retained
rollback state, fail-closed removal, receipt preservation, path separation,
identity rejection, and no automatic retry.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
