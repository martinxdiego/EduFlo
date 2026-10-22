param([switch]$Sanitizer)
$ErrorActionPreference = 'Stop'
$researchRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$researchOutput = [IO.Path]::GetFullPath((Join-Path $researchRoot '../../.tmp/replacement-identity-preflight'))
$appRoot = [IO.Path]::GetFullPath((Join-Path $researchRoot '../..'))
if (!$researchOutput.StartsWith($appRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Output outside workspace' }
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'MSVC unavailable; no installation attempted' }
$vcvars = Join-Path $installation 'VC/Auxiliary/Build/vcvars64.bat'
New-Item -ItemType Directory -Force -Path $researchOutput | Out-Null
$name = if ($Sanitizer) { 'preflight-asan' } else { 'preflight' }
$source = Join-Path $researchRoot 'preflight.cpp'
$object = Join-Path $researchOutput ($name + '.obj')
$binary = Join-Path $researchOutput ($name + '.exe')
$extra = if ($Sanitizer) { ' /fsanitize=address /Zi /Fd"' + (Join-Path $researchOutput ($name + '.pdb')) + '"' } else { '' }
$researchSavedPath = $env:PATH
try {
  $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
  $command = 'call "' + $vcvars + '" >nul && cl /nologo /std:c++20 /W4 /WX /EHsc /GS /guard:cf /sdl /DUNICODE /D_UNICODE /D_WIN32_WINNT=0x0A00' + $extra + ' /Fo"' + $object + '" /Fe"' + $binary + '" "' + $source + '" /link /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA /guard:cf'
  & $env:ComSpec /d /s /c $command
  if ($LASTEXITCODE -ne 0) { throw 'Research adapter compile failed' }
} finally { $env:PATH = $researchSavedPath }
# Compile only. No executable, capture, actor, service or driver is launched.
