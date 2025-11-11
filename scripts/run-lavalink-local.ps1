Param(
    [string]$JavaPath = "java",
    [string]$HeapSize = "512m"
)

$jarPath = Join-Path $PSScriptRoot "..\lavalink\Lavalink-4.0.8.jar"
$configPath = Join-Path $PSScriptRoot "..\lavalink\application.yml"

if (-not (Test-Path $jarPath)) {
    Write-Error "Arquivo Lavalink-4.0.8.jar não encontrado em $jarPath. Execute o download antes de rodar este script."
    exit 1
}

if (-not (Test-Path $configPath)) {
    Write-Error "Arquivo application.yml não encontrado em $configPath."
    exit 1
}

$env:JAVA_TOOL_OPTIONS = "-Xmx$HeapSize"

Write-Host "Iniciando Lavalink local com $JavaPath e heap $HeapSize..."
Write-Host "Usando config: $configPath"
Write-Host "Pressione Ctrl+C para encerrar."

Push-Location (Split-Path $jarPath)
& $JavaPath -jar $jarPath
$exitCode = $LASTEXITCODE
Pop-Location

exit $exitCode

