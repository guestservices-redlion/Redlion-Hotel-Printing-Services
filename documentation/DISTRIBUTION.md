# Distribution ZIP

Create the hotel ZIP from a verified source checkout:

```powershell
npm install
npm test
npm run package:windows
```

The output is:

```text
outputs/HotelPrint-Windows.zip
```

The ZIP contains compiled application code, static websites, setup scripts, documentation, and
empty data folders.

It must not contain:

- Guest files
- Development databases
- Admin passwords
- Sessions
- `.env`
- Tunnel credentials
- Hotel-specific URLs
- Personal QR codes

After building, inspect the ZIP listing and test extraction into a new temporary directory.
