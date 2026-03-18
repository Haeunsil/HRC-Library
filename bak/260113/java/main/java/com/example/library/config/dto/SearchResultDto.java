package com.example.library.config.dto;

public class SearchResultDto {
    private String qnum;
    private String questionTag;
    private String questionType;
    
    public SearchResultDto() {}
    
    public SearchResultDto(String qnum, String questionTag, String questionType) {
        this.qnum = qnum;
        this.questionTag = questionTag;
        this.questionType = questionType;
    }
    
    // Getter와 Setter
    public String getQnum() {
        return qnum;
    }
    
    public void setQnum(String qnum) {
        this.qnum = qnum;
    }
    
    public String getQuestionTag() {
        return questionTag;
    }
    
    public void setQuestionTag(String questionTag) {
        this.questionTag = questionTag;
    }
    
    public String getQuestionType() {
        return questionType;
    }
    
    public void setQuestionType(String questionType) {
        this.questionType = questionType;
    }
}

