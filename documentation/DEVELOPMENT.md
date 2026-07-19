# VS Code development

## Initial setup

```powershell
git clone <repository-or-copy-project>
cd <project>
npm install
Copy-Item .env.example .env
npm run dev
```

Open:

- `http://localhost:3000/`
- `http://localhost:3000/admin`

## Useful commands

```powershell
npm run dev
npm run build
npm start
npm run lint
npm run format:check
npm test
npm run check:antivirus
npm run package:windows
```

## Local testing without ClamAV

Real hotel use should require ClamAV. For deliberate local-only development, set:

```text
ALLOW_UNSAFE_ANTIVIRUS_BYPASS=true
```

Then turn off **Require antivirus scanning** in the admin settings. The dashboard displays an
unsafe warning. Never distribute an installation in that state.

Automated tests use controlled mock scanner modes and separate temporary databases.
