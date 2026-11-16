param([switch]$SkipWebBuild)
$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectDirectory
$androidSdkDirectory = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$androidJavaDirectory = $env:STEAKUP_JAVA_HOME
if (-not $androidJavaDirectory) {
    $androidJavaDirectory = (Get-ChildItem -LiteralPath "$env:USERPROFILE/.cache/steakup-android/jdk21" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
if (-not $androidJavaDirectory -or -not (Test-Path -LiteralPath "$androidJavaDirectory/bin/java.exe")) { throw 'Configure STEAKUP_JAVA_HOME com o caminho do JDK 21.' }
if (-not (Test-Path -LiteralPath "$androidSdkDirectory/platforms/android-36/android.jar")) { throw 'Android SDK 36 não encontrado. Configure ANDROID_HOME e instale os pacotes necessários.' }
# Alterações limitadas a este processo; não muda o Java padrão do computador.
$env:JAVA_HOME = $androidJavaDirectory
$env:ANDROID_HOME = $androidSdkDirectory
[System.IO.File]::WriteAllText((Join-Path $projectDirectory 'android/local.properties'), "sdk.dir=$($androidSdkDirectory.Replace('\','/'))`n", (New-Object System.Text.UTF8Encoding($false)))
if (-not $SkipWebBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Falha no build web.' }
}
& node node_modules/@capacitor/cli/bin/capacitor sync android
if ($LASTEXITCODE -ne 0) { throw 'Falha ao sincronizar Android.' }
& ./android/gradlew.bat --project-dir android assembleRelease --no-daemon --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Falha na compilação Android.' }
& node scripts/sign-apk.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falha na assinatura do APK.' }
