# PPS distribution — Pi 5 + ESP32-C6 companion (gap C3)

In Option B both processors need the GPS 1-PPS edge:

- **Pi 5** disciplines its system clock (chrony) for SDR sample-stream timestamping.
- **ESP32-C6** keeps its existing PPS ISR for LoRa nonce-counter discipline and for
  stamping `DetectPacket.pps_timestamp_us`.

## Wiring

One GPS module (u-blox **MAX-M10S** recommended — multi-constellation, current
production, jam-resilient). Fan its PPS line out to **both**:

```
GPS PPS ──┬── 74AHC1G125 buffer ── Pi 5 GPIO 18   (dtoverlay=pps-gpio,gpiopin=18)
          └── 74AHC1G125 buffer ── ESP32-C6 PPS GPIO (existing task_gps_pps ISR)
```

Two parallel high-Z inputs also work; a buffer per branch is cleaner and avoids
edge-loading. MeshAdv-Pi v1.1 routes PPS to GPIO 23 instead of 18 — adjust the overlay.

## Pi 5 software stack (chrony, not ntpd)

```
# /boot/firmware/config.txt
dtoverlay=pps-gpio,gpiopin=18

# /etc/chrony/chrony.conf  (see ../systemd/chrony.conf.example)
refclock SHM 0 refid GPS precision 1e-1 noselect
refclock PPS /dev/pps0 refid PPS lock GPS prefer
```

Expected: sub-µs system-clock offset on Pi 5 (avg ~16.7 ns, peak < 1 µs).

## Who owns pps_timestamp_us

The SDR sample stream lives on the Pi, so the **Pi** sources `pps_timestamp_us` and
ships it in the framed `DetectPacket` payload over UART. The ESP32-C6 only validates
monotonicity before it encrypts/transmits.

## Reality check (do not over-promise)

Sub-µs **system-clock** alignment does NOT mean sub-µs **sample** alignment: USB-burst
jitter on RTL-SDR/HackRF makes host-clock TDOA multi-km. v0.2 localization is KrakenSDR
DoA + RSSI multilateration; sample-accurate TDOA (reference-TX cross-correlation) is
v0.3. See [../../docs/V02_PIVOT.md](../../docs/V02_PIVOT.md) §4 and gaps C1/C2.
