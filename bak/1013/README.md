# Library Config Service

이 프로젝트는 기존 Perl CGI 스크립트(`config.cgi`)를 Spring Boot로 변환한 REST API 서비스입니다.

## 프로젝트 구조

```
src/main/java/com/example/library/config/
├── LibraryConfigApplication.java    # Spring Boot 메인 애플리케이션
├── controller/
│   └── LibraryListController.java   # REST API 컨트롤러
├── service/
│   └── LibraryListService.java      # 비즈니스 로직 서비스
├── repository/
│   └── LibraryListRepository.java   # 데이터 접근 레이어
├── entity/
│   └── LibraryList.java            # 데이터베이스 엔티티
└── dto/
    ├── QuestionDataDto.java        # 데이터 전송 객체들
    ├── QnumWithTagDto.java
    └── SearchResultDto.java
```

## 주요 기능

### 1. 데이터 조회 API
- **GET** `/api/get_data` - 모든 질문 데이터 조회
- **GET** `/api/get_qnums` - 질문 번호 목록 조회
- **GET** `/api/get_question_types` - 질문 타입 목록 조회
- **GET** `/api/get_qnums_by_type?type={type}` - 특정 타입의 질문 번호 조회

### 2. 검색 API
- **GET** `/api/search_questions?q={searchTerm}` - 질문 태그에서 검색

### 3. 디버깅 API
- **GET** `/api/debug_columns` - 테이블 구조 확인
- **GET** `/api/debug_qnums` - 질문 번호 값들 확인
- **GET** `/api/debug_q1` - QuestionQnum=1 데이터 확인
- **GET** `/api/debug_qnums_detailed` - 질문 번호 상세 정보
- **GET** `/api/debug_all_data` - 모든 데이터 확인

### 4. 기존 CGI 호환성
- **GET** `/api/config?action={action}` - 기존 CGI와 동일한 인터페이스

## 실행 방법

### 1. 의존성 설치
```bash
mvn clean install
```

### 2. 애플리케이션 실행
```bash
mvn spring-boot:run
```

또는 JAR 파일로 실행:
```bash
java -jar target/library-config-1.0.0.jar
```

### 3. 서버 접속
애플리케이션이 실행되면 `http://localhost:8080`에서 접근 가능합니다.

## API 사용 예시

### 모든 데이터 조회
```bash
curl http://localhost:8080/api/get_data
```

### 질문 번호 목록 조회
```bash
curl http://localhost:8080/api/get_qnums
```

### 질문 타입별 조회
```bash
curl "http://localhost:8080/api/get_qnums_by_type?type=multiple_choice"
```

### 검색
```bash
curl "http://localhost:8080/api/search_questions?q=설문"
```

### 기존 CGI 호환 방식
```bash
curl "http://localhost:8080/api/config?action=get_data"
```

## 데이터베이스 설정

`src/main/resources/application.properties` 파일에서 데이터베이스 연결 정보를 설정할 수 있습니다:

```properties
spring.datasource.url=jdbc:sqlserver://10.0.11.175:15000;databaseName=WEBDEMO;encrypt=false;trustServerCertificate=true;
spring.datasource.username=esha
spring.datasource.password=ws5000997!
spring.datasource.driver-class-name=com.microsoft.sqlserver.jdbc.SQLServerDriver
```

## 기존 CGI와의 차이점

1. **성능**: Spring Boot는 더 효율적인 연결 풀링과 캐싱을 제공합니다.
2. **확장성**: REST API로 다양한 클라이언트에서 접근 가능합니다.
3. **유지보수성**: 객체지향 설계로 코드 가독성과 유지보수성이 향상되었습니다.
4. **에러 처리**: 더 체계적인 예외 처리와 HTTP 상태 코드를 제공합니다.
5. **로깅**: Spring Boot의 로깅 시스템으로 더 나은 디버깅이 가능합니다.

## 필요한 라이브러리

- Spring Boot 3.2.0
- Spring Data JPA
- Microsoft SQL Server JDBC Driver
- Jackson (JSON 처리)
- Maven (빌드 도구)

## 포트 설정

기본 포트는 8080입니다. `application.properties`에서 변경 가능합니다:

```properties
server.port=8080
```

