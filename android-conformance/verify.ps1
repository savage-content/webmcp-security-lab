[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$prototypeRoot = $PSScriptRoot
$buildRoot = Join-Path $prototypeRoot 'build'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

function Resolve-KotlinCompiler {
    $command = Get-Command 'kotlinc.bat' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $candidates = @(
        'C:\Program Files\JetBrains\IntelliJ IDEA 2025.3.1.1\plugins\Kotlin\kotlinc\bin\kotlinc.bat',
        'C:\Program Files\Android\Android Studio\plugins\Kotlin\kotlinc\bin\kotlinc.bat'
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw 'Kotlin compiler not found. Install Kotlin CLI or an IDE bundle containing kotlinc.'
}

function Resolve-Java {
    if ($env:JAVA_HOME) {
        $candidate = Join-Path $env:JAVA_HOME 'bin\java.exe'
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    $command = Get-Command 'java.exe' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw 'java.exe not found.'
}

function Resolve-AndroidSdk {
    $candidates = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME)
    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

$kotlinCompiler = Resolve-KotlinCompiler
$kotlinHome = Split-Path (Split-Path $kotlinCompiler -Parent) -Parent
$kotlinStdlib = Join-Path $kotlinHome 'lib\kotlin-stdlib.jar'
if (-not (Test-Path -LiteralPath $kotlinStdlib)) {
    throw "Kotlin standard library not found at $kotlinStdlib"
}
$java = Resolve-Java

$coreSources = @(
    Get-ChildItem (Join-Path $prototypeRoot 'src\main\kotlin') -Filter '*.kt' -File -Recurse |
        ForEach-Object { $_.FullName }
)
$testSources = @(
    Get-ChildItem (Join-Path $prototypeRoot 'src\test\kotlin') -Filter '*.kt' -File -Recurse |
        ForEach-Object { $_.FullName }
)
$testJar = Join-Path $buildRoot 'conformance-tests.jar'

& $kotlinCompiler -classpath $kotlinStdlib @coreSources @testSources -include-runtime -d $testJar
if ($LASTEXITCODE -ne 0) { throw "Kotlin conformance compilation failed with exit code $LASTEXITCODE." }

& $java -jar $testJar
if ($LASTEXITCODE -ne 0) { throw "Conformance tests failed with exit code $LASTEXITCODE." }

$coreJar = Join-Path $buildRoot 'capability-core.jar'
& $kotlinCompiler -classpath $kotlinStdlib @coreSources -d $coreJar
if ($LASTEXITCODE -ne 0) { throw "Core compilation failed with exit code $LASTEXITCODE." }

$androidSdk = Resolve-AndroidSdk
if (-not $androidSdk) {
    Write-Warning 'Android SDK not found; skipped native adapter API check.'
    exit 0
}

$androidJarCandidates = @(
    (Join-Path $androidSdk 'platforms\android-36.1\android.jar')
    (Join-Path $androidSdk 'platforms\android-36\android.jar')
)
$androidJar = $androidJarCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $androidJar) {
    Write-Warning 'Android API 36 platform not found; skipped native adapter API check.'
    exit 0
}

$adapterSources = @(
    Get-ChildItem (Join-Path $prototypeRoot 'android-adapter\src\main\kotlin') -Filter '*.kt' -File -Recurse |
        ForEach-Object { $_.FullName }
)
$adapterJar = Join-Path $buildRoot 'android-adapter-api-check.jar'
& $kotlinCompiler -classpath "$coreJar;$androidJar;$kotlinStdlib" @adapterSources -d $adapterJar
if ($LASTEXITCODE -ne 0) { throw "Android adapter API check failed with exit code $LASTEXITCODE." }

$aapt2Candidates = @(
    Get-ChildItem (Join-Path $androidSdk 'build-tools') -Filter 'aapt2.exe' -File -Recurse |
        Sort-Object FullName -Descending |
        ForEach-Object { $_.FullName }
)
if ($aapt2Candidates.Count -gt 0) {
    $manifest = Join-Path $prototypeRoot 'android-adapter\src\main\AndroidManifest.xml'
    $manifestShell = Join-Path $buildRoot 'android-adapter-manifest-check.apk'
    & $aapt2Candidates[0] link -o $manifestShell -I $androidJar --manifest $manifest `
        --min-sdk-version 36 --target-sdk-version 36
    if ($LASTEXITCODE -ne 0) { throw "Android manifest check failed with exit code $LASTEXITCODE." }
}

Write-Output 'PASS Kotlin/JVM core tests and Android API-36 adapter compile check.'
