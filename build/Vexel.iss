#ifndef PublishDir
  #error PublishDir must point to the complete Electron application folder.
#endif
#ifndef AppVersion
  #define AppVersion "1.8.0"
#endif
#ifndef OutputDirectory
  #define OutputDirectory "..\..\..\work\release-1.8"
#endif
#ifndef LanguageInclude
  #error LanguageInclude must point to the generated language catalogue.
#endif
#ifdef TestBuild
  #define InstallerId "Vexel.Installer.Test"
  #define InstallerName "Vexel Installer Test"
  #define LegacyGuid "Vexel.Legacy.Test"
#else
  #define InstallerId "dev.luma.code"
  #define InstallerName "Vexel"
  #define LegacyGuid "ef269d39-ebb4-5242-a005-e1c2c496391f"
#endif

[Setup]
AppId={#InstallerId}
AppName={#InstallerName}
AppVersion={#AppVersion}
AppPublisher=Vexel
AppPublisherURL=https://github.com/sua1dev/Vexel
VersionInfoVersion={#AppVersion}.0
DefaultDirName={code:DefaultInstallDirectory}
DefaultGroupName={#InstallerName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupArchitecture=x64
MinVersion=10.0.19041
WizardStyle=modern dark includetitlebar
WizardSizePercent=110
SetupIconFile=..\assets\icon.ico
UninstallDisplayIcon={app}\Vexel.exe
OutputDir={#OutputDirectory}
OutputBaseFilename=Vexel-Setup-{#AppVersion}
#ifdef TestBuild
Compression=none
SolidCompression=no
#else
Compression=lzma2/normal
SolidCompression=yes
#endif
CloseApplications=yes
RestartApplications=no
SetupMutex=Local\{#InstallerId}.Setup
Uninstallable=yes
UsePreviousAppDir=yes
DisableWelcomePage=no
DisableDirPage=no
ChangesAssociations=no

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕화면에 바로가기 만들기"; GroupDescription: "바로가기:"; Flags: unchecked
Name: "startmenu"; Description: "시작 메뉴에 추가"; GroupDescription: "바로가기:"
Name: "sound"; Description: "효과음 사용 (또각 소리 포함)"; GroupDescription: "처음 사용할 환경:"; Check: IsFirstInstall
Name: "animation"; Description: "코드를 처음 열 때 애니메이션 사용"; GroupDescription: "처음 사용할 환경:"; Check: IsFirstInstall
Name: "privacy"; Description: "토큰을 항상 ***로 가리기"; GroupDescription: "처음 사용할 환경:"; Check: IsFirstInstall

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\README.md"; DestDir: "{app}"; DestName: "README-KO.md"; Flags: ignoreversion
Source: "..\THIRD-PARTY-NOTICES.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#InstallerName}"; Filename: "{app}\Vexel.exe"; WorkingDir: "{app}"; Tasks: startmenu; AppUserModelID: "dev.luma.code"
Name: "{autodesktop}\{#InstallerName}"; Filename: "{app}\Vexel.exe"; WorkingDir: "{app}"; Tasks: desktopicon; AppUserModelID: "dev.luma.code"

[Run]
Filename: "{app}\Vexel.exe"; Description: "Vexel 실행"; Flags: nowait postinstall skipifsilent

[Code]
const
  LegacyInstallKey = 'Software\{#LegacyGuid}';
  LegacyUninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#LegacyGuid}';
var
  LangPage: TInputOptionWizardPage;
  LangIds: TStringList;
  LanguageTerms: TNewCheckBox;
  FreshInstall: Boolean;
  LegacyDirectory: String;

function FindLegacyDirectory(): String;
var Candidate, Command: String;
begin
  Result := '';
  if RegQueryStringValue(HKCU, LegacyInstallKey, 'InstallLocation', Candidate) and
     RegQueryStringValue(HKCU, LegacyUninstallKey, 'UninstallString', Command) then
    if FileExists(AddBackslash(Candidate) + 'Vexel.exe') or
       FileExists(AddBackslash(Candidate) + 'Luma Code.exe') then
      if (Pos('"' + AddBackslash(Candidate) + 'Uninstall Vexel.exe"', Command) = 1) or
         (Pos('"' + AddBackslash(Candidate) + 'Uninstall Luma Code.exe"', Command) = 1) then
        Result := Candidate;
end;

function DefaultInstallDirectory(Param: String): String;
begin
  Result := FindLegacyDirectory();
  if Result = '' then Result := ExpandConstant('{localappdata}\Programs\{#InstallerName}');
end;

function IsFirstInstall(): Boolean;
begin
  Result := FreshInstall;
end;

procedure InitializeWizard();
var SettingsDirectory: String;
begin
  LegacyDirectory := FindLegacyDirectory();
  FreshInstall := (LegacyDirectory = '') and not
    RegKeyExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#InstallerId}_is1');
  SettingsDirectory := GetEnv('LUMA_TEST_USERDATA');
  if SettingsDirectory = '' then SettingsDirectory := ExpandConstant('{userappdata}\luma-code');
  if FileExists(AddBackslash(SettingsDirectory) + 'settings.json') then FreshInstall := False;
  LangIds := TStringList.Create;
  LangPage := CreateInputOptionPage(wpSelectTasks, '언어 설치 · 최신 버전 업데이트',
    '함께 준비할 언어를 선택하세요. 인터넷과 추가 설치 권한이 필요할 수 있습니다.',
    '선택하지 않으면 편집기만 설치합니다. 이미 설치된 언어는 공급처의 최신 안정 버전으로 업데이트합니다. Haskell/Nim/OCaml은 앱 설정에서 공식 설치 페이지를 안내합니다.', False, False);
  LangPage.CheckListBox.Height := LangPage.CheckListBox.Height - ScaleY(48);
  LanguageTerms := TNewCheckBox.Create(LangPage);
  LanguageTerms.Parent := LangPage.Surface;
  LanguageTerms.Left := 0;
  LanguageTerms.Top := LangPage.CheckListBox.Top + LangPage.CheckListBox.Height + ScaleY(8);
  LanguageTerms.Width := LangPage.SurfaceWidth;
  LanguageTerms.Height := ScaleY(34);
  LanguageTerms.Caption := '선택한 언어 배포처의 설치 약관에 동의합니다.';
  #include LanguageInclude
end;

function SelectedLanguages(): String;
var I: Integer;
begin
  Result := '';
  for I := 0 to LangIds.Count - 1 do
    if LangPage.Values[I] then begin
      if Result <> '' then Result := Result + ',';
      Result := Result + LangIds[I];
    end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = LangPage.ID) and (SelectedLanguages() <> '') and not LanguageTerms.Checked then begin
    MsgBox('언어 설치 약관에 동의하거나 언어 선택을 해제해주세요.', mbInformation, MB_OK);
    Result := False;
  end;
end;

function BooleanJson(Value: Boolean): String;
begin
  if Value then Result := 'true' else Result := 'false';
end;

procedure DeleteOwnedShortcut(Link, Expected: String);
var Shell, Shortcut: Variant;
begin
  if not FileExists(Link) then Exit;
  try
    Shell := CreateOleObject('WScript.Shell');
    Shortcut := Shell.CreateShortcut(Link);
    if CompareText(ExpandFileName(Shortcut.TargetPath), ExpandFileName(Expected)) = 0 then
      DeleteFile(Link);
  except
    Log('Shortcut retained: target could not be verified.');
  end;
end;

procedure RetireLegacyInstaller();
begin
  if (LegacyDirectory = '') or
     (CompareText(ExpandFileName(LegacyDirectory), ExpandConstant('{app}')) <> 0) then Exit;
  { Remove only the verified previous installer's records and known obsolete binaries.
    Never run its recursive uninstaller over the new application or user files. }
  DeleteFile(AddBackslash(LegacyDirectory) + 'Uninstall Vexel.exe');
  DeleteFile(AddBackslash(LegacyDirectory) + 'Uninstall Luma Code.exe');
  if FileExists(AddBackslash(LegacyDirectory) + 'Luma Code.exe') then begin
    DeleteOwnedShortcut(ExpandConstant('{autodesktop}\Luma Code.lnk'), AddBackslash(LegacyDirectory) + 'Luma Code.exe');
    DeleteOwnedShortcut(ExpandConstant('{autoprograms}\Luma Code.lnk'), AddBackslash(LegacyDirectory) + 'Luma Code.exe');
    DeleteFile(AddBackslash(LegacyDirectory) + 'Luma Code.exe');
  end;
  RegDeleteKeyIncludingSubkeys(HKCU, LegacyUninstallKey);
  RegDeleteKeyIncludingSubkeys(HKCU, LegacyInstallKey);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Options, Privacy, FileName, Languages: String; ExitCode: Integer;
begin
  if CurStep <> ssPostInstall then Exit;
  RetireLegacyInstaller();
  if not WizardIsTaskSelected('desktopicon') then
    DeleteOwnedShortcut(ExpandConstant('{autodesktop}\{#InstallerName}.lnk'), ExpandConstant('{app}\Vexel.exe'));
  if not WizardIsTaskSelected('startmenu') then
    DeleteOwnedShortcut(ExpandConstant('{autoprograms}\{#InstallerName}.lnk'), ExpandConstant('{app}\Vexel.exe'));
  Languages := SelectedLanguages();
  if not ((FreshInstall and not WizardSilent) or (Languages <> '')) then Exit;
  Options := '{}';
  if FreshInstall and not WizardSilent then begin
    Privacy := 'off';
    if WizardIsTaskSelected('privacy') then Privacy := 'always';
    Options := '{"privacy":{"mode":"' + Privacy + '"},"theme":{"soundEnabled":' +
      BooleanJson(WizardIsTaskSelected('sound')) + ',"openAnimation":' +
      BooleanJson(WizardIsTaskSelected('animation')) + '}}';
  end;
  FileName := ExpandConstant('{tmp}\vexel-setup.json');
  SaveStringToFile(FileName, Options, False);
  WizardForm.StatusLabel.Caption := '설정을 적용하고 선택한 언어를 준비하고 있습니다...';
  if not Exec(ExpandConstant('{app}\Vexel.exe'), '--setup-run --setup-options "' + FileName +
    '" --setup-languages "' + Languages + '"', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ExitCode) then
    MsgBox('편집기는 설치됐지만 초기 설정을 완료하지 못했습니다. 앱 설정에서 다시 시도해주세요.', mbInformation, MB_OK)
  else if ExitCode <> 0 then
    MsgBox('일부 언어 설치를 완료하지 못했습니다. 앱의 설정 → 언어 설치에서 기록을 확인해주세요.', mbInformation, MB_OK);
end;
