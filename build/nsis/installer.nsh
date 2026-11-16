; Custom NSIS snippets for Mira Windows installer.
; Keep minimal — electron-builder injects this via `nsis.include`.
;
; electron-updater silent updates pass `/S` and `--force-run`. Without
; `--force-run` the installer finishes and Mira stays closed — that felt like
; «после обновления не открывается».
;
; Mid-update clicks: customInit (before Mira.exe is removed) writes a lock,
; retargets Desktop/Start Menu shortcuts to %APPDATA%\Mira\launcher\Mira.vbs,
; and shows «Мира обновляется». Mirrored in electron/updateGate.ts.

!macro customInit
  InitPluginsDir
  File /oname=$PLUGINSDIR\update-gate-init.ps1 `${BUILD_RESOURCES_DIR}\nsis\update-gate-init.ps1`
  File /oname=$PLUGINSDIR\updating.ps1 `${BUILD_RESOURCES_DIR}\nsis\updating.ps1`
  File /oname=$PLUGINSDIR\Mira.vbs `${BUILD_RESOURCES_DIR}\nsis\Mira.vbs`
  ; Non-blocking: init script Start-Process-es the wait UI, then returns.
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\update-gate-init.ps1"'
!macroend

!macro customInstall
  DetailPrint "Mira: exe-папка = движок Chromium. Ваши данные: %APPDATA%\Mira (см. ЧИТАЙ-МЕНЯ.txt)."
!macroend

!macro customUnInstall
  DetailPrint "Mira: exe удалён. Данные в %APPDATA%\Mira (.env / library / skills) сохраняются."
  ; Leave launcher/lock cleanup to the userData tree — deleteAppDataOnUninstall=false.
!macroend
