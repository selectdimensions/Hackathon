# gen_node_key.ps1 — generate Ed25519 + X25519 keypairs for one node.
#
# Outputs into shared/keys/private/ (gitignored) and shared/keys/pinned/ (committed):
#   private/node_<id>_ed25519.priv   <-- 32 bytes raw, gitignored
#   pinned/node_<id>_ed25519.pub     <-- 32 bytes raw, committed
#   private/node_<id>_x25519.priv    <-- 32 bytes raw, gitignored
#   pinned/node_<id>_x25519.pub      <-- 32 bytes raw, committed
#
# Requires: python (any 3.8+) with the `cryptography` package.
#   pip install cryptography
#
# Usage:
#   .\shared\keys\gen_node_key.ps1 -NodeId 0x80 -Name master
#   .\shared\keys\gen_node_key.ps1 -NodeId 0x01 -Name pod_a
#   .\shared\keys\gen_node_key.ps1 -NodeId 0xA0 -Name soldier_1

param(
    [Parameter(Mandatory=$true)] [byte]   $NodeId,
    [Parameter(Mandatory=$true)] [string] $Name
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$keysDir    = $PSScriptRoot
$privateDir = Join-Path $keysDir 'private'
$pinnedDir  = Join-Path $keysDir 'pinned'

New-Item -ItemType Directory -Force -Path $privateDir | Out-Null
New-Item -ItemType Directory -Force -Path $pinnedDir  | Out-Null

# Find python
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $py) {
    throw "python not found on PATH. Install Python 3.8+ and 'pip install cryptography'."
}

$hexId = "0x{0:X2}" -f $NodeId
$tag   = "{0}_{1:x2}" -f $Name, $NodeId

$pyScript = @"
import sys, os
from cryptography.hazmat.primitives.asymmetric import ed25519, x25519
from cryptography.hazmat.primitives import serialization

priv_dir = sys.argv[1]
pinn_dir = sys.argv[2]
tag      = sys.argv[3]

def write_raw(path, data):
    with open(path, 'wb') as f:
        f.write(data)
    print(f"  wrote {path} ({len(data)} bytes)")

# Ed25519
ed_priv = ed25519.Ed25519PrivateKey.generate()
ed_pub  = ed_priv.public_key()
write_raw(os.path.join(priv_dir, f"node_{tag}_ed25519.priv"),
          ed_priv.private_bytes(
              encoding=serialization.Encoding.Raw,
              format=serialization.PrivateFormat.Raw,
              encryption_algorithm=serialization.NoEncryption()))
write_raw(os.path.join(pinn_dir, f"node_{tag}_ed25519.pub"),
          ed_pub.public_bytes(
              encoding=serialization.Encoding.Raw,
              format=serialization.PublicFormat.Raw))

# X25519
x_priv = x25519.X25519PrivateKey.generate()
x_pub  = x_priv.public_key()
write_raw(os.path.join(priv_dir, f"node_{tag}_x25519.priv"),
          x_priv.private_bytes(
              encoding=serialization.Encoding.Raw,
              format=serialization.PrivateFormat.Raw,
              encryption_algorithm=serialization.NoEncryption()))
write_raw(os.path.join(pinn_dir, f"node_{tag}_x25519.pub"),
          x_pub.public_bytes(
              encoding=serialization.Encoding.Raw,
              format=serialization.PublicFormat.Raw))
"@

$tmpPy = New-TemporaryFile
try {
    $pyScript | Set-Content -Path $tmpPy.FullName -Encoding utf8
    Write-Host "Generating keys for node_id=$hexId ($Name -> tag '$tag'):"
    & $py.Source $tmpPy.FullName $privateDir $pinnedDir $tag
} finally {
    Remove-Item -Force $tmpPy.FullName
}

Write-Host ""
Write-Host "Public keys (commit): $pinnedDir"
Write-Host "Private keys (DO NOT COMMIT): $privateDir"
Write-Host "Next: run .\shared\keys\gen_pinned_header.ps1 to bake the public keys into shared/PinnedKeys.h"
