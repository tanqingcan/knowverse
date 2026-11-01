# KNOWVERSE B-side asset fetch checklist.
# Run this on YOUR machine (network is blocked inside the DSH sandbox).
#
# Usage (Windows PowerShell / pwsh):
#   powershell -ExecutionPolicy Bypass -File scripts/fetch-assets.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/fetch-assets.ps1 -Open
#   powershell -ExecutionPolicy Bypass -File scripts/fetch-assets.ps1 -OutDir .\public\assets\models
#
# The source sites are mostly "click to download", so this script only opens pages
# and prints the checklist. After downloading, fill in the `local` field and record
# name / author / source / license / triangles in public/assets/CREDITS.md.

param(
  [switch]$Open,
  [string]$OutDir = ".\public\assets\models"
)

$assets = @(
  @{ key = "flower_lowpoly";   name = "Low-poly flowers";              cat = "flower";    license = "CC0";       tris = "100-300";  url = "https://poly.pizza/search/flower"; local = "" },
  @{ key = "plant_quaternius"; name = "Plant (Quaternius)";            cat = "flower";    license = "CC0";       tris = "~150";     url = "https://poly.pizza/m/xH5gNlQxAZ"; local = "" },
  @{ key = "quaternius_megakit"; name = "Quaternius Stylized Nature";  cat = "flower/tree"; license = "QAL/CC0"; tris = "100-500";  url = "https://quaternius.com/"; local = "" },
  @{ key = "tree_kenney";      name = "Kenney Nature Kit";             cat = "tree";      license = "CC0";       tris = "200-800";  url = "https://kenney.nl/assets/nature-kit"; local = "" },
  @{ key = "chair_kenney";     name = "Kenney Furniture Kit";          cat = "furniture"; license = "CC0";       tris = "100-300";  url = "https://kenney.nl/assets/furniture-kit"; local = "" },
  @{ key = "dreamscape_meadow"; name = "Dreamscape Nature: Meadows";   cat = "flower/tree"; license = "Unity/UE store"; tris = "medium"; url = "https://assetstore.unity.com/packages/3d/environments/fantasy/dreamscape-nature-meadows-stylized-open-world-environment-186894"; local = "" },
  @{ key = "mac_handpainted";  name = "Mac Nature Pack (Hand Painted)"; cat = "flower/tree"; license = "Unity store"; tris = "medium"; url = "https://assetstore.unity.com/packages/3d/environments/mac-nature-pack-stylized-hand-painted-273395"; local = "" },
  @{ key = "synty_nature";     name = "Synty POLYGON Nature Pack";     cat = "flower/tree"; license = "Synty (paid)"; tris = "medium"; url = "https://syntystore.com/products/polygon-nature-pack"; local = "" },
  @{ key = "hdri_sky";         name = "Sky HDRI (optional)";           cat = "sky";       license = "CC0";       tris = "-";        url = "https://polyhaven.com/hdris"; local = "" }
)

Write-Host ("Asset checklist: {0} entries" -f $assets.Count)
$assets | Format-Table key, name, cat, license, tris, url -AutoSize

if ($Open) {
  foreach ($a in $assets) {
    Start-Process $a.url
    Start-Sleep -Milliseconds 400
  }
  Write-Host ("Opened source pages. Put downloaded files into: {0}" -f $OutDir)
}

Write-Host ""
Write-Host "Complexity budget (see docs/visual-references.md section 3):"
Write-Host "  flower <= 800 tris / tree <= 2000 / chair <= 500 / traveler <= 2500 / decor <= 500"
Write-Host "  total decor per planet <= 50000 tris. Decimate + bake vertex color in Blender if over budget."
Write-Host ""
Write-Host "Record template (public/assets/CREDITS.md):"
Write-Host "  - name | author | source URL | license | modifications"
