import React, { useState, useEffect } from 'react';
import { getQuestionTypes, getQuestions } from '../api';
import CustomSelect from './CustomSelect';

const FilterRow = ({ onSelect, selectedQnum }) => {
    const [categories, setCategories] = useState([]);
    const [categoryData, setCategoryData] = useState({});
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedQuestion, setSelectedQuestion] = useState('');

    // Sync with external selectedQnum
    useEffect(() => {
        if (!selectedQnum || Object.keys(categoryData).length === 0) return;

        // If currently selected question matches prop, do nothing (avoid loop/reset)
        if (selectedQuestion === selectedQnum) return;

        // Find which category contains this qnum
        let types = Object.keys(categoryData);
        for (let cat of types) {
            const list = categoryData[cat];
            const found = list.find(q => q.qnum === selectedQnum);
            if (found) {
                setSelectedCategory(cat);
                setSelectedQuestion(selectedQnum);
                break;
            }
        }
    }, [selectedQnum, categoryData]);

    useEffect(() => {
        const init = async () => {
            try {
                // 1. Get Types
                const types = await getQuestionTypes(); // Returns ['sample', 'single', ...]

                // Sort according to legacy order: sample, single, multi, open, ...
                const order = ['sample', 'single', 'multi', 'open'];
                const sorted = [
                    ...order.filter(x => types.includes(x)),
                    ...types.filter(x => !order.includes(x))
                ];
                setCategories(sorted);

                // Default to first category if available -> REMOVED per request to default to placeholder
                // if (sorted.length > 0) {
                //    setSelectedCategory(sorted[0]);
                // }

                // 2. Fetch ALL data once for client-side filtering
                const allQs = await getQuestions();

                // Distribute to categories
                const map = {};
                sorted.forEach(cat => {
                    const normalizedCat = String(cat).toLowerCase().trim();
                    map[cat] = allQs.filter(q => {
                        const qType = String(q.questionType || '').toLowerCase().trim();
                        return qType === normalizedCat;
                    });
                });
                setCategoryData(map);

            } catch (e) { console.error(e); }
        };
        init();
    }, []);

    const handleCategoryChange = (e) => {
        const cat = e.target.value;
        setSelectedCategory(cat);
        setSelectedQuestion(''); // Reset question when category changes
    };

    const handleQuestionChange = (e) => {
        const val = e.target.value;
        setSelectedQuestion(val);
        if (val) {
            onSelect({ value: val, category: selectedCategory });
        }
    };

    const koreanNames = {
        'sample': '표준화', 'single': '단수', 'multi': '복수', 'open': '오픈',
        'grid': '척도', 'scale': '단일척도', 'popupmenu': '팝업메뉴',
        'media': '미디어', 'sum': '합계', 'search': '검색',
        // Add more mappings here if needed
    };

    const getCategoryLabel = (cat) => {
        if (!cat) return '';
        // 1. Try exact match
        if (koreanNames[cat]) return koreanNames[cat];
        // 2. Try lowercase match
        if (koreanNames[cat.toLowerCase()]) return koreanNames[cat.toLowerCase()];
        // 3. Fallback to original English
        return cat;
    };

    const currentQuestions = categoryData[selectedCategory] || [];

    // Custom Dropdown Component is defined outside below to prevent re-creation
    // Just using it here
    const categoryOptions = categories.map(cat => ({ value: cat, label: getCategoryLabel(cat) }));
    const questionOptions = currentQuestions.map(q => ({ value: q.qnum, label: q.questionTag || q.qnum }));

    return (
        <>
            <div className="filter-item">
                <CustomSelect
                    value={selectedCategory}
                    options={categoryOptions}
                    onChange={handleCategoryChange}
                    placeholder="카테고리"
                />
            </div>

            <div className="filter-item">
                <CustomSelect
                    value={selectedQuestion}
                    options={questionOptions}
                    onChange={handleQuestionChange}
                    placeholder={currentQuestions.length > 0 ? "문항을 선택하세요" : "문항"}
                    disabled={currentQuestions.length === 0}
                />
            </div>
        </>
    );
};

export default FilterRow;
