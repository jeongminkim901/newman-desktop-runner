# Newman Desktop Runner 사용법

## 0. 사전 준비
- Postman 컬렉션(JSON) 파일이 필요합니다.
- 리포트 저장 폴더를 지정해야 합니다.

## 1. 설치
1. 설치 파일 실행:
   `dist\Newman Desktop Runner Setup 0.1.0.exe`
2. 시작 메뉴에서 앱 실행.

## 2. 빠른 시작
1. **Collection \***: Postman 컬렉션 JSON 선택
2. **Output Directory \***: 리포트/로그 저장 폴더 지정
3. 선택 옵션: Environment JSON, IP, Token, Extra Vars
4. Reporter 선택(HTML/JSON/CLI)
5. **Run Newman** 클릭

## 3. 리포트 확인
- HTML: History에서 Open/Preview
- JSON: History에서 Open/Preview
- Log: History에서 Open Log

## 4. 비정상 값 실행(2차 패스)
비정상 값으로 한번 더 실행하려면:
1. **Invalid Vars (JSON)** 입력
2. **Run invalid also** 체크
3. **Run Newman** 클릭

예시:
```json
{"token":"INVALID_TOKEN","ip":"0.0.0.0"}
```

History 라벨:
- `VALID OK/FAIL`
- `INVALID OK/FAIL`

## 5. 업데이트
- **Check Update**: 업데이트 확인
- **Download**: 다운로드
- **Install**: 재시작 후 설치

## 6. 문제 해결
- HTML이 안 보임: HTML reporter 체크 확인
- 로그가 안 나옴: Output Directory 쓰기 권한 확인
- 업데이트 버튼 비활성: 개발 모드에서는 비활성(설치형 앱에서만 동작)
