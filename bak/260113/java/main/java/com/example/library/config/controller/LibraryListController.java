package com.example.library.config.controller;

import com.example.library.config.dto.QnumWithTagDto;
import com.example.library.config.dto.QuestionDataDto;
import com.example.library.config.dto.SearchResultDto;
import com.example.library.config.service.LibraryListService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*") // CORS 허용
public class LibraryListController {
    
    @Autowired
    private LibraryListService libraryListService;
    
    /**
     * 모든 데이터 조회 (get_data)
     */
    @GetMapping("/get_data")
    public ResponseEntity<?> getData() {
        try {
            List<QuestionDataDto> data = libraryListService.getAllData();
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "데이터 조회 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * Qnum 목록 조회 (get_qnums)
     */
    @GetMapping("/get_qnums")
    public ResponseEntity<?> getQnums() {
        try {
            List<String> qnums = libraryListService.getQnums();
            return ResponseEntity.ok(qnums);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "Qnum 조회 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * QuestionType 목록 조회 (get_question_types)
     */
    @GetMapping("/get_question_types")
    public ResponseEntity<?> getQuestionTypes() {
        try {
            List<String> questionTypes = libraryListService.getQuestionTypes();
            return ResponseEntity.ok(questionTypes);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "QuestionType 조회 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * 특정 QuestionType에 해당하는 Qnum과 Tag 조회 (get_qnums_by_type)
     */
    @GetMapping("/get_qnums_by_type")
    public ResponseEntity<?> getQnumsByType(@RequestParam String type) {
        try {
            if (type == null || type.trim().isEmpty()) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "QuestionType 파라미터가 필요합니다");
                return ResponseEntity.badRequest().body(error);
            }
            
            List<QnumWithTagDto> qnumsWithTags = libraryListService.getQnumsByType(type);
            return ResponseEntity.ok(qnumsWithTags);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "QuestionType별 Qnum 조회 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * QuestionTag에서 검색 (search_questions)
     */
    @GetMapping("/search_questions")
    public ResponseEntity<?> searchQuestions(@RequestParam(required = false) String q) {
        try {
            List<SearchResultDto> results = libraryListService.searchQuestions(q);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "검색 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * 디버깅: 테이블 구조 확인 (debug_columns)
     */
    @GetMapping("/debug_columns")
    public ResponseEntity<?> debugColumns() {
        try {
            Map<String, Object> result = libraryListService.debugColumns();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "디버깅 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * 디버깅: QuestionQnum 값들 확인 (debug_qnums)
     */
    @GetMapping("/debug_qnums")
    public ResponseEntity<?> debugQnums() {
        try {
            Map<String, Object> result = libraryListService.debugQnums();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "디버깅 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * 디버깅: QuestionQnum=1 데이터 확인 (debug_q1)
     */
    @GetMapping("/debug_q1")
    public ResponseEntity<?> debugQ1() {
        try {
            Map<String, Object> result = libraryListService.debugQ1();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "디버깅 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * 디버깅: QuestionQnum 상세 정보 (debug_qnums_detailed)
     */
    @GetMapping("/debug_qnums_detailed")
    public ResponseEntity<?> debugQnumsDetailed() {
        try {
            Map<String, Object> result = libraryListService.debugQnumsDetailed();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "디버깅 오류: " + e.getMessage());
            return ResponseEntity.ok(error);
        }
    }
    
    /**
     * 디버깅: 모든 데이터 확인 (debug_all_data)
     */
    @GetMapping("/debug_all_data")
    public ResponseEntity<?> debugAllData() {
        try {
            Map<String, Object> result = libraryListService.debugAllData();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "디버깅 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * 기존 CGI와의 호환성을 위한 통합 엔드포인트
     */
    @GetMapping("/config")
    public ResponseEntity<?> config(@RequestParam(required = false) String action) {
        try {
            if (action == null || action.trim().isEmpty()) {
                Map<String, Object> error = new HashMap<>();
                error.put("error", "Invalid action: no action specified");
                
                List<String> availableActions = List.of(
                    "get_data", "get_qnums", "get_question_types", "get_qnums_by_type",
                    "debug_columns", "debug_qnums", "debug_q1", "debug_qnums_detailed", "debug_all_data"
                );
                error.put("available_actions", availableActions);
                
                return ResponseEntity.badRequest().body(error);
            }
            
            switch (action) {
                case "get_data":
                    return getData();
                case "get_qnums":
                    return getQnums();
                case "get_question_types":
                    return getQuestionTypes();
                case "debug_columns":
                    return debugColumns();
                case "debug_qnums":
                    return debugQnums();
                case "debug_q1":
                    return debugQ1();
                case "debug_qnums_detailed":
                    return debugQnumsDetailed();
                case "debug_all_data":
                    return debugAllData();
                default:
                    Map<String, Object> error = new HashMap<>();
                    error.put("error", "Invalid action: " + action);
                    
                    List<String> availableActions = List.of(
                        "get_data", "get_qnums", "get_question_types", "get_qnums_by_type",
                        "debug_columns", "debug_qnums", "debug_q1", "debug_qnums_detailed", "debug_all_data"
                    );
                    error.put("available_actions", availableActions);
                    
                    return ResponseEntity.badRequest().body(error);
            }
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "일반 오류: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
}

