# Newman Desktop Runner

Electron desktop app for running Postman collections locally with Newman.

## Features
- Upload collection/environment JSON
- Input IP/Token and extra vars JSON
- Run Newman locally
- Generate HTML/JSON reports
- Save run history

## Run (dev)
```bash
npm install
npm start
```

## Build Windows EXE
```bash
npm run build:win
```

## Auto Update (GitHub Releases)
1. Bump version and push a tag:
```bash
git tag v0.1.1
git push origin v0.1.1
```
2. GitHub Actions builds and uploads:
   - `Newman Desktop Runner Setup X.Y.Z.exe`
   - `latest.yml` + `.blockmap`
3. The app checks updates on startup and you can manually trigger:
   - **Check Update**, **Download**, **Install**

## Code Signing (Optional)
Set environment variables before build if you have a certificate:
```bash
set CSC_LINK=path/to/cert.p12
set CSC_KEY_PASSWORD=your_password
npm run build:win
```
