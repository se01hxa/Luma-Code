!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "FileFunc.nsh"
!macro customInit
 StrCpy $LANGUAGE 1042
!macroend
!ifndef BUILD_UNINSTALLER
Var LumaDialog
Var LumaList
Var LumaDesktop
Var LumaStartMenu
Var LumaSound
Var LumaAnimation
Var LumaPrivacy
Var LumaTerms
Var LumaLanguages
Var LumaVisited
Var LumaDesktopState
Var LumaMenuState
Var LumaSoundState
Var LumaAnimationState
Var LumaPrivacyState
!endif

!macro customPageAfterChangeDir
 Page custom LumaOptionsCreate LumaOptionsLeave
 Page custom LumaLanguagesCreate LumaLanguagesLeave

!ifndef BUILD_UNINSTALLER
Function LumaOptionsCreate
 !insertmacro MUI_HEADER_TEXT "추가 설치 설정" "바로가기와 처음 사용할 환경을 선택하세요."
 nsDialogs::Create 1018
 Pop $LumaDialog
 ${NSD_CreateCheckbox} 0 5u 100% 16u "바탕화면에 Luma Code 추가"
 Pop $LumaDesktop
 ${NSD_SetState} $LumaDesktop ${BST_CHECKED}
 ${NSD_CreateCheckbox} 0 27u 100% 16u "시작 메뉴에 추가"
 Pop $LumaStartMenu
 ${NSD_SetState} $LumaStartMenu ${BST_CHECKED}
 ${NSD_CreateCheckbox} 0 49u 100% 16u "효과음 사용 (또각 클릭음 포함)"
 Pop $LumaSound
 ${NSD_SetState} $LumaSound ${BST_CHECKED}
 ${NSD_CreateCheckbox} 0 71u 100% 16u "코드를 처음 열 때 애니메이션 사용"
 Pop $LumaAnimation
 ${NSD_SetState} $LumaAnimation ${BST_CHECKED}
 ${NSD_CreateCheckbox} 0 93u 100% 16u "토큰을 항상 ***로 가리기 (권장)"
 Pop $LumaPrivacy
 ${NSD_SetState} $LumaPrivacy ${BST_CHECKED}
 ${If} $LumaVisited == 1
  ${NSD_SetState} $LumaDesktop $LumaDesktopState
  ${NSD_SetState} $LumaStartMenu $LumaMenuState
  ${NSD_SetState} $LumaSound $LumaSoundState
  ${NSD_SetState} $LumaAnimation $LumaAnimationState
  ${NSD_SetState} $LumaPrivacy $LumaPrivacyState
 ${EndIf}
 ${NSD_CreateLabel} 0 119u 100% 24u "설치 후 설정에서 변경할 수 있습니다. 원본 코드와 실행에 사용되는 값은 유지됩니다."
 Pop $0
 nsDialogs::Show
FunctionEnd
Function LumaOptionsLeave
 StrCpy $LumaVisited 1
 ${NSD_GetState} $LumaDesktop $LumaDesktopState
 ${NSD_GetState} $LumaStartMenu $LumaMenuState
 ${NSD_GetState} $LumaSound $LumaSoundState
 ${NSD_GetState} $LumaAnimation $LumaAnimationState
 ${NSD_GetState} $LumaPrivacy $LumaPrivacyState
FunctionEnd
Function LumaLanguagesCreate
 !insertmacro MUI_HEADER_TEXT "언어 설치 · 최신 버전 업데이트" "선택한 언어만 설치합니다. 이미 설치되었다면 최신 안정 버전으로 업데이트합니다."
 nsDialogs::Create 1018
 Pop $LumaDialog
 ${NSD_CreateLabel} 0 0 100% 21u "필요한 언어를 클릭해 여러 개 선택하세요. 선택하지 않으면 편집기만 설치합니다. Kotlin은 Java도 함께 설치합니다."
 Pop $0
 nsDialogs::CreateControl LISTBOX ${WS_VISIBLE}|${WS_CHILD}|0x00800000|${WS_VSCROLL}|${LBS_MULTIPLESEL}|${LBS_NOINTEGRALHEIGHT}|${LBS_NOTIFY} ${WS_EX_CLIENTEDGE} 0 25u 100% 76u ""
 Pop $LumaList
  ${NSD_LB_AddString} $LumaList "Python"
  ${NSD_LB_AddString} $LumaList "Node.js · JavaScript / TypeScript"
  ${NSD_LB_AddString} $LumaList "PowerShell"
  ${NSD_LB_AddString} $LumaList "Kotlin"
  ${NSD_LB_AddString} $LumaList "Java · OpenJDK"
  ${NSD_LB_AddString} $LumaList "C · WinLibs GCC"
  ${NSD_LB_AddString} $LumaList "Rust"
  ${NSD_LB_AddString} $LumaList "Go"
  ${NSD_LB_AddString} $LumaList "C# / F# · .NET SDK"
  ${NSD_LB_AddString} $LumaList "Ruby"
  ${NSD_LB_AddString} $LumaList "PHP"
  ${NSD_LB_AddString} $LumaList "Lua"
  ${NSD_LB_AddString} $LumaList "Perl"
  ${NSD_LB_AddString} $LumaList "R"
  ${NSD_LB_AddString} $LumaList "Julia"
  ${NSD_LB_AddString} $LumaList "Dart SDK"
  ${NSD_LB_AddString} $LumaList "Swift"
  ${NSD_LB_AddString} $LumaList "Bash · Git for Windows"
  ${NSD_LB_AddString} $LumaList "Zig"
  ${NSD_LB_AddString} $LumaList "Racket"
  ${NSD_LB_AddString} $LumaList "Elixir"
  ${NSD_LB_AddString} $LumaList "Groovy"
  ${NSD_LB_AddString} $LumaList "Scala CLI"
  ${NSD_LB_AddString} $LumaList "Bun"
  ${NSD_LB_AddString} $LumaList "Deno"
 ${NSD_CreateCheckbox} 0 105u 100% 15u "선택한 언어 배포처 및 WinGet 설치 약관에 동의합니다."
 Pop $LumaTerms
 ${NSD_CreateLabel} 0 123u 100% 15u "인터넷과 언어별 Windows 관리자 승인이 필요할 수 있습니다."
 Pop $0
 nsDialogs::Show
FunctionEnd
Function LumaLanguagesLeave
 StrCpy $LumaLanguages ""
  SendMessage $LumaList ${LB_GETSEL} 0 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagespython,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 1 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesnode,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 2 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagespowershell,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 3 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguageskotlin,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 4 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesjava,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 5 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesc,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 6 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesrust,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 7 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesgo,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 8 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesdotnet,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 9 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesruby,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 10 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesphp,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 11 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguageslua,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 12 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesperl,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 13 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesr,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 14 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesjulia,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 15 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesdart,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 16 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesswift,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 17 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesbash,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 18 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguageszig,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 19 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesracket,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 20 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguageselixir,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 21 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesgroovy,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 22 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesscala,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 23 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesbun,"
  ${EndIf}
  SendMessage $LumaList ${LB_GETSEL} 24 0 $0
  ${If} $0 == 1
    StrCpy $LumaLanguages "$LumaLanguagesdeno,"
  ${EndIf}
 ${If} $LumaLanguages != ""
  ${NSD_GetState} $LumaTerms $0
  ${If} $0 != ${BST_CHECKED}
   MessageBox MB_OK "언어 설치를 진행하려면 배포처의 설치 약관에 동의해주세요. 선택을 해제하면 편집기만 설치할 수 있습니다."
   Abort
  ${EndIf}
 ${EndIf}
FunctionEnd
!endif
!macroend

!macro customInstall
 StrCpy $launchLink "$INSTDIR\Luma Code.exe"
 ${If} $LumaVisited == 1
  ${If} $LumaDesktopState == ${BST_CHECKED}
   CreateShortCut "$DESKTOP\Luma Code.lnk" "$INSTDIR\Luma Code.exe"
   WriteRegDWORD HKCU "Software\LumaCode\InstallOptions" "$INSTDIR-Desktop" 1
  ${EndIf}
  ${If} $LumaMenuState == ${BST_CHECKED}
   CreateShortCut "$SMPROGRAMS\Luma Code.lnk" "$INSTDIR\Luma Code.exe"
   WriteRegDWORD HKCU "Software\LumaCode\InstallOptions" "$INSTDIR-Menu" 1
  ${EndIf}
  StrCpy $1 "false"
  StrCpy $2 "false"
  StrCpy $3 "off"
  ${If} $LumaSoundState == ${BST_CHECKED}
   StrCpy $1 "true"
  ${EndIf}
  ${If} $LumaAnimationState == ${BST_CHECKED}
   StrCpy $2 "true"
  ${EndIf}
  ${If} $LumaPrivacyState == ${BST_CHECKED}
   StrCpy $3 "always"
  ${EndIf}
  InitPluginsDir
  FileOpen $0 "$PLUGINSDIR\luma-setup.json" w
  FileWrite $0 '{"privacy":{"mode":"$3"},"theme":{"soundEnabled":$1,"openAnimation":$2}}'
  FileClose $0
  DetailPrint "설정을 저장하고 선택한 언어를 설치·최신 버전으로 업데이트합니다..."
  nsExec::ExecToLog '"$INSTDIR\Luma Code.exe" --setup-run --setup-options "$PLUGINSDIR\luma-setup.json" --setup-languages "$LumaLanguages"'
  Pop $0
  ${If} $0 != 0
   MessageBox MB_OK "편집기는 설치됐지만 일부 언어 설치를 완료하지 못했습니다. 앱의 설정 → 언어 설치에서 기록을 확인하고 다시 시도해주세요."
  ${EndIf}
 ${EndIf}
!macroend
!macro customUnInstall
 ReadRegDWORD $0 HKCU "Software\LumaCode\InstallOptions" "$INSTDIR-Desktop"
 ${If} $0 == 1
  Delete "$DESKTOP\Luma Code.lnk"
  DeleteRegValue HKCU "Software\LumaCode\InstallOptions" "$INSTDIR-Desktop"
 ${EndIf}
 ReadRegDWORD $0 HKCU "Software\LumaCode\InstallOptions" "$INSTDIR-Menu"
 ${If} $0 == 1
  Delete "$SMPROGRAMS\Luma Code.lnk"
  DeleteRegValue HKCU "Software\LumaCode\InstallOptions" "$INSTDIR-Menu"
 ${EndIf}
!macroend


