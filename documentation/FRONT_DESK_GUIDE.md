# Front-desk operating guide

## Start of shift

1. Confirm Hotel Print is running.
2. Open `http://localhost:3000/admin`.
3. Sign in.
4. Confirm **File scanner: Ready**.
5. Keep the print queue open.

## Process a document

1. Match the displayed room number and last name against hotel records.
2. Review the page count and charge.
3. For payment-required jobs, collect the displayed amount.
4. Select **Open PDF**.
5. Print using the normal Windows print dialog.
6. Select **Complete** to remove the job from the active queue.

Completed documents remain only for the configured retention period and are then deleted.

## Change the price

1. Open **Settings**.
2. Update the free-page limit or price per extra page.
3. Save.

The new price applies to new uploads. Existing accepted jobs keep their original amount.

## Documents that must not be opened

Files are unavailable to staff until validation and scanning pass. If the dashboard reports an
antivirus problem, stop accepting files and follow the troubleshooting guide.
