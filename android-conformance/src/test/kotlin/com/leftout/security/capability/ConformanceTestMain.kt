package com.leftout.security.capability

import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

private class MutableClock(var now: Long) : Clock() {
    override fun getZone(): ZoneId = ZoneOffset.UTC
    override fun withZone(zone: ZoneId): Clock = this
    override fun instant(): Instant = Instant.ofEpochMilli(now)
    override fun millis(): Long = now
}

private const val ISSUED_AT = 1_800_000_000_000L
private const val EXPIRES_AT = ISSUED_AT + 120_000L

private val certificateHash = Hashing.sha256Hex("certificate")
private val schemaHash = Hashing.sha256Hex("schema-v1")
private val baselineHash = Hashing.sha256Hex("baseline-v1")

private fun binding() = CapabilityBinding(
    packageName = "com.example.agent",
    signingCertificateSha256 = certificateHash,
    appVersionCode = 1042,
    functionId = "com.leftout.security.CAPABILITY_ONCE",
    schemaSha256 = schemaHash,
    baselineSha256 = baselineHash,
)

private fun observation(
    packageName: String = "com.example.agent",
    signingCertificateSha256: String = certificateHash,
    appVersionCode: Long = 1042,
    functionId: String = "com.leftout.security.CAPABILITY_ONCE",
    schemaSha256: String = schemaHash,
    baselineSha256: String = baselineHash,
) = InvocationObservation(
    packageName,
    signingCertificateSha256,
    appVersionCode,
    functionId,
    schemaSha256,
    baselineSha256,
)

private fun engineAndGrant(
    clock: MutableClock = MutableClock(ISSUED_AT),
    nonce: String = "deterministic-test-nonce",
    monotonicNowMillis: () -> Long = { System.nanoTime() / 1_000_000L },
): Pair<OneUseCapabilityEngine, CapabilityGrant> {
    val engine = OneUseCapabilityEngine(clock, monotonicNowMillis)
    val grant = engine.issue(
        GrantRequest(
            binding = binding(),
            maxCalls = 1,
            issuedAtEpochMillis = ISSUED_AT,
            expiresAtEpochMillis = EXPIRES_AT,
            issuanceNonce = nonce,
        ),
    )
    return engine to grant
}

private fun successfulEvidence(value: String = "eligible") = ExecutionEvidence(
    value = value,
    outputSha256 = Hashing.sha256Hex("output:$value"),
    effectsSha256 = Hashing.sha256Hex("effects:none"),
)

private inline fun test(name: String, block: () -> Unit) {
    try {
        block()
        println("PASS $name")
    } catch (error: Throwable) {
        println("FAIL $name: ${error.message}")
        throw error
    }
}

private fun rejectsWith(
    expected: RejectionCode,
    observed: InvocationObservation,
) {
    val (engine, grant) = engineAndGrant(nonce = "drift-$expected")
    var ran = false
    val result = engine.invoke(grant.grantId, observed) {
        ran = true
        successfulEvidence()
    }
    check(result is InvocationResult.Rejected && result.code == expected)
    check(result.lifecycle == GrantLifecycle.INVALIDATED)
    check(!ran)
    check(engine.snapshot(grant.grantId)?.receipt == null)
}

fun main() {
    test("grant binds the complete approved authority") {
        val (_, grant) = engineAndGrant()
        check(grant.protocol == CAPABILITY_PROTOCOL)
        check(grant.maxCalls == 1)
        check(grant.binding == binding())
        check(grant.expiresAtEpochMillis == EXPIRES_AT)
        check(OneUseCapabilityEngine.verifyGrant(grant))
        val (_, sameGrant) = engineAndGrant()
        check(sameGrant.grantId == grant.grantId)
        check(sameGrant.grantSha256 == grant.grantSha256)
    }

    test("claim is consumed before execution and emits a linked receipt") {
        val (engine, grant) = engineAndGrant()
        val calls = AtomicInteger()
        val result = engine.invoke(grant.grantId, observation()) {
            check(engine.snapshot(grant.grantId)?.lifecycle == GrantLifecycle.CONSUMED)
            calls.incrementAndGet()
            successfulEvidence()
        }
        check(result is InvocationResult.Executed)
        check(result.value == "eligible")
        check(result.receipt.grantId == grant.grantId)
        check(result.receipt.grantSha256 == grant.grantSha256)
        check(result.receipt.disclaimer == RECEIPT_DISCLAIMER)
        check(OneUseCapabilityEngine.verifyReceipt(result.receipt, grant))
        check(engine.snapshot(grant.grantId)?.receipt == result.receipt)

        val replay = engine.invoke(grant.grantId, observation()) {
            calls.incrementAndGet()
            successfulEvidence()
        }
        check(replay is InvocationResult.Rejected && replay.code == RejectionCode.REPLAY)
        check(calls.get() == 1)
    }

    test("exact expiry boundary rejects without execution") {
        val clock = MutableClock(ISSUED_AT)
        val (engine, grant) = engineAndGrant(clock)
        clock.now = EXPIRES_AT
        var ran = false
        val result = engine.invoke(grant.grantId, observation()) {
            ran = true
            successfulEvidence()
        }
        check(result is InvocationResult.Rejected && result.code == RejectionCode.EXPIRED)
        check(result.lifecycle == GrantLifecycle.EXPIRED)
        check(!ran)
        check(engine.snapshot(grant.grantId)?.receipt == null)

        var monotonicNow = 10_000L
        val monotonicClock = MutableClock(ISSUED_AT)
        val (monotonicEngine, monotonicGrant) = engineAndGrant(
            clock = monotonicClock,
            nonce = "monotonic-expiry",
            monotonicNowMillis = { monotonicNow },
        )
        monotonicClock.now = ISSUED_AT + 1
        monotonicNow += EXPIRES_AT - ISSUED_AT
        val monotonicExpiry = monotonicEngine.invoke(monotonicGrant.grantId, observation()) {
            successfulEvidence()
        }
        check(
            monotonicExpiry is InvocationResult.Rejected &&
                monotonicExpiry.code == RejectionCode.EXPIRED,
        )

        var rollbackMonotonicNow = 20_000L
        val rollbackClock = MutableClock(ISSUED_AT)
        val (rollbackEngine, rollbackGrant) = engineAndGrant(
            clock = rollbackClock,
            nonce = "wall-clock-rollback",
            monotonicNowMillis = { rollbackMonotonicNow },
        )
        rollbackClock.now = ISSUED_AT - 1
        rollbackMonotonicNow += 1
        val rollback = rollbackEngine.invoke(rollbackGrant.grantId, observation()) {
            successfulEvidence()
        }
        check(rollback is InvocationResult.Rejected && rollback.code == RejectionCode.EXPIRED)
        check(rollbackEngine.snapshot(rollbackGrant.grantId)?.receipt == null)
    }

    test("every bound dimension fails closed on drift") {
        rejectsWith(RejectionCode.PACKAGE_NAME_DRIFT, observation(packageName = "com.other.agent"))
        rejectsWith(
            RejectionCode.SIGNING_CERTIFICATE_DRIFT,
            observation(signingCertificateSha256 = Hashing.sha256Hex("other-certificate")),
        )
        rejectsWith(RejectionCode.APP_VERSION_DRIFT, observation(appVersionCode = 1043))
        rejectsWith(RejectionCode.FUNCTION_ID_DRIFT, observation(functionId = "other.function"))
        rejectsWith(
            RejectionCode.SCHEMA_DRIFT,
            observation(schemaSha256 = Hashing.sha256Hex("schema-v2")),
        )
        rejectsWith(
            RejectionCode.BASELINE_DRIFT,
            observation(baselineSha256 = Hashing.sha256Hex("baseline-v2")),
        )
    }

    test("concurrent callers execute exactly once") {
        val (engine, grant) = engineAndGrant(nonce = "concurrency")
        val workers = 32
        val pool = Executors.newFixedThreadPool(workers)
        val ready = CountDownLatch(workers)
        val start = CountDownLatch(1)
        val calls = AtomicInteger()
        val futures = (1..workers).map {
            pool.submit(Callable {
                ready.countDown()
                check(start.await(5, TimeUnit.SECONDS))
                engine.invoke(grant.grantId, observation()) {
                    calls.incrementAndGet()
                    successfulEvidence()
                }
            })
        }
        check(ready.await(5, TimeUnit.SECONDS))
        start.countDown()
        val results = futures.map { it.get(5, TimeUnit.SECONDS) }
        pool.shutdownNow()
        check(calls.get() == 1)
        check(results.count { it is InvocationResult.Executed } == 1)
        check(
            results.count {
                it is InvocationResult.Rejected && it.code == RejectionCode.REPLAY
            } == workers - 1,
        )
    }

    test("execution failure still consumes and receives a receipt") {
        val (engine, grant) = engineAndGrant(nonce = "failure")
        val result = engine.invoke<String>(grant.grantId, observation()) {
            check(engine.snapshot(grant.grantId)?.lifecycle == GrantLifecycle.CONSUMED)
            error("synthetic failure")
        }
        check(result is InvocationResult.ExecutionFailed)
        check(!result.receipt.succeeded)
        check(result.receipt.failureType == "java.lang.IllegalStateException")
        check(result.receipt.disclaimer == RECEIPT_DISCLAIMER)
        check(OneUseCapabilityEngine.verifyReceipt(result.receipt, grant))
        val replay = engine.invoke(grant.grantId, observation()) { successfulEvidence() }
        check(replay is InvocationResult.Rejected && replay.code == RejectionCode.REPLAY)
    }

    test("receipt tampering is detected") {
        val (engine, grant) = engineAndGrant(nonce = "tampering")
        val result = engine.invoke(grant.grantId, observation()) { successfulEvidence() }
        check(result is InvocationResult.Executed)
        val tampered = result.receipt.copy(outputSha256 = Hashing.sha256Hex("forged"))
        check(!OneUseCapabilityEngine.verifyReceipt(tampered, grant))
        val missingDisclaimer = result.receipt.copy(disclaimer = "")
        check(!OneUseCapabilityEngine.verifyReceipt(missingDisclaimer, grant))
        val wrongBinding = result.receipt.copy(
            observedBindingSha256 = Hashing.sha256Hex("different-observed-binding"),
        )
        val selfConsistentHash = OneUseCapabilityEngine.recomputeReceiptHash(wrongBinding, grant)
        val selfConsistentWrongBinding = wrongBinding.copy(
            receiptId = "receipt_${selfConsistentHash.take(24)}",
            receiptSha256 = selfConsistentHash,
        )
        check(!OneUseCapabilityEngine.verifyReceipt(selfConsistentWrongBinding, grant))
        val oneHashOnFailure = result.receipt.copy(
            effectsSha256 = null,
            succeeded = false,
            failureType = "synthetic.Failure",
        )
        val oneHashFailureDigest = OneUseCapabilityEngine.recomputeReceiptHash(
            oneHashOnFailure,
            grant,
        )
        val selfConsistentOneHashFailure = oneHashOnFailure.copy(
            receiptId = "receipt_${oneHashFailureDigest.take(24)}",
            receiptSha256 = oneHashFailureDigest,
        )
        check(!OneUseCapabilityEngine.verifyReceipt(selfConsistentOneHashFailure, grant))
    }

    test("widened, malformed, and ambiguous inputs are rejected") {
        val widened = runCatching {
            GrantRequest(binding(), 2, ISSUED_AT, EXPIRES_AT, "widened")
        }
        check(widened.isFailure)
        val malformed = runCatching {
            CapabilityBinding(
                "com.example.agent",
                "not-a-digest",
                1,
                "function",
                schemaHash,
                baselineHash,
            )
        }
        check(malformed.isFailure)
        check(exactlyOneGrantId(listOf("grant_once")) == "grant_once")
        check(exactlyOneGrantId(null) == null)
        check(exactlyOneGrantId(emptyList()) == null)
        check(exactlyOneGrantId(listOf("")) == null)
        check(exactlyOneGrantId(listOf("grant_one", "grant_two")) == null)
    }

    println("PASS all 8 conformance groups")
}
