package com.example.library.config.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "LibraryList", schema = "dbo")
public class LibraryList {
    
    @Id
    @Column(name = "QuestionQnum")
    private Integer questionQnum;
    
    @Column(name = "QuestionSourceQM", columnDefinition = "NVARCHAR(MAX)")
    private String questionSourceQM;
    
    @Column(name = "QuestionSourcePERL", columnDefinition = "NVARCHAR(MAX)")
    private String questionSourcePERL;
    
    @Column(name = "QuestionTag")
    private String questionTag;
    
    @Column(name = "QuestionType")
    private String questionType;
    
    // 기본 생성자
    public LibraryList() {}
    
    // 생성자
    public LibraryList(Integer questionQnum, String questionSourceQM, String questionSourcePERL, 
                      String questionTag, String questionType) {
        this.questionQnum = questionQnum;
        this.questionSourceQM = questionSourceQM;
        this.questionSourcePERL = questionSourcePERL;
        this.questionTag = questionTag;
        this.questionType = questionType;
    }
    
    // Getter와 Setter
    public Integer getQuestionQnum() {
        return questionQnum;
    }
    
    public void setQuestionQnum(Integer questionQnum) {
        this.questionQnum = questionQnum;
    }
    
    public String getQuestionSourceQM() {
        return questionSourceQM;
    }
    
    public void setQuestionSourceQM(String questionSourceQM) {
        this.questionSourceQM = questionSourceQM;
    }
    
    public String getQuestionSourcePERL() {
        return questionSourcePERL;
    }
    
    public void setQuestionSourcePERL(String questionSourcePERL) {
        this.questionSourcePERL = questionSourcePERL;
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
    
    @Override
    public String toString() {
        return "LibraryList{" +
                "questionQnum=" + questionQnum +
                ", questionSourceQM='" + questionSourceQM + '\'' +
                ", questionSourcePERL='" + questionSourcePERL + '\'' +
                ", questionTag='" + questionTag + '\'' +
                ", questionType='" + questionType + '\'' +
                '}';
    }
}

