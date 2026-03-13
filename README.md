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

## Release Notes

### 0.1.0 (2026-03-13)
- 툴팁 설명 확장(변형 방식/리스크/권장 조건 포함, 한글)
- 탐색 모드(Exploratory) 상세 가이드 강화
- SSL 검증 무시 옵션 설명 추가(개발/내부망용, 운영 비권장)
- Help 모달 가이드 보강


