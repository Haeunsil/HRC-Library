import React, { useState } from 'react';
import { searchQuestions } from '../api';
import { Search } from 'lucide-react';

const QuestionList = ({ onSelectQuestion }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleChange = async (e) => {
        const val = e.target.value;
        setSearchTerm(val);
        if (val.length > 1) {
            try {
                const results = await searchQuestions(val);
                setSuggestions(results || []);
                setShowSuggestions(true);
            } catch (err) {
                console.error(err);
                setSuggestions([]);
            }
        } else {
            setShowSuggestions(false);
        }
    };

    return (
        <div className="search-container">
            <Search className="search-icon" />
            <input
                id="searchInput"
                type="text"
                placeholder="문항 검색..."
                value={searchTerm}
                onChange={handleChange}
                autoComplete="off"
            />
            <div
                id="searchSuggestions"
                className={`search-suggestions ${showSuggestions && suggestions.length > 0 ? 'open' : ''}`}
            >
                {suggestions.map((q, idx) => (
                    <div
                        key={idx}
                        className="search-suggestion-item"
                        onClick={() => {
                            onSelectQuestion(q);
                            setSearchTerm(q.questionTag);
                            setShowSuggestions(false);
                        }}
                    >
                        <div className="search-suggestion-title">{q.questionTag}</div>
                        <div className="search-suggestion-desc">{q.qnum}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default QuestionList;
