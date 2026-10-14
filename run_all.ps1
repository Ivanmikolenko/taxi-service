<#
    Прогоняет solution.py против reference/ и testcases/1..9.

    Использование:
        .\run_all.ps1
        .\run_all.ps1 -Port 8080
#>

param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

# Карта: номер testcase → имя теста, который должен упасть
$ExpectedFail = @{
    1 = "test_tc1_register_with_existing_phone"
    2 = "test_tc2_login_with_wrong_password"
    3 = "test_tc3_order_without_destination"
    4 = "test_tc4_price_without_full_route"
    5 = "test_tc5_second_review_not_allowed"
    6 = "test_tc6_register_without_name"
    7 = "test_tc7_register_without_phone"
    8 = "test_tc8_register_without_password"
    9 = "test_tc9_register_without_password_confirm"
}

# --- вспомогательные функции ----------------------------------------------

function Start-TestServer {
    param([string]$Path, [int]$Port)

    $logOut = Join-Path $env:TEMP "http_server_$Port.out.log"
    $logErr = Join-Path $env:TEMP "http_server_$Port.err.log"

    $proc = Start-Process python `
        -ArgumentList "-m", "http.server", "-d", $Path, $Port `
        -PassThru -NoNewWindow `
        -RedirectStandardOutput $logOut `
        -RedirectStandardError $logErr

    # ждём, пока сервер поднимется
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $null = Invoke-WebRequest "http://localhost:$Port/index.html" `
                -UseBasicParsing -TimeoutSec 1
            return $proc
        } catch {
            Start-Sleep -Milliseconds 200
        }
    }
    throw "Сервер на порту $Port не поднялся за 4 секунды"
}

function Run-Pytest {
    param([string]$Url)
    $env:TEST_URL = $Url
    $output = python -m pytest solution.py -v --no-header 2>&1 | Out-String
    return $output
}

function Parse-Results {
    param([string]$Output)
    $passed = ([regex]::Matches($Output, " PASSED")).Count
    $failed = ([regex]::Matches($Output, " FAILED")).Count
    # имена упавших тестов
    $failedNames = [regex]::Matches(
        $Output, "solution\.py::(\w+) FAILED"
    ) | ForEach-Object { $_.Groups[1].Value }
    return [pscustomobject]@{
        Passed      = $passed
        Failed      = $failed
        FailedNames = $failedNames
    }
}

function Check-Scenario {
    param(
        [string]$Label,
        [string]$Path,
        [int]$Port,
        [string]$ExpectedFailName  # $null = ожидается всё passed
    )

    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor DarkGray
    Write-Host "Проверка: $Label" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor DarkGray

    $server = $null
    try {
        $server = Start-TestServer -Path $Path -Port $Port
        $output = Run-Pytest -Url "http://localhost:$Port"
        Write-Host $output

        $res = Parse-Results -Output $output

        $ok = $false
        if ($ExpectedFailName) {
            # ожидаем: ровно один упавший, и это нужный
            $ok = ($res.Failed -eq 1) -and
                  ($res.FailedNames.Count -eq 1) -and
                  ($res.FailedNames[0] -eq $ExpectedFailName) -and
                  ($res.Passed -eq 8)
        } else {
            # ожидаем: всё прошло
            $ok = ($res.Failed -eq 0) -and ($res.Passed -eq 9)
        }

        if ($ok) {
            Write-Host ">>> OK: $Label" -ForegroundColor Green
        } else {
            Write-Host ">>> НЕ СОШЛОСЬ: $Label" -ForegroundColor Red
            if ($ExpectedFailName) {
                Write-Host "    Ожидалось: 1 failed ($ExpectedFailName), 8 passed" `
                    -ForegroundColor Yellow
                Write-Host "    Фактически: $($res.Failed) failed, $($res.Passed) passed" `
                    -ForegroundColor Yellow
                if ($res.FailedNames.Count -gt 0) {
                    Write-Host "    Упавшие тесты: $($res.FailedNames -join ', ')" `
                        -ForegroundColor Yellow
                }
            } else {
                Write-Host "    Ожидалось: 0 failed, 9 passed" -ForegroundColor Yellow
                Write-Host "    Фактически: $($res.Failed) failed, $($res.Passed) passed" `
                    -ForegroundColor Yellow
            }
        }
    }
    finally {
        if ($server -and -not $server.HasExited) {
            Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

# --- основной прогон ------------------------------------------------------

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$refPath = Join-Path $root "reference"
$tcRoot  = Join-Path $root "testcases"

if (-not (Test-Path $refPath)) {
    throw "Не найдена папка reference/"
}
if (-not (Test-Path $tcRoot)) {
    throw "Не найдена папка testcases/"
}

$summary = @()

# reference — ожидаем 9 passed
Check-Scenario -Label "reference" -Path $refPath -Port $Port `
    -ExpectedFailName $null

# testcases/1..9 — ожидаем падение ровно соответствующего теста
foreach ($n in 1..9) {
    $tcPath = Join-Path $tcRoot "$n"
    if (-not (Test-Path $tcPath)) {
        Write-Host ">>> ПРОПУСК: нет папки testcases/$n" -ForegroundColor Yellow
        continue
    }
    $expected = $ExpectedFail[$n]
    Check-Scenario -Label "testcases/$n" -Path $tcPath -Port $Port `
        -ExpectedFailName $expected
}

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor DarkGray
Write-Host "Все сценарии проверены." -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor DarkGray