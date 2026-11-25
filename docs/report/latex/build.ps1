param([switch]$PublishPreview)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$latexRoot = $PSScriptRoot
$requiredBinaries = if ($PublishPreview) { @('xelatex') } else { @('xelatex', 'bibtex') }
foreach ($binary in $requiredBinaries) {
    if (-not (Get-Command $binary -ErrorAction SilentlyContinue)) {
        throw "Missing $binary. Install TeX Live or use Overleaf with XeLaTeX."
    }
}
Push-Location -LiteralPath $latexRoot
try {
    New-Item -ItemType Directory -Path 'build' -Force | Out-Null
    $latexArgs = @('-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-output-directory=build')
    if ($PublishPreview) {
        $outlineOutput = & xelatex @latexArgs 'outline.tex' 2>&1
        if ($LASTEXITCODE -ne 0) {
            $outlineOutput | Select-Object -Last 35 | Write-Output
            throw 'Outline compilation failed. See build/outline.log.'
        }
        $reportRoot = Split-Path -Parent $latexRoot
        $previewPdf = Join-Path $reportRoot '报告架构与分工预览.pdf'
        Copy-Item -LiteralPath 'build/outline.pdf' -Destination $previewPdf -Force
        Write-Output "Outline: $previewPdf"
        return
    }
    for ($pass = 1; $pass -le 3; $pass++) {
        $compilerOutput = & xelatex @latexArgs 'main.tex' 2>&1
        if ($LASTEXITCODE -ne 0) {
            $compilerOutput | Select-Object -Last 35 | Write-Output
            throw "XeLaTeX pass $pass failed. See build/main.log."
        }
        if ($pass -eq 1) {
            $bibOutput = & bibtex 'build/main' 2>&1
            if ($LASTEXITCODE -ne 0) {
                $bibOutput | Select-Object -Last 25 | Write-Output
                throw 'BibTeX failed. See build/main.blg.'
            }
        }
    }
    $compiledPdf = Join-Path $latexRoot 'build/main.pdf'
    if (-not (Test-Path -LiteralPath $compiledPdf)) { throw 'Compiler produced no PDF.' }
    Write-Output "Compiled: $compiledPdf"
} finally {
    Pop-Location
}
