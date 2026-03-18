using System;
using System.Collections.Generic;
using System.Configuration;   // web.config의 <connectionStrings> 접근용
using System.Data;
using System.Data.SqlClient;  // MSSQL 접속용
using System.Text;
using System.Web;
using System.Web.UI;
using Newtonsoft.Json;        // JSON 직렬화

public partial class config : System.Web.UI.Page
{
    // ASPX 요청이 들어오면 가장 먼저 실행되는 메서드
    protected void Page_Load(object sender, EventArgs e)
    {
        // 항상 JSON으로 응답하도록 설정
        Response.Clear();
        Response.ContentType = "application/json; charset=utf-8";
        Response.ContentEncoding = Encoding.UTF8;
        Response.Charset = "utf-8";

        // Perl CGI에서 사용하던 action 파라미터 동일하게 처리
        string action = Request["action"];

        try
        {
            // DB 연결 (Perl DBI->connect와 대응)
            using (var conn = GetConnection())
            {
                conn.Open();

                // action이 없을 때는 Perl처럼 가능한 action 목록을 알려줌
                if (string.IsNullOrEmpty(action))
                {
                    WriteJson(new
                    {
                        error = "Invalid action: no action specified",
                        available_actions = new[]
                        {
                            "get_data", "get_qnums", "get_question_types", "get_qnums_by_type",
                            "debug_columns", "debug_qnums", "debug_q1", "debug_qnums_detailed",
                            "search_questions", "debug_all_data"
                        }
                    });
                    return;
                }

                // Perl CGI의 if/elsif 구조를 C# switch로 그대로 1:1 대응
                switch (action)
                {
                    case "get_data":
                        HandleGetData(conn);
                        break;

                    case "get_qnums":
                        HandleGetQnums(conn);
                        break;

                    case "debug_columns":
                        HandleDebugColumns(conn);
                        break;

                    case "debug_qnums":
                        HandleDebugQnums(conn);
                        break;

                    case "debug_q1":
                        HandleDebugQ1(conn);
                        break;

                    case "debug_qnums_detailed":
                        HandleDebugQnumsDetailed(conn);
                        break;

                    case "get_question_types":
                        HandleGetQuestionTypes(conn);
                        break;

                    case "get_qnums_by_type":
                        HandleGetQnumsByType(conn);
                        break;

                    case "search_questions":
                        HandleSearchQuestions(conn);
                        break;

                    case "debug_all_data":
                        HandleDebugAllData(conn);
                        break;

                    default:
                        // Perl CGI의 마지막 else 부분 대응
                        WriteJson(new
                        {
                            error = "Invalid action: " + action,
                            available_actions = new[]
                            {
                                "get_data", "get_qnums", "get_question_types", "get_qnums_by_type",
                                "debug_columns", "debug_qnums", "debug_q1", "debug_qnums_detailed",
                                "search_questions", "debug_all_data"
                            }
                        });
                        break;
                }
            }
        }
        catch (Exception ex)
        {
            // Perl의 eval {} 실패 시 JSON error 출력과 동일
            WriteJson(new { error = "서버 오류: " + ex.Message });
        }

        Response.End();
    }

    // web.config의 DB ConnectionString을 불러와 SqlConnection 생성
    private SqlConnection GetConnection()
    {
        var connStr = ConfigurationManager.ConnectionStrings["WebDemoDb"].ConnectionString;
        return new SqlConnection(connStr);
    }

    // JSON 응답 출력 (Perl의 print encode_json(...)과 동일)
    private void WriteJson(object obj)
    {
        string json = JsonConvert.SerializeObject(obj);
        Response.Write(json);
    }

    // Perl에서 nvarchar(max) → Trim 처리해주던 부분 대응
    private string CleanString(object o)
    {
        if (o == null || o == DBNull.Value) return "";
        var s = o.ToString();
        if (string.IsNullOrWhiteSpace(s) || s == "NULL") return "";
        return s.Trim();
    }

    // --------------------------------------------
    // action = get_data
    // --------------------------------------------
    private void HandleGetData(SqlConnection conn)
    {
        string sql = @"
            SELECT 
                QuestionQnum,
                CAST(QuestionSourceQM AS NVARCHAR(MAX)) AS QuestionSourceQM,
                CAST(PerlSourceQ AS NVARCHAR(MAX)) AS PerlSourceQ,
                CAST(PerlSourceC AS NVARCHAR(MAX)) AS PerlSourceC,
                QuestionTag
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum";

        var list = new List<object>();

        using (var cmd = new SqlCommand(sql, conn))
        using (var r = cmd.ExecuteReader())
        {
            while (r.Read())
            {
                // Perl: my $qnum = "q" . $row->{QuestionQnum};
                string qnum = "q" + r["QuestionQnum"].ToString();

                list.Add(new
                {
                    qnum = qnum,
                    qmcode = CleanString(r["QuestionSourceQM"]),
                    perlcodeQ = CleanString(r["PerlSourceQ"]),
                    perlcodeC = CleanString(r["PerlSourceC"]),
                    questionTag =
                        (r["QuestionTag"] == DBNull.Value || string.IsNullOrWhiteSpace(r["QuestionTag"].ToString()))
                        ? qnum     // Perl처럼 QuestionTag가 없으면 qnum으로 대체
                        : r["QuestionTag"].ToString()
                });
            }
        }

        WriteJson(list);
    }

    // --------------------------------------------
    // action = get_qnums
    // --------------------------------------------
    private void HandleGetQnums(SqlConnection conn)
    {
        string sql = @"
            SELECT DISTINCT QuestionQnum
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum";

        var list = new List<string>();

        using (var cmd = new SqlCommand(sql, conn))
        using (var r = cmd.ExecuteReader())
        {
            while (r.Read())
            {
                list.Add("q" + r["QuestionQnum"].ToString());
            }
        }

        WriteJson(list);
    }

    // --------------------------------------------
    // action = debug_columns
    // 테이블 컬럼 목록 확인
    // --------------------------------------------
    private void HandleDebugColumns(SqlConnection conn)
    {
        string sql = "SELECT TOP 1 * FROM [WEBDEMO].[dbo].[LibraryList]";

        using (var cmd = new SqlCommand(sql, conn))
        using (var r = cmd.ExecuteReader())
        {
            if (r.Read())
            {
                // 컬럼 이름 목록
                var columns = new List<string>();
                // 샘플 데이터
                var sample = new Dictionary<string, object>();

                for (int i = 0; i < r.FieldCount; i++)
                {
                    string name = r.GetName(i);
                    columns.Add(name);
                    sample[name] = r.GetValue(i);
                }

                WriteJson(new
                {
                    available_columns = columns,
                    sample_data = sample,
                    message = "테이블 구조 확인 완료"
                });
            }
            else
            {
                WriteJson(new { error = "테이블에 데이터가 없습니다" });
            }
        }
    }

    // --------------------------------------------
    // action = debug_qnums
    // --------------------------------------------
    private void HandleDebugQnums(SqlConnection conn)
    {
        string sql = @"
            SELECT QuestionQnum, COUNT(*) AS cnt
            FROM [WEBDEMO].[dbo].[LibraryList]
            GROUP BY QuestionQnum
            ORDER BY QuestionQnum";

        var list = new List<object>();

        using (var cmd = new SqlCommand(sql, conn))
        using (var r = cmd.ExecuteReader())
        {
            while (r.Read())
            {
                list.Add(new
                {
                    qnum = r["QuestionQnum"],
                    count = r["cnt"]
                });
            }
        }

        WriteJson(new
        {
            qnums = list,
            message = "QuestionQnum 값들 확인 완료"
        });
    }

    // --------------------------------------------
    // action = debug_q1
    // QuestionQnum=1 데이터만 확인
    // --------------------------------------------
    private void HandleDebugQ1(SqlConnection conn)
    {
        string sql = @"
            SELECT QuestionQnum, QuestionSourceQM, PerlSourceQ, PerlSourceC
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionQnum = 1";

        using (var cmd = new SqlCommand(sql, conn))
        using (var r = cmd.ExecuteReader())
        {
            if (r.Read())
            {
                var row = new Dictionary<string, object>();
                for (int i = 0; i < r.FieldCount; i++)
                    row[r.GetName(i)] = r.GetValue(i);

                WriteJson(new
                {
                    found_q1 = true,
                    data = row,
                    message = "QuestionQnum=1 데이터 발견"
                });
            }
            else
            {
                WriteJson(new
                {
                    found_q1 = false,
                    message = "QuestionQnum=1 데이터가 없습니다"
                });
            }
        }
    }

    // --------------------------------------------
    // action = debug_qnums_detailed
    // q1, q2 ... 변환 정보 확인
    // --------------------------------------------
    private void HandleDebugQnumsDetailed(SqlConnection conn)
    {
        string sql = @"
            SELECT DISTINCT QuestionQnum
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum";

        var info = new List<object>();

        using (var cmd = new SqlCommand(sql, conn))
        using (var r = cmd.ExecuteReader())
        {
            while (r.Read())
            {
                string original = r["QuestionQnum"].ToString();
                info.Add(new
                {
                    original = original,
                    converted = "q" + original
                });
            }
        }

        WriteJson(new
        {
            debug_info = info,
            count = info.Count,
            message = "QuestionQnum 상세 정보"
        });
    }

    // --------------------------------------------
    // action = get_question_types
    // --------------------------------------------
    private void HandleGetQuestionTypes(SqlConnection conn)
    {
        string sql = @"
            SELECT DISTINCT QuestionType
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionType IS NOT NULL AND QuestionType <> ''
            ORDER BY QuestionType";

        var list = new List<string>();

        using (var cmd = new SqlCommand(sql, conn))
        using (var r = cmd.ExecuteReader())
        {
            while (r.Read())
            {
                list.Add(r["QuestionType"].ToString());
            }
        }

        WriteJson(list);
    }

    // --------------------------------------------
    // action = get_qnums_by_type
    // 특정 QuestionType에 속한 qnum + tag
    // --------------------------------------------
    private void HandleGetQnumsByType(SqlConnection conn)
    {
        string questionType = Request["type"];
        if (string.IsNullOrEmpty(questionType))
            throw new Exception("QuestionType 파라미터가 필요합니다.");


        string sql = @"
            SELECT QuestionQnum, QuestionTag
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionType = @type AND QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum";

        var list = new List<object>();

        using (var cmd = new SqlCommand(sql, conn))
        {
            cmd.Parameters.AddWithValue("@type", questionType);

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    string qnum = "q" + r["QuestionQnum"].ToString();
                    string tag =
                        (r["QuestionTag"] == DBNull.Value || string.IsNullOrWhiteSpace(r["QuestionTag"].ToString()))
                        ? qnum
                        : r["QuestionTag"].ToString();

                    list.Add(new
                    {
                        value = qnum,
                        text = tag
                    });
                }
            }
        }

        WriteJson(list);
    }

    // --------------------------------------------
    // action = search_questions
    // tag LIKE 검색
    // --------------------------------------------
    private void HandleSearchQuestions(SqlConnection conn)
    {
        string searchTerm = Request["q"];

        // Perl CGI처럼 빈 검색어는 빈 배열 반환
        if (string.IsNullOrEmpty(searchTerm))
        {
            WriteJson(new List<object>());
            return;
        }

        string sql = @"
            SELECT QuestionQnum, QuestionTag, QuestionType
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionTag LIKE @q AND QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum";

        var list = new List<object>();

        using (var cmd = new SqlCommand(sql, conn))
        {
            cmd.Parameters.AddWithValue("@q", "%" + searchTerm + "%");

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    string qnum = "q" + r["QuestionQnum"].ToString();
                    string tag =
                        (r["QuestionTag"] == DBNull.Value || string.IsNullOrWhiteSpace(r["QuestionTag"].ToString()))
                        ? qnum
                        : r["QuestionTag"].ToString();

                    string type =
                        (r["QuestionType"] == DBNull.Value || string.IsNullOrWhiteSpace(r["QuestionType"].ToString()))
                        ? "unknown"
                        : r["QuestionType"].ToString();

                    list.Add(new
                    {
                        qnum = qnum,
                        questionTag = tag,
                        questionType = type
                    });
                }
            }
        }

        WriteJson(list);
    }

    // --------------------------------------------
    // action = debug_all_data
    // --------------------------------------------
    private void HandleDebugAllData(SqlConnection conn)
    {
        string sql = @"
            SELECT QuestionQnum, QuestionSourceQM, PerlSourceQ, PerlSourceC
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum";

        var list = new List<object>();

        using (var cmd = new SqlCommand(sql, conn))
        using (var r = cmd.ExecuteReader())
        {
            while (r.Read())
            {
                string originalQnum = r["QuestionQnum"].ToString();
                string convertedQnum = "q" + originalQnum;

                bool has_qmcode =
                    !(r["QuestionSourceQM"] == DBNull.Value ||
                      string.IsNullOrWhiteSpace(r["QuestionSourceQM"].ToString()));

                bool has_perlcode = false;
                
                // Perl CGI에서도 컬럼명 불명확했기 때문에 안전 체크
                if (r.Table.Columns.Contains("PerlSourceQ"))
                {
                    has_perlcode =
                        !(r["PerlSourceQ"] == DBNull.Value ||
                          string.IsNullOrWhiteSpace(r["PerlSourceQ"].ToString()));
                }

                list.Add(new
                {
                    original_qnum = originalQnum,
                    converted_qnum = convertedQnum,
                    has_qmcode = has_qmcode,
                    has_perlcode = has_perlcode
                });
            }
        }

        WriteJson(new
        {
            all_data = list,
            message = "모든 데이터 확인 완료"
        });
    }
}
