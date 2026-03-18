package com.example.library.config.dto;

public class QnumWithTagDto {
    private String value;
    private String text;
    
    public QnumWithTagDto() {}
    
    public QnumWithTagDto(String value, String text) {
        this.value = value;
        this.text = text;
    }
    
    // Getter와 Setter
    public String getValue() {
        return value;
    }
    
    public void setValue(String value) {
        this.value = value;
    }
    
    public String getText() {
        return text;
    }
    
    public void setText(String text) {
        this.text = text;
    }
}

