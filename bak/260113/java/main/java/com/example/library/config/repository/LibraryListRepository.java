package com.example.library.config.repository;

import com.example.library.config.entity.LibraryList;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LibraryListRepository extends JpaRepository<LibraryList, Integer> {
    
    // QuestionQnum이 null이 아닌 모든 데이터 조회
    @Query("SELECT l FROM LibraryList l WHERE l.questionQnum IS NOT NULL ORDER BY l.questionQnum")
    List<LibraryList> findAllWithQuestionQnum();
    
    // QuestionQnum 목록 조회 (중복 제거)
    @Query("SELECT DISTINCT l.questionQnum FROM LibraryList l WHERE l.questionQnum IS NOT NULL ORDER BY l.questionQnum")
    List<Integer> findDistinctQuestionQnums();
    
    // QuestionType 목록 조회 (중복 제거)
    @Query("SELECT DISTINCT l.questionType FROM LibraryList l WHERE l.questionType IS NOT NULL AND l.questionType != '' ORDER BY l.questionType")
    List<String> findDistinctQuestionTypes();
    
    // 특정 QuestionType에 해당하는 데이터 조회
    @Query("SELECT l FROM LibraryList l WHERE l.questionType = :questionType AND l.questionQnum IS NOT NULL ORDER BY l.questionQnum")
    List<LibraryList> findByQuestionType(@Param("questionType") String questionType);
    
    // QuestionTag에서 검색어를 포함하는 항목들 조회
    @Query("SELECT l FROM LibraryList l WHERE l.questionTag LIKE %:searchTerm% AND l.questionQnum IS NOT NULL ORDER BY l.questionQnum")
    List<LibraryList> findByQuestionTagContaining(@Param("searchTerm") String searchTerm);
    
    // QuestionQnum별 개수 조회
    @Query("SELECT l.questionQnum, COUNT(l) FROM LibraryList l GROUP BY l.questionQnum ORDER BY l.questionQnum")
    List<Object[]> findQuestionQnumCounts();
    
    // 특정 QuestionQnum 데이터 조회
    @Query("SELECT l FROM LibraryList l WHERE l.questionQnum = :questionQnum")
    LibraryList findByQuestionQnum(@Param("questionQnum") Integer questionQnum);
}

