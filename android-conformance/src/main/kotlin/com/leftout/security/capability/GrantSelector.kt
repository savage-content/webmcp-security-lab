package com.leftout.security.capability

/** Returns one non-blank opaque grant selector and rejects every other shape. */
fun exactlyOneGrantId(values: List<String?>?): String? {
    if (values?.size != 1) return null
    return values.single()?.takeIf { it.isNotBlank() }
}
