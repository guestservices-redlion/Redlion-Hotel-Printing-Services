# Windows installation

## Requirements

1. Windows 10 or Windows 11
2. Node.js 22.5 or newer
3. ClamAV for Windows
4. A hotel computer that stays powered on while uploads are accepted

## Install the distribution

1. Extract `HotelPrint-Windows.zip` to a permanent folder such as:

   ```text
   C:\HotelPrint
   ```

2. Right-click `setup.ps1` and run it with PowerShell.
3. Run `start.ps1`.
4. Open `http://localhost:3000/admin`.
5. Complete the one-time setup.
6. Confirm the dashboard reports that antivirus is ready.
7. Configure the public guest URL in **Settings**.
8. Generate and print the QR code.

## Daily operation

- Run `start.ps1` after the computer starts.
- Run `stop.ps1` before moving or updating the installation.
- Keep the `data` folder private.
- Do not expose Windows file shares containing `data`.

## Automatic startup

After the installation is verified, create a Windows Task Scheduler task that runs `start.ps1`
when the front-desk user signs in. Configure it only after antivirus and storage paths are working.
