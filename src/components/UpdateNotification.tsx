import { useState, useEffect } from 'react';

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

interface UpdateInfo {
    version: string;
    releaseNotes?: string;
    releaseDate?: string;
}

export function UpdateNotification() {
    const [status, setStatus] = useState<UpdateStatus>('idle');
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [downloadPercent, setDownloadPercent] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!window.electronAPI) return;

        const cleanups = [
            window.electronAPI.onUpdateAvailable((info) => {
                setUpdateInfo(info);
                setStatus('available');
                setDismissed(false);
            }),
            window.electronAPI.onUpdateProgress((progress) => {
                setDownloadPercent(progress.percent);
                setStatus('downloading');
            }),
            window.electronAPI.onUpdateDownloaded((info) => {
                setUpdateInfo(prev => prev ? { ...prev, ...info } : info);
                setStatus('ready');
            }),
            window.electronAPI.onUpdateError(() => {
                setStatus('error');
            }),
        ];

        return () => { cleanups.forEach(fn => fn()); };
    }, []);

    if (status === 'idle' || dismissed) return null;

    const handleDownload = () => {
        window.electronAPI?.downloadUpdate();
        setStatus('downloading');
    };

    const handleInstall = () => {
        window.electronAPI?.installUpdate();
    };

    const handleDismiss = () => {
        setDismissed(true);
    };

    const handleCheckAgain = () => {
        setStatus('idle');
        window.electronAPI?.checkForUpdates().catch(() => { });
    };

    return (
        <div className={`update-notification update-${status}`} role="alert" aria-live="polite">
            <div className="update-content">
                {status === 'available' && (
                    <>
                        <span className="icon icon-sm update-icon">system_update</span>
                        <span className="update-message">
                            Version {updateInfo?.version} is available
                        </span>
                        <div className="update-actions">
                            <button className="btn-update-primary" onClick={handleDownload}>
                                Download
                            </button>
                            <button className="btn-update-dismiss" onClick={handleDismiss}>
                                Later
                            </button>
                        </div>
                    </>
                )}

                {status === 'downloading' && (
                    <>
                        <span className="icon icon-sm update-icon spin">sync</span>
                        <span className="update-message">
                            Downloading update... {downloadPercent}%
                        </span>
                        <div className="update-progress-bar">
                            <div
                                className="update-progress-fill"
                                style={{ width: `${downloadPercent}%` }}
                            />
                        </div>
                    </>
                )}

                {status === 'ready' && (
                    <>
                        <span className="icon icon-sm update-icon">check_circle</span>
                        <span className="update-message">
                            Update ready to install
                        </span>
                        <div className="update-actions">
                            <button className="btn-update-primary" onClick={handleInstall}>
                                Restart Now
                            </button>
                            <button className="btn-update-dismiss" onClick={handleDismiss}>
                                Later
                            </button>
                        </div>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <span className="icon icon-sm update-icon">error_outline</span>
                        <span className="update-message">
                            Update check failed
                        </span>
                        <div className="update-actions">
                            <button className="btn-update-dismiss" onClick={handleCheckAgain}>
                                Retry
                            </button>
                            <button className="btn-update-dismiss" onClick={handleDismiss}>
                                Dismiss
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
