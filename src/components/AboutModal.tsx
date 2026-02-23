import { useEffect, useRef } from 'react';
import logoWhite from '../assets/Logo/logo-white.svg';

interface AboutModalProps {
    onClose: () => void;
    version?: string;
}

export function AboutModal({ onClose, version = '1.0.0' }: AboutModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const prev = document.activeElement as HTMLElement;
        modalRef.current?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key !== 'Tab') return;
            const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (!focusable || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => { document.removeEventListener('keydown', handleKeyDown); prev?.focus(); };
    }, [onClose]);

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div
                className="modal-content about-modal"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="about-title"
                ref={modalRef}
                tabIndex={-1}
            >
                <div className="modal-header">
                    <h2 id="about-title">About</h2>
                    <button className="btn-icon" onClick={onClose} aria-label="Close about">
                        <span className="icon">close</span>
                    </button>
                </div>

                <div className="modal-body about-body">

                    {/* App identity */}
                    <div className="about-hero">
                        <img src={logoWhite} alt="SUBLIBR" className="about-logo" />
                        <div className="about-app-name">SUBLIBR</div>
                        <div className="about-version">Version {version}</div>
                        <p className="about-description">
                            AI-powered subtitle generator for video and audio files.
                            Supports Google Gemini and OpenAI for accurate, multi-language
                            transcription with a built-in timeline editor, rich styling,
                            and direct video rendering.
                        </p>
                    </div>

                    {/* Author */}
                    <div className="about-section">
                        <div className="about-section-title">Author</div>
                        <div className="about-author-row">
                            <span className="about-author-name">Stas Krylov</span>
                            <div className="about-author-links">
                                <a
                                    href="https://x.com/StasKrylov"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="about-link"
                                    aria-label="Stas Krylov on X (Twitter)"
                                    title="@StasKrylov on X"
                                >
                                    <svg className="about-social-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                    </svg>
                                    @StasKrylov
                                </a>
                                <a
                                    href="https://github.com/stskr"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="about-link"
                                    aria-label="Stas Krylov on GitHub"
                                    title="stskr on GitHub"
                                >
                                    <svg className="about-social-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                                        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                                    </svg>
                                    stskr
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Open source credits */}
                    <div className="about-section">
                        <div className="about-section-title">Built With</div>
                        <div className="about-credits-grid">
                            <a href="https://www.electronjs.org" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">Electron</span>
                                <span className="about-credit-license">MIT</span>
                            </a>
                            <a href="https://react.dev" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">React</span>
                                <span className="about-credit-license">MIT</span>
                            </a>
                            <a href="https://www.typescriptlang.org" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">TypeScript</span>
                                <span className="about-credit-license">Apache 2.0</span>
                            </a>
                            <a href="https://vitejs.dev" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">Vite</span>
                                <span className="about-credit-license">MIT</span>
                            </a>
                            <a href="https://ffmpeg.org" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">FFmpeg</span>
                                <span className="about-credit-license">LGPL 2.1+</span>
                            </a>
                            <a href="https://github.com/fluent-ffmpeg/node-fluent-ffmpeg" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">fluent-ffmpeg</span>
                                <span className="about-credit-license">MIT</span>
                            </a>
                            <a href="https://github.com/sindresorhus/electron-store" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">electron-store</span>
                                <span className="about-credit-license">MIT</span>
                            </a>
                            <a href="https://www.electron.build" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">electron-builder</span>
                                <span className="about-credit-license">MIT</span>
                            </a>
                            <a href="https://fonts.google.com/specimen/Signika" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">Signika Font</span>
                                <span className="about-credit-license">OFL</span>
                            </a>
                            <a href="https://fonts.google.com/icons" target="_blank" rel="noopener noreferrer" className="about-credit-item">
                                <span className="about-credit-name">Material Icons</span>
                                <span className="about-credit-license">Apache 2.0</span>
                            </a>
                        </div>
                    </div>

                    {/* AI services disclaimer */}
                    <div className="about-section">
                        <div className="about-section-title">AI Services</div>
                        <p className="about-legal-text">
                            This app connects to third-party AI APIs (Google Gemini, OpenAI) to process audio.
                            Use of those services is subject to their respective Terms of Service and Privacy Policies.
                            Audio data is sent directly from your device to the selected provider and is not stored
                            by this application.
                        </p>
                    </div>

                    {/* Legal */}
                    <div className="about-section">
                        <div className="about-section-title">Legal</div>
                        <p className="about-legal-text">
                            This software is provided "as is", without warranty of any kind, express or implied.
                            The author is not liable for any claim, damages, or other liability arising from
                            the use of this software. Users are solely responsible for ensuring they have the
                            right to transcribe, subtitle, and distribute any media processed through this app.
                        </p>
                        <p className="about-legal-text">
                            This application uses{' '}
                            <a href="https://ffmpeg.org" target="_blank" rel="noopener noreferrer" className="about-inline-link">FFmpeg</a>
                            {' '}licensed under the{' '}
                            <a href="https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html" target="_blank" rel="noopener noreferrer" className="about-inline-link">GNU Lesser General Public License v2.1</a>.
                            FFmpeg source code is available at{' '}
                            <a href="https://ffmpeg.org/download.html" target="_blank" rel="noopener noreferrer" className="about-inline-link">ffmpeg.org/download</a>.
                        </p>
                    </div>

                    {/* Copyright */}
                    <div className="about-copyright">
                        © 2026 Stas Krylov — MIT License
                    </div>

                </div>
            </div>
        </div>
    );
}
