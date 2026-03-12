# Newman Desktop Runner Usage

## Install
1. Run the installer:
   `dist\Newman Desktop Runner Setup 0.1.0.exe`
2. Launch the app from Start Menu.

## Quick Start
1. **Collection \***: Select a Postman collection JSON.
2. **Output Directory \***: Pick a folder to save reports/logs.
3. Optional: Environment JSON, IP, Token, Extra Vars.
4. Choose reporters (HTML/JSON/CLI).
5. Click **Run Newman**.

## Reports
- HTML: Open or Preview from History.
- JSON: Open or Preview from History.
- Logs: Open Log from History.

## Invalid Run (2nd pass)
To run a second pass with invalid data:
1. Fill **Invalid Vars (JSON)**.
2. Check **Run invalid also**.
3. Click **Run Newman**.

Example:
```json
{"token":"INVALID_TOKEN","ip":"0.0.0.0"}
```

History will show labels:
- `VALID OK/FAIL`
- `INVALID OK/FAIL`

## Update
- **Check Update**: check for new release.
- **Download**: download update.
- **Install**: restart and install update.

## Troubleshooting
- No HTML preview: ensure HTML reporter is enabled.
- No logs: check Output Directory writable.
- Update buttons disabled in dev mode: packaged app only.
