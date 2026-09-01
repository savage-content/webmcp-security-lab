package com.leftout.security.capability

import java.time.Clock
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

/**
 * Process-local reference implementation of a one-use capability store.
 *
 * The ACTIVE -> CONSUMED compare-and-set occurs before [action] starts. A failed
 * action is still a consumed call and cannot be replayed.
 */
class OneUseCapabilityEngine(
    private val clock: Clock = Clock.systemUTC(),
    private val monotonicNowMillis: () -> Long = { System.nanoTime() / 1_000_000L },
) {
    private sealed interface InternalState {
        data object Active : InternalState
        data class Consumed(val claimedAtEpochMillis: Long) : InternalState
        data class Expired(val observedAtEpochMillis: Long) : InternalState
        data class Invalidated(
            val reason: RejectionCode,
            val observedAtEpochMillis: Long,
        ) : InternalState
    }

    private data class Entry(
        val grant: CapabilityGrant,
        val issuedMonotonicMillis: Long,
        val lifetimeMillis: Long,
        val state: AtomicReference<InternalState> = AtomicReference(InternalState.Active),
        val receipt: AtomicReference<CapabilityReceipt?> = AtomicReference(null),
    )

    private val entries = ConcurrentHashMap<String, Entry>()

    fun issue(request: GrantRequest): CapabilityGrant {
        val now = clock.millis()
        require(request.issuedAtEpochMillis <= now) { "A grant cannot be issued in the future." }
        require(request.expiresAtEpochMillis > now) { "A grant must be active when issued." }
        val issuedMonotonicMillis = monotonicNowMillis()

        val grantId = "grant_${Hashing.sha256Hex(request.canonical()).take(24)}"
        val grant = CapabilityGrant(
            protocol = CAPABILITY_PROTOCOL,
            grantId = grantId,
            grantSha256 = grantHash(grantId, request),
            binding = request.binding,
            maxCalls = request.maxCalls,
            issuedAtEpochMillis = request.issuedAtEpochMillis,
            expiresAtEpochMillis = request.expiresAtEpochMillis,
            issuanceNonce = request.issuanceNonce,
        )
        check(
            entries.putIfAbsent(
                grantId,
                Entry(
                    grant = grant,
                    issuedMonotonicMillis = issuedMonotonicMillis,
                    lifetimeMillis = request.expiresAtEpochMillis - now,
                ),
            ) == null,
        ) {
            "The issuance nonce produced a duplicate grant ID."
        }
        return grant
    }

    fun snapshot(grantId: String): GrantSnapshot? {
        val entry = entries[grantId] ?: return null
        val state = expireIfDue(entry)
        return GrantSnapshot(
            lifecycle = state.lifecycle(),
            terminalReason = when (state) {
                is InternalState.Invalidated -> state.reason
                is InternalState.Expired -> RejectionCode.EXPIRED
                else -> null
            },
            receipt = entry.receipt.get(),
        )
    }

    fun <T> invoke(
        grantId: String,
        observation: InvocationObservation,
        action: () -> ExecutionEvidence<T>,
    ): InvocationResult<T> {
        val entry = entries[grantId]
            ?: return InvocationResult.Rejected(null, RejectionCode.UNKNOWN_GRANT, null)

        if (!verifyGrant(entry.grant)) {
            invalidate(entry, RejectionCode.GRANT_INTEGRITY_FAILURE, clock.millis())
            return InvocationResult.Rejected(
                grantId,
                RejectionCode.GRANT_INTEGRITY_FAILURE,
                entry.state.get().lifecycle(),
            )
        }

        while (true) {
            when (val current = entry.state.get()) {
                is InternalState.Consumed ->
                    return InvocationResult.Rejected(
                        grantId,
                        RejectionCode.REPLAY,
                        GrantLifecycle.CONSUMED,
                    )
                is InternalState.Expired ->
                    return InvocationResult.Rejected(
                        grantId,
                        RejectionCode.EXPIRED,
                        GrantLifecycle.EXPIRED,
                    )
                is InternalState.Invalidated ->
                    return InvocationResult.Rejected(
                        grantId,
                        current.reason,
                        GrantLifecycle.INVALIDATED,
                    )
                InternalState.Active -> {
                    val claimedAt = clock.millis()
                    if (isExpired(entry, claimedAt, monotonicNowMillis())) {
                        if (entry.state.compareAndSet(current, InternalState.Expired(claimedAt))) {
                            return InvocationResult.Rejected(
                                grantId,
                                RejectionCode.EXPIRED,
                                GrantLifecycle.EXPIRED,
                            )
                        }
                        continue
                    }

                    val drift = firstDrift(entry.grant.binding, observation)
                    if (drift != null) {
                        if (entry.state.compareAndSet(
                                current,
                                InternalState.Invalidated(drift, claimedAt),
                            )
                        ) {
                            return InvocationResult.Rejected(
                                grantId,
                                drift,
                                GrantLifecycle.INVALIDATED,
                            )
                        }
                        continue
                    }

                    // The capability is irreversibly spent before controlled code runs.
                    if (!entry.state.compareAndSet(current, InternalState.Consumed(claimedAt))) {
                        continue
                    }
                    return executeConsumed(entry, observation, claimedAt, action)
                }
            }
        }
    }

    private fun <T> executeConsumed(
        entry: Entry,
        observation: InvocationObservation,
        claimedAt: Long,
        action: () -> ExecutionEvidence<T>,
    ): InvocationResult<T> {
        return try {
            val evidence = action()
            val receipt = createReceipt(
                grant = entry.grant,
                observation = observation,
                claimedAt = claimedAt,
                completedAt = clock.millis().coerceAtLeast(claimedAt),
                outputSha256 = evidence.outputSha256,
                effectsSha256 = evidence.effectsSha256,
                failureType = null,
            )
            check(entry.receipt.compareAndSet(null, receipt)) { "A consumed grant emitted two receipts." }
            InvocationResult.Executed(evidence.value, receipt)
        } catch (error: Throwable) {
            val receipt = createReceipt(
                grant = entry.grant,
                observation = observation,
                claimedAt = claimedAt,
                completedAt = clock.millis().coerceAtLeast(claimedAt),
                outputSha256 = null,
                effectsSha256 = null,
                failureType = error.javaClass.name,
            )
            check(entry.receipt.compareAndSet(null, receipt)) { "A consumed grant emitted two receipts." }
            InvocationResult.ExecutionFailed(receipt)
        }
    }

    private fun invalidate(entry: Entry, reason: RejectionCode, observedAt: Long) {
        entry.state.compareAndSet(
            InternalState.Active,
            InternalState.Invalidated(reason, observedAt),
        )
    }

    private fun expireIfDue(entry: Entry): InternalState {
        while (true) {
            val current = entry.state.get()
            if (current !is InternalState.Active) return current
            val observedAt = clock.millis()
            if (!isExpired(entry, observedAt, monotonicNowMillis())) return current
            val expired = InternalState.Expired(observedAt)
            if (entry.state.compareAndSet(current, expired)) return expired
        }
    }

    private fun isExpired(
        entry: Entry,
        wallNowMillis: Long,
        observedMonotonicMillis: Long,
    ): Boolean {
        val elapsedMillis = observedMonotonicMillis - entry.issuedMonotonicMillis
        return wallNowMillis < entry.grant.issuedAtEpochMillis ||
            wallNowMillis >= entry.grant.expiresAtEpochMillis ||
            elapsedMillis < 0 ||
            elapsedMillis >= entry.lifetimeMillis
    }

    private fun firstDrift(
        expected: CapabilityBinding,
        actual: InvocationObservation,
    ): RejectionCode? = when {
        actual.packageName != expected.packageName -> RejectionCode.PACKAGE_NAME_DRIFT
        actual.signingCertificateSha256 != expected.signingCertificateSha256 ->
            RejectionCode.SIGNING_CERTIFICATE_DRIFT
        actual.appVersionCode != expected.appVersionCode -> RejectionCode.APP_VERSION_DRIFT
        actual.functionId != expected.functionId -> RejectionCode.FUNCTION_ID_DRIFT
        actual.schemaSha256 != expected.schemaSha256 -> RejectionCode.SCHEMA_DRIFT
        actual.baselineSha256 != expected.baselineSha256 -> RejectionCode.BASELINE_DRIFT
        else -> null
    }

    companion object {
        fun verifyGrant(grant: CapabilityGrant): Boolean {
            if (grant.protocol != CAPABILITY_PROTOCOL || grant.maxCalls != 1) return false
            val request = runCatching {
                GrantRequest(
                    binding = grant.binding,
                    maxCalls = grant.maxCalls,
                    issuedAtEpochMillis = grant.issuedAtEpochMillis,
                    expiresAtEpochMillis = grant.expiresAtEpochMillis,
                    issuanceNonce = grant.issuanceNonce,
                )
            }.getOrNull() ?: return false
            val expectedId = "grant_${Hashing.sha256Hex(request.canonical()).take(24)}"
            return grant.grantId == expectedId &&
                grant.grantSha256 == grantHash(expectedId, request)
        }

        fun verifyReceipt(receipt: CapabilityReceipt, grant: CapabilityGrant): Boolean {
            if (!verifyGrant(grant)) return false
            val expectedObservedBindingSha256 = Hashing.sha256Hex(grant.binding.canonical())
            val hashesMatchOutcome = if (receipt.succeeded) {
                receipt.outputSha256 != null && receipt.effectsSha256 != null
            } else {
                receipt.outputSha256 == null && receipt.effectsSha256 == null
            }
            if (
                receipt.protocol != RECEIPT_PROTOCOL ||
                receipt.grantId != grant.grantId ||
                receipt.grantSha256 != grant.grantSha256 ||
                receipt.callNumber != 1 ||
                receipt.claimedAtEpochMillis < grant.issuedAtEpochMillis ||
                receipt.claimedAtEpochMillis >= grant.expiresAtEpochMillis ||
                receipt.completedAtEpochMillis < receipt.claimedAtEpochMillis ||
                receipt.succeeded != (receipt.failureType == null) ||
                !hashesMatchOutcome ||
                receipt.observedBindingSha256 != expectedObservedBindingSha256 ||
                receipt.disclaimer != RECEIPT_DISCLAIMER
            ) return false

            receipt.outputSha256?.let {
                if (runCatching { Hashing.requireSha256Hex(it, "outputSha256") }.isFailure) return false
            }
            receipt.effectsSha256?.let {
                if (runCatching { Hashing.requireSha256Hex(it, "effectsSha256") }.isFailure) return false
            }
            if (runCatching {
                    Hashing.requireSha256Hex(receipt.observedBindingSha256, "observedBindingSha256")
                    Hashing.requireSha256Hex(receipt.receiptSha256, "receiptSha256")
                }.isFailure
            ) return false

            val expectedHash = receiptHash(
                grant = grant,
                claimedAt = receipt.claimedAtEpochMillis,
                completedAt = receipt.completedAtEpochMillis,
                observedBindingSha256 = receipt.observedBindingSha256,
                outputSha256 = receipt.outputSha256,
                effectsSha256 = receipt.effectsSha256,
                failureType = receipt.failureType,
            )
            return receipt.receiptSha256 == expectedHash &&
                receipt.receiptId == "receipt_${expectedHash.take(24)}"
        }

        internal fun recomputeReceiptHash(
            receipt: CapabilityReceipt,
            grant: CapabilityGrant,
        ): String = receiptHash(
            grant = grant,
            claimedAt = receipt.claimedAtEpochMillis,
            completedAt = receipt.completedAtEpochMillis,
            observedBindingSha256 = receipt.observedBindingSha256,
            outputSha256 = receipt.outputSha256,
            effectsSha256 = receipt.effectsSha256,
            failureType = receipt.failureType,
        )

        private fun grantHash(grantId: String, request: GrantRequest): String = Hashing.sha256Hex(
            Hashing.canonical(
                "grantId" to grantId,
                "request" to request.canonical(),
            ),
        )

        private fun receiptHash(
            grant: CapabilityGrant,
            claimedAt: Long,
            completedAt: Long,
            observedBindingSha256: String,
            outputSha256: String?,
            effectsSha256: String?,
            failureType: String?,
        ): String = Hashing.sha256Hex(
            Hashing.canonical(
                "protocol" to RECEIPT_PROTOCOL,
                "grantId" to grant.grantId,
                "grantSha256" to grant.grantSha256,
                "callNumber" to 1,
                "claimedAtEpochMillis" to claimedAt,
                "completedAtEpochMillis" to completedAt,
                "observedBindingSha256" to observedBindingSha256,
                "outputSha256" to outputSha256,
                "effectsSha256" to effectsSha256,
                "succeeded" to (failureType == null),
                "failureType" to failureType,
                "disclaimer" to RECEIPT_DISCLAIMER,
            ),
        )

        private fun createReceipt(
            grant: CapabilityGrant,
            observation: InvocationObservation,
            claimedAt: Long,
            completedAt: Long,
            outputSha256: String?,
            effectsSha256: String?,
            failureType: String?,
        ): CapabilityReceipt {
            val observedBindingSha256 = Hashing.sha256Hex(observation.canonical())
            val hash = receiptHash(
                grant,
                claimedAt,
                completedAt,
                observedBindingSha256,
                outputSha256,
                effectsSha256,
                failureType,
            )
            return CapabilityReceipt(
                protocol = RECEIPT_PROTOCOL,
                receiptId = "receipt_${hash.take(24)}",
                receiptSha256 = hash,
                grantId = grant.grantId,
                grantSha256 = grant.grantSha256,
                callNumber = 1,
                claimedAtEpochMillis = claimedAt,
                completedAtEpochMillis = completedAt,
                observedBindingSha256 = observedBindingSha256,
                outputSha256 = outputSha256,
                effectsSha256 = effectsSha256,
                succeeded = failureType == null,
                failureType = failureType,
                disclaimer = RECEIPT_DISCLAIMER,
            )
        }

        private fun InternalState.lifecycle(): GrantLifecycle = when (this) {
            InternalState.Active -> GrantLifecycle.ACTIVE
            is InternalState.Consumed -> GrantLifecycle.CONSUMED
            is InternalState.Expired -> GrantLifecycle.EXPIRED
            is InternalState.Invalidated -> GrantLifecycle.INVALIDATED
        }
    }
}
