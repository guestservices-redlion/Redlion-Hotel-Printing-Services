# Public guest URL

Local testing uses `http://localhost:3000`, but a guest phone cannot normally reach `localhost`
on the hotel computer.

A public HTTPS tunnel can forward the customer URL to the local application:

```text
Guest phone -> public HTTPS URL -> tunnel -> hotel computer:3000
```

The tunnel transports the upload. Documents remain on the hotel computer.

## Cloudflare Tunnel example

1. Install `cloudflared` from Cloudflare's official documentation.
2. Create a tunnel for `http://localhost:3000`.
3. Start the tunnel with Windows.
4. Enter the resulting HTTPS customer URL in Hotel Print **Settings**.
5. Open **Guest QR code** and regenerate the room card.
6. Test the QR code from a phone using mobile data.

Do not expose the admin password, local data folders, or Windows file-sharing ports.

Free-service terms can change. The application is tunnel-provider independent, so another HTTPS
forwarding service can be substituted later.
