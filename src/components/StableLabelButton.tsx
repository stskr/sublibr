import type { ButtonHTMLAttributes, ReactNode } from 'react';

function StableLabelStack({ labels, children }: { labels: readonly string[]; children: ReactNode }) {
    return (
        <>
            {labels.map((label, index) => (
                <span key={`${index}-${label}`} className="btn-stable-width-sizer" aria-hidden="true">
                    {label}
                </span>
            ))}
            <span className="btn-stable-width-label">{children}</span>
        </>
    );
}

/** Keeps a button as wide as its longest caption so swapping labels does not jump layout. */
export function StableLabelButton({
    labels,
    className,
    children,
    type = 'button',
    ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { labels: readonly string[] }) {
    return (
        <button type={type} className={`btn-stable-width${className ? ` ${className}` : ''}`} {...rest}>
            <StableLabelStack labels={labels}>{children}</StableLabelStack>
        </button>
    );
}

/** Same sizing, for use inside an existing button (icons stay outside the stack). */
export function StableLabel({ labels, children }: { labels: readonly string[]; children: ReactNode }) {
    return (
        <span className="btn-stable-width">
            <StableLabelStack labels={labels}>{children}</StableLabelStack>
        </span>
    );
}
