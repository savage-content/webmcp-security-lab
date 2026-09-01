# 2026-09-01 prior-art delta review manifest

This documentation-only manifest fixes the exact implementation and test path
set used for the current-working-tree content anchor in `PRIOR_ART.md`. The
anchor was calculated from the files' raw bytes while the nested repository was
at HEAD `b79cf816c2943afc9b2764c7a0bae11d83d2258b`, with 22 tracked modified
paths and 45 untracked paths after the Chrome 152 compatibility fix:

`224522a46d475ce6fe8242c5abcff1c5e397e59628981332fa99e477283eb5a9`

The path list is ordered and uses repository-relative forward-slash spelling.
It deliberately excludes generated Android build artifacts, `.gitignore`,
Markdown documentation, and all files outside the reviewed implementation/test
scope.

```text
# BEGIN REVIEWED PATHS
android-conformance/android-adapter/src/main/AndroidManifest.xml
android-conformance/android-adapter/src/main/kotlin/com/leftout/security/capability/android/AndroidCapabilityRuntime.kt
android-conformance/android-adapter/src/main/kotlin/com/leftout/security/capability/android/CapabilityAppFunctionService.kt
android-conformance/src/main/kotlin/com/leftout/security/capability/GrantSelector.kt
android-conformance/src/main/kotlin/com/leftout/security/capability/Hashing.kt
android-conformance/src/main/kotlin/com/leftout/security/capability/Model.kt
android-conformance/src/main/kotlin/com/leftout/security/capability/OneUseCapabilityEngine.kt
android-conformance/src/test/kotlin/com/leftout/security/capability/ConformanceTestMain.kt
android-conformance/verify.ps1
components/lab/capability-negotiator.tsx
components/lab/lab-app.tsx
lib/capability-core/bindings.ts
lib/capability-core/canonical.ts
lib/capability-core/conformance.ts
lib/capability-core/grant.ts
lib/capability-core/index.ts
lib/capability-core/lease.ts
lib/capability-core/receipt.ts
lib/capability-core/types.ts
lib/capability-core/verification.ts
lib/lab/capability-negotiation.ts
lib/lab/schemas.ts
lib/lab/webmcp.ts
products/connector/bridge-coordinator.ts
products/connector/dashboard.ts
products/connector/mcp-server.ts
products/connector/receipt-store.ts
products/connector/server.ts
products/extension/background.js
products/extension/content-script.js
products/extension/manifest.json
products/extension/popup.css
products/extension/popup.html
products/extension/popup.js
products/extension/validation.js
scripts/live-mcp-call.mts
tests/capability-core.test.ts
tests/connector-bridge.test.ts
tests/connector-receipts.test.ts
tests/connector-server.test.ts
tests/extension-background.test.ts
tests/extension-manifest.test.ts
tests/extension-validation.test.ts
tests/fixtures/capability-receipt.ts
tests/webmcp-registration.test.ts
# END REVIEWED PATHS
```

## Reproduction

Run this from the nested `webmcp-security-lab` repository root in PowerShell.
For each listed file, it computes SHA-256 over the raw file bytes. It then
constructs one row as UTF-8 `path + NUL + lowercase digest + LF`, concatenates
the 45 rows in manifest order, and computes SHA-256 over that byte sequence.

```powershell
$manifestPath = 'docs/PRIOR_ART_DELTA_MANIFEST_2026-09-01.md'
$lines = Get-Content -LiteralPath $manifestPath
$begin = [Array]::IndexOf($lines, '# BEGIN REVIEWED PATHS')
$end = [Array]::IndexOf($lines, '# END REVIEWED PATHS')

if ($begin -lt 0 -or $end -le ($begin + 1)) {
  throw 'Reviewed-path markers are missing or invalid.'
}

$files = @($lines[($begin + 1)..($end - 1)])
if ($files.Count -ne 45 -or ($files | Sort-Object -Unique).Count -ne 45) {
  throw 'Expected exactly 45 unique reviewed paths.'
}

$rows = foreach ($path in $files) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing reviewed file: $path"
  }
  $digest = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  "$path$([char]0)$digest`n"
}

$sha256 = [Security.Cryptography.SHA256]::Create()
try {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($rows -join ''))
  [Convert]::ToHexString($sha256.ComputeHash($bytes)).ToLowerInvariant()
} finally {
  $sha256.Dispose()
}
```

Expected output:

```text
224522a46d475ce6fe8242c5abcff1c5e397e59628981332fa99e477283eb5a9
```

This is a scoped content anchor only. It is not a signature, trusted timestamp,
complete working-tree snapshot, provenance record, or evidence of authorship.
