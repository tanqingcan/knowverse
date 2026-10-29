# B 部分素材获取清单（在【本机】PowerShell 运行；DSH 沙箱内出网被禁）
#
# 用法：
#   pwsh -File scripts/fetch-assets.ps1              # 打印清单
#   pwsh -File scripts/fetch-assets.ps1 -Open       # 逐条在浏览器打开来源页
#   pwsh -File scripts/fetch-assets.ps1 -OutDir .\public\assets\models
#
# 说明：这些来源站多为「点按钮下载」，脚本只负责打开与归档路径。
#       下载后请把文件名回填到下方 local 字段，并在 public/assets/CREDITS.md 记录
#       名称 / 作者 / 来源 URL / 许可 / 三角面。

param(
  [switch]$Open,
  [string]$OutDir = ".\public\assets\models"
)

$assets = @(
  @{ key = "flower_lowpoly"; name = "低模花（多色）";       cat = "flower";    license = "CC0";     tris = "~100-300"; url = "https://poly.pizza/search/flower"; local = "" },
  @{ key = "plant_quaternius"; name = "Plant (Quaternius)"; cat = "flower";    license = "CC0";     tris = "~150";     url = "https://poly.pizza/m/xH5gNlQxAZ";   local = "" },
  @{ key = "tree_kenney"; name = "Nature Kit（树/灌木/石）"; cat = "tree";      license = "CC0";     tris = "~200-800"; url = "https://kenney.nl/assets/nature-kit"; local = "" },
  @{ key = "chair_kenney"; name = "Furniture Kit（椅/桌）";  cat = "furniture"; license = "CC0";     tris = "~100-300"; url = "https://kenney.nl/assets/furniture-kit"; local = "" },
  @{ key = "hdri_sky"; name = "天空 HDRI（可选）";           cat = "sky";       license = "CC0";     tris = "-";        url = "https://polyhaven.com/hdris";       local = "" }
)

Write-Host "素材清单（$($assets.Count) 条）"
$assets | Format-Table key, name, cat, license, tris, url -AutoSize

if ($Open) {
  foreach ($a in $assets) {
    Start-Process $a.url
    Start-Sleep -Milliseconds 400
  }
  Write-Host "已在浏览器打开来源页。下载后请放到：$OutDir"
}

Write-Host ""
Write-Host "复杂度的硬指标（详见 docs/visual-references.md §3）："
Write-Host "  花 ≤ 800 面 / 树 ≤ 2000 / 椅 ≤ 500 / 旅人 ≤ 2500 / 通用装饰 ≤ 500；单星球装饰总量 ≤ 50000 面。"
Write-Host "  超预算的模型先用 Blender 减面 + 烘焙顶点色，再入库。"
Write-Host ""
Write-Host "记录模板（public/assets/CREDITS.md）："
Write-Host "  - 名称：lowpoly_flower_a | 作者：xxx | 来源：https://... | 许可：CC0 | 修改：减面至 300 面"
