; Custom NSIS snippets for Mira Windows installer.
; Keep minimal — electron-builder injects this via `nsis.include`.
;
; electron-updater silent updates pass `/S` and `--force-run`. Without
; `--force-run` the installer finishes and Mira stays closed — that felt like
; «после обновления не открывается».

!macro customInstall
  DetailPrint "Mira: exe-папка = движок Chromium. Ваши данные: %APPDATA%\Mira (см. ЧИТАЙ-МЕНЯ.txt)."
!macroend

!macro customUnInstall
  DetailPrint "Mira: exe удалён. Данные в %APPDATA%\Mira (.env / library / skills) сохраняются."
!macroend
