Write-Host "Instalando yt-dlp..." -ForegroundColor Cyan

# Verificar se já está instalado
try {
    $ytdlpVersion = yt-dlp --version 2>$null
    if ($ytdlpVersion) {
        Write-Host "✅ yt-dlp já está instalado (versão: $ytdlpVersion)" -ForegroundColor Green
        exit
    }
} catch {
    # Não está instalado
}

# Criar diretório para binários
$binDir = "$env:USERPROFILE\bin"
if (!(Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir | Out-Null
}

# Download yt-dlp
Write-Host "📥 Baixando yt-dlp..." -ForegroundColor Yellow
$ytdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
$ytdlpPath = "$binDir\yt-dlp.exe"

try {
    Invoke-WebRequest -Uri $ytdlpUrl -OutFile $ytdlpPath -UseBasicParsing
    Write-Host "✅ yt-dlp baixado com sucesso!" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao baixar yt-dlp: $_" -ForegroundColor Red
    exit
}

# Adicionar ao PATH do usuário
Write-Host "🔧 Adicionando ao PATH..." -ForegroundColor Yellow
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$binDir", "User")
    Write-Host "✅ yt-dlp adicionado ao PATH!" -ForegroundColor Green
} else {
    Write-Host "✅ yt-dlp já está no PATH" -ForegroundColor Green
}

Write-Host ""
Write-Host "✨ Instalação concluída!" -ForegroundColor Green
Write-Host "⚠️ Por favor, reinicie o terminal/PowerShell para usar yt-dlp" -ForegroundColor Yellow
Write-Host ""
Write-Host "Teste com: yt-dlp --version" -ForegroundColor Cyan

