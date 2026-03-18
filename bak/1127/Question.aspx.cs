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
    public partial class Question : Page
    {
        public Label Mainmenu = new Label();
        public Label Submenu = new Label();
        public Label MainTitle = new Label();
        protected void Page_Load(object sender, EventArgs e)
        {
            if (!IsPostBack)
            {
                Mainmenu.Text = "";
                Submenu.Text = "";
                MainTitle.Text = "메뉴를 선택해주세요.";
                iframePC.Src = "";
                iframeMobile.Src = "";
                iframeMobile2.Src = "";

                GetMenu();
                GetQtype();
            }
        }

        protected void GetMenu()
        {
            DB db = new DB();
            DbBase dbs = new DbBase();

            string Query = string.Empty;

            Query = "QuestionTypeMenu_R";

            Hashtable ht = new Hashtable();

            DataTable ListData = dbs.ExecuteDataTable(Query, ht);




            StringBuilder sb = new StringBuilder();
            //Table start.

            foreach (DataRow row in ListData.Rows)
            {
                Query = "QuestionTypeMenuSub_R";

                ht = new Hashtable();

                ht.Add("@questionType", row["QuestionType"].ToString());

                DataTable SubData = dbs.ExecuteDataTable(Query, ht);

                int cnt = 0;
                foreach (DataRow subrow in SubData.Rows)
                {
                    string styleVari = "style=\"display:none;\"";
                    string classVari = "";
                    if (Request.Params["idx"] != null)
                    {
                        if (Request.Params["questiontype"] == row["QuestionType"].ToString())
                        {
                            styleVari = "style=\"\"";
                        }

                        if (Request.Params["idx"] == subrow["idx"].ToString())
                        {
                            classVari = "class=\"active \" ";
                        }
                    }

                    if (cnt == 0)
                    {
                        sb.Append("<li class=\"li_step1\"><div class=\"txt_step1\" style=\"cursor:pointer\" onclick=\"javascript:showMenu('" + row["QuestionType"].ToString() + "')\">" + row["QuestionMenu"].ToString() + " </div> ");
                        sb.Append(" <ul id = \"" + row["QuestionType"].ToString() + "\" " + styleVari + ">                                                                                          ");
                    }
                    cnt++;

                    sb.Append("     <li><a id=\"" + subrow["idx"].ToString() + "\" " + classVari + " href=\"?questiontype=" + row["QuestionType"].ToString() + "&idx=" + subrow["idx"].ToString() + "\" > " + subrow["QuestionInfo"].ToString() + "</a></li>");
                }
                sb.Append(" </ul>                                                                                                                                 ");
                sb.Append("</li>                                                                                                                                  ");
            }
            dbs.Dispose();
            db.Dispose();
            //Table end.
            sb.Append("</table>");
            ltTable1.Text = sb.ToString();
        }

        protected void GetQtype()
        {
            if (Request.Params["idx"] != null)
            {
                int i = 0;
                string s = Request.Params["idx"].ToString();
                bool result = int.TryParse(s, out i);

                if (result == true)
                {
                    DB db = new DB();
                    DbBase dbs = new DbBase();

                    string Query = string.Empty;

                    Query = "QuestionType_R";

                    Hashtable ht = new Hashtable();

                    ht.Add("@questionType", Request.Params["idx"].ToString());

                    DataTable ListData = dbs.ExecuteDataTable(Query, ht);

                    foreach (DataRow row in ListData.Rows)
                    {
                        Mainmenu.Text = "<div class=\"bc_step\">" + row["QuestionTypeText"].ToString() + "</div>";
                        Submenu.Text = "<div class=\"bc_step active\">" + row["QuestionInfo"].ToString() + "</div>";
                        MainTitle.Text = row["QuestionTypeText"].ToString() + " - " + row["QuestionInfo"].ToString();
                        iframePC.Src = row["QuestionURL"].ToString();
                        iframeMobile.Src = row["QuestionURL"].ToString() + "&t=cami";
                        iframeMobile2.Src = row["QuestionURL"].ToString() + "&t=cami";
                        ScriptManager.RegisterClientScriptBlock(this.Page, this.GetType(), null, "<script type='text/javascript'>javascript:showMenu('" + row["QuestionType"].ToString() + "')</script>", true);
                    }

                    dbs.Dispose();
                    db.Dispose();
                }
                else
                {
                    Response.Redirect("/Error/Error");
                }
            }
        }
    }
}