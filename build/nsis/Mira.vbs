' Mira launcher — shortcuts point here so mid-update clicks stay alive.
Option Explicit
Dim sh, fso, ud, lockFile, exeFile, exePath, ps1
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ud = sh.ExpandEnvironmentStrings("%APPDATA%\Mira")
lockFile = ud & "\mira-updating.lock"
exeFile = ud & "\install-exe.path"
ps1 = ud & "\launcher\updating.ps1"

If fso.FileExists(lockFile) Then
  sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
  WScript.Quit 0
End If

If Not fso.FileExists(exeFile) Then
  MsgBox "Не найден путь к Mira.exe. Откройте Mira из меню Пуск или переустановите.", 48, "Mira"
  WScript.Quit 1
End If

exePath = Trim(fso.OpenTextFile(exeFile, 1).ReadAll())
If Not fso.FileExists(exePath) Then
  On Error Resume Next
  fso.CreateTextFile(lockFile, True).Close
  On Error GoTo 0
  sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
  WScript.Quit 0
End If

sh.Run """" & exePath & """", 1, False
