# Android AppFunctions Conformance Prototype

This directory is an isolated Android-facing conformance spike for the one-use
capability protocol. It does not modify or ship the WebMCP lab.

**Publish boundary (2026-09-01): conformance only.** This directory is outside
the web/connector MVP runtime and is not evidence of a discoverable,
device-invokable, or publicly deployed Android AppFunction.

## Proven here

The dependency-free Kotlin/JVM core binds every grant to:

- caller package name;
- the current APK signing-certificate SHA-256 digest;
- application version code;
- AppFunction identifier;
- hand-authored prototype function-schema descriptor SHA-256 digest;
- current controlled-state baseline SHA-256 digest;
- `maxCalls=1`; and
- an absolute expiry instant.

`OneUseCapabilityEngine.invoke` performs an atomic `ACTIVE -> CONSUMED`
compare-and-set before calling controlled application code. It rejects replay,
the exact expiry boundary, and drift in each bound value. Success and controlled
failure both produce a receipt linked to the grant ID and grant hash. Receipt
self-consistency can be recomputed without Android or network dependencies, and
every receipt carries the required assessment disclaimer. These process-local,
unkeyed hashes do not establish signer identity or external provenance.

Expiry enforcement combines the absolute wall-clock boundary with a
process-local monotonic lifetime. A backward wall-clock jump fails closed; it
cannot extend a grant or produce a receipt dated before issuance.

The test runner includes a 32-caller race and proves that exactly one caller can
reach the action. Other deterministic tests cover each drift dimension, expiry,
wall-clock rollback, replay, failure-after-consumption, receipt tampering,
ambiguous selectors, and `maxCalls` widening.

The Kotlin tests are semantic conformance tests with Android-specific package,
certificate, version, function, schema, and baseline bindings. They do not
consume the TypeScript hash vector and do not prove byte-for-byte protocol or
hash interoperability with the browser/connector implementation.

Run on Windows PowerShell:

```powershell
./verify.ps1
```

The script uses an installed Kotlin compiler and Java runtime. If Android API 36
is installed, it also compiles the boundary adapter against `android.jar` and
validates its manifest with `aapt2`.

The latest local run on 2026-09-03 passed all eight Kotlin/JVM conformance
groups and the Android API-36 adapter compile/manifest check. Immediately before
that run, `adb devices -l` started the local ADB daemon and returned an empty
device list. This proves repeatable source conformance in this workstation, not
device registration, discovery, invocation, or receipt behavior.

## Android adapter boundary

`CapabilityAppFunctionService` directly extends the API-36 platform
`android.app.appfunctions.AppFunctionService`. It:

1. accepts exactly one non-empty opaque selector value, `grant_id`, which cannot
   widen the authority already fixed in the installed grant;
2. obtains package name and signing information from the system callback;
3. obtains the installed version code from `PackageManager`;
4. supplies a fixed schema hash and freshly read baseline hash;
5. invokes the platform-neutral atomic core; and
6. returns the synthetic result with the linked receipt identifiers.

Multiple current APK signers fail closed because this prototype binds one exact
certificate digest. An execution failure remains consumed and returns its receipt
identifier through the error path.

## Deliberate limit: not yet a device-invokable AppFunction

The checked-in manifest declares the service permission and intent-filter but
deliberately omits AppFunction metadata. Therefore the APK shell is not
discoverable or invokable as an AppFunction and must not be represented as a
working Android integration.

The exact local blocker, reconfirmed on 2026-09-03, is:

- Android platform SDK 36 and 36.1 are installed and sufficient to type-check
  `AppFunctionService`;
- no Gradle executable or Gradle wrapper distribution is installed;
- no cached `androidx.appfunctions:appfunctions:1.0.0-alpha10` (or newer),
  `appfunctions-compiler`, or compatible KSP/Android Gradle Plugin toolchain is
  present; and
- no Android device or emulator is connected through ADB.

Current Android guidance requires the Jetpack AppFunctions library and KSP to
generate the concrete service bridge and v2 XML metadata. Fetching that preview
toolchain and running its generated output on Android 16 is a separate integration
step. This API compile check is not equivalent to registration, discovery, policy
allowance, or invocation.

Authoritative integration references:

- <https://developer.android.com/ai/appfunctions/add-appfunctions>
- <https://developer.android.com/reference/androidx/appfunctions/AppFunctionServiceEntryPoint>
- <https://developer.android.com/reference/android/app/appfunctions/AppFunctionService>

## Production gaps

This conformance runtime is process-local. A production adapter needs encrypted,
crash-safe grant and receipt persistence, authenticated receipt signing or
anchoring, a human approval UI that installs the exact request, process-death
recovery without restoring spent authority, Android instrumentation tests, and an
on-device `adb shell cmd app_function` discovery and single-invocation proof. No
universal Android, Gemini, browser, or WebMCP support claim follows from this
prototype.

This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.
