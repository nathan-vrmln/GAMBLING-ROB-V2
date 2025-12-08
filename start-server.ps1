# Serveur HTTP simple pour le développement local
$port = 8000
$root = $PSScriptRoot

Write-Host "Demarrage du serveur sur http://localhost:$port" -ForegroundColor Green
Write-Host "Appuyez sur Ctrl+C pour arreter" -ForegroundColor Yellow
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "Serveur demarre! Ouvrez http://localhost:$port dans votre navigateur" -ForegroundColor Cyan

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath
        if ($path -eq '/') { $path = '/index.html' }
        
        $filePath = Join-Path $root $path.TrimStart('/')
        
        if (Test-Path $filePath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $content.Length
            
            # MIME types
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mimeTypes = @{
                '.html' = 'text/html; charset=utf-8'
                '.css' = 'text/css'
                '.js' = 'application/javascript'
                '.json' = 'application/json'
                '.png' = 'image/png'
                '.jpg' = 'image/jpeg'
                '.jpeg' = 'image/jpeg'
                '.gif' = 'image/gif'
                '.svg' = 'image/svg+xml'
                '.mp3' = 'audio/mpeg'
                '.wav' = 'audio/wav'
                '.woff' = 'font/woff'
                '.woff2' = 'font/woff2'
            }
            
            if ($mimeTypes.ContainsKey($ext)) {
                $response.ContentType = $mimeTypes[$ext]
            }
            
            $response.StatusCode = 200
            $response.OutputStream.Write($content, 0, $content.Length)
            Write-Host "200 $path" -ForegroundColor Green
        } else {
            $response.StatusCode = 404
            $content = [System.Text.Encoding]::UTF8.GetBytes("404 - File Not Found: $path")
            $response.OutputStream.Write($content, 0, $content.Length)
            Write-Host "404 $path" -ForegroundColor Red
        }
        
        $response.Close()
    }
} finally {
    $listener.Stop()
}
