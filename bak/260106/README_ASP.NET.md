# Config.cgi ASP.NET 변환 버전

이 프로젝트는 Perl로 작성된 `config.cgi` 파일을 ASP.NET Core로 변환한 버전입니다.

## 프로젝트 구조

```
LibraryConfig/
├── ConfigController.cs    # 메인 API 컨트롤러
├── Program.cs             # 애플리케이션 진입점
├── appsettings.json       # 설정 파일 (데이터베이스 연결 정보)
├── LibraryConfig.csproj   # 프로젝트 파일
└── README_ASP.NET.md      # 이 파일
```

## 주요 기능

### 지원하는 Action

1. **get_data** - 모든 질문 데이터 조회
2. **get_qnums** - 질문 번호 목록 조회
3. **get_question_types** - 질문 타입 목록 조회
4. **get_qnums_by_type** - 특정 타입의 질문 번호 조회
5. **search_questions** - 질문 태그에서 검색
6. **debug_columns** - 테이블 구조 확인
7. **debug_qnums** - 질문 번호 값들 확인
8. **debug_q1** - QuestionQnum=1 데이터 확인
9. **debug_qnums_detailed** - 질문 번호 상세 정보
10. **debug_all_data** - 모든 데이터 확인

## 설치 및 실행 방법

### 1. 필수 요구사항

- .NET 8.0 SDK 이상
- Windows Server (IIS 또는 Kestrel)
- SQL Server 데이터베이스 접근 권한

### 2. 프로젝트 빌드

```bash
dotnet restore
dotnet build
```

### 3. 설정 파일 수정

`appsettings.json` 파일에서 데이터베이스 연결 문자열을 수정하세요:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=서버주소,포트;Database=데이터베이스명;User Id=사용자명;Password=비밀번호;Encrypt=false;TrustServerCertificate=true;"
  }
}
```

### 4. 실행

#### 개발 환경
```bash
dotnet run
```

#### 프로덕션 환경 (IIS 배포)
1. 프로젝트를 빌드합니다:
   ```bash
   dotnet publish -c Release -o ./publish
   ```

2. IIS에 웹 애플리케이션으로 배포합니다.

3. `web.config` 파일이 필요할 수 있습니다 (자동 생성됨).

## API 사용 예시

### 기존 CGI와 동일한 방식

```
GET /api/config?action=get_data
GET /api/config?action=get_qnums
GET /api/config?action=get_question_types
GET /api/config?action=get_qnums_by_type&type=single
GET /api/config?action=search_questions&q=검색어
```

### RESTful 방식 (추가 옵션)

```
GET /api/config/get_data
GET /api/config/get_qnums
GET /api/config/get_question_types
```

## 기존 CGI와의 차이점

1. **성능**: ASP.NET Core는 더 효율적인 연결 풀링을 제공합니다.
2. **확장성**: 비동기 처리를 통해 더 나은 성능을 제공합니다.
3. **유지보수성**: 타입 안전성과 구조화된 코드로 유지보수가 쉽습니다.
4. **에러 처리**: 체계적인 예외 처리와 로깅을 제공합니다.
5. **보안**: SQL Injection 방지를 위한 파라미터화된 쿼리 사용.

## 주의사항

- 데이터베이스 연결 정보는 `appsettings.json`에 저장되어 있습니다. 프로덕션 환경에서는 환경 변수나 보안 저장소를 사용하는 것을 권장합니다.
- CORS 설정이 모든 Origin을 허용하도록 설정되어 있습니다. 프로덕션 환경에서는 필요한 Origin만 허용하도록 수정하세요.

## 문제 해결

### 데이터베이스 연결 오류
- 연결 문자열이 올바른지 확인하세요.
- SQL Server가 실행 중인지 확인하세요.
- 방화벽 설정을 확인하세요.

### 빌드 오류
- .NET SDK 버전이 8.0 이상인지 확인하세요.
- NuGet 패키지가 올바르게 복원되었는지 확인하세요.

