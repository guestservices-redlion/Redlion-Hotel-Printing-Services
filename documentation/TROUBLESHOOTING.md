# Troubleshooting

## The website does not open

- Confirm Node.js 22.5 or newer is installed.
- Run `start.ps1`.
- Check `data/logs/hotel-print.log`.
- Confirm port 3000 is not in use.

## Guest phones cannot open the QR code

- `localhost` works only on the hotel computer.
- Configure the public HTTPS tunnel URL.
- Regenerate the QR code after changing the URL.
- Test using mobile data.

## Antivirus attention warning

- Confirm ClamAV is installed.
- Confirm virus definitions are updated.
- Check `CLAMSCAN_PATH`.
- Run `scripts/check-antivirus.ps1`.
- Do not disable antivirus for hotel operation.

## A PDF is rejected

The file may be:

- Larger than the configured limit
- Not a genuine PDF
- Corrupted
- Password-protected or encrypted
- Above the page limit
- Detected by antivirus

Ask the guest to create a new, unencrypted PDF.

## A queued file is missing

Check that antivirus software, cleanup utilities, or staff did not manually remove files from
`data/queue`. Do not edit that folder while Hotel Print is running.

## Reset the admin account

There is intentionally no insecure password-reset backdoor. Stop the application, back up the
database, and follow the documented recovery procedure or initialize a new database.
