# Mira update wait UI — shown while %APPDATA%\Mira\mira-updating.lock exists.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$lock = Join-Path $env:APPDATA "Mira\mira-updating.lock"

$form = New-Object System.Windows.Forms.Form
$form.Text = "Mira"
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.Width = 440
$form.Height = 168
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 20, 26)
$form.ForeColor = [System.Drawing.Color]::FromArgb(236, 240, 255)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Мира обновляется"
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 14)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(24, 28)
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Подождите немного — приложение откроется само."
$sub.Font = New-Object System.Drawing.Font("Segoe UI", 10)
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
