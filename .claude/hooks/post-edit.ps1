#requires -Version 5.1
# Post-edit hook for the Flipping Market Dashboard.
# - On dashboard.js edit: bump ?v=N in index.html + validate JS syntax via `node -c`.
# - On dashboard.css edit: bump ?v=N in index.html.
# Hook input arrives as JSON on stdin (Claude Code PostToolUse payload).

$ErrorActionPreference = 'Stop'

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }

    $payload = $raw | ConvertFrom-Json
    $filePath = $payload.tool_input.file_path
    if (-not $filePath) { exit 0 }

    $fileName = Split-Path -Leaf $filePath
    if ($fileName -ne 'dashboard.js' -and $fileName -ne 'dashboard.css') { exit 0 }

    $projectDir = $env:CLAUDE_PROJECT_DIR
    if (-not $projectDir) {
        $projectDir = 'C:\Users\maxim\OneDrive\Bureau\Claude Code'
    }
    $indexPath = Join-Path $projectDir 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath)) { exit 0 }

    $content = Get-Content -LiteralPath $indexPath -Raw

    if ($fileName -eq 'dashboard.css') {
        $bumped = $false
        $newContent = [regex]::Replace($content, 'dashboard\.css\?v=(\d+)', {
            param($m)
            $script:bumped = $true
            $v = [int]$m.Groups[1].Value + 1
            "dashboard.css?v=$v"
        })
        if ($bumped) {
            Set-Content -LiteralPath $indexPath -Value $newContent -NoNewline
            Write-Host "[hook] dashboard.css cache-bust applied."
        }
        exit 0
    }

    if ($fileName -eq 'dashboard.js') {
        $bumped = $false
        $newContent = [regex]::Replace($content, 'dashboard\.js\?v=(\d+)', {
            param($m)
            $script:bumped = $true
            $v = [int]$m.Groups[1].Value + 1
            "dashboard.js?v=$v"
        })
        if ($bumped) {
            Set-Content -LiteralPath $indexPath -Value $newContent -NoNewline
            Write-Host "[hook] dashboard.js cache-bust applied."
        }

        $jsPath = Join-Path $projectDir 'dashboard.js'
        $nodeOutput = & node -c $jsPath 2>&1
        if ($LASTEXITCODE -ne 0) {
            [Console]::Error.WriteLine("dashboard.js failed `node -c` syntax check. Fix the syntax error before continuing.")
            [Console]::Error.WriteLine(($nodeOutput | Out-String))
            exit 2
        }
        Write-Host "[hook] dashboard.js syntax OK."
        exit 0
    }
}
catch {
    # Never block the workflow on a hook-internal error; just log to stderr non-blocking.
    [Console]::Error.WriteLine("[hook] non-blocking error: $($_.Exception.Message)")
    exit 0
}
