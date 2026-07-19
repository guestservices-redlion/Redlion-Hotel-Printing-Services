# ClamAV setup

ClamAV is the antivirus scanner used before a document enters the front-desk queue.

## Install

1. Download the current Windows build from the official ClamAV website.
2. Install or extract it to a permanent folder.
3. Update virus definitions using `freshclam`.
4. Set `CLAMSCAN_PATH` in `application\.env` if `clamscan.exe` is not on the Windows `PATH`.

Example:

```text
CLAMSCAN_PATH=C:\Program Files\ClamAV\clamscan.exe
```

## Verify

From the source project:

```powershell
npm run check:antivirus
```

From a hotel distribution, run:

```powershell
.\scripts\check-antivirus.ps1
```

The admin dashboard must show **Ready** before the QR code is placed in guest rooms.

## Updates

Virus definitions become stale. Schedule `freshclam` according to ClamAV's official Windows
instructions and verify updates regularly.

## Safe testing

Use only recognized harmless antivirus test fixtures in a controlled test environment. Never
create or distribute real malicious files.
