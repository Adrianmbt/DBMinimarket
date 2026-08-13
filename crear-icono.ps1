# Genera el icono "Don Beni" (DonBeni.ico) en la raiz del proyecto.
# Diseno: tiendita de mercado - casita con toldo listado rojo/crema y
# ventana arqueada brillante, como un mercadito tradicional.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$icoPath = Join-Path $root 'DonBeni.ico'

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

# ---------- Paleta (mercado calido) ----------
$colBg1   = [System.Drawing.Color]::FromArgb(255, 30, 122, 84)    # verde profundo
$colBg2   = [System.Drawing.Color]::FromArgb(255, 13, 69, 82)     # verde teal
$colCream = [System.Drawing.Color]::FromArgb(255, 250, 243, 228)  # crema
$colRed   = [System.Drawing.Color]::FromArgb(255, 226, 59, 46)    # rojo mercado
$colRedD  = [System.Drawing.Color]::FromArgb(255, 176, 43, 34)    # rojo sombra
$colTer   = [System.Drawing.Color]::FromArgb(255, 194, 84, 47)    # terracota
$colDark  = [System.Drawing.Color]::FromArgb(255, 13, 69, 82)     # verde oscuro
$colAmber1= [System.Drawing.Color]::FromArgb(255, 255, 224, 160)  # brillo ventana
$colAmber2= [System.Drawing.Color]::FromArgb(255, 240, 154, 60)   # fondo ventana

$bCream  = New-Object System.Drawing.SolidBrush($colCream)
$bRed    = New-Object System.Drawing.SolidBrush($colRed)
$bDark   = New-Object System.Drawing.SolidBrush($colDark)
$bGreen  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 46, 139, 87))
$bAmber  = New-Object System.Drawing.SolidBrush($colAmber2)
$bBottle = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 46, 139, 87))
$bCan    = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 217, 58, 50))
$bBox    = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 232, 178, 58))
$bWhite  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
$bTer    = New-Object System.Drawing.SolidBrush($colTer)

$pRedD  = New-Object System.Drawing.Pen($colRedD, 5)
$pGreen = New-Object System.Drawing.Pen($colDark, 5)
$pTer   = New-Object System.Drawing.Pen($colTer, 5)
$pAmber = New-Object System.Drawing.Pen($colAmber1, 4)
$pShelf = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 160, 96, 40), 4)

# ---------- Fondo: rectangulo redondeado degradado ----------
$pathBg = New-RoundedRectPath -x 8 -y 8 -w 240 -h 240 -r 56
$rectBg = New-Object System.Drawing.Rectangle(8, 8, 240, 240)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectBg, $colBg1, $colBg2, 45)
$g.FillPath($bgBrush, $pathBg)
$gloss = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rectBg,
    [System.Drawing.Color]::FromArgb(70, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(0, 255, 255, 255), 90)
$g.FillPath($gloss, $pathBg)

# ---------- Toldo (casita) listado con volantes ----------
$awning = New-RoundedRectPath -x 34 -y 36 -w 188 -h 68 -r 8
$g.FillPath($bCream, $awning)

$stripeW = 23.5
for ($i = 0; $i -lt 8; $i++) {
    $x0 = 34 + $i * $stripeW
    if ($i % 2 -eq 0) { $g.FillRectangle($bRed, $x0 - 0.25, 34, 24, 68) }
}
# Volantes (festoneado)
for ($i = 0; $i -lt 8; $i++) {
    $cx = 45.75 + $i * $stripeW
    $bx = $cx - 11.75
    if ($i % 2 -eq 0) { $g.FillPie($bRed, $bx, 104, 23.5, 23.5, 180, 180) }
    else              { $g.FillPie($bCream, $bx, 104, 23.5, 23.5, 180, 180) }
}
# Contorno del toldo: borde superior y borde festoneado
$g.DrawLine($pRedD, 36, 38, 220, 38)
$g.DrawLine($pRedD, 34, 104, 222, 104)
for ($i = 0; $i -lt 8; $i++) {
    $cx = 45.75 + $i * $stripeW
    $g.DrawArc($pRedD, $cx - 11.75, 104, 23.5, 23.5, 180, 180)
}

# ---------- Distintivo redondo "DB" sobre el toldo ----------
$g.FillEllipse($bCream, 110, 46, 36, 36)
$g.DrawEllipse($pGreen, 110, 46, 36, 36)
$fontBadge = New-Object System.Drawing.Font('Georgia', 16, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$m = $g.MeasureString('DB', $fontBadge)
$g.DrawString('DB', $fontBadge, $bDark, 128 - $m.Width / 2, 62 - $m.Height / 2)

# ---------- Fachada de la casita ----------
$wall = New-RoundedRectPath -x 56 -y 120 -w 144 -h 80 -r 10
$g.FillPath($bCream, $wall)
$g.DrawPath($pTer, $wall)

# Ventana arqueada con brillo
$winPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$winPath.AddArc(94, 128, 68, 68, 180, 180)
$winPath.AddLine(162, 162, 162, 192)
$winPath.AddLine(162, 192, 94, 192)
$winPath.CloseFigure()
$rectWin = New-Object System.Drawing.Rectangle(94, 128, 68, 64)
$winBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectWin, $colAmber1, $colAmber2, 90)
$g.FillPath($winBrush, $winPath)

# Repisa
$g.DrawLine($pShelf, 98, 176, 158, 176)

# Productos en la ventana
$g.FillEllipse($bBottle, 103, 144, 8, 5)                      # tapa botella
$g.FillRectangle($bBottle, 105, 148, 5, 11)                   # cuello
$g.FillEllipse($bBottle, 100, 158, 14, 18)                    # cuerpo botella
$g.FillRectangle($bCan, 118, 160, 13, 16)                     # lata
$g.FillRectangle($bWhite, 121, 164, 7, 3)                     # etiqueta lata
$g.FillRectangle($bBox, 136, 156, 16, 20)                     # caja
$g.FillRectangle($bWhite, 139, 162, 10, 4)                    # etiqueta caja

# Marco de la ventana
$g.DrawArc($pAmber, 94, 128, 68, 68, 180, 180)
$g.DrawLine($pAmber, 94, 162, 94, 192)
$g.DrawLine($pAmber, 162, 162, 162, 192)
$g.DrawLine($pAmber, 94, 192, 162, 192)

# ---------- Letrero "DON BENI" ----------
$fontSign = New-Object System.Drawing.Font('Georgia', 27, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$txt = 'DON BENI'
$m = $g.MeasureString($txt, $fontSign)
$cx = (256 - $m.Width) / 2
$shadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(110, 10, 40, 40))
$g.DrawString($txt, $fontSign, $shadow, $cx + 1, 215)
$g.DrawString($txt, $fontSign, $bCream, $cx, 213)

# Subrayado artesanal del letrero
$g.DrawLine($pTer, 68, 246, 188, 246)
$g.FillEllipse($bTer, 62, 243, 6, 6)
$g.FillEllipse($bTer, 188, 243, 6, 6)

$g.Flush()

# Guardar como .ico (una sola imagen 256x256)
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs)
$fs.Close()

$icon.Dispose()
$bmp.Dispose()
$g.Dispose()
$pathBg.Dispose()
$awning.Dispose()
$wall.Dispose()
$winPath.Dispose()
$bgBrush.Dispose()
$gloss.Dispose()
$winBrush.Dispose()
$bCream.Dispose(); $bRed.Dispose(); $bDark.Dispose(); $bGreen.Dispose()
$bAmber.Dispose(); $bBottle.Dispose(); $bCan.Dispose(); $bBox.Dispose()
$bWhite.Dispose(); $bTer.Dispose(); $shadow.Dispose()
$pRedD.Dispose(); $pGreen.Dispose(); $pTer.Dispose(); $pAmber.Dispose(); $pShelf.Dispose()
$fontBadge.Dispose(); $fontSign.Dispose()

Write-Host "Icono creado: $icoPath"
