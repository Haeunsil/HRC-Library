package com.example.library.config.dto;

public class QuestionDataDto {
    private String qnum;
    private String qmcode;
    private String perlcode;
    private String questionTag;
    
    public QuestionDataDto() {}
    
    public QuestionDataDto(String qnum, String qmcode, String perlcode, String questionTag) {
        this.qnum = qnum;
        this.qmcode = qmcode;
        this.perlcode = perlcode;
        this.questionTag = questionTag;
    }
    
    // Getter와 Setter
    public String getQnum() {
        return qnum;
    }
    
    public void setQnum(String qnum) {
        this.qnum = qnum;
    }
    
    public String getQmcode() {
        return qmcode;
    }
    
    public void setQmcode(String qmcode) {
        this.qmcode = qmcode;
    }
    
    public String getPerlcode() {
        return perlcode;
    }
    
    public void setPerlcode(String perlcode) {
        this.perlcode = perlcode;
    }
    
    public String getQuestionTag() {
        return questionTag;
    }
    
    public void setQuestionTag(String questionTag) {
        this.questionTag = questionTag;
    }
}

