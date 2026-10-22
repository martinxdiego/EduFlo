param([string]$OutputDirectory = '', [switch]$SecuritySanitizer)
$ErrorActionPreference = 'Stop'
$componentRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $componentRoot '../..'))
if (!$OutputDirectory) { $OutputDirectory = Join-Path $workspaceRoot '.tmp/qualification-native-build' }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if (!$outputRoot.StartsWith($workspaceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Build output must be in workspace' }
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (!(Test-Path -LiteralPath $vswhere)) { throw 'MSVC locator unavailable' }
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'MSVC unavailable' }
$vcvars = Join-Path $installation 'VC/Auxiliary/Build/vcvars64.bat'
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$components = @('collector', 'broker', 'bridge', 'observer-service', 'cleanup', 'protocol-tests', 'security-tests', 'observation-tests')
if ($SecuritySanitizer) { $components = @('security-tests', 'observation-tests') }
$savedQualificationPath = $env:PATH
try {
  # vcvars parses PATH through cmd.exe. Keep unrelated vendor quoting out of it.
  $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
foreach ($component in $components) {
  $source = Join-Path $componentRoot "$component/main.cpp"
  if (!(Test-Path -LiteralPath $source)) { throw "Missing source: $component" }
  $outputName = if ($SecuritySanitizer) { "$component-asan" } else { $component }
  $extension = if ($component -eq 'bridge') { 'node' } else { 'exe' }
  $binary = Join-Path $outputRoot "$outputName.$extension"
  $object = Join-Path $outputRoot "$outputName.obj"
  $sanitizerFlags = if ($SecuritySanitizer) { ' /fsanitize=address /Zi /Fd"' + (Join-Path $outputRoot "$outputName.pdb") + '"' } else { '' }
  if ($component -eq 'bridge') { $sanitizerFlags += ' /LD' }
  # Constant compiler switches; paths are quoted and no destructive shell operations occur.
  $command = 'call "' + $vcvars + '" >nul && cl /nologo /std:c++20 /W4 /WX /EHsc /GS /guard:cf /sdl' + $sanitizerFlags + ' /DUNICODE /D_UNICODE /D_WIN32_WINNT=0x0A00 /Fo"' + $object + '" /Fe"' + $binary + '" "' + $source + '" /link /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA /guard:cf /STACK:8388608'
  & $env:ComSpec /d /s /c $command
  if ($LASTEXITCODE -ne 0) { throw "Native build failed: $component" }
}
} finally { $env:PATH = $savedQualificationPath }
# Deliberately no driver installation, signing, service creation, elevation or launch.
