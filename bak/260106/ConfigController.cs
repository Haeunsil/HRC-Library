using Microsoft.AspNetCore.Mvc;
using System.Data;
using Microsoft.Data.SqlClient;
using System.Text.Json;

namespace LibraryConfig.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ConfigController : ControllerBase
    {
        private readonly string _connectionString;
        private readonly ILogger<ConfigController> _logger;

        public ConfigController(IConfiguration configuration, ILogger<ConfigController> logger)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection") 
                ?? "Server=10.0.11.175,15000;Database=WEBDEMO;User Id=esha;Password=ws5000997!;Encrypt=false;TrustServerCertificate=true;";
            _logger = logger;
        }

        // 기존 config.cgi와의 호환성을 위한 라우트
        [HttpGet("config.cgi")]
        public async Task<IActionResult> ConfigCgi([FromQuery] string? action)
        {
            return await Get(action);
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] string? action)
        {
            if (string.IsNullOrEmpty(action))
            {
                return BadRequest(new
                {
                    error = "Invalid action: no action specified",
                    available_actions = new[] { "get_data", "get_qnums", "get_question_types", "get_qnums_by_type", 
                        "search_questions", "debug_columns", "debug_qnums", "debug_q1", "debug_qnums_detailed", "debug_all_data" }
                });
            }

            try
            {
                return action switch
                {
                    "get_data" => await GetData(),
                    "get_qnums" => await GetQnums(),
                    "get_question_types" => await GetQuestionTypes(),
                    "get_qnums_by_type" => await GetQnumsByType(Request.Query["type"].ToString()),
                    "search_questions" => await SearchQuestions(Request.Query["q"].ToString()),
                    "debug_columns" => await DebugColumns(),
                    "debug_qnums" => await DebugQnums(),
                    "debug_q1" => await DebugQ1(),
                    "debug_qnums_detailed" => await DebugQnumsDetailed(),
                    "debug_all_data" => await DebugAllData(),
                    _ => BadRequest(new
                    {
                        error = $"Invalid action: {action}",
                        available_actions = new[] { "get_data", "get_qnums", "get_question_types", "get_qnums_by_type",
                            "search_questions", "debug_columns", "debug_qnums", "debug_q1", "debug_qnums_detailed", "debug_all_data" }
                    })
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing action: {Action}", action);
                return StatusCode(500, new { error = $"처리 중 오류 발생: {ex.Message}" });
            }
        }

        private async Task<IActionResult> GetData()
        {
            var data = new List<object>();

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT QuestionQnum, 
                                CAST(QuestionSourceQM AS NVARCHAR(MAX)) AS QuestionSourceQM, 
                                CAST(PerlSourceQ AS NVARCHAR(MAX)) AS PerlSourceQ, 
                                CAST(PerlSourceC AS NVARCHAR(MAX)) AS PerlSourceC, 
                                QuestionTag 
                         FROM [WEBDEMO].[dbo].[LibraryList] 
                         WHERE QuestionQnum IS NOT NULL 
                         ORDER BY QuestionQnum";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var qnum = "q" + reader.GetInt32(0);
                var qmcode = CleanString(reader.IsDBNull(1) ? null : reader.GetString(1));
                var perlcodeQ = CleanString(reader.IsDBNull(2) ? null : reader.GetString(2));
                var perlcodeC = CleanString(reader.IsDBNull(3) ? null : reader.GetString(3));
                var questionTag = reader.IsDBNull(4) ? qnum : reader.GetString(4);

                data.Add(new
                {
                    qnum = qnum,
                    qmcode = qmcode,
                    perlcodeQ = perlcodeQ,
                    perlcodeC = perlcodeC,
                    questionTag = questionTag
                });
            }

            return Ok(data);
        }

        private async Task<IActionResult> GetQnums()
        {
            var qnums = new List<string>();

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT DISTINCT QuestionQnum 
                         FROM [WEBDEMO].[dbo].[LibraryList] 
                         WHERE QuestionQnum IS NOT NULL 
                         ORDER BY QuestionQnum";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                qnums.Add("q" + reader.GetInt32(0));
            }

            return Ok(qnums);
        }

        private async Task<IActionResult> GetQuestionTypes()
        {
            var questionTypes = new List<string>();

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT DISTINCT QuestionType 
                         FROM [WEBDEMO].[dbo].[LibraryList] 
                         WHERE QuestionType IS NOT NULL AND QuestionType != '' 
                         ORDER BY QuestionType";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                questionTypes.Add(reader.GetString(0));
            }

            return Ok(questionTypes);
        }

        private async Task<IActionResult> GetQnumsByType(string? type)
        {
            if (string.IsNullOrEmpty(type))
            {
                return BadRequest(new { error = "QuestionType 파라미터가 필요합니다" });
            }

            var qnumsWithTags = new List<object>();

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT QuestionQnum, QuestionTag 
                         FROM [WEBDEMO].[dbo].[LibraryList] 
                         WHERE QuestionType = @type AND QuestionQnum IS NOT NULL 
                         ORDER BY QuestionQnum";

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@type", type);

            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var qnum = "q" + reader.GetInt32(0);
                var tag = reader.IsDBNull(1) ? qnum : reader.GetString(1);

                qnumsWithTags.Add(new
                {
                    value = qnum,
                    text = tag
                });
            }

            return Ok(qnumsWithTags);
        }

        private async Task<IActionResult> SearchQuestions(string? searchTerm)
        {
            if (string.IsNullOrEmpty(searchTerm))
            {
                return Ok(new List<object>());
            }

            var searchResults = new List<object>();

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT QuestionQnum, QuestionTag, QuestionType 
                         FROM [WEBDEMO].[dbo].[LibraryList] 
                         WHERE QuestionTag LIKE @searchTerm AND QuestionQnum IS NOT NULL 
                         ORDER BY QuestionQnum";

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@searchTerm", $"%{searchTerm}%");

            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var qnum = "q" + reader.GetInt32(0);
                var questionTag = reader.IsDBNull(1) ? qnum : reader.GetString(1);
                var questionType = reader.IsDBNull(2) ? "unknown" : reader.GetString(2);

                searchResults.Add(new
                {
                    qnum = qnum,
                    questionTag = questionTag,
                    questionType = questionType
                });
            }

            return Ok(searchResults);
        }

        private async Task<IActionResult> DebugColumns()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = "SELECT TOP 1 * FROM [WEBDEMO].[dbo].[LibraryList]";
            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                var columns = new List<string>();
                var sampleData = new Dictionary<string, object?>();

                for (int i = 0; i < reader.FieldCount; i++)
                {
                    var columnName = reader.GetName(i);
                    columns.Add(columnName);
                    sampleData[columnName] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                }

                return Ok(new
                {
                    available_columns = columns,
                    sample_data = sampleData,
                    message = "테이블 구조 확인 완료"
                });
            }
            else
            {
                return Ok(new { error = "테이블에 데이터가 없습니다" });
            }
        }

        private async Task<IActionResult> DebugQnums()
        {
            var qnums = new List<object>();

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT QuestionQnum, COUNT(*) as count 
                         FROM [WEBDEMO].[dbo].[LibraryList] 
                         GROUP BY QuestionQnum 
                         ORDER BY QuestionQnum";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                qnums.Add(new
                {
                    qnum = reader.GetInt32(0),
                    count = reader.GetInt32(1)
                });
            }

            return Ok(new
            {
                qnums = qnums,
                message = "QuestionQnum 값들 확인 완료"
            });
        }

        private async Task<IActionResult> DebugQ1()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT QuestionQnum, QuestionSourceQM, PerlSourceQ, PerlSourceC 
                         FROM [WEBDEMO].[dbo].[LibraryList] 
                         WHERE QuestionQnum = 1";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                return Ok(new
                {
                    found_q1 = true,
                    data = new
                    {
                        QuestionQnum = reader.GetInt32(0),
                        QuestionSourceQM = reader.IsDBNull(1) ? null : reader.GetString(1),
                        PerlSourceQ = reader.IsDBNull(2) ? null : reader.GetString(2),
                        PerlSourceC = reader.IsDBNull(3) ? null : reader.GetString(3)
                    },
                    message = "QuestionQnum=1 데이터 발견"
                });
            }
            else
            {
                return Ok(new
                {
                    found_q1 = false,
                    message = "QuestionQnum=1 데이터가 없습니다"
                });
            }
        }

        private async Task<IActionResult> DebugQnumsDetailed()
        {
            var debugInfo = new List<object>();

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT DISTINCT QuestionQnum 
                         FROM [WEBDEMO].[dbo].[LibraryList] 
                         WHERE QuestionQnum IS NOT NULL 
                         ORDER BY QuestionQnum";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var qnum = reader.GetInt32(0);
                debugInfo.Add(new
                {
                    original = qnum,
                    converted = "q" + qnum
                });
            }

            return Ok(new
            {
                debug_info = debugInfo,
                count = debugInfo.Count,
                message = "QuestionQnum 상세 정보"
            });
        }

        private async Task<IActionResult> DebugAllData()
        {
            var allData = new List<object>();

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT QuestionQnum, QuestionSourceQM, PerlSourceQ, PerlSourceC 
                         FROM [WEBDEMO].[dbo].[LibraryList] 
                         WHERE QuestionQnum IS NOT NULL 
                         ORDER BY QuestionQnum";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var qnum = reader.GetInt32(0);
                var qmcode = reader.IsDBNull(1) ? null : reader.GetString(1);
                var perlcode = reader.IsDBNull(2) ? null : reader.GetString(2);

                allData.Add(new
                {
                    original_qnum = qnum,
                    converted_qnum = "q" + qnum,
                    has_qmcode = !string.IsNullOrEmpty(qmcode),
                    has_perlcode = !string.IsNullOrEmpty(perlcode)
                });
            }

            return Ok(new
            {
                all_data = allData,
                message = "모든 데이터 확인 완료"
            });
        }

        private string CleanString(string? value)
        {
            if (string.IsNullOrEmpty(value) || value.Equals("NULL", StringComparison.OrdinalIgnoreCase))
            {
                return "";
            }
            return value.Trim();
        }
    }
}

