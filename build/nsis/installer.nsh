; Custom NSIS snippets for Mira Windows installer.
; Keep minimal — electron-builder injects this via `nsis.include`.

!macro customInstall
  DetailPrint "Mira: exe-папка = движок Chromium. Ваши данные: %APPDATA%\Mira (см. ЧИТАЙ-МЕНЯ.txt)."
!macroend

!macro customUnInstall
  DetailPrint "Mira: exe удалён. Данные в %APPDATA%\Mira (.env / library / skills) сохраняются."
!macroend
