# Kleiner lokaler Webserver zum Testen der App (keine Installation nötig).
# Start:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1
param([int]$Port = 4173)

$root = Split-Path -Parent $PSScriptRoot

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "The Snail laeuft auf http://localhost:$Port/  (Beenden mit Strg+C)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $isHead = $ctx.Request.HttpMethod -eq "HEAD"
      $reqPath = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($reqPath -eq "/") { $reqPath = "/index.html" }
      $file = Join-Path $root ($reqPath -replace "/", "\")
      $full = [System.IO.Path]::GetFullPath($file)

      if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $full -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
        $ctx.Response.Headers.Add("Cache-Control", "no-store")
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ctx.Response.ContentLength64 = $bytes.Length
        if (-not $isHead) { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $ctx.Response.StatusCode = 404
        if (-not $isHead) {
          $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - nicht gefunden")
          $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
        }
      }
    } catch {
      try { $ctx.Response.StatusCode = 500 } catch {}
    } finally {
      try { $ctx.Response.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
