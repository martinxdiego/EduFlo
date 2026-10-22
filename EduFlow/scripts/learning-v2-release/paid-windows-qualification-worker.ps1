param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$RunId,
  [Parameter(Mandatory=$true)][string]$ParentRef,
  [Parameter(Mandatory=$true)][ValidateSet('rename','replace-junction','delete-child','dacl','owner','guard-remove','guard-change','child-directory','direct-reparse','remove-reparse','device-redirection')][string]$Action
)
$ErrorActionPreference = 'Stop'
if ($env:NODE_ENV -notin @('test','development') -or $RunId -notmatch '^test-paid-[a-z0-9-]+$') { throw 'BLOCKED' }
$fixtureRoot = [IO.Path]::GetFullPath($Root)
if (-not [IO.Path]::IsPathRooted($Root) -or [IO.Path]::GetFileName($fixtureRoot) -notlike 'paid-execution-test-*') { throw 'BLOCKED' }
$allowedParents = @('.', 'docs', 'docs/evaluation-results', 'docs/evaluation-results/execution-checkpoints', "docs/evaluation-results/execution-checkpoints/$RunId", 'docs/evaluation-results/human-review', "docs/evaluation-results/human-review/$RunId")
if ($ParentRef -notin $allowedParents) { throw 'BLOCKED' }
$targetPath = [IO.Path]::GetFullPath((Join-Path $fixtureRoot $ParentRef))
if ($targetPath -ne $fixtureRoot -and -not $targetPath.StartsWith($fixtureRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'BLOCKED' }
$outsideProbe = $fixtureRoot + '-outside-probe'
$guardPath = Join-Path $targetPath '.namespace-guard'
$actualSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$outcome = 'UNSUPPORTED'; $nativeCode = $null

# Attack-only native controls: no native artifact writer, provisioning, credential or elevation API.
if ($Action -in @('direct-reparse','remove-reparse')) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
public static class PaidQualificationAttack {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 static extern SafeFileHandle CreateFileW(string n,uint a,uint s,IntPtr p,uint d,uint f,IntPtr t);
 [DllImport("kernel32.dll", SetLastError=true)]
 static extern bool DeviceIoControl(SafeFileHandle h,uint c,byte[] b,int n,IntPtr o,int l,out int r,IntPtr x);
 public static int Reparse(string dir,string dest,bool remove) {
  using (var h=CreateFileW(dir,2,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
   if(h.IsInvalid) return Marshal.GetLastWin32Error();
   byte[] b;
   if(remove) { b=new byte[8]; Array.Copy(BitConverter.GetBytes(0xA0000003u),b,4); }
   else {
    var sub=Encoding.Unicode.GetBytes(@"\??\"+dest); var print=Encoding.Unicode.GetBytes(dest);
    b=new byte[16+sub.Length+2+print.Length+2];
    Array.Copy(BitConverter.GetBytes(0xA0000003u),b,4);
    Array.Copy(BitConverter.GetBytes((ushort)(b.Length-8)),0,b,4,2);
    Array.Copy(BitConverter.GetBytes((ushort)sub.Length),0,b,10,2);
    Array.Copy(BitConverter.GetBytes((ushort)(sub.Length+2)),0,b,12,2);
    Array.Copy(BitConverter.GetBytes((ushort)print.Length),0,b,14,2);
    Array.Copy(sub,0,b,16,sub.Length); Array.Copy(print,0,b,18+sub.Length,print.Length);
   }
   int returned; return DeviceIoControl(h,remove?0x900ACu:0x900A4u,b,b.Length,IntPtr.Zero,0,out returned,IntPtr.Zero)?0:Marshal.GetLastWin32Error();
  }
 }
}
'@
}
try {
  switch ($Action) {
    'rename' { Rename-Item -LiteralPath $targetPath -NewName ([IO.Path]::GetFileName($targetPath) + '-held') }
    'replace-junction' {
      Rename-Item -LiteralPath $targetPath -NewName ([IO.Path]::GetFileName($targetPath) + '-held')
      New-Item -ItemType Junction -Path $targetPath -Value $outsideProbe | Out-Null
    }
    'delete-child' { Remove-Item -LiteralPath $guardPath }
    'guard-remove' { Remove-Item -LiteralPath $guardPath }
    'guard-change' { [IO.File]::WriteAllText($guardPath, 'TEST-PAID-ATTACK') }
    'child-directory' { New-Item -ItemType Directory -Path (Join-Path $targetPath 'test-paid-unapproved-child') | Out-Null }
    'dacl' {
      $descriptor = Get-Acl -LiteralPath $targetPath
      $identity = [Security.Principal.SecurityIdentifier]::new($actualSid)
      $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, [Security.AccessControl.FileSystemRights]::FullControl, [Security.AccessControl.AccessControlType]::Allow)
      $descriptor.AddAccessRule($rule); Set-Acl -LiteralPath $targetPath -AclObject $descriptor
    }
    'owner' {
      $descriptor = Get-Acl -LiteralPath $targetPath
      $descriptor.SetOwner([Security.Principal.SecurityIdentifier]::new($actualSid))
      Set-Acl -LiteralPath $targetPath -AclObject $descriptor
    }
    'direct-reparse' { $nativeCode = [PaidQualificationAttack]::Reparse($targetPath, $outsideProbe, $false) }
    'remove-reparse' { $nativeCode = [PaidQualificationAttack]::Reparse($targetPath, $outsideProbe, $true) }
    'device-redirection' {
      # Device spelling/session binding is deployment specific. An unconfigured attack is not a denial/PASS.
      [pscustomobject]@{ outcome='UNSUPPORTED'; action=$Action; sid=$actualSid; code='DEVICE_BINDING_ADAPTER_REQUIRED' } | ConvertTo-Json -Compress
      exit 0
    }
  }
  if ($null -eq $nativeCode -or $nativeCode -eq 0) { $outcome='MUTATION_SUCCEEDED' }
  # 4390 is absence, not authority denial. Nonempty prevention needs the new
  # profile-bound positive-control oracle; this legacy adapter cannot assert it.
  elseif ($nativeCode -eq 5) { $outcome='DENIED' }
} catch {
  $nativeCode = $_.Exception.HResult -band 0xffff
  if ($nativeCode -eq 5 -or $_.CategoryInfo.Category -eq 'PermissionDenied') { $outcome='DENIED' }
  # Missing targets, invalid arguments and other errors are unsupported/ambiguous, never simulated success.
}
[pscustomobject]@{ outcome=$outcome; action=$Action; sid=$actualSid; code=$nativeCode } | ConvertTo-Json -Compress
