# Deploy QrAtt and rotate the cache build stamp.
#
# The stamp rotation is the point of this script. Cache keys derived from the
# build stamp only become correct if something rotates it on every deploy —
# leaving that to a human is the failure mode the stamp exists to remove.
#
# clasp deploy MUST run in the foreground. Backgrounded, it has reported exit 0
# while silently skipping the deploy step (push succeeded, deploy did not).

$ErrorActionPreference = 'Stop'

$DeploymentId = 'AKfycbzkGp766lCPYqhitkbYsv0jQGPtBE_dLzpc3CiwuXIWmm7CbFps4XMTb5kmxLAryR0CMQ'
$ExecUrl      = "https://script.google.com/macros/s/$DeploymentId/exec"
$Description  = if ($args.Count -gt 0) { $args[0] } else { 'deploy' }

Write-Host '==> clasp push'
npx clasp push --force
if ($LASTEXITCODE -ne 0) { throw 'clasp push failed' }

Write-Host '==> clasp deploy'
npx clasp deploy --deploymentId $DeploymentId --description $Description
if ($LASTEXITCODE -ne 0) { throw 'clasp deploy failed' }

Write-Host '==> rotating cache build stamp'
try {
    $res = Invoke-RestMethod -Uri "$ExecUrl`?diag=bumpbuild" -MaximumRedirection 10 -TimeoutSec 120
    if ($res.ok) {
        Write-Host "    build stamp now: $($res.stamp)"
    } else {
        Write-Warning "bumpbuild returned not-ok. Caches may still serve the previous payload shape."
        Write-Warning "Rotate manually: $ExecUrl`?diag=bumpbuild"
    }
} catch {
    # Deploy succeeded; only the rotation failed. Say so loudly rather than
    # implying a clean deploy — a stale cache here looks exactly like "the fix
    # didn't work".
    Write-Warning "Deployed, but the build-stamp rotation failed: $($_.Exception.Message)"
    Write-Warning "Rotate manually: $ExecUrl`?diag=bumpbuild"
}

Write-Host '==> done'
