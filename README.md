# Hotel Print

Hotel Print is a local Windows web application for receiving guest PDF documents at a hotel
front desk.

It provides two separate websites:

- Customer upload: `http://localhost:3000/`
- Front desk: `http://localhost:3000/admin`

Documents are stored on the hotel computer. They enter a private quarantine area, are scanned
with ClamAV, validated as PDFs, counted, priced, and shown to the front desk only after the guest
accepts the result.

## Business rules

- PDF only.
- The backend calculates the real page count.
- The default first three pages are free.
- Additional pages use the price configured by the front desk.
- `chargeable pages = max(total pages - free pages, 0)`.
- A paid document does not enter the queue until the guest selects **Accept & Submit**.
- Staff verify the guest, collect payment, and print manually.
- The application does not control the printer or process online payments.

## Development

Requirements:

- Windows 10 or Windows 11
- Node.js 22.5 or newer
- VS Code
- ClamAV for real document scanning

```powershell
npm install
npm run dev
```

For a production-style local run:

```powershell
npm run build
npm start
```

This repository is the recovered JavaScript source baseline. Cloud migration files live under
`supabase/`; the current runtime continues to use local SQLite and local document storage until
the Supabase application adapter is enabled and verified.

On the first visit to `/admin`, the hotel creates its own administrator account and settings.

## Verification

```powershell
npm run format:check
npm run lint
npm test
```

The test suite uses controlled scanner modes and never creates a genuinely harmful file.

## Data

Mutable data is created under `data/`:

```text
data/
├── quarantine/
├── queue/
├── database/
├── logs/
└── backups/
```

The `data` directory, `.env`, sessions, passwords, guest documents, and tunnel credentials must
never be placed in a public repository or reused in another hotel's distribution ZIP.

## Documentation

- [Architecture](documentation/ARCHITECTURE.md)
- [Windows installation](documentation/WINDOWS_INSTALLATION.md)
- [VS Code development](documentation/DEVELOPMENT.md)
- [Front-desk guide](documentation/FRONT_DESK_GUIDE.md)
- [ClamAV](documentation/CLAMAV.md)
- [Public tunnel](documentation/PUBLIC_TUNNEL.md)
- [Backup and recovery](documentation/BACKUP_RECOVERY.md)
- [Updating](documentation/UPDATING.md)
- [Troubleshooting](documentation/TROUBLESHOOTING.md)
- [Distribution ZIP](documentation/DISTRIBUTION.md)

## License notes

Project code is provided for the hotel-printing project. Vendored PDF functionality is from
`pdf-lib` (MIT), and QR encoding code is from `qrcode-terminal` (MIT). Their license files are
included under `src/vendor`.
