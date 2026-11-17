# Samsung TV Build & Install Guide

## Before building

1. TV Developer Mode must be ON.
2. The PC and TV must be on the same LAN.
3. The TV must appear in `sdb devices`.
4. The Samsung Author/Distributor certificate profile must already exist on this PC.
5. The Tizen Web CLI and Samsung TV extension must be installed.

The known device connection from the setup session was:

```text
192.168.1.3:26101       device          UA55RU7300SXEG
```

## Build, sign, and install

Open PowerShell in the `NexusNightsTv` directory:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\build.ps1 -Install
```

Enter the exact certificate profile name when prompted. The script:

1. Validates required TV project files.
2. Finds the Tizen CLI.
3. Verifies the certificate profile exists.
4. Runs `tizen build-web`.
5. Runs `tizen package -t wgt -s <profile> -- .buildResult`.
6. Copies the signed package to the repository's `dist/NexusNightTV.wgt`.
7. Checks the SDB serial and installs/launches the WGT when `-Install` is used.

You can also build without installing:

```powershell
.\build.ps1
```

Or provide the profile and device explicitly:

```powershell
.\build.ps1 -CertificateProfile "YOUR_EXACT_PROFILE_NAME" -Install -DeviceSerial "192.168.1.3:26101"
```

## If the TV address changes

Run `sdb devices` and use the complete serial shown before the `device` state. For example, use `192.168.1.3:26101`, not the TV model name.

## Common failures

- **Tizen CLI not found:** confirm Web App Development Web / Web CLI is installed and add `<TIZEN_STUDIO>\tools\ide\bin` to PATH.
- **Certificate profile not found:** open Certificate Manager, confirm the profile exists on this PC, and copy its exact name.
- **Device not found:** reconnect with SDB, then verify `sdb devices`.
- **Install/signature error:** check that the selected Distributor certificate includes this TV's DUID and that the same profile is used for updates.
- **App launches but cannot reach backend:** verify the backend URL in `js/config.js`, network access from the TV, and HTTPS/certificate availability.

Do not delete the existing app or change its application ID to fix a normal update/install error.
