<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8"%>
<%@ page import="java.sql.*" %>
<%@ page import="java.util.*" %>
<%@ page import="org.json.simple.JSONObject" %>
<%@ page import="org.json.simple.JSONArray" %>
<%@ page import="org.json.simple.parser.JSONParser" %>
<%@ page import="org.json.simple.parser.ParseException" %>

<%
    // 요청 파라미터 처리
    String action = request.getParameter("action");
    
    // MSSQL 연결 정보
    String driver = "com.microsoft.sqlserver.jdbc.SQLServerDriver";
    String url = "jdbc:sqlserver://10.0.11.175:15000;databaseName=WEBDEMO;encrypt=false;trustServerCertificate=true;";
    String username = "esha";
    String password = "ws5000997!";
    
    Connection conn = null;
    PreparedStatement pstmt = null;
    ResultSet rs = null;
    
    try {
        // 데이터베이스 연결
        Class.forName(driver);
        conn = DriverManager.getConnection(url, username, password);
        
        // 응답 헤더 설정
        response.setContentType("application/json; charset=UTF-8");
        
        if ("get_data".equals(action)) {
            // 실제 데이터 조회 (nvarchar(max) 처리 개선)
            String query = "SELECT QuestionQnum, CAST(QuestionSourceQM AS NVARCHAR(MAX)) AS QuestionSourceQM, " +
                          "CAST(QuestionSourcePERL AS NVARCHAR(MAX)) AS QuestionSourcePERL, QuestionTag " +
                          "FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
            
            pstmt = conn.prepareStatement(query);
            rs = pstmt.executeQuery();
            
            JSONArray dataArray = new JSONArray();
            
            while (rs.next()) {
                // DB의 int형 QuestionQnum(1,2,3...)을 q1,q2,q3... 형태로 변환
                int questionQnum = rs.getInt("QuestionQnum");
                String qnum = "q" + questionQnum;
                
                // nvarchar(max) 데이터 처리 개선
                String qmcode = rs.getString("QuestionSourceQM");
                String perlcode = rs.getString("QuestionSourcePERL");
                String questionTag = rs.getString("QuestionTag");
                
                // 데이터가 정의되지 않았거나 빈 값인 경우 처리
                if (qmcode == null || qmcode.equals("") || qmcode.equals("NULL")) {
                    qmcode = "";  // 공백으로 설정
                } else {
                    // 문자열 정리 (앞뒤 공백 제거)
                    qmcode = qmcode.trim();
                }
                
                if (perlcode == null || perlcode.equals("") || perlcode.equals("NULL")) {
                    perlcode = "";  // 공백으로 설정
                } else {
                    // 문자열 정리 (앞뒤 공백 제거)
                    perlcode = perlcode.trim();
                }
                
                JSONObject dataObj = new JSONObject();
                dataObj.put("qnum", qnum);
                dataObj.put("qmcode", qmcode);
                dataObj.put("perlcode", perlcode);
                dataObj.put("questionTag", questionTag != null ? questionTag : qnum);
                
                dataArray.add(dataObj);
            }
            
            out.print(dataArray.toJSONString());
            
        } else if ("get_qnums".equals(action)) {
            // QuestionQnum을 q1, q2... 형태로 변환하여 Qnum 목록 조회
            String query = "SELECT DISTINCT QuestionQnum FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
            
            pstmt = conn.prepareStatement(query);
            rs = pstmt.executeQuery();
            
            JSONArray qnumsArray = new JSONArray();
            
            while (rs.next()) {
                // DB의 int형 QuestionQnum(1,2,3...)을 q1,q2,q3... 형태로 변환
                int questionQnum = rs.getInt("QuestionQnum");
                String qnum = "q" + questionQnum;
                qnumsArray.add(qnum);
            }
            
            out.print(qnumsArray.toJSONString());
            
        } else if ("debug_columns".equals(action)) {
            // 테이블 구조만 확인
            String query = "SELECT TOP 1 * FROM [WEBDEMO].[dbo].[LibraryList]";
            
            pstmt = conn.prepareStatement(query);
            rs = pstmt.executeQuery();
            
            if (rs.next()) {
                JSONObject result = new JSONObject();
                JSONArray columnsArray = new JSONArray();
                JSONObject sampleData = new JSONObject();
                
                ResultSetMetaData metaData = rs.getMetaData();
                int columnCount = metaData.getColumnCount();
                
                for (int i = 1; i <= columnCount; i++) {
                    String columnName = metaData.getColumnName(i);
                    columnsArray.add(columnName);
                    sampleData.put(columnName, rs.getString(i));
                }
                
                result.put("available_columns", columnsArray);
                result.put("sample_data", sampleData);
                result.put("message", "테이블 구조 확인 완료");
                
                out.print(result.toJSONString());
            } else {
                JSONObject errorObj = new JSONObject();
                errorObj.put("error", "테이블에 데이터가 없습니다");
                out.print(errorObj.toJSONString());
            }
            
        } else if ("debug_qnums".equals(action)) {
            // QuestionQnum 값들을 확인
            String query = "SELECT QuestionQnum, COUNT(*) as count FROM [WEBDEMO].[dbo].[LibraryList] GROUP BY QuestionQnum ORDER BY QuestionQnum";
            
            pstmt = conn.prepareStatement(query);
            rs = pstmt.executeQuery();
            
            JSONObject result = new JSONObject();
            JSONArray qnumsArray = new JSONArray();
            
            while (rs.next()) {
                JSONObject qnumObj = new JSONObject();
                qnumObj.put("qnum", rs.getInt("QuestionQnum"));
                qnumObj.put("count", rs.getInt("count"));
                qnumsArray.add(qnumObj);
            }
            
            result.put("qnums", qnumsArray);
            result.put("message", "QuestionQnum 값들 확인 완료");
            
            out.print(result.toJSONString());
            
        } else if ("debug_q1".equals(action)) {
            // QuestionQnum=1인 데이터만 확인
            String query = "SELECT QuestionQnum, QuestionSourceQM, QuestionSourcePERL FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum = 1";
            
            pstmt = conn.prepareStatement(query);
            rs = pstmt.executeQuery();
            
            if (rs.next()) {
                JSONObject result = new JSONObject();
                JSONObject dataObj = new JSONObject();
                
                dataObj.put("QuestionQnum", rs.getInt("QuestionQnum"));
                dataObj.put("QuestionSourceQM", rs.getString("QuestionSourceQM"));
                dataObj.put("QuestionSourcePERL", rs.getString("QuestionSourcePERL"));
                
                result.put("found_q1", true);
                result.put("data", dataObj);
                result.put("message", "QuestionQnum=1 데이터 발견");
                
                out.print(result.toJSONString());
            } else {
                JSONObject result = new JSONObject();
                result.put("found_q1", false);
                result.put("message", "QuestionQnum=1 데이터가 없습니다");
                out.print(result.toJSONString());
            }
            
        } else if ("debug_qnums_detailed".equals(action)) {
            // QuestionQnum 값들을 상세히 확인
            String query = "SELECT DISTINCT QuestionQnum FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
            
            pstmt = conn.prepareStatement(query);
            rs = pstmt.executeQuery();
            
            JSONObject result = new JSONObject();
            JSONArray debugInfoArray = new JSONArray();
            
            while (rs.next()) {
                int questionQnum = rs.getInt("QuestionQnum");
                String qnum = "q" + questionQnum;
                
                JSONObject debugObj = new JSONObject();
                debugObj.put("original", questionQnum);
                debugObj.put("converted", qnum);
                debugInfoArray.add(debugObj);
            }
            
            result.put("debug_info", debugInfoArray);
            result.put("count", debugInfoArray.size());
            result.put("message", "QuestionQnum 상세 정보");
            
            out.print(result.toJSONString());
            
        } else if ("get_question_types".equals(action)) {
            // QuestionType 값들을 조회
            String query = "SELECT DISTINCT QuestionType FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionType IS NOT NULL AND QuestionType != '' ORDER BY QuestionType";
            
            pstmt = conn.prepareStatement(query);
            rs = pstmt.executeQuery();
            
            JSONArray questionTypesArray = new JSONArray();
            
            while (rs.next()) {
                questionTypesArray.add(rs.getString("QuestionType"));
            }
            
            out.print(questionTypesArray.toJSONString());
            
        } else if ("get_qnums_by_type".equals(action)) {
            String questionType = request.getParameter("type");
            
            if (questionType == null || questionType.trim().isEmpty()) {
                JSONObject errorObj = new JSONObject();
                errorObj.put("error", "QuestionType 파라미터가 필요합니다");
                out.print(errorObj.toJSONString());
            } else {
                // 특정 QuestionType에 해당하는 qnum과 QuestionTag를 조회
                String query = "SELECT QuestionQnum, QuestionTag FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionType = ? AND QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
                
                pstmt = conn.prepareStatement(query);
                pstmt.setString(1, questionType);
                rs = pstmt.executeQuery();
                
                JSONArray qnumsWithTagsArray = new JSONArray();
                
                while (rs.next()) {
                    int questionQnum = rs.getInt("QuestionQnum");
                    String qnum = "q" + questionQnum;
                    String tag = rs.getString("QuestionTag");
                    
                    JSONObject qnumObj = new JSONObject();
                    qnumObj.put("value", qnum);
                    qnumObj.put("text", tag != null ? tag : qnum); // QuestionTag가 없으면 qnum 사용
                    
                    qnumsWithTagsArray.add(qnumObj);
                }
                
                out.print(qnumsWithTagsArray.toJSONString());
            }
            
        } else if ("search_questions".equals(action)) {
            String searchTerm = request.getParameter("q");
            
            if (searchTerm == null || searchTerm.trim().isEmpty()) {
                out.print("[]");
            } else {
                // QuestionTag에서 검색어를 포함하는 항목들을 조회
                String query = "SELECT QuestionQnum, QuestionTag, QuestionType FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionTag LIKE ? AND QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
                
                pstmt = conn.prepareStatement(query);
                pstmt.setString(1, "%" + searchTerm + "%");
                rs = pstmt.executeQuery();
                
                JSONArray searchResultsArray = new JSONArray();
                
                while (rs.next()) {
                    int questionQnum = rs.getInt("QuestionQnum");
                    String qnum = "q" + questionQnum;
                    
                    JSONObject searchObj = new JSONObject();
                    searchObj.put("qnum", qnum);
                    searchObj.put("questionTag", rs.getString("QuestionTag") != null ? rs.getString("QuestionTag") : qnum);
                    searchObj.put("questionType", rs.getString("QuestionType") != null ? rs.getString("QuestionType") : "unknown");
                    
                    searchResultsArray.add(searchObj);
                }
                
                out.print(searchResultsArray.toJSONString());
            }
            
        } else if ("debug_all_data".equals(action)) {
            // 모든 데이터를 확인 (QuestionQnum 순서대로)
            String query = "SELECT QuestionQnum, QuestionSourceQM, QuestionSourcePERL FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
            
            pstmt = conn.prepareStatement(query);
            rs = pstmt.executeQuery();
            
            JSONObject result = new JSONObject();
            JSONArray allDataArray = new JSONArray();
            
            while (rs.next()) {
                int questionQnum = rs.getInt("QuestionQnum");
                String qnum = "q" + questionQnum;
                
                JSONObject dataObj = new JSONObject();
                dataObj.put("original_qnum", questionQnum);
                dataObj.put("converted_qnum", qnum);
                
                String qmcode = rs.getString("QuestionSourceQM");
                String perlcode = rs.getString("QuestionSourcePERL");
                
                dataObj.put("has_qmcode", qmcode != null && !qmcode.isEmpty());
                dataObj.put("has_perlcode", perlcode != null && !perlcode.isEmpty());
                
                allDataArray.add(dataObj);
            }
            
            result.put("all_data", allDataArray);
            result.put("message", "모든 데이터 확인 완료");
            
            out.print(result.toJSONString());
            
        } else {
            // 잘못된 action 처리
            JSONObject errorObj = new JSONObject();
            errorObj.put("error", "Invalid action: " + (action != null ? action : "no action specified"));
            
            JSONArray availableActionsArray = new JSONArray();
            availableActionsArray.add("get_data");
            availableActionsArray.add("get_qnums");
            availableActionsArray.add("get_question_types");
            availableActionsArray.add("get_qnums_by_type");
            availableActionsArray.add("debug_columns");
            availableActionsArray.add("debug_qnums");
            availableActionsArray.add("debug_q1");
            availableActionsArray.add("debug_qnums_detailed");
            availableActionsArray.add("debug_all_data");
            
            errorObj.put("available_actions", availableActionsArray);
            
            out.print(errorObj.toJSONString());
        }
        
    } catch (ClassNotFoundException e) {
        JSONObject errorObj = new JSONObject();
        errorObj.put("error", "DB 드라이버 오류: " + e.getMessage());
        out.print(errorObj.toJSONString());
    } catch (SQLException e) {
        JSONObject errorObj = new JSONObject();
        errorObj.put("error", "DB 연결 오류: " + e.getMessage());
        out.print(errorObj.toJSONString());
    } catch (Exception e) {
        JSONObject errorObj = new JSONObject();
        errorObj.put("error", "일반 오류: " + e.getMessage());
        out.print(errorObj.toJSONString());
    } finally {
        // 리소스 정리
        try {
            if (rs != null) rs.close();
            if (pstmt != null) pstmt.close();
            if (conn != null) conn.close();
        } catch (SQLException e) {
            // 로그만 남기고 무시
        }
    }
%>
