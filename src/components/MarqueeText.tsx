import React, { useState, useRef, useEffect } from 'react';
import './MarqueeText.css';

interface MarqueeTextProps {
    text: string;
    className?: string; // To inherit font styles (e.g., font-weight, color)
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({ text, className = '' }) => {
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [scrollDistance, setScrollDistance] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const textWidth = textRef.current.offsetWidth;

                const overflowing = textWidth > containerWidth;
                setIsOverflowing(overflowing);

                if (overflowing) {
                    // Calculate how much to scroll: text width - container width + small padding
                    setScrollDistance(textWidth - containerWidth + 10);
                } else {
                    setScrollDistance(0);
                }
            }
        };

        checkOverflow();
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [text]);

    const style = {
        '--scroll-distance': `-${scrollDistance}px`,
        '--duration': `${Math.max(5, scrollDistance * 0.05)}s` // Slower for longer text
    } as React.CSSProperties;

    return (
        <div
            ref={containerRef}
            className={`marquee-container ${className}`}
            title={text}
        >
            <span
                ref={textRef}
                className={`marquee-content ${isOverflowing ? 'overflowing' : ''}`}
                style={isOverflowing ? style : undefined}
            >
                {text}
            </span>
        </div>
    );
};
