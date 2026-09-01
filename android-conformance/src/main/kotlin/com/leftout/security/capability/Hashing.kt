package com.leftout.security.capability

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/** Dependency-free SHA-256 and unambiguous canonical field encoding. */
object Hashing {
    private val sha256Pattern = Regex("^[0-9a-f]{64}$")

    fun sha256Hex(value: String): String = sha256Hex(value.toByteArray(StandardCharsets.UTF_8))

    fun sha256Hex(value: ByteArray): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value)
            .joinToString(separator = "") { byte -> "%02x".format(byte.toInt() and 0xff) }

    fun requireSha256Hex(value: String, fieldName: String): String {
        require(sha256Pattern.matches(value)) { "$fieldName must be a lowercase SHA-256 digest." }
        return value
    }

    /**
     * Encodes named fields without delimiter ambiguity. Field order remains significant.
     * Every name and value is prefixed with its UTF-16 character count.
     */
    fun canonical(vararg fields: Pair<String, Any?>): String = buildString {
        for ((name, rawValue) in fields) {
            val value = rawValue?.toString() ?: "null"
            append(name.length).append(':').append(name)
            append(value.length).append(':').append(value)
        }
    }
}
