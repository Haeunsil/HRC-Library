<%@ Page Language="C#" Debug="true" %>
    <%@ Import Namespace="System.Net" %>
        <%@ Import Namespace="System.IO" %>
            <%@ Import Namespace="System.Web" %>

                <script runat="server">
                    // Python Server URL (IPv4 Localhost)
                    private const string BACKEND_URL = "http://127.0.0.1:8000";
                    // API 경로 접두사 (배포 환경에 따라 /HRClib 필요 시 사용)
                    private static readonly string[] PATH_PREFIXES = { "", "/HRClib" };

    protected void Page_Load(object sender, EventArgs e)
                    {
                        try {
            // 1. Get the target path from query parameter '_path'
            string targetPath = Request.QueryString["_path"];
                            if (string.IsNullOrEmpty(targetPath)) {
                                Response.Write("Status: OK (Proxy is running). Please provide '_path' parameter.");
                                return;
                            }

            // 2. POST 본문 미리 읽기 (한 번만)
            byte[] bodyBytes = null;
            if ((Request.HttpMethod == "POST" || Request.HttpMethod == "PUT" || Request.HttpMethod == "PATCH") && Request.InputStream != null)
            {
                using (var ms = new MemoryStream())
                {
                    if (Request.InputStream.CanSeek) Request.InputStream.Position = 0;
                    Request.InputStream.CopyTo(ms);
                    bodyBytes = ms.ToArray();
                }
            }

            // 3. Append query parameters
            var queryCollection = HttpUtility.ParseQueryString(Request.Url.Query);
            queryCollection.Remove("_path");
            string queryString = (queryCollection.Count > 0) ? ("?" + queryCollection.ToString()) : "";

            // 4. 경로 접두사 폴백: /api/... → /HRClib/api/... (404 시 재시도)
            HttpWebResponse apiResponse = null;
            for (int i = 0; i < PATH_PREFIXES.Length; i++)
            {
                string targetUrl = BACKEND_URL + PATH_PREFIXES[i] + targetPath + queryString;

                HttpWebRequest apiRequest = (HttpWebRequest)WebRequest.Create(targetUrl);
                apiRequest.Method = Request.HttpMethod;
                apiRequest.ContentType = !string.IsNullOrEmpty(Request.ContentType) ? Request.ContentType : "application/json";
                apiRequest.UserAgent = Request.UserAgent;
                apiRequest.Timeout = 30000;
                apiRequest.ReadWriteTimeout = 30000;

                if (bodyBytes != null && bodyBytes.Length > 0)
                {
                    apiRequest.ContentLength = bodyBytes.Length;
                    using (Stream reqStream = apiRequest.GetRequestStream())
                    {
                        reqStream.Write(bodyBytes, 0, bodyBytes.Length);
                    }
                }

                try {
                    apiResponse = (HttpWebResponse)apiRequest.GetResponse();
                }
                catch (WebException webEx) {
                    if (webEx.Response != null) {
                        apiResponse = (HttpWebResponse)webEx.Response;
                        if (apiResponse.StatusCode == HttpStatusCode.NotFound && i < PATH_PREFIXES.Length - 1) {
                            apiResponse.Close();
                            continue; // 404면 다음 접두사 시도
                        }
                    } else {
                        throw;
                    }
                }

                Response.ContentType = apiResponse.ContentType;
                Response.StatusCode = (int)apiResponse.StatusCode;
                Response.BufferOutput = false;
                using (Stream responseStream = apiResponse.GetResponseStream()) {
                    if (responseStream != null) responseStream.CopyTo(Response.OutputStream);
                }
                apiResponse.Close();
                return;
            }
                        }
                        catch (Exception ex)
                        {
                            // 프록시 자체 오류
                            Response.StatusCode = 500;
                            Response.TrySkipIisCustomErrors = true;
                            Response.ContentType = "text/plain; charset=utf-8";

                            Response.Write("============== ASP.NET Proxy Error ==============\n");
                            Response.Write("Message: " + ex.Message + "\n");

                            if (ex is WebException webEx && webEx.Response == null)
                            {
                                Response.Write("Status: " + webEx.Status + "\n");
                            }
                            Response.Write("\nStack Trace:\n" + (ex.StackTrace ?? ""));
                        }
                    }
                </script>