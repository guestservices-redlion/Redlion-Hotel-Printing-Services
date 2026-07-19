# Backup and recovery

## What to back up

Back up:

```text
data/database/hotel-print.sqlite
application/.env
```

The database contains settings, admin accounts, job metadata, and sessions. Treat it as private.

Guest PDFs in `data/queue` are temporary. Avoid long-term backup of guest documents unless the
hotel has a documented legal and privacy reason.

## Safe backup

1. Run `stop.ps1`.
2. Copy the database and `.env` to encrypted hotel-controlled storage.
3. Run `start.ps1`.

## Recovery

1. Stop Hotel Print.
2. Restore the database to `data/database/hotel-print.sqlite`.
3. Restore `.env` if needed.
4. Confirm folder permissions.
5. Start the application.
6. Verify login, antivirus, settings, and queue state.

If the database cannot be recovered, move the damaged database aside and run setup to initialize
a new installation. Do not overwrite a damaged database until a copy has been retained for
diagnosis.
