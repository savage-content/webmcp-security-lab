package com.leftout.security.capability.android

import android.app.appfunctions.AppFunctionException
import android.app.appfunctions.AppFunctionService
import android.app.appfunctions.ExecuteAppFunctionRequest
import android.app.appfunctions.ExecuteAppFunctionResponse
import android.app.appsearch.GenericDocument
import android.content.pm.PackageManager
import android.content.pm.SigningInfo
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import com.leftout.security.capability.Hashing
import com.leftout.security.capability.InvocationObservation
import com.leftout.security.capability.InvocationResult
import com.leftout.security.capability.RejectionCode
import com.leftout.security.capability.exactlyOneGrantId

/**
 * Thin API-36 boundary adapter. It derives caller identity from system-supplied
 * values, accepts only an opaque selector for a previously approved grant, and
 * delegates the atomic consume-before-execute rule to the platform-neutral core.
 */
class CapabilityAppFunctionService : AppFunctionService() {
    override fun onExecuteFunction(
        request: ExecuteAppFunctionRequest,
        callingPackage: String,
        callingPackageSigningInfo: SigningInfo,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<ExecuteAppFunctionResponse, AppFunctionException>,
    ) {
        if (cancellationSignal.isCanceled) {
            callback.onError(
                AppFunctionException(AppFunctionException.ERROR_CANCELLED, "Invocation was cancelled."),
            )
            return
        }
        if (request.functionIdentifier != AndroidCapabilityRuntime.FUNCTION_ID) {
            callback.onError(
                AppFunctionException(
                    AppFunctionException.ERROR_FUNCTION_NOT_FOUND,
                    "Unknown function identifier.",
                ),
            )
            return
        }

        val parameters = request.parameters
        if (parameters.propertyNames != setOf("grant_id")) {
            callback.onError(
                AppFunctionException(
                    AppFunctionException.ERROR_INVALID_ARGUMENT,
                    "Exactly one grant_id parameter is required.",
                ),
            )
            return
        }
        val grantId = exactlyOneGrantId(
            parameters.getPropertyStringArray("grant_id")?.asList(),
        )
        if (grantId == null) {
            callback.onError(
                AppFunctionException(
                    AppFunctionException.ERROR_INVALID_ARGUMENT,
                    "grant_id must contain exactly one non-empty string.",
                ),
            )
            return
        }

        val observation = runCatching {
            val signers = callingPackageSigningInfo.apkContentsSigners
            require(signers.size == 1) { "Exactly one current APK signer is required." }
            val packageInfo = packageManager.getPackageInfo(
                callingPackage,
                PackageManager.PackageInfoFlags.of(
                    PackageManager.GET_SIGNING_CERTIFICATES.toLong(),
                ),
            )
            InvocationObservation(
                packageName = callingPackage,
                signingCertificateSha256 = Hashing.sha256Hex(signers.single().toByteArray()),
                appVersionCode = packageInfo.longVersionCode,
                functionId = request.functionIdentifier,
                schemaSha256 = AndroidCapabilityRuntime.schemaSha256,
                baselineSha256 = AndroidCapabilityRuntime.currentBaselineSha256(),
            )
        }.getOrElse {
            callback.onError(
                AppFunctionException(
                    AppFunctionException.ERROR_DENIED,
                    "Caller identity could not be bound to the grant.",
                ),
            )
            return
        }

        when (val result = AndroidCapabilityRuntime.invoke(grantId, observation)) {
            is InvocationResult.Executed -> {
                val document = GenericDocument.Builder<GenericDocument.Builder<*>>(
                    "leftout-capability",
                    result.receipt.receiptId,
                    "CapabilityReceipt",
                )
                    .setPropertyString("account_id", result.value.accountId)
                    .setPropertyString("eligibility", result.value.eligibility)
                    .setPropertyString("grant_id", result.receipt.grantId)
                    .setPropertyString("receipt_id", result.receipt.receiptId)
                    .setPropertyString("receipt_sha256", result.receipt.receiptSha256)
                    .setPropertyString("disclaimer", result.receipt.disclaimer)
                    .build()
                callback.onResult(ExecuteAppFunctionResponse(document))
            }
            is InvocationResult.ExecutionFailed -> callback.onError(
                AppFunctionException(
                    AppFunctionException.ERROR_APP_UNKNOWN_ERROR,
                    "The consumed capability failed during controlled execution; " +
                        "receipt=${result.receipt.receiptId}",
                ),
            )
            is InvocationResult.Rejected -> callback.onError(
                AppFunctionException(
                    result.code.toAppFunctionError(),
                    "Capability rejected: ${result.code}.",
                ),
            )
        }
    }

    private fun RejectionCode.toAppFunctionError(): Int = when (this) {
        RejectionCode.UNKNOWN_GRANT -> AppFunctionException.ERROR_INVALID_ARGUMENT
        RejectionCode.REPLAY,
        RejectionCode.EXPIRED,
        RejectionCode.PACKAGE_NAME_DRIFT,
        RejectionCode.SIGNING_CERTIFICATE_DRIFT,
        RejectionCode.APP_VERSION_DRIFT,
        RejectionCode.FUNCTION_ID_DRIFT,
        RejectionCode.SCHEMA_DRIFT,
        RejectionCode.BASELINE_DRIFT,
        RejectionCode.GRANT_INTEGRITY_FAILURE,
        -> AppFunctionException.ERROR_DENIED
    }
}
