param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Payload)
$ErrorActionPreference='Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$work = [IO.Path]::GetFullPath((Join-Path $repo '../../work'))
$fixture = Join-Path $work ('native-installer-'+[guid]::NewGuid().ToString('N'))
$appDir = Join-Path $fixture 'app'
$dataDir = Join-Path $fixture 'userdata'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vexel.Installer.Test_is1'
$legacy = 'HKCU:\Software\Vexel.Legacy.Test'
$legacyUninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vexel.Legacy.Test'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Vexel Installer Test.lnk'
$info=[Diagnostics.FileVersionInfo]::GetVersionInfo($Installer)
if($info.ProductName.Trim() -ne 'Vexel Installer Test'){throw 'Only the isolated TestBuild installer may be verified by this script.'}
foreach($target in @($key,$legacy,$legacyUninstall,$shortcut)){if(Test-Path -LiteralPath $target){throw "Existing test target was retained: $target"}}
if(-not $appDir.StartsWith($work+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected fixture path'}
New-Item -ItemType Directory -Path $appDir,$dataDir -Force | Out-Null
$settings='{"onboarding":"completed","theme":{"fontSize":17},"privacy":{"mode":"always"}}'
[IO.File]::WriteAllText((Join-Path $dataDir 'settings.json'),$settings)
[IO.File]::WriteAllText((Join-Path $appDir 'unrelated-user-file.txt'),'KEEP_USER_DATA')
$env:LUMA_TEST_USERDATA=$dataDir
$checks=0
function Check([bool]$Passed,[string]$Message){if(-not $Passed){throw $Message};$script:checks++;Write-Output "PASS $Message"}
function Install([string]$Tasks,[string]$Log){
  $arguments=@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',('/DIR="'+$appDir+'"'),('/TASKS="'+$Tasks+'"'),('/LOG="'+(Join-Path $fixture $Log)+'"'))
  $p=Start-Process -FilePath $Installer -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
  Check ($p.ExitCode -eq 0) 'native installer exits successfully'
}
Install 'startmenu' 'first.log'
Check (Test-Path -LiteralPath (Join-Path $appDir 'Vexel.exe')) 'application installed into the selected folder'
Check ((Get-FileHash -LiteralPath (Join-Path $appDir 'Vexel.exe')).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Payload 'Vexel.exe')).Hash) 'installed executable matches the verified payload'
$registration=Get-ItemProperty -LiteralPath $key
Check ($registration.DisplayVersion -eq '1.8.0') 'current-user app registration has the right version'
Check ($registration.InstallLocation.TrimEnd('\') -eq $appDir) 'registration targets only the isolated install directory'
Check (Test-Path -LiteralPath $shortcut) 'selected Start menu shortcut is created'
$shell=New-Object -ComObject WScript.Shell
Check ($shell.CreateShortcut($shortcut).TargetPath -eq (Join-Path $appDir 'Vexel.exe')) 'shortcut opens the installed editor'
Check ([IO.File]::ReadAllText((Join-Path $dataDir 'settings.json')) -eq $settings) 'installation preserves existing user settings'
New-Item -Path $legacy,$legacyUninstall -Force | Out-Null
New-ItemProperty -LiteralPath $legacy -Name 'InstallLocation' -Value $appDir -PropertyType String -Force | Out-Null
New-ItemProperty -LiteralPath $legacyUninstall -Name 'UninstallString' -Value ('"'+(Join-Path $appDir 'Uninstall Vexel.exe')+'" /currentuser') -PropertyType String -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $appDir 'Uninstall Vexel.exe'),'LEGACY_TEST_STUB_NOT_EXECUTED')
Install '' 'update.log'
Check (-not (Test-Path -LiteralPath $legacyUninstall)) 'in-place update retires only the verified legacy uninstall record'
Check (-not (Test-Path -LiteralPath (Join-Path $appDir 'Uninstall Vexel.exe'))) 'obsolete legacy uninstaller is removed without executing it'
Check (-not (Test-Path -LiteralPath $shortcut)) 'unselected owned shortcut is removed on update'
Check ([IO.File]::ReadAllText((Join-Path $appDir 'unrelated-user-file.txt')) -eq 'KEEP_USER_DATA') 'update keeps files it does not own'
Check ([IO.File]::ReadAllText((Join-Path $dataDir 'settings.json')) -eq $settings) 'update keeps user preferences unchanged'
$resolved=(Resolve-Path -LiteralPath $appDir).Path
if(-not $resolved.StartsWith($fixture+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Uninstall target escaped its test fixture'}
$uninstaller=Join-Path $resolved 'unins000.exe'
$p=Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="'+(Join-Path $fixture 'uninstall.log')+'"')) -WindowStyle Hidden -Wait -PassThru
Check ($p.ExitCode -eq 0) 'native uninstaller exits successfully'
Check (-not (Test-Path -LiteralPath (Join-Path $appDir 'Vexel.exe'))) 'uninstall removes the application'
Check (-not (Test-Path -LiteralPath $key)) 'uninstall removes its own registration'
Check ([IO.File]::ReadAllText((Join-Path $appDir 'unrelated-user-file.txt')) -eq 'KEEP_USER_DATA') 'uninstall retains unrelated local files'
Check ([IO.File]::ReadAllText((Join-Path $dataDir 'settings.json')) -eq $settings) 'uninstall preserves user settings'
Write-Output "ALL $checks NATIVE INSTALLER CHECKS PASSED"

