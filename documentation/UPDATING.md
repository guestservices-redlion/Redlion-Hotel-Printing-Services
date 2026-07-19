# Updating Hotel Print

1. Stop the current installation.
2. Back up `data/database/hotel-print.sqlite` and `application/.env`.
3. Extract the new release to a separate folder.
4. Keep the existing `data` folder.
5. Replace only the `application`, `scripts`, and `documentation` folders and root scripts.
6. Start the application.
7. Verify the front-desk login, queue, settings, QR code, and antivirus status.

Do not copy a release's sample data over the hotel's real `data` directory.

Rollback by restoring the prior application folder and database backup.
