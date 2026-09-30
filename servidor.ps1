# Servidor local mínimo para o Organizador de Curtidas.
# Serve os arquivos desta pasta em http://127.0.0.1:8888/ (o Spotify exige 127.0.0.1, não "localhost").
# Não precisa instalar nada nem de permissão de administrador. Feche a janela para parar.

$ErrorActionPreference = 'Stop'
$port = 8888
$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
}

try {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
  $listener.Start()
} catch {
  Write-Host "Nao consegui abrir a porta $port. Talvez o servidor ja esteja aberto em outra janela." -ForegroundColor Red
  Start-Process "http://127.0.0.1:$port/"
  Read-Host 'Pressione Enter para sair'
  exit 1
}

$url = "http://127.0.0.1:$port/"
Write-Host ''
Write-Host "  Organizador de Curtidas rodando em $url" -ForegroundColor Green
Write-Host '  Deixe esta janela aberta enquanto usa o site. Feche-a para parar.'
Write-Host ''
Start-Process $url

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 3000   # evita travar com conexões que o navegador abre e não usa
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $requestLine = $reader.ReadLine()
    while (($h = $reader.ReadLine()) -ne $null -and $h -ne '') { }

    $path = '/'
    if ($requestLine -match '^[A-Z]+\s+(\S+)') { $path = $Matches[1] }
    $path = [Uri]::UnescapeDataString(($path -split '\?')[0])
    if ($path.EndsWith('/')) { $path += 'index.html' }

    $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $body = [IO.File]::ReadAllBytes($file)
      $status = '200 OK'
      $type = $mime[[IO.Path]::GetExtension($file).ToLower()]
      if (-not $type) { $type = 'application/octet-stream' }
    } else {
      $body = [Text.Encoding]::UTF8.GetBytes('Arquivo nao encontrado')
      $status = '404 Not Found'
      $type = 'text/plain; charset=utf-8'
    }

    $header = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
  } catch {
    # conexão abortada/ociosa: ignora e segue atendendo
  } finally {
    $client.Close()
  }
}
