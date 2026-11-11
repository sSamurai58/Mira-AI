; Custom NSIS snippets for Mira Windows installer.
; Keep minimal — electron-builder injects this via `nsis.include`.

!macro customInstall
  DetailPrint "Mira: установка завершена. Данные приложения — в профиле пользователя."
!macroend

!macro customUnInstall
  DetailPrint "Mira: приложение удалено. Локальные данные (.env / mira/) не удаляются автоматически."
!macroend
