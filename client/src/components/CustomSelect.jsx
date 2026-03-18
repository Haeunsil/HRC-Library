import React, { useState, useEffect, useRef } from 'react';

const CustomSelect = ({ value, options, onChange, placeholder, disabled, size, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue) => {
        onChange({ target: { value: optionValue } }); // Mimic event object
        setIsOpen(false);
    };

    // Find display label
    const currentLabel = options.find(o => o.value === value)?.label;

    return (
        <div className="custom-select-container" ref={ref}>
            <div
                className={`custom-select-trigger ${disabled ? 'disabled' : ''} ${size || ''} ${className || ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
            >
                <span title={value ? (currentLabel || placeholder) : placeholder}>{value ? (currentLabel || placeholder) : placeholder}</span>
                <span style={{ fontSize: '10px' }}>▼</span>
            </div>
            <div className={`custom-select-menu ${isOpen ? 'show' : ''}`}>
                {options.map(opt => (
                    <div
                        key={opt.value}
                        className={`custom-select-option ${value === opt.value ? 'selected' : ''}`}
                        title={opt.label}
                        onClick={() => handleSelect(opt.value)}
                    >
                        {opt.label}
                    </div>
                ))}
                {options.length === 0 && (
                    <div className="custom-select-option" style={{ color: '#999', cursor: 'default' }}>
                        {placeholder}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CustomSelect;
