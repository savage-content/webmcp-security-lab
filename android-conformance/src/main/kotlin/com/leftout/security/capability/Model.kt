package com.leftout.security.capability

const val CAPABILITY_PROTOCOL = "leftout-one-use-capability/1"
const val RECEIPT_PROTOCOL = "leftout-capability-receipt/1"
const val RECEIPT_DISCLAIMER =
    "This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system."
const val LEGACY_RECEIPT_DISCLAIMER =
    "This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system."

/** The complete authority and state identity approved by the human. */
data class CapabilityBinding(
    val packageName: String,
    val signingCertificateSha256: String,
    val appVersionCode: Long,
    val functionId: String,
    val schemaSha256: String,
    val baselineSha256: String,
) {
    init {
        require(packageName.isNotBlank()) { "packageName is required." }
        Hashing.requireSha256Hex(signingCertificateSha256, "signingCertificateSha256")
        require(appVersionCode >= 0) { "appVersionCode cannot be negative." }
        require(functionId.isNotBlank()) { "functionId is required." }
        Hashing.requireSha256Hex(schemaSha256, "schemaSha256")
        Hashing.requireSha256Hex(baselineSha256, "baselineSha256")
    }

    internal fun canonical(): String = Hashing.canonical(
        "packageName" to packageName,
        "signingCertificateSha256" to signingCertificateSha256,
        "appVersionCode" to appVersionCode,
        "functionId" to functionId,
        "schemaSha256" to schemaSha256,
        "baselineSha256" to baselineSha256,
    )
}

/** Freshly measured values supplied at the invocation boundary. */
data class InvocationObservation(
    val packageName: String,
    val signingCertificateSha256: String,
    val appVersionCode: Long,
    val functionId: String,
    val schemaSha256: String,
    val baselineSha256: String,
) {
    init {
        require(packageName.isNotBlank()) { "packageName is required." }
        Hashing.requireSha256Hex(signingCertificateSha256, "signingCertificateSha256")
        require(appVersionCode >= 0) { "appVersionCode cannot be negative." }
        require(functionId.isNotBlank()) { "functionId is required." }
        Hashing.requireSha256Hex(schemaSha256, "schemaSha256")
        Hashing.requireSha256Hex(baselineSha256, "baselineSha256")
    }

    internal fun canonical(): String = Hashing.canonical(
        "packageName" to packageName,
        "signingCertificateSha256" to signingCertificateSha256,
        "appVersionCode" to appVersionCode,
        "functionId" to functionId,
        "schemaSha256" to schemaSha256,
        "baselineSha256" to baselineSha256,
    )
}

data class GrantRequest(
    val binding: CapabilityBinding,
    val maxCalls: Int,
    val issuedAtEpochMillis: Long,
    val expiresAtEpochMillis: Long,
    val issuanceNonce: String,
) {
    init {
        require(maxCalls == 1) { "This protocol only permits maxCalls=1." }
        require(issuedAtEpochMillis >= 0) { "issuedAtEpochMillis cannot be negative." }
        require(expiresAtEpochMillis > issuedAtEpochMillis) {
            "expiresAtEpochMillis must be after issuedAtEpochMillis."
        }
        require(issuanceNonce.isNotBlank()) { "issuanceNonce is required." }
    }

    internal fun canonical(): String = Hashing.canonical(
        "protocol" to CAPABILITY_PROTOCOL,
        "binding" to binding.canonical(),
        "maxCalls" to maxCalls,
        "issuedAtEpochMillis" to issuedAtEpochMillis,
        "expiresAtEpochMillis" to expiresAtEpochMillis,
        "issuanceNonce" to issuanceNonce,
    )
}

data class CapabilityGrant(
    val protocol: String,
    val grantId: String,
    val grantSha256: String,
    val binding: CapabilityBinding,
    val maxCalls: Int,
    val issuedAtEpochMillis: Long,
    val expiresAtEpochMillis: Long,
    val issuanceNonce: String,
)

enum class GrantLifecycle {
    ACTIVE,
    CONSUMED,
    EXPIRED,
    INVALIDATED,
}

enum class RejectionCode {
    UNKNOWN_GRANT,
    REPLAY,
    EXPIRED,
    PACKAGE_NAME_DRIFT,
    SIGNING_CERTIFICATE_DRIFT,
    APP_VERSION_DRIFT,
    FUNCTION_ID_DRIFT,
    SCHEMA_DRIFT,
    BASELINE_DRIFT,
    GRANT_INTEGRITY_FAILURE,
}

data class ExecutionEvidence<T>(
    val value: T,
    val outputSha256: String,
    val effectsSha256: String,
) {
    init {
        Hashing.requireSha256Hex(outputSha256, "outputSha256")
        Hashing.requireSha256Hex(effectsSha256, "effectsSha256")
    }
}

data class CapabilityReceipt(
    val protocol: String,
    val receiptId: String,
    val receiptSha256: String,
    val grantId: String,
    val grantSha256: String,
    val callNumber: Int,
    val claimedAtEpochMillis: Long,
    val completedAtEpochMillis: Long,
    val observedBindingSha256: String,
    val outputSha256: String?,
    val effectsSha256: String?,
    val succeeded: Boolean,
    val failureType: String?,
    val disclaimer: String,
)

sealed interface InvocationResult<out T> {
    data class Executed<T>(val value: T, val receipt: CapabilityReceipt) : InvocationResult<T>

    data class ExecutionFailed(val receipt: CapabilityReceipt) : InvocationResult<Nothing>

    data class Rejected(
        val grantId: String?,
        val code: RejectionCode,
        val lifecycle: GrantLifecycle?,
    ) : InvocationResult<Nothing>
}

data class GrantSnapshot(
    val lifecycle: GrantLifecycle,
    val terminalReason: RejectionCode?,
    val receipt: CapabilityReceipt?,
)
