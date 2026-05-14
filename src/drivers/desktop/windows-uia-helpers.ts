/**
 * Shared PowerShell + UIAutomation helpers for WindowsAdapter.
 *
 * Why it looks “weird”: each `runPowerShell()` call starts a **new** `powershell.exe`
 * with `-EncodedCommand`, so this entire block is **prepended to every UIA script**.
 * That avoids a long‑lived host process but repeats parse + JIT. Payloads (selectors,
 * values) are passed as **UTF‑8 base64** so we never embed raw quotes inside PS strings.
 *
 * Embedded as a plain string — no `${...}` so TS templates can safely inject PID/b64.
 */
export const WINDOWS_UIA_HELPERS_PS1 = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient

function Da-DecodeB64([string]$b64) {
  if ([string]::IsNullOrEmpty($b64)) { return '' }
  [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
}

function Da-GetAppRoot([int]$processId) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $pidCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $processId)
  $app = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
  if (-not $app) { throw "UIA: No automation root for PID $processId (is the app running?)" }
  $app
}

function Da-FindByAutomationId($app, [string]$automationId) {
  if ([string]::IsNullOrEmpty($automationId)) { return $null }
  $c = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty, $automationId)
  $app.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
}

function Da-FindByNameExact($app, [string]$name) {
  if ([string]::IsNullOrEmpty($name)) { return $null }
  $c = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, $name)
  $app.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
}

function Da-FindForAction($app, [string]$needle) {
  $el = Da-FindByAutomationId $app $needle
  if ($el) { return $el }
  Da-FindByNameExact $app $needle
}

function Da-FindForRead($app, [string]$needle) {
  $el = Da-FindByNameExact $app $needle
  if ($el) { return $el }
  Da-FindByAutomationId $app $needle
}

function Da-FindLoose($app, [string]$needle) {
  if ([string]::IsNullOrEmpty($needle)) { return $null }
  $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
  $q = New-Object System.Collections.Queue
  $q.Enqueue($app)
  $seen = 0
  $max = 600
  while ($q.Count -gt 0 -and $seen -lt $max) {
    $cur = $q.Dequeue()
    $ch = $walker.GetFirstChild($cur)
    while ($ch -ne $null) {
      $q.Enqueue($ch)
      $seen++
      $id = [string]$ch.Current.AutomationId
      $nm = [string]$ch.Current.Name
      if ($id.Length -gt 0 -and $id.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $ch }
      if ($nm.Length -gt 0 -and $nm.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $ch }
      $ch = $walker.GetNextSibling($ch)
    }
  }
  return $null
}

function Da-InvokeClick([System.Windows.Automation.AutomationElement]$el) {
  if (-not $el) { throw 'UIA: Element not found for selector' }
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) {
    $p.Invoke(); return
  }
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) {
    $p.Toggle(); return
  }
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$p)) {
    try {
      $st = $p.Current.ExpandCollapseState
      if ($st -eq [System.Windows.Automation.ExpandCollapseState]::Collapsed -or
          $st -eq [System.Windows.Automation.ExpandCollapseState]::PartiallyExpanded) {
        $p.Expand()
      } elseif ($st -eq [System.Windows.Automation.ExpandCollapseState]::Expanded) {
        $p.Collapse()
      }
      return
    } catch {
      # Some controls expose the pattern but reject Expand/Collapse — try other patterns
    }
  }
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) {
    $p.Select(); return
  }
  throw 'UIA: No Invoke/Toggle/ExpandCollapse/SelectionItem pattern (control not clickable via UIA)'
}

function Da-SetValue([System.Windows.Automation.AutomationElement]$el, [string]$value) {
  if (-not $el) { throw 'UIA: Element not found for selector' }
  $p = $null
  if (-not ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p))) {
    throw 'UIA: ValuePattern not supported (readonly or non-editable control)'
  }
  if (-not $p.Current.IsReadOnly) {
    $p.SetValue($value)
    return
  }
  throw 'UIA: ValuePattern is read-only'
}

function Da-ReadText([System.Windows.Automation.AutomationElement]$el) {
  if (-not $el) { return '' }
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) {
    $v = $p.Current.Value
    if (-not [string]::IsNullOrEmpty($v)) { return [string]$v }
  }
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$p)) {
    return [string]$p.DocumentRange.GetText(-1)
  }
  return [string]$el.Current.Name
}

function Da-IsReallyVisible([System.Windows.Automation.AutomationElement]$el) {
  if (-not $el) { return $false }
  try {
    if ($el.Current.IsOffscreen) { return $false }
  } catch { return $false }
  $r = $el.Current.BoundingRectangle
  if ($r.Width -le 0 -or $r.Height -le 0) { return $false }
  return $true
}

function Da-CollectElements($app, [int]$limit) {
  $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue($app)
  # Plain PS array; ConvertTo-Json handles this reliably (Generic.List edge cases do not).
  $out = [System.Collections.ArrayList]::new()
  while ($queue.Count -gt 0 -and $out.Count -lt $limit) {
    $current = $queue.Dequeue()
    $child = $walker.GetFirstChild($current)
    while ($null -ne $child) {
      $null = $queue.Enqueue($child)
      $r = $child.Current.BoundingRectangle
      $val = $null
      try {
        $vp = $null
        $hasVp = $child.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)
        if ($hasVp -and ($null -ne $vp)) {
          $val = $vp.Current.Value
        }
      } catch { }
      $fw = ''
      try { $fw = [string]$child.Current.ClassName } catch { }
      $null = $out.Add(@{
        Id = [string]$child.Current.AutomationId
        Name = [string]$child.Current.Name
        Type = [string]$child.Current.ControlType.ProgrammaticName
        LocalizedType = [string]$child.Current.LocalizedControlType
        Enabled = [bool]$child.Current.IsEnabled
        Offscreen = [bool]$child.Current.IsOffscreen
        X = [double]$r.X; Y = [double]$r.Y; W = [double]$r.Width; H = [double]$r.Height
        Value = $val
        ClassName = $fw
      })
      $child = $walker.GetNextSibling($child)
    }
  }
  return @($out)
}
`.trim();
