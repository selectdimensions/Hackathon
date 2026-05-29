# Security

This project has two distinct security surfaces:

1. **Git remote auth** — protecting code in transit between your machine and GitHub.
2. **LoRa packet confidentiality** — protecting field traffic between sensor pods, master, and soldier nodes.

Both are designed for **zero shared secrets in repo, zero passwords typed at runtime, and per-machine / per-node key isolation**.

---

## 1. Git remote auth (SSH)

### Why SSH-only

- No PATs to leak, expire, or rotate.
- No HTTPS basic-auth credentials cached in `~/.gitconfig` or `.netrc`.
- Hardware-revocable per machine (drop one `.pub` from GitHub when a laptop is lost).
- Clone URL is `git@github.com:selectdimensions/Hackathon.git` — SSH-only.

### One-time per-machine setup

```powershell
# Generate ed25519 with a passphrase (do NOT skip the passphrase).
ssh-keygen -t ed25519 -C "selectdimensions@gmail.com" -f $env:USERPROFILE\.ssh\id_ed25519_selectdimensions

# Enable Windows ssh-agent service.
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519_selectdimensions
```

Append to `~/.ssh/config`:

```ssh-config
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_selectdimensions
    IdentitiesOnly yes
    AddKeysToAgent yes
```

Upload the **public** key (`.pub` only — never the private key) to GitHub → Settings → SSH and GPG keys. Label it with the hostname so revocation is unambiguous.

Verify:

```powershell
ssh -T git@github.com
# Expected: "Hi selectdimensions! You've successfully authenticated…"
```

### Optional hardening (not enforced in v1)

- **FIDO2-backed key**: `ssh-keygen -t ed25519-sk` with a hardware security key. Cannot be exfiltrated.
- **1Password SSH agent** as drop-in replacement for `ssh-agent` (biometric unlock).
- **Signed commits**: `git config commit.gpgsign true` with `gpg.format = ssh`.

### Repo hygiene rules

These patterns must never be committed:

```
*.pem
*.key
id_*           (private SSH keys)
.env
.env.*
secrets.*
*.p12 / *.pfx
keys/*.priv    (LoRa identity private keys — see §2)
```

All are in [`.gitignore`](.gitignore). Future hardening: add a pre-commit hook running `gitleaks` or `git-secrets`.

---

## 2. LoRa packet confidentiality (AES-128-EAX + Ed25519 rekey)

### Threat model

- **In-scope adversary:** anyone with an SX1262 radio within RF range of the mesh, capable of recording all traffic and replaying it.
- **Out-of-scope:** physical capture of a node (the encrypted NVS partition is best-effort; a determined attacker with hardware access can extract keys). Documented future hardening: secure boot + flash encryption with eFuse-locked keys.

### Design

| Property | Mechanism |
|---|---|
| Confidentiality | AES-128-EAX, 8-byte truncated tag |
| Integrity / origin | EAX tag (per-packet) + Ed25519 signature (rekey only) |
| Forward secrecy | Ephemeral X25519 on every rekey; old session keys overwritten 5 min after epoch transition |
| Anti-replay | 1-byte epoch + 2-byte per-sender nonce counter in EAX nonce + receiver-side high-water-mark check |
| Key rotation | Every 45–75 min (60 ± 15 jittered). Configurable in [30 min, 2 h] via `LoRaConfig.h` |
| Identity | Per-node Ed25519 long-term keypair, pinned at provisioning (no PKI) |

> **AEAD cipher note (was CCM).** The mesh uses **AES-128-EAX**, not CCM. The original
> spec named CCM, but the project's crypto library (rweather/arduinolibs `Crypto`, also the
> source of our Ed25519/X25519/SHA-256) implements **EAX/GCM/ChaCha-Poly, not CCM** — so
> `#include <CCM.h>` never compiled. EAX is an equivalent NIST-class two-pass AEAD that
> natively accepts the existing **13-byte nonce** and **8-byte truncated tag** (no
> `setLengths()` ceremony, unlike CCM), so the on-air envelope is byte-identical and only the
> algorithm changed. Security properties are preserved: confidentiality + per-packet
> integrity + the epoch/nonce-counter anti-replay scheme are unchanged, and the tag length
> was **not** reduced (still 8 bytes). GCM was the alternative; EAX was chosen for its
> robustness to the per-epoch nonce-counter scheme and its native nonce/tag flexibility.

### Provisioning workflow

Per node, performed offline on a trusted workstation, **once**:

```powershell
# Generates node_<id>_ed25519.{priv,pub} and node_<id>_x25519.{priv,pub}
.\shared\keys\gen_node_key.ps1 -NodeId 0x01

# After generating keys for all nodes (master = 0x80, pods 0x01..0x7F, soldiers 0xA0+):
.\shared\keys\gen_pinned_header.ps1
# Emits shared/PinnedKeys.h containing all .pub keys as C arrays.

# Sync to sketches and flash:
.\shared\sync_shared.ps1
# Open SensorNode.ino / MasterNode.ino / SoldierNode.ino in Arduino IDE, flash.

# Transfer the .priv files to the corresponding node via USB MSC ONE TIME
# during a one-shot provision.ino flash. The provision sketch writes them to
# the ESP32-C6 encrypted NVS partition then erases the staging area.
```

`.priv` files are listed in `.gitignore` — they live only on the trusted workstation and the destination node.

### Rekey protocol (master → all)

Every 45–75 min the master broadcasts a `MSG_REKEY` packet (~108 B, 2 LoRa frames, ~410 ms airtime). See [shared/Protocol.h](shared/Protocol.h) for the exact struct. Sequence:

1. Master generates fresh ephemeral X25519 keypair (`eph_priv`, `eph_pub`).
2. Master constructs `RekeyPacket{new_epoch, valid_from_unix_ms, eph_pub}` and signs over it with its long-term Ed25519 key.
3. Master broadcasts the signed rekey on Freq B (downlink band — pods also listen during rekey windows).
4. Each receiver verifies the signature against `MASTER_ED25519_PUB` (pinned at provisioning). Reject if signature fails.
5. Receiver runs `K_shared = X25519(my_x25519_priv, eph_pub)`.
6. Receiver derives `K_session = HKDF_SHA256(K_shared, salt = new_epoch || master_node_id, info = "rftm-v1-session")[:16]`.
7. Receiver stores `K_session` indexed by `new_epoch`. Previous epoch's key is retained for 5 min (handles in-flight packets during the cutover).
8. From now on, outbound packets carry `epoch = new_epoch` in their header; receivers select the matching key.

### Compromise response

| Event | Response |
|---|---|
| One node's private key suspected leaked | Delete its `.pub` from `shared/keys/pinned/`, regenerate `PinnedKeys.h`, reflash all surviving nodes. The compromised node's signatures (if any) are now rejected. |
| Master's Ed25519 private key suspected leaked | Generate new master keypair, reflash master + all nodes (full re-provisioning). Treat as full mesh roll. |
| LoRa traffic suspected being decrypted in real time | Manually trigger an immediate rekey at the master (debug command over USB serial). Re-evaluate jitter range — drop to 30 min minimum until threat is characterised. |
| Lost or captured node | Treat as both above; revoke + roll master. Document in `docs/incidents/`. |

### What we explicitly do NOT defend against

- Direction-finding from RF emission (you can be located by transmitting at all — emission control is operational, not cryptographic).
- Traffic-flow analysis (packet sizes are fixed but rate is event-driven; an attacker can infer "something happened" from the existence of a TX). Future: cover-traffic / constant-rate emission, out of v1 scope.
- Jamming of the LoRa band itself (DoS, not confidentiality).
- Physical tamper of a node (assume the attacker who has the device can eventually get the keys).

### Pi super-pods & multi-radio (v0.3-hardware)

The hardware pivot changes the node mix but **not** the trust boundary:

- **Keys live only on the ESP32.** Most pods are bare-metal ESP32 + sensor (the fixed bus). The crypto TCB is the ESP32 — no MMU, no shell, no interpreter — and session/identity keys live only in its encrypted NVS.
- **Pi super-pods don't hold keys.** A minority of pods pair the ESP32 with a Linux host (Raspberry Pi 5 + RTL-SDR/HackRF) for wideband RF (see [PiPod/](PiPod/)). The Pi runs full Linux (large attack surface), so it is treated as **untrusted**: the Pi→ESP32 UART is one-way and carries only a plaintext `DetectPacket` payload — never key material. A compromised Pi can at worst inject/forge detections into *its own* pod's uplink (the master rate-limits and cross-checks against other pods); it **cannot** exfiltrate keys, impersonate other nodes, or decrypt mesh traffic, because the ESP32 is the sole holder of the keys and the SX1262.
- **The redundant radio adds no key exposure.** A pod may run a primary SX1262 plus a redundant SX1278 (433 MHz) or SX1280/1281 (2.4 GHz). The wire format is PHY-agnostic (see [shared/RadioLink.h](shared/RadioLink.h)): the *same* AES-128-EAX envelope, nonce discipline, and epoch keys go out whichever radio is chosen. Switching radios is a transport/jam-resistance choice, not a crypto change.
- **TX/RX co-existence (not a security boundary).** The ESP32 asserts a `TX_ACTIVE` GPIO around each transmit so a co-located SDR or the redundant radio gates its RX (self-jam mitigation). This is a robustness measure; it does not affect confidentiality or integrity.

---

## Reporting vulnerabilities

Open a private issue on GitHub or email `selectdimensions@gmail.com`. Do not file public issues for crypto bugs until coordinated disclosure.
