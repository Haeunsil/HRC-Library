using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.UI;
using System.Web.UI.WebControls;
using System.Collections;
using System.Data;
using System.Data.SqlClient;
using HRC.CAS.Framework.WebIFS;
using System.Text;
using System.Security.Principal;

namespace WebSurveyDEMO
{
    public class LibraryController : ApiController
    {
        // GET /api/member/list
        [HttpGet]
        [Route("api/member/list")]
        public IHttpActionResult GetMemberList()
        {
            // 1. DB에서 데이터 조회
            var list = new List<MemberDto>();

            using (var conn = new SqlConnection(
                ConfigurationManager.ConnectionStrings["MyDb"].ConnectionString))
            using (var cmd = new SqlCommand("SELECT Id, Name, Email FROM Member", conn))
            {
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(new MemberDto
                        {
                            Id = (int)reader["Id"],
                            Name = reader["Name"].ToString(),
                            Email = reader["Email"].ToString()
                        });
                    }
                }
            }

            // 2. JSON으로 응답
            return Ok(list);
        }
    }
}
public class MemberDto
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }
}
