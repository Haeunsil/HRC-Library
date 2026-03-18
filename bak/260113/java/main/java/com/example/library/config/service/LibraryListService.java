package com.example.library.config.service;

import com.example.library.config.dto.QnumWithTagDto;
import com.example.library.config.dto.QuestionDataDto;
import com.example.library.config.dto.SearchResultDto;
import com.example.library.config.entity.LibraryList;
import com.example.library.config.repository.LibraryListRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class LibraryListService {
    
    @Autowired
    private LibraryListRepository repository;
    
    /**
     * 모든 데이터 조회 (get_data)
     */
    public List<QuestionDataDto> getAllData() {
        List<LibraryList> entities = repository.findAllWithQuestionQnum();
        List<QuestionDataDto> result = new ArrayList<>();
        
        for (LibraryList entity : entities) {
            String qnum = "q" + entity.getQuestionQnum();
            String qmcode = cleanString(entity.getQuestionSourceQM());
            String perlcode = cleanString(entity.getQuestionSourcePERL());
            String questionTag = entity.getQuestionTag() != null ? entity.getQuestionTag() : qnum;
            
            result.add(new QuestionDataDto(qnum, qmcode, perlcode, questionTag));
        }
        
        return result;
    }
    
    /**
     * Qnum 목록 조회 (get_qnums)
     */
    public List<String> getQnums() {
        List<Integer> questionQnums = repository.findDistinctQuestionQnums();
        List<String> result = new ArrayList<>();
        
        for (Integer qnum : questionQnums) {
            result.add("q" + qnum);
        }
        
        return result;
    }
    
    /**
     * QuestionType 목록 조회 (get_question_types)
     */
    public List<String> getQuestionTypes() {
        return repository.findDistinctQuestionTypes();
    }
    
    /**
     * 특정 QuestionType에 해당하는 Qnum과 Tag 조회 (get_qnums_by_type)
     */
    public List<QnumWithTagDto> getQnumsByType(String questionType) {
        List<LibraryList> entities = repository.findByQuestionType(questionType);
        List<QnumWithTagDto> result = new ArrayList<>();
        
        for (LibraryList entity : entities) {
            String qnum = "q" + entity.getQuestionQnum();
            String tag = entity.getQuestionTag() != null ? entity.getQuestionTag() : qnum;
            
            result.add(new QnumWithTagDto(qnum, tag));
        }
        
        return result;
    }
    
    /**
     * QuestionTag에서 검색 (search_questions)
     */
    public List<SearchResultDto> searchQuestions(String searchTerm) {
        if (searchTerm == null || searchTerm.trim().isEmpty()) {
            return new ArrayList<>();
        }
        
        List<LibraryList> entities = repository.findByQuestionTagContaining(searchTerm);
        List<SearchResultDto> result = new ArrayList<>();
        
        for (LibraryList entity : entities) {
            String qnum = "q" + entity.getQuestionQnum();
            String questionTag = entity.getQuestionTag() != null ? entity.getQuestionTag() : qnum;
            String questionType = entity.getQuestionType() != null ? entity.getQuestionType() : "unknown";
            
            result.add(new SearchResultDto(qnum, questionTag, questionType));
        }
        
        return result;
    }
    
    /**
     * 디버깅: 테이블 구조 확인 (debug_columns)
     */
    public Map<String, Object> debugColumns() {
        Map<String, Object> result = new HashMap<>();
        
        List<LibraryList> entities = repository.findAll();
        if (!entities.isEmpty()) {
            LibraryList sample = entities.get(0);
            
            List<String> columns = new ArrayList<>();
            columns.add("questionQnum");
            columns.add("questionSourceQM");
            columns.add("questionSourcePERL");
            columns.add("questionTag");
            columns.add("questionType");
            
            Map<String, Object> sampleData = new HashMap<>();
            sampleData.put("questionQnum", sample.getQuestionQnum());
            sampleData.put("questionSourceQM", sample.getQuestionSourceQM());
            sampleData.put("questionSourcePERL", sample.getQuestionSourcePERL());
            sampleData.put("questionTag", sample.getQuestionTag());
            sampleData.put("questionType", sample.getQuestionType());
            
            result.put("available_columns", columns);
            result.put("sample_data", sampleData);
            result.put("message", "테이블 구조 확인 완료");
        } else {
            result.put("error", "테이블에 데이터가 없습니다");
        }
        
        return result;
    }
    
    /**
     * 디버깅: QuestionQnum 값들 확인 (debug_qnums)
     */
    public Map<String, Object> debugQnums() {
        Map<String, Object> result = new HashMap<>();
        
        List<Object[]> counts = repository.findQuestionQnumCounts();
        List<Map<String, Object>> qnums = new ArrayList<>();
        
        for (Object[] count : counts) {
            Map<String, Object> qnumInfo = new HashMap<>();
            qnumInfo.put("qnum", count[0]);
            qnumInfo.put("count", count[1]);
            qnums.add(qnumInfo);
        }
        
        result.put("qnums", qnums);
        result.put("message", "QuestionQnum 값들 확인 완료");
        
        return result;
    }
    
    /**
     * 디버깅: QuestionQnum=1 데이터 확인 (debug_q1)
     */
    public Map<String, Object> debugQ1() {
        Map<String, Object> result = new HashMap<>();
        
        LibraryList entity = repository.findByQuestionQnum(1);
        if (entity != null) {
            Map<String, Object> data = new HashMap<>();
            data.put("QuestionQnum", entity.getQuestionQnum());
            data.put("QuestionSourceQM", entity.getQuestionSourceQM());
            data.put("QuestionSourcePERL", entity.getQuestionSourcePERL());
            
            result.put("found_q1", true);
            result.put("data", data);
            result.put("message", "QuestionQnum=1 데이터 발견");
        } else {
            result.put("found_q1", false);
            result.put("message", "QuestionQnum=1 데이터가 없습니다");
        }
        
        return result;
    }
    
    /**
     * 디버깅: QuestionQnum 상세 정보 (debug_qnums_detailed)
     */
    public Map<String, Object> debugQnumsDetailed() {
        Map<String, Object> result = new HashMap<>();
        
        List<Integer> questionQnums = repository.findDistinctQuestionQnums();
        List<Map<String, Object>> debugInfo = new ArrayList<>();
        
        for (Integer qnum : questionQnums) {
            Map<String, Object> info = new HashMap<>();
            info.put("original", qnum);
            info.put("converted", "q" + qnum);
            debugInfo.add(info);
        }
        
        result.put("debug_info", debugInfo);
        result.put("count", debugInfo.size());
        result.put("message", "QuestionQnum 상세 정보");
        
        return result;
    }
    
    /**
     * 디버깅: 모든 데이터 확인 (debug_all_data)
     */
    public Map<String, Object> debugAllData() {
        Map<String, Object> result = new HashMap<>();
        
        List<LibraryList> entities = repository.findAllWithQuestionQnum();
        List<Map<String, Object>> allData = new ArrayList<>();
        
        for (LibraryList entity : entities) {
            Map<String, Object> data = new HashMap<>();
            data.put("original_qnum", entity.getQuestionQnum());
            data.put("converted_qnum", "q" + entity.getQuestionQnum());
            data.put("has_qmcode", entity.getQuestionSourceQM() != null && !entity.getQuestionSourceQM().isEmpty());
            data.put("has_perlcode", entity.getQuestionSourcePERL() != null && !entity.getQuestionSourcePERL().isEmpty());
            allData.add(data);
        }
        
        result.put("all_data", allData);
        result.put("message", "모든 데이터 확인 완료");
        
        return result;
    }
    
    /**
     * 문자열 정리 (앞뒤 공백 제거, null 처리)
     */
    private String cleanString(String str) {
        if (str == null || str.equals("") || str.equals("NULL")) {
            return "";
        }
        return str.trim();
    }
}

