# Architecture

## Components

```text
Guest phone
    |
    | HTTP/HTTPS multipart upload
    v
Local Node.js server on hotel computer
    |
    +-- Customer website
    +-- Front-desk website
    +-- SQLite database
    +-- Quarantine folder
    +-- Clean queue folder
    +-- ClamAV process adapter
```

Both websites are served by the same local application. A document is uploaded once and remains
on the hotel computer.

## Upload flow

1. Validate room number and last name.
2. Apply the configured upload-size limit.
3. Write the PDF under a random name in `data/quarantine`.
4. Run ClamAV before front-desk visibility.
5. Verify MIME type, extension, PDF signature, structure, encryption status, and page count.
6. Save a pricing snapshot.
7. Return page and price information to the guest.
8. On acceptance, move the file to `data/queue` and set the job to `QUEUED`.
9. On cancellation, rejection, or expiration, delete the quarantined file.

## Pricing

Money is stored in integer minor units:

```text
chargeablePages = max(totalPages - freePageLimit, 0)
totalMinor = chargeablePages * pricePerPageMinor
```

Accepted jobs keep their pricing snapshot when settings change later.

## Statuses

```text
QUARANTINED
  -> AWAITING_CONFIRMATION
  -> QUEUED
  -> COMPLETED
  -> EXPIRED
```

Alternative terminal paths are `REJECTED`, `CANCELLED`, and `EXPIRED`.

## Access boundaries

- Customer routes cannot list jobs or retrieve PDFs.
- Admin pages and APIs require a local staff session.
- Mutating admin APIs require a session CSRF token.
- Queue files are not public static files.
- Stored filenames and references are random.
- Resolved document paths must remain inside the queue directory.
- Passwords use scrypt with random salts.

## Deliberate exclusions

- No online payment processing
- No hotel-system integration
- No automatic guest verification
- No automatic printing
- No SavaPage integration
- No cloud document storage
