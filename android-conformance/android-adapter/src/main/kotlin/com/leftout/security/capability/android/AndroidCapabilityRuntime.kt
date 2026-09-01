package com.leftout.security.capability.android

import com.leftout.security.capability.CapabilityGrant
import com.leftout.security.capability.ExecutionEvidence
import com.leftout.security.capability.GrantRequest
import com.leftout.security.capability.GrantSnapshot
import com.leftout.security.capability.Hashing
import com.leftout.security.capability.InvocationObservation
import com.leftout.security.capability.InvocationResult
import com.leftout.security.capability.OneUseCapabilityEngine
import java.util.concurrent.atomic.AtomicReference

data class SyntheticEligibilityResult(
    val accountId: String,
    val eligibility: String,
)

/**
 * Process-local bridge used by the API-36 service adapter.
 *
 * The prototype deliberately exposes explicit grant installation instead of
 * silently minting authority from an incoming AppFunction call. A production
 * app must back this interface with encrypted, crash-safe persistence and a
 * human approval surface.
 */
object AndroidCapabilityRuntime {
    const val FUNCTION_ID = "com.leftout.security.capability.executeOnce"

    private const val SCHEMA_DESCRIPTOR =
        "functionId=com.leftout.security.capability.executeOnce;" +
            "input={grant_id:string};additionalProperties=false;" +
            "output={account_id:string,eligibility:string,grant_id:string," +
            "receipt_id:string,receipt_sha256:string,disclaimer:string}"
    private const val INITIAL_BASELINE =
        "accountId=TRAINING-1042;eligibility=eligible;reviewed=false;" +
            "reviewCount=0;lastReviewedAt=null"

    val schemaSha256: String = Hashing.sha256Hex(SCHEMA_DESCRIPTOR)
    private val baselineSha256 = AtomicReference(Hashing.sha256Hex(INITIAL_BASELINE))
    private val engine = OneUseCapabilityEngine()

    fun installApprovedGrant(request: GrantRequest): CapabilityGrant = engine.issue(request)

    fun snapshot(grantId: String): GrantSnapshot? = engine.snapshot(grantId)

    fun currentBaselineSha256(): String = baselineSha256.get()

    internal fun invoke(
        grantId: String,
        observation: InvocationObservation,
    ): InvocationResult<SyntheticEligibilityResult> = engine.invoke(grantId, observation) {
        val before = baselineSha256.get()
        check(before == observation.baselineSha256) { "Baseline changed after atomic claim." }
        val value = SyntheticEligibilityResult("TRAINING-1042", "eligible")
        val after = baselineSha256.get()
        check(after == before) { "Synthetic state changed during execution." }
        ExecutionEvidence(
            value = value,
            outputSha256 = Hashing.sha256Hex(
                "accountId=${value.accountId};eligibility=${value.eligibility}",
            ),
            effectsSha256 = Hashing.sha256Hex("before=$before;after=$after;effects=none"),
        )
    }
}
