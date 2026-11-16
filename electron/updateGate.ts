/**
 * Windows update gate: keep Start Menu / Desktop shortcuts working while NSIS
 * replaces Mira.exe, and show «Мира обновляется…» instead of the shell
 * "ярлык больше не работает" dialog.
 *
 * Shortcuts are retargeted to a VBS launcher under userData (survives install).
 * During install we write a lock file; the launcher shows a small form until
 * the lock is cleared by the relaunched app.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const LOCK_NAME = "mira-updating.lock";
const EXE_PATH_NAME = "install-exe.path";
const LAUNCHER_DIR_NAME = "launcher";

function userDataDir(): string {
  return app.getPath("userData");
}

export function updateLockPath(): string {
  return path.join(userDataDir(), LOCK_NAME);
}

function exePathFile(): string {
  return path.join(userDataDir(), EXE_PATH_NAME);
}

function launcherDir(): string {
  return path.join(userDataDir(), LAUNCHER_DIR_NAME);
}

function launcherVbsPath(): string {
  return path.join(launcherDir(), "Mira.vbs");
}

function updatingPs1Path(): string {
  return path.join(launcherDir(), "updating.ps1");
}

function isWinPackaged(): boolean {
  return process.platform === "win32" && app.isPackaged;
}

function writeText(file: string, body: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
}

/** Remember where Mira.exe lives so the external launcher can find it. */
export function rememberInstallExePath(): void {
  if (!isWinPackaged()) return;
  try {
    writeText(exePathFile(), app.getPath("exe"));
  } catch {
    /* ignore */
  }
}

function updatingPs1Source(lockFile: string): string {
  // PowerShell form — no dependency on Mira.exe. Polls the lock file.
  const lockLit = lockFile.replace(/'/g, "''");
  return `# Mira update gate — do not edit
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$lock = '${lockLit}'
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Mira'
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.Width = 440
$form.Height = 168
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 20, 26)
$form.ForeColor = [System.Drawing.Color]::FromArgb(236, 240, 255)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Мира обновляется'
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 14)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(24, 28)
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = 'Подождите немного — приложение откроется само.'
$sub.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$sub.AutoSize = $true
$sub.ForeColor = [System.Drawing.Color]::FromArgb(170, 178, 200)
$sub.Location = New-Object System.Drawing.Point(24, 68)
$form.Controls.Add($sub)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$started = Get-Date
$timer.Add_Tick({
  if (-not (Test-Path -LiteralPath $lock)) { $form.Close(); return }
  if (((Get-Date) - $started).TotalMinutes -gt 12) { $form.Close() }
})
$timer.Start()
$form.Add_FormClosed({ $timer.Stop() })
[void]$form.ShowDialog()
`;
}

function launcherVbsSource(paths: {
  lockFile: string;
  exePathFile: string;
  ps1File: string;
}): string {
  const esc = (s: string) => s.replace(/"/g, '""');
  return `' Mira launcher — keeps shortcuts alive while Mira.exe is replaced
Option Explicit
Dim sh, fso, lockFile, exeFile, exePath, ps1, ud
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
lockFile = "${esc(paths.lockFile)}"
exeFile = "${esc(paths.exePathFile)}"
ps1 = "${esc(paths.ps1File)}"

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
  ' Exe missing without lock — likely mid-update race; show the same wait UI.
  On Error Resume Next
  fso.CreateTextFile(lockFile, True).Close
  On Error GoTo 0
  sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
  WScript.Quit 0
End If

sh.Run """" & exePath & """", 1, False
`;
}

function ensureLauncherFiles(): string | null {
  if (!isWinPackaged()) return null;
  const lock = updateLockPath();
  const dir = launcherDir();
  fs.mkdirSync(dir, { recursive: true });
  writeText(updatingPs1Path(), updatingPs1Source(lock));
  writeText(
    launcherVbsPath(),
    launcherVbsSource({
      lockFile: lock,
      exePathFile: exePathFile(),
      ps1File: updatingPs1Path(),
    }),
  );
  rememberInstallExePath();
  return launcherVbsPath();
}

/**
 * Retarget Desktop / Start Menu shortcuts to the userData VBS launcher so
 * Windows never resolves a missing Mira.exe mid-update.
 */
export function ensureUpdateGateShortcuts(): void {
  if (!isWinPackaged()) return;
  const vbs = ensureLauncherFiles();
  if (!vbs) return;
  const icon = app.getPath("exe");
  const vbsLit = vbs.replace(/'/g, "''");
  const cwdLit = path.dirname(icon).replace(/'/g, "''");
  const iconLit = icon.replace(/'/g, "''");
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$ws = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path $env:USERPROFILE 'Desktop\\Mira.lnk'),
  (Join-Path $env:USERPROFILE 'OneDrive\\Desktop\\Mira.lnk'),
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Mira.lnk')
)
foreach ($t in $targets) {
  if (-not (Test-Path -LiteralPath $t)) { continue }
  $sc = $ws.CreateShortcut($t)
  $sc.TargetPath = '${vbsLit}'
  $sc.WorkingDirectory = '${cwdLit}'
  $sc.IconLocation = '${iconLit},0'
  $sc.Description = 'Mira'
  $sc.Save()
}
`;
  try {
    spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { detached: true, stdio: "ignore", windowsHide: true },
    ).unref();
  } catch {
    /* best-effort */
  }
}

/** Show the updating form (detached). Safe to call multiple times. */
export function showUpdatingWindow(): void {
  if (!isWinPackaged()) return;
  ensureLauncherFiles();
  try {
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        updatingPs1Path(),
      ],
      { detached: true, stdio: "ignore", windowsHide: true },
    ).unref();
  } catch {
    /* ignore */
  }
}

/**
 * Call right before quitAndInstall: lock + shortcuts + wait UI.
 */
export function beginUpdateGate(): void {
  if (!isWinPackaged()) return;
  try {
    writeText(
      updateLockPath(),
      JSON.stringify({
        at: new Date().toISOString(),
        from: app.getVersion(),
        exe: app.getPath("exe"),
      }),
    );
  } catch {
    /* ignore */
  }
  ensureUpdateGateShortcuts();
  showUpdatingWindow();
}

/** New process is up — drop the lock so the wait UI closes. */
export function clearUpdateGate(): void {
  if (process.platform !== "win32") return;
  try {
    const lock = updateLockPath();
    if (fs.existsSync(lock)) fs.unlinkSync(lock);
  } catch {
    /* ignore */
  }
}

/** Boot hook: remember exe, fix shortcuts, clear stale lock. */
export function bootUpdateGate(): void {
  if (!isWinPackaged()) return;
  clearUpdateGate();
  rememberInstallExePath();
  ensureUpdateGateShortcuts();
}
