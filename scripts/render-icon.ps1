Add-Type -AssemblyName System.Drawing

$output = Join-Path $PSScriptRoot '..\media\icon.png'
$bitmap = [System.Drawing.Bitmap]::new(128, 128)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#182433'))
$units = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#7DD3FC'))
$rounded = [System.Drawing.Drawing2D.GraphicsPath]::new()
$rounded.AddArc(0, 0, 52, 52, 180, 90)
$rounded.AddArc(76, 0, 52, 52, 270, 90)
$rounded.AddArc(76, 76, 52, 52, 0, 90)
$rounded.AddArc(0, 76, 52, 52, 90, 90)
$rounded.CloseFigure()
$graphics.FillPath($background, $rounded)

$shapes = @(
  @(@(64,19), @(79,32), @(64,45), @(49,32)),
  @(@(93,36), @(110,45), @(107,64), @(90,55)),
  @(@(90,85), @(107,76), @(110,95), @(93,104)),
  @(@(64,83), @(79,96), @(64,109), @(49,96)),
  @(@(38,85), @(35,104), @(18,95), @(21,76)),
  @(@(38,55), @(21,64), @(18,45), @(35,36))
)
foreach ($shape in $shapes) {
  $points = [System.Drawing.Point[]]($shape | ForEach-Object { [System.Drawing.Point]::new($_[0], $_[1]) })
  $graphics.FillPolygon($units, $points)
}

$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
$rounded.Dispose()
$background.Dispose()
$units.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
