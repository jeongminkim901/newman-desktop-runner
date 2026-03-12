# Newman Desktop Runner

Electron desktop app for running Postman collections locally with Newman.

## Features
- Upload collection/environment JSON
- Input IP/Token and extra vars JSON
- Run Newman locally
- Generate HTML/JSON reports
- Save run history
- Exploratory API testing with Playwright (mutated requests)

## Run (dev)
```bash
npm install
npm start
```

## Build Windows EXE
```bash
npm run build:win
```

## Code Signing (Optional)
Set environment variables before build if you have a certificate:
```bash
set CSC_LINK=path/to/cert.p12
set CSC_KEY_PASSWORD=your_password
npm run build:win
```
