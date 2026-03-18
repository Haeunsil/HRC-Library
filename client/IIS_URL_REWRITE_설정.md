# IIS URL Rewrite 설정 - /dist 숨기기

**현재 URL**: `https://webdemo.hrcglobal.com/HRClib/dist?usercode=1`  
**표시할 URL**: `https://webdemo.hrcglobal.com/HRClib/?usercode=1`

클라이언트(App.jsx)에서 `replaceState`로 `/dist`를 숨기고, IIS Rewrite로 `/HRClib/` 접속 시 `/HRClib/dist/` 내용을 제공합니다.

---

## 설정 체크리스트

| # | 설정 | 담당 | 상태 |
|---|------|------|------|
| 1 | IIS URL Rewrite 모듈 설치 | 서버 관리자 | |
| 2 | Web.config에 rewrite 규칙 추가 | 서버 관리자 | |
| 3 | App.jsx getCleanDisplayUrl (/dist 제거) | 클라이언트 | ✅ 완료 |

---

## 방법 1: Web.config에 URL Rewrite 추가 (권장)

### 1. URL Rewrite 모듈 설치 확인

IIS에 **URL Rewrite** 모듈이 있어야 합니다.

- [다운로드](https://www.iis.net/downloads/microsoft/url-rewrite)
- 설치 후 IIS 관리자에서 사이트 설정 시 "URL 다시 쓰기" 항목이 보이면 됩니다.

### 2. Web.config 수정

**사이트 루트** (HRClib의 부모 폴더) Web.config에 아래 내용을 추가합니다.

- **기존 Web.config가 있는 경우**: `<system.webServer>` 섹션 안에 `<rewrite>` 블록 추가
- **새로 만드는 경우**: `server/Web.config`를 사이트 루트에 복사 후 기존 설정과 병합

`<system.webServer>` 섹션 안에 넣습니다:

```xml
<rewrite>
  <rules>
    <!-- /HRClib/dist?usercode=1 → /HRClib/?usercode=1 로 리다이렉트 -->
    <rule name="HRClib dist redirect" stopProcessing="true">
      <match url="^HRClib/dist/?$" />
      <action type="Redirect" url="/HRClib/" appendQueryString="true" redirectType="Permanent" />
    </rule>
    <!-- /HRClib/ 접속 시 /HRClib/dist/ 내용 제공 -->
    <rule name="HRClib to dist" stopProcessing="true">
      <match url="^HRClib/?$" />
      <action type="Rewrite" url="HRClib/dist/" />
    </rule>
    <rule name="HRClib SPA fallback" stopProcessing="true">
      <match url="^HRClib/(?!dist/)(.*)$" />
      <conditions>
        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
      </conditions>
      <action type="Rewrite" url="HRClib/dist/{R:1}" />
    </rule>
  </rules>
</rewrite>
```

---

## 방법 2: IIS 관리자에서 직접 설정

1. **IIS 관리자** 실행
2. 해당 **사이트** 선택
3. **URL 다시 쓰기** 더블클릭
4. **규칙 추가** → **빈 규칙**

### 규칙 1: /HRClib → /HRClib/dist/

| 항목 | 값 |
|------|-----|
| 이름 | HRClib to dist |
| URL 일치 | `^HRClib/?$` |
| 작업 유형 | 다시 쓰기 |
| URL | `HRClib/dist/` |

### 규칙 2: SPA 새로고침용 (선택)

| 항목 | 값 |
|------|-----|
| 이름 | HRClib SPA fallback |
| URL 일치 | `^HRClib/(?!dist/)(.*)$` |
| 조건 | `{REQUEST_FILENAME}` - 파일 아님 | `{REQUEST_FILENAME}` - 디렉터리 아님 |
| 작업 유형 | 다시 쓰기 |
| URL | `HRClib/dist/{R:1}` |

---

## 방법 3: applicationHost.config에서 사이트별 설정

사이트가 `Default Web Site` 아래에 있을 때:

1. `C:\Windows\System32\inetsrv\config\applicationHost.config` 열기
2. 해당 사이트의 `<location>` 섹션에 `<rewrite>` 블록 추가

---

## 경로가 다른 경우

- HRClib 폴더가 `/HRClib/`가 아니라 `/WebDemo/HRClib/` 등이라면:

```xml
<match url="^WebDemo/HRClib/?$" />
<action type="Rewrite" url="WebDemo/HRClib/dist/" />
```

처럼 실제 경로에 맞게 수정하면 됩니다.

---

## 설정 후 확인

1. `https://webdemo.hrcglobal.com/HRClib/dist?usercode=1` 접속 → `https://webdemo.hrcglobal.com/HRClib/?usercode=1`로 리다이렉트되는지 확인
2. `https://webdemo.hrcglobal.com/HRClib/` 직접 접속 시 앱이 정상 표시되는지 확인
3. 새로고침(F5) 후에도 404가 나지 않는지 확인

---

## 동작 흐름

| 접속 URL | 동작 |
|----------|------|
| `/HRClib/dist?usercode=1` | 301 리다이렉트 → `/HRClib/?usercode=1` |
| `/HRClib/?usercode=1` | Rewrite로 dist 내용 제공, 클라이언트에서 URL 유지 |
| `/HRClib/` 직접 접속 | Rewrite로 dist 내용 제공 |

---

## 클라이언트 처리 (완료됨)

`App.jsx`의 `getCleanDisplayUrl`에서 `/dist`를 제거하고 `replaceState`로 주소창을 갱신합니다.  
리다이렉트 규칙이 없어도 클라이언트에서 URL이 정리되며, 서버 리다이렉트를 추가하면 처음부터 깔끔한 URL로 접속됩니다.
